import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { compile, parseArtifact, validateArtifact } from './compiler.mjs';
import { ContractOracle, ContractViolation } from './oracle.mjs';
import { createHost, InjectedCrash } from './host.mjs';

const FIXTURES = JSON.parse(readFileSync(new URL('./fixtures/faults.json', import.meta.url), 'utf8'));
const factories = new Map();
const qualifications = new Map();
const RESOURCE_KEYS = ['commits', 'writeBytes', 'peakRetainedBytes', 'recoveryRecords', 'recoveryBytes', 'recoveryCalls', 'latencyTicks', 'maxLatencyTicks'];
export const CONTEXT_IDS = ['write_pressure', 'recovery_pressure', 'latency_pressure', 'commit_pressure'];

export function loadContext(id) {
  if (![...CONTEXT_IDS, 'dev_burst', 'dev_paced'].includes(id)) throw new Error('unknown context');
  return JSON.parse(readFileSync(new URL(`./contexts/${id}.json`, import.meta.url), 'utf8'));
}

export function permutations(values) {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) => permutations(values.filter((_, candidate) => candidate !== index)).map(tail => [value, ...tail]));
}

export async function factoryFor(artifact) {
  const source = compile(artifact);
  const digest = createHash('sha256').update(source).digest('hex');
  if (!factories.has(digest)) {
    // Only trusted compiler bytes are imported; model output is closed inert data.
    const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    factories.set(digest, { create: module.create, sourceSha256: digest });
  }
  return factories.get(digest);
}

export function executeTrace(create, commit, scenario, faults = []) {
  const oracle = new ContractOracle(scenario.commands);
  const host = createHost(oracle, faults);
  const keys = [...new Set(scenario.commands.map(command => command.key))];
  let service;
  let calls = 0;
  let recoveries = 0;
  const maxTicks = commit.op === 'each' ? 0 : commit.maxTicks;

  function inspectReads() {
    for (const key of keys) {
      host.checkpoint('read:before');
      oracle.read(key, service.read(key));
      host.checkpoint('read:after');
    }
  }

  function recover() {
    for (;;) {
      try {
        host.checkpoint('create:before');
        service = create(host.api);
        recoveries += 1;
        if (!service || Object.keys(service).sort().join(',') !== 'read,submit,tick') throw new ContractViolation('service API mismatch');
        host.checkpoint('create:after');
        // Observe both keys before any retry can conceal acknowledged data loss.
        inspectReads();
        return;
      } catch (error) {
        if (!(error instanceof InjectedCrash)) throw error;
        oracle.crash();
      }
    }
  }

  function operation(step) {
    const op = step.op;
    if (op === 'restart') {
      oracle.crash();
      recover();
      return;
    }
    host.checkpoint(`${op}:before`);
    if (op === 'submit') {
      const callId = `call-${++calls}`;
      const command = scenario.commands[step.command];
      oracle.submit(callId, command, host.now);
      if (service.submit(callId, { ...command }) !== undefined) throw new ContractViolation('submit returned a value');
      oracle.endCall(true);
      oracle.checkDeadline(host.now, maxTicks);
    } else if (op === 'tick') {
      host.advance(step.now);
      if (service.tick(host.now) !== undefined) throw new ContractViolation('tick returned a value');
      oracle.checkDeadline(host.now, maxTicks, true);
    } else if (op === 'read') {
      oracle.read(step.key, service.read(step.key));
    } else throw new Error('unknown trace operation');
    host.checkpoint(`${op}:after`);
  }

  function apply(step) {
    try { operation(step); }
    catch (error) {
      oracle.endCall();
      if (!(error instanceof InjectedCrash)) throw error;
      oracle.crash();
      recover();
    }
  }

  try {
    recover();
    for (const step of scenario.prefix) apply(step);
    host.closeFaultWindow();
    for (const step of scenario.tail ?? []) apply(step);
    if (scenario.retryDrain !== false) {
      for (let command = 0; command < scenario.commands.length; command += 1) apply({ op: 'submit', command });
      const start = host.now;
      for (let delta = 1; delta <= 5; delta += 1) apply({ op: 'tick', now: start + delta });
      // Every construction now has committed duplicates, including capacity-four
      // schedules that had not reached a commit within the faulty prefix.
      for (let command = 0; command < scenario.commands.length; command += 1) apply({ op: 'submit', command });
    }
    inspectReads();
    oracle.finish();
    if (host.consumed.length !== faults.length) throw new Error('unreached injected fault');
    const latencies = oracle.replyLatencies;
    return {
      correct: true, sites: host.sites, recoveries,
      metrics: { ...host.metrics, latencyTicks: latencies.reduce((sum, value) => sum + value, 0), maxLatencyTicks: Math.max(0, ...latencies) },
    };
  } catch (error) {
    return { correct: false, sites: host.sites, recoveries, error: `${error.name}: ${error.message}`, faults: [...faults] };
  }
}

