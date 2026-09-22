import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, enumerateDesigns } from './compiler.mjs';
import { ContractOracle, ContractViolation } from './oracle.mjs';
import { createHost } from './host.mjs';
import { CONTEXT_IDS, executeTrace, factoryFor, loadContext, qualify, workloadTraces } from './evaluate.mjs';
import { enumerateSpace } from './space.mjs';

const commands = [{ id: 'a', key: 'x', delta: 1 }, { id: 'b', key: 'y', delta: 4 }, { id: 'c', key: 'x', delta: -16 }];
let assertions = 0;
function check(body) { body(); assertions += 1; }

check(() => {
  const oracle = new ContractOracle(commands);
  oracle.submit('a1', commands[0], 0); oracle.endCall();
  oracle.submit('b1', commands[1], 0); oracle.endCall();
  // Unacknowledged a may disappear while b commits: global first-seen FIFO is
  // deliberately not asserted by this oracle.
  oracle.read('x', 0); oracle.reply('b1', { id: 'b', accepted: true }, 0);
  oracle.crash(); oracle.read('x', 0); oracle.read('y', 4);
  oracle.submit('a2', commands[0], 1); oracle.endCall();
  oracle.reply('a2', { id: 'a', accepted: true }, 1); oracle.read('x', 1);
});
check(() => {
  const oracle = new ContractOracle(commands);
  assert.throws(() => oracle.read('x', 1), ContractViolation);
});
check(() => {
  const oracle = new ContractOracle(commands);
  oracle.submit('a1', commands[0], 0); oracle.endCall();
  oracle.reply('a1', { id: 'a', accepted: true }, 0); oracle.crash();
  assert.throws(() => oracle.read('x', 0), ContractViolation);
});
check(() => {
  const oracle = new ContractOracle(commands);
  oracle.submit('a1', commands[0], 0); oracle.endCall();
  oracle.read('x', 1); oracle.crash();
  assert.throws(() => oracle.read('x', 0), ContractViolation);
});
check(() => {
  const oracle = new ContractOracle(commands);
  oracle.submit('a1', commands[0], 0); oracle.endCall();
  oracle.crash();
  assert.throws(() => oracle.reply('a1', { id: 'a', accepted: true }, 0), ContractViolation);
});
check(() => {
  const host = createHost({ write() {}, reply() {} });
  host.api.appendAtomic('é'); host.api.appendAtomic('🧱');
  assert.equal(host.metrics.writeBytes, 6); assert.equal(host.metrics.peakRetainedBytes, 6);
  const records = host.api.readRecords(); records.length = 0;
  assert.deepEqual(host.snapshot(), ['é', '🧱']);
  host.api.replaceAtomic('x');
  assert.equal(host.metrics.writeBytes, 7); assert.equal(host.metrics.peakRetainedBytes, 6);
  assert.deepEqual(host.snapshot(), ['x']); assert.equal(host.metrics.recoveryBytes, 6);
});

