# Design artifact contract

Before implementing the task, return one JSON object with exactly these fields:

```json
{
  "schema": "pattern-language.design.v1",
  "family": "TASK_FAMILY",
  "states": ["STATE"],
  "transitions": [{"event": "EVENT", "from": "STATE", "to": "STATE"}],
  "effects": [],
  "decisions": {"CHOICE_NAME": "CHOICE_VALUE"},
  "rationale": [{"decision": "CHOICE_NAME", "reason": "A short design justification."}]
}
```

Use the task's `model.json` vocabulary, including every decision key and one of
its permitted values. `family` is the vocabulary's family. Declare every state,
transition and effect the implementation may exhibit under the public contract.
Transitions are individual triples, never wildcards. Include the task's no-op and
error transitions, and exclude transitions forbidden by its contract. An effect
being in the vocabulary does not mean the task permits it. In particular, an
empty effects list is the correct representation when no effects are needed.

State names, transitions and effects must be unique. Transition endpoints must
occur in `states`. Give one short rationale for each decision. A rationale can
explain a dependency on another decision, but prose and pattern names earn no
points. Constant decision values document a required boundary; only choices with
multiple permitted values represent alternatives.

The implementation request will receive your exact design response, including
any mistakes, without validation feedback. It must satisfy the task and honor
your declared commitments where compatible with the task. Behavioral correctness,
validity and adequacy of this artifact, and agreement between observed behavior
and the artifact are evaluated separately. Declaring all possible transitions
does not make an adequate model: contract-contradicting transitions are rejected.

Observations come from host-visible state, actual replies and effects. An
implementation cannot establish conformance by reporting its own trace strings.
This artifact is an observable design commitment, not a request for private
reasoning or proof of how a model internally reached its answer.
