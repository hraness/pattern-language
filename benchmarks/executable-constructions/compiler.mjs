const SCHEMA = 'pattern-language.construct.v1';
const STORAGE = ['append-journal', 'replace-snapshot'];
const MAX_RAW_LENGTH = 16_384;

function invalid(message) {
  return { valid: false, artifact: null, errors: [message] };
}

function hasKeys(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length && keys.every(key => actual.includes(key));
}

export function validateArtifact(value) {
  try {
    if (!hasKeys(value, ['schema', 'storage', 'commit'])) return invalid('Expected exactly schema, storage and commit.');
    if (value.schema !== SCHEMA) return invalid('Unknown artifact schema.');
    if (!hasKeys(value.storage, ['op']) || !STORAGE.includes(value.storage.op)) return invalid('Unknown storage construction.');
    let commit;
    if (value.commit?.op === 'each' && hasKeys(value.commit, ['op'])) {
      commit = { op: 'each' };
    } else if (value.commit?.op === 'bounded-batch' && hasKeys(value.commit, ['op', 'maxItems', 'maxTicks'])
      && [2, 4].includes(value.commit.maxItems) && [1, 3].includes(value.commit.maxTicks)) {
      commit = { op: 'bounded-batch', maxItems: value.commit.maxItems, maxTicks: value.commit.maxTicks };
    } else {
      return invalid('Unknown commit construction or parameters.');
    }
    return {
      valid: true,
      artifact: { schema: SCHEMA, storage: { op: value.storage.op }, commit },
      errors: [],
    };
  } catch {
    return invalid('Artifact must be ordinary JSON-shaped data.');
  }
}

// JSON.parse establishes syntax first. This second pass retains object-key
// identity, including escaped spellings that JSON.parse would silently replace.
function checkDuplicateKeys(raw) {
  let cursor = 0;
  function whitespace() {
    while (/\s/.test(raw[cursor] ?? '') && cursor < raw.length) cursor += 1;
  }
  function string() {
    const start = cursor++;
    while (raw[cursor] !== '"') {
      if (raw[cursor] === '\\') cursor += 1;
      cursor += 1;
    }
    cursor += 1;
    return JSON.parse(raw.slice(start, cursor));
  }
  function value(depth) {
    if (depth > 32) throw new Error('JSON nesting exceeds the artifact limit.');
    whitespace();
    if (raw[cursor] === '{') {
      cursor += 1;
      whitespace();
      const keys = new Set();
      if (raw[cursor] === '}') { cursor += 1; return; }
      while (true) {
        const key = string();
        if (keys.has(key)) throw new Error('Duplicate JSON object key.');
        keys.add(key);
        whitespace();
        cursor += 1; // colon, checked by JSON.parse
        value(depth + 1);
        whitespace();
        if (raw[cursor++] === '}') return;
        whitespace();
      }
    }
    if (raw[cursor] === '[') {
      cursor += 1;
      whitespace();
      if (raw[cursor] === ']') { cursor += 1; return; }
      while (true) {
        value(depth + 1);
        whitespace();
        if (raw[cursor++] === ']') return;
      }
    }
    if (raw[cursor] === '"') { string(); return; }
    while (cursor < raw.length && !/[\s,\]}]/.test(raw[cursor])) cursor += 1;
  }
  value(0);
}

export function parseArtifact(raw) {
  if (typeof raw !== 'string') return invalid('Response must be a JSON string.');
  if (raw.length > MAX_RAW_LENGTH) return invalid('Response exceeds the artifact size limit.');
  try {
    const parsed = JSON.parse(raw);
    checkDuplicateKeys(raw);
    return validateArtifact(parsed);
  } catch (error) {
    return invalid(error instanceof Error ? error.message : 'Invalid JSON artifact.');
  }
}

export function enumerateDesigns() {
  const designs = [];
  for (const op of STORAGE) {
    designs.push({ schema: SCHEMA, storage: { op }, commit: { op: 'each' } });
    for (const maxItems of [2, 4]) {
      for (const maxTicks of [1, 3]) {
        designs.push({ schema: SCHEMA, storage: { op }, commit: { op: 'bounded-batch', maxItems, maxTicks } });
      }
    }
  }
  return designs;
}

const JOURNAL = `  function apply(commands) {
    for (const command of commands) {
      if (seen.has(command.id)) continue;
      totals.set(command.key, (totals.get(command.key) ?? 0) + command.delta);
      seen.add(command.id);
    }
  }
  for (const record of host.readRecords()) {
    const frame = JSON.parse(record);
    if (frame.v !== 1 || !Array.isArray(frame.commands)) throw new Error('Invalid journal record.');
    apply(frame.commands);
  }
  function persist(commands) {
    host.appendAtomic(JSON.stringify({ v: 1, commands }));
    apply(commands);
  }
`;

const SNAPSHOT = `  const records = host.readRecords();
  if (records.length > 1) throw new Error('Invalid snapshot record count.');
  if (records.length === 1) {
    const snapshot = JSON.parse(records[0]);
    if (snapshot.v !== 1 || !Array.isArray(snapshot.totals) || !Array.isArray(snapshot.ids)) throw new Error('Invalid snapshot record.');
    totals = new Map(snapshot.totals);
    seen = new Set(snapshot.ids);
  }
  function persist(commands) {
    const nextTotals = new Map(totals);
    const nextIds = new Set(seen);
    for (const command of commands) {
      if (nextIds.has(command.id)) continue;
      nextTotals.set(command.key, (nextTotals.get(command.key) ?? 0) + command.delta);
      nextIds.add(command.id);
    }
    host.replaceAtomic(JSON.stringify({ v: 1, totals: [...nextTotals], ids: [...nextIds] }));
    totals = nextTotals;
    seen = nextIds;
  }
`;

const EACH = `  function submit(callId, command) {
    if (!seen.has(command.id)) persist([{ id: command.id, key: command.key, delta: command.delta }]);
    host.reply(callId, { id: command.id, accepted: true });
  }
  function tick(_now) {}
`;

function batch(maxItems, maxTicks) {
  return `  const pending = new Map();
  let oldest = null;
  function flush() {
    const entries = [...pending.values()];
    persist(entries.map(entry => entry.command));
    pending.clear();
    oldest = null;
    for (const entry of entries) {
      for (const callId of entry.waiters) host.reply(callId, { id: entry.command.id, accepted: true });
    }
  }
  function submit(callId, command) {
    if (seen.has(command.id)) {
      host.reply(callId, { id: command.id, accepted: true });
      return;
    }
    const existing = pending.get(command.id);
    if (existing) {
      existing.waiters.push(callId);
      return;
    }
    if (pending.size === 0) oldest = host.now();
    pending.set(command.id, {
      command: { id: command.id, key: command.key, delta: command.delta },
      waiters: [callId],
    });
    if (pending.size >= ${maxItems}) flush();
  }
  function tick(now) {
    if (pending.size > 0 && now - oldest >= ${maxTicks}) flush();
  }
`;
}

export function compile(value) {
  const checked = validateArtifact(value);
  if (!checked.valid) throw new TypeError(checked.errors.join(' '));
  const { storage, commit } = checked.artifact;
  const persistence = storage.op === 'append-journal' ? JOURNAL : SNAPSHOT;
  const scheduling = commit.op === 'each' ? EACH : batch(commit.maxItems, commit.maxTicks);
  return `// Generated by the closed pattern-language.construct.v1 compiler.
export function create(host) {
  let totals = new Map();
  let seen = new Set();
${persistence}${scheduling}  function read(key) { return totals.get(key) ?? 0; }
  return { submit, read, tick };
}
`;
}