const designs = enumerateDesigns();
const each = designs.find(artifact => artifact.storage.op === 'append-journal' && artifact.commit.op === 'each');
const batch = designs.find(artifact => artifact.storage.op === 'append-journal' && artifact.commit.op === 'bounded-batch' && artifact.commit.maxItems === 4 && artifact.commit.maxTicks === 3);
const mutations = [
  {
    id: 'reply-before-durable-write', artifact: each,
    from: "    if (!seen.has(command.id)) persist([{ id: command.id, key: command.key, delta: command.delta }]);\n    host.reply(callId, { id: command.id, accepted: true });",
    to: "    host.reply(callId, { id: command.id, accepted: true });\n    if (!seen.has(command.id)) persist([{ id: command.id, key: command.key, delta: command.delta }]);",
  },
  { id: 'volatile-only-commit', artifact: each, from: '    host.appendAtomic(JSON.stringify({ v: 1, commands }));', to: '    void commands;' },
  { id: 'lost-recovery-replay', artifact: each, from: '    apply(frame.commands);', to: '    void frame.commands;' },
  { id: 'rewrite-committed-duplicate', artifact: each, from: 'if (!seen.has(command.id)) persist(', to: 'if (true) persist(' },
  { id: 'drop-pending-waiter', artifact: batch, from: '      existing.waiters.push(callId);', to: '      void callId;' },
  { id: 'missing-deadline-flush', artifact: batch, from: 'now - oldest >= 3', to: 'now - oldest >= 30' },
  { id: 'duplicate-resets-deadline', artifact: batch, from: '      existing.waiters.push(callId);', to: '      existing.waiters.push(callId); oldest = host.now();' },
  { id: 'cross-key-corruption', artifact: each, from: 'totals.set(command.key, (totals.get(command.key) ?? 0) + command.delta);', to: "totals.set('wrong', (totals.get('wrong') ?? 0) + command.delta);" },
  { id: 'drop-acknowledgement', artifact: each, from: '    host.reply(callId, { id: command.id, accepted: true });', to: '    void callId;' },
  { id: 'capacity-flush-too-early', artifact: batch, from: 'if (pending.size >= 4) flush();', to: 'if (pending.size >= 1) flush();' },
  { id: 'capacity-flush-too-late', artifact: { ...batch, commit: { ...batch.commit, maxItems: 2 } }, from: 'if (pending.size >= 2) flush();', to: 'if (pending.size >= 4) flush();' },
  { id: 'fourth-reply-wrong-payload', artifact: batch, from: 'host.reply(callId, { id: entry.command.id, accepted: true });', to: "host.reply(callId, { id: entry.command.id === 'four' ? 'wrong' : entry.command.id, accepted: true });" },
  { id: 'fourth-reply-reuses-call', artifact: batch, from: 'host.reply(callId, { id: entry.command.id, accepted: true });', to: "host.reply(entry.command.id === 'four' ? 'capacity-0' : callId, { id: entry.command.id, accepted: true });" },
];
const sensitivity = [];
for (const mutation of mutations) {
  const source = compile(mutation.artifact);
  assert.equal(source.split(mutation.from).length, 2, `mutation must replace one site: ${mutation.id}`);
  const altered = source.replace(mutation.from, mutation.to);
  const module = await import(`data:text/javascript;base64,${Buffer.from(altered).toString('base64')}`);
  const result = qualify(module.create, mutation.artifact.commit, undefined, 1);
  assert.equal(result.correct, false, `mutant survived: ${mutation.id}`);
  sensitivity.push({ id: mutation.id, detected: true, category: result.counterexample.error.split(':')[0] });
  assertions += 1;
}

// Prove that the second-crash branch adds sensitivity beyond the one-crash set.
const originalFactory = await factoryFor(each);
const creationCounts = new WeakMap();
function secondRecoveryLoss(host) {
  const count = (creationCounts.get(host) ?? 0) + 1;
  creationCounts.set(host, count);
  const service = originalFactory.create(host);
  return count < 3 ? service : { ...service, read: () => 0 };
}
assert.equal(qualify(secondRecoveryLoss, each.commit, undefined, 1).correct, true);
assert.equal(qualify(secondRecoveryLoss, each.commit, undefined, 2).correct, false);
sensitivity.push({ id: 'second-recovery-loss', detected: true, category: 'ContractViolation', survivesOneCrash: true });
assertions += 1;

const duplicateSource = compile(batch)
  .replace('  const pending = new Map();', '  const pending = new Map(); const deferred = [];')
  .replace('      host.reply(callId, { id: command.id, accepted: true });\n      return;', '      deferred.push({callId, id: command.id});\n      return;')
  .replace('  function tick(now) {', '  function tick(now) { for (const item of deferred.splice(0)) host.reply(item.callId, {id:item.id, accepted:true});');
const deferredDuplicate = await import(`data:text/javascript;base64,${Buffer.from(duplicateSource).toString('base64')}`);
assert.equal(qualify(deferredDuplicate.create, batch.commit, undefined, 1).correct, false);
sensitivity.push({ id: 'deferred-committed-duplicate', detected: true, category: 'ContractViolation' });
assertions += 1;

