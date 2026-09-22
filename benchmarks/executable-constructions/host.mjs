import { ContractViolation } from './oracle.mjs';

export class InjectedCrash extends Error {
  constructor(site) { super(`injected crash at ${site}`); this.name = 'InjectedCrash'; }
}

export function createHost(oracle, faults = []) {
  let records = [];
  let now = 0;
  let open = true;
  let checkpointCount = 0;
  const faultSet = new Set(faults);
  const sites = [];
  const consumed = [];
  const metrics = { commits: 0, writeBytes: 0, peakRetainedBytes: 0, recoveryRecords: 0, recoveryBytes: 0, recoveryCalls: 0 };
  const bytes = text => Buffer.byteLength(text, 'utf8');

  function checkpoint(label) {
    if (!open) return;
    checkpointCount += 1;
    sites.push({ index: checkpointCount, label });
    if (faultSet.has(checkpointCount)) {
      consumed.push(checkpointCount);
      throw new InjectedCrash(checkpointCount);
    }
  }

  function write(record, replace) {
    if (typeof record !== 'string') throw new ContractViolation('durable record is not a string');
    checkpoint('write:before');
    oracle.write();
    records = replace ? [record] : [...records, record];
    metrics.commits += 1;
    metrics.writeBytes += bytes(record);
    metrics.peakRetainedBytes = Math.max(metrics.peakRetainedBytes, records.reduce((sum, row) => sum + bytes(row), 0));
    checkpoint('write:after');
  }

  const api = Object.freeze({
    now: () => now,
    readRecords() {
      checkpoint('recovery-read:before');
      metrics.recoveryCalls += 1;
      metrics.recoveryRecords += records.length;
      metrics.recoveryBytes += records.reduce((sum, row) => sum + bytes(row), 0);
      const result = [...records];
      checkpoint('recovery-read:after');
      return result;
    },
    appendAtomic: record => write(record, false),
    replaceAtomic: record => write(record, true),
    reply(callId, value) {
      checkpoint('reply:before');
      oracle.reply(callId, value, now);
      checkpoint('reply:after');
    },
  });

  return {
    api, metrics, sites, consumed, checkpoint,
    get now() { return now; },
    advance(value) {
      if (!Number.isSafeInteger(value) || value < now) throw new Error('invalid host clock');
      now = value;
    },
    closeFaultWindow() { open = false; },
    snapshot() { return [...records]; },
  };
}