export function checkConstruction(create, commit) {
  // Separate no-fault host observations check construction semantics. The
  // three-ID subset oracle below does not claim to exercise a size-four flush.
  const commands = [
    { id: 'one', key: 'x', delta: 1 }, { id: 'two', key: 'y', delta: 2 },
    { id: 'three', key: 'x', delta: 4 }, { id: 'four', key: 'y', delta: 8 },
  ];
  function fixture() {
    const replies = [];
    const host = createHost({ write() {}, reply: (callId, value) => replies.push({ callId, value }) });
    host.closeFaultWindow();
    const service = create(host.api);
    return { host, service, replies };
  }
  function require(condition, message) { if (!condition) throw new ContractViolation(message); }
  function requireReplies(replies, expected, bindings, message) {
    require(replies.length === expected.size && new Set(replies.map(reply => reply.callId)).size === expected.size
      && replies.every(reply => expected.has(reply.callId) && reply.value
        && Object.keys(reply.value).sort().join(',') === 'accepted,id'
        && reply.value.id === bindings.get(reply.callId) && reply.value.accepted === true), message);
  }
  try {
    const { host, service, replies } = fixture();
    const submitted = [];
    const expected = new Set();
    const bindings = new Map(commands.map((command, index) => [`capacity-${index}`, command.id]));
    bindings.set('capacity-duplicate', commands[0].id);
    bindings.set('committed-duplicate', commands[3].id);
    let writes = 0;
    let committed = 0;
    for (let index = 0; index < 4; index += 1) {
      const callId = `capacity-${index}`;
      service.submit(callId, commands[index]);
      submitted.push(callId);
      if (commit.op === 'each' || (index + 1) % commit.maxItems === 0) {
        writes += 1; committed = index + 1;
        for (const id of submitted) expected.add(id);
      }
      require(host.metrics.commits === writes, 'capacity construction wrote before/after its declared threshold');
      requireReplies(replies, expected, bindings, 'capacity construction replies violate timing, identity, uniqueness or payload');
      for (const key of ['x', 'y']) require(service.read(key) === commands.slice(0, committed).filter(command => command.key === key).reduce((sum, command) => sum + command.delta, 0), 'capacity construction exposed the wrong committed state');
      if (index === 0) {
        service.submit('capacity-duplicate', commands[0]); submitted.push('capacity-duplicate');
        if (commit.op === 'each') expected.add('capacity-duplicate');
        require(host.metrics.commits === writes, 'pending duplicate changed capacity');
        requireReplies(replies, expected, bindings, 'pending/committed duplicate replies violate the contract');
      }
    }
    service.submit('committed-duplicate', commands[3]);
    expected.add('committed-duplicate');
    requireReplies(replies, expected, bindings, 'committed duplicate was delayed or replied incorrectly');
    require(host.metrics.commits === writes, 'committed duplicate was rewritten');
    const recovered = create(host.api);
    require(recovered.read('x') === 5 && recovered.read('y') === 10, 'capacity state did not recover');

    const timed = fixture();
    timed.service.submit('deadline-original', commands[0]);
    const deadline = commit.op === 'each' ? 0 : commit.maxTicks;
    for (let now = 0; now <= 4; now += 1) {
      if (now > 0) { timed.host.advance(now); timed.service.tick(now); }
      if (now === 1) timed.service.submit('deadline-duplicate', commands[0]);
      const shouldCommit = now >= deadline;
      const expectedReplies = new Set(shouldCommit ? (now >= 1 ? ['deadline-original', 'deadline-duplicate'] : ['deadline-original']) : []);
      require(timed.host.metrics.commits === (shouldCommit ? 1 : 0), 'deadline construction wrote before/after its declared deadline');
      requireReplies(timed.replies, expectedReplies, new Map([['deadline-original', commands[0].id], ['deadline-duplicate', commands[0].id]]), 'deadline construction replies violate timing, identity, uniqueness or payload');
      require(timed.service.read('x') === (shouldCommit ? 1 : 0), 'deadline construction exposed the wrong committed state');
    }
    return { correct: true, scenarios: ['four-command-capacity-with-duplicates', 'single-command-deadline-with-duplicate'], faults: 0 };
  } catch (error) {
    return { correct: false, error: `${error.name}: ${error.message}` };
  }
}

