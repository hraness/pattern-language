// Independent public-contract oracle. No compiler, storage decoding, or design labels.
export class ContractViolation extends Error {
  constructor(message) { super(message); this.name = 'ContractViolation'; }
}

export class ContractOracle {
  constructor(commands) {
    if (!Array.isArray(commands) || commands.length !== 3) throw new Error('oracle requires three identities');
    this.commands = commands.map(command => ({ ...command }));
    this.index = new Map(this.commands.map((command, index) => [command.id, index]));
    if (this.index.size !== 3) throw new Error('oracle requires distinct identities');
    this.invoked = 0;
    this.possible = new Set([0]);
    this.calls = new Map();
    this.replyLatencies = [];
    this.activeInvocation = null;
  }

  fail(message) { throw new ContractViolation(message); }

  // A commit may occur between observations, but can never remove an effect.
  expand(predicate = () => true) {
    const next = new Set();
    for (const prior of this.possible) {
      for (let mask = 0; mask < 8; mask += 1) {
        if ((mask & prior) === prior && (mask & ~this.invoked) === 0 && predicate(mask)) next.add(mask);
      }
    }
    if (next.size === 0) this.fail('no monotonic committed subset explains observations');
    this.possible = next;
  }

  definitelyCommitted(id) {
    const bit = 1 << this.index.get(id);
    return [...this.possible].every(mask => (mask & bit) !== 0);
  }

  submit(callId, command, now) {
    if (this.calls.has(callId)) this.fail('reused call identity');
    const index = this.index.get(command.id);
    const expected = this.commands[index];
    if (!expected || expected.key !== command.key || expected.delta !== command.delta) this.fail('outside input domain');
    const duplicate = this.definitelyCommitted(command.id);
    this.invoked |= 1 << index;
    this.calls.set(callId, { id: command.id, submittedAt: now, active: true, replied: false });
    this.activeInvocation = { duplicate, callId };
  }

  endCall(completed = false) {
    if (completed && this.activeInvocation?.duplicate && !this.calls.get(this.activeInvocation.callId).replied) {
      this.fail('committed duplicate did not reply during submit');
    }
    this.activeInvocation = null;
  }

  write() {
    if (this.activeInvocation?.duplicate) this.fail('committed duplicate caused another write');
  }

  reply(callId, value, now) {
    const call = this.calls.get(callId);
    if (!call || !call.active || call.replied) this.fail('reply to unknown, abandoned, or already replied call');
    if (!value || Object.keys(value).sort().join(',') !== 'accepted,id' || value.id !== call.id || value.accepted !== true) {
      this.fail('reply does not match the public contract');
    }
    const bit = 1 << this.index.get(call.id);
    this.expand(mask => (mask & bit) !== 0);
    call.replied = true;
    this.replyLatencies.push(now - call.submittedAt);
  }

  read(key, value) {
    if (!Number.isSafeInteger(value)) this.fail('read is not a safe integer');
    this.expand(mask => this.commands.reduce((total, command, index) => (
      total + (((mask & (1 << index)) !== 0 && command.key === key) ? command.delta : 0)
    ), 0) === value);
  }

  crash() {
    // A last atomic write may have committed without a reply/read.
    this.expand();
    for (const call of this.calls.values()) call.active = false;
    this.activeInvocation = null;
  }

  checkDeadline(now, maxTicks, afterTick = false) {
    for (const call of this.calls.values()) {
      if (call.active && !call.replied && (maxTicks === 0 || (afterTick && now - call.submittedAt >= maxTicks))) {
        this.fail('live call missed the construction deadline');
      }
    }
  }

  finish() {
    for (const call of this.calls.values()) if (call.active && !call.replied) this.fail('live call did not drain');
    this.expand(mask => mask === 7);
  }
}