const spaces = [];
const faultFixtures = JSON.parse(readFileSync(new URL('./fixtures/faults.json', import.meta.url), 'utf8')).scenarios;
for (const artifact of designs) {
  const factory = await factoryFor(artifact);
  for (const fixture of faultFixtures) {
    const baseline = executeTrace(factory.create, artifact.commit, fixture);
    const boundaries = new Set(baseline.sites.map(site => site.label));
    for (const required of ['write:before', 'write:after', 'reply:before', 'reply:after', 'recovery-read:before', 'recovery-read:after']) {
      assert.ok(boundaries.has(required), 'every construction/scenario must reach durable writes and replies inside its fault window');
    }
    assertions += 1;
  }
}
for (const id of [...CONTEXT_IDS, 'dev_burst', 'dev_paced']) {
  const context = loadContext(id);
  assert.equal(workloadTraces(context).length, 6);
  const space = await enumerateSpace(context);
  assert.equal(space.designs.length, 10);
  assert.equal(space.designs.every(design => design.correct), true);
  assert.ok(space.feasibleCount >= 2);
  assert.ok(space.paretoCount >= 2);
  assert.ok(Number.isSafeInteger(space.optimum) && space.optimum > 0);
  for (const design of space.designs) {
    assert.ok(design.qualification.counts.every(count => count > 0));
    assert.equal(design.qualification.bound.maxCrashes, 2);
    assert.ok(Object.values(design.metrics).every(value => Number.isSafeInteger(value) && value >= 0));
  }
  spaces.push(space);
  assertions += 7;
}

function optimalSet(space) { return new Set(space.designs.filter(design => design.optimal).map(design => JSON.stringify(design.artifact))); }
for (const [left, right] of [[0, 1], [2, 3]]) {
  const first = optimalSet(spaces[left]); const second = optimalSet(spaces[right]);
  assert.equal([...first].some(key => second.has(key)), false, 'reversal pair shares an optimum');
  assertions += 1;
}

// All fault-space results must be identical on replay; no seeds or random input.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/faults.json', import.meta.url), 'utf8')).scenarios[0];
const factory = await factoryFor(each);
check(() => assert.deepEqual(executeTrace(factory.create, each.commit, fixture, [3, 7]), executeTrace(factory.create, each.commit, fixture, [3, 7])));

check(() => {
  const directory = mkdtempSync(join(tmpdir(), 'construction-evaluate-cli-'));
  try {
    const artifactPath = join(directory, 'artifact.json');
    const cliPath = fileURLToPath(new URL('./evaluate.mjs', import.meta.url));
    const invoke = () => spawnSync(process.execPath, [cliPath, artifactPath, 'write_pressure'],
      { encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024 });
    const raw = JSON.stringify(each);
    writeFileSync(artifactPath, raw);
    const valid = invoke();
    assert.equal(valid.status, 0, valid.stderr);
    const result = JSON.parse(valid.stdout);
    assert.equal(result.valid, true);
    assert.equal(result.correct, true);
    assert.deepEqual(result.artifact, each);
    writeFileSync(artifactPath, raw.replace('"op":"each"', '"op":"each","op":"each"'));
    const duplicate = invoke();
    assert.notEqual(duplicate.status, 0);
    assert.equal(duplicate.stdout, '');
    assert.match(duplicate.stderr, /Duplicate JSON object key/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const evidence = {
  schema: 'pattern-language.construction-instrument-evidence.v1',
  sensitivity,
  spaces: spaces.map(space => ({
    ...space,
    designs: space.designs.map(({ workloads, ...design }) => design),
  })),
};
const evidencePath = new URL('./fixtures/instrument-evidence.json', import.meta.url);
const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
if (process.argv.includes('--record-instrument')) writeFileSync(evidencePath, serialized);
else assert.equal(readFileSync(evidencePath, 'utf8'), serialized, 'frozen instrument evidence changed');
const digest = createHash('sha256').update(serialized).digest('hex');
console.log(`construction instrument: ${assertions} focused checks passed; 10 constructions, 6 contexts, ${sensitivity.length} detected faults; evidence ${digest}`);