export function qualify(create, commit, fixtures = FIXTURES.scenarios, maxCrashes = 2) {
  if (![0, 1, 2].includes(maxCrashes)) throw new Error('unsupported fault bound');
  const construction = checkConstruction(create, commit);
  const counts = [0, 0, 0];
  if (!construction.correct) return { correct: false, counts, construction, counterexample: { scenario: 'construction-policy', error: construction.error } };
  const scenarios = [];
  for (const fixture of fixtures) {
    const local = [0, 0, 0];
    function run(faults) {
      const result = executeTrace(create, commit, fixture, faults);
      counts[faults.length] += 1;
      local[faults.length] += 1;
      return result;
    }
    const base = run([]);
    if (!base.correct) return { correct: false, counts, counterexample: { scenario: fixture.id, ...base } };
    if (maxCrashes >= 1) {
      for (const first of base.sites) {
        const once = run([first.index]);
        if (!once.correct) return { correct: false, counts, counterexample: { scenario: fixture.id, ...once } };
        if (maxCrashes >= 2) {
          // The first crash changes subsequent recovery sites. Enumerating this
          // actual branch, not baseline site pairs, covers every second site.
          for (const second of once.sites.filter(site => site.index > first.index)) {
            const twice = run([first.index, second.index]);
            if (!twice.correct) return { correct: false, counts, counterexample: { scenario: fixture.id, ...twice } };
          }
        }
      }
    }
    scenarios.push({ id: fixture.id, counts: local });
  }
  return { correct: true, counts, scenarios, construction, bound: { maxCrashes, placement: 'every reachable declared boundary in each frozen prefix', recoveryInterrupted: true, stableRetryDrainTicks: 5, committedDuplicateRetriesAfterDrain: true } };
}

export function workloadTraces(context) {
  const workload = context.workload;
  if (context.schema !== 'pattern-language.construction-context.v1' || workload.orders !== 'all-permutations' || workload.commands.length !== 3) throw new Error('unsupported context');
  return permutations([0, 1, 2]).map((order, index) => {
    const prefix = [];
    const keys = [...new Set(workload.commands.map(command => command.key))];
    const lastArrival = Math.max(...workload.arrivalTicks);
    for (let now = 0; now <= lastArrival + workload.drainTicks; now += 1) {
      if (now > 0) prefix.push({ op: 'tick', now });
      if (now === workload.duplicateFirstAtTick) prefix.push({ op: 'submit', command: order[0] });
      for (let position = 0; position < order.length; position += 1) {
        if (workload.arrivalTicks[position] === now) prefix.push({ op: 'submit', command: order[position] });
      }
      for (const key of keys) prefix.push({ op: 'read', key });
    }
    for (const command of order) prefix.push({ op: 'submit', command });
    for (let restart = 0; restart < workload.recoveryCycles; restart += 1) prefix.push({ op: 'restart' });
    return { id: `${context.id}-${index}`, commands: workload.commands, prefix: [], tail: prefix, retryDrain: false };
  });
}

export async function evaluate(artifact, context) {
  const validated = validateArtifact(artifact);
  if (!validated.valid) return { valid: false, correct: false, feasible: false, errors: validated.errors, metrics: null, objective: null };
  const canonical = validated.artifact;
  const { create, sourceSha256 } = await factoryFor(canonical);
  if (!qualifications.has(sourceSha256)) qualifications.set(sourceSha256, qualify(create, canonical.commit));
  const qualification = qualifications.get(sourceSha256);
  if (!qualification.correct) return { valid: true, correct: false, feasible: false, artifact: canonical, sourceSha256, qualification, metrics: null, objective: null };
  const metrics = Object.fromEntries(RESOURCE_KEYS.map(key => [key, 0]));
  const workloads = [];
  for (const trace of workloadTraces(context)) {
    const result = executeTrace(create, canonical.commit, trace);
    if (!result.correct) return { valid: true, correct: false, feasible: false, artifact: canonical, sourceSha256, qualification, workloadFailure: result, metrics: null, objective: null };
    for (const key of RESOURCE_KEYS) {
      metrics[key] = ['peakRetainedBytes', 'maxLatencyTicks'].includes(key) ? Math.max(metrics[key], result.metrics[key]) : metrics[key] + result.metrics[key];
    }
    workloads.push({ id: trace.id, metrics: result.metrics });
  }
  const budgetFailures = Object.entries(context.budgets).filter(([key, limit]) => !RESOURCE_KEYS.includes(key) || metrics[key] > limit).map(([key]) => key);
  let objective = 0;
  for (const [key, weight] of Object.entries(context.objective.weights)) {
    if (!RESOURCE_KEYS.includes(key) || !Number.isSafeInteger(weight) || weight < 0) throw new Error('invalid objective weight');
    objective += metrics[key] * weight;
  }
  if (!Number.isSafeInteger(objective)) throw new Error('objective is not a safe integer');
  return { valid: true, correct: true, feasible: budgetFailures.length === 0, artifact: canonical, sourceSha256, qualification, metrics, objective, budgetFailures, workloads };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const parsed = parseArtifact(readFileSync(process.argv[2], 'utf8'));
  if (!parsed.valid) throw new Error(`Invalid construction: ${parsed.errors.join('; ')}`);
  const context = loadContext(process.argv[3]);
  process.stdout.write(`${JSON.stringify(await evaluate(parsed.artifact, context), null, 2)}\n`);
}
