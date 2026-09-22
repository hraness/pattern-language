# Requirement-coverage procedure

Use the public task, shared facts and artifact contract. Work through this flat
checklist to produce the requested design, then implement it in the code stage.

- Identify the actual accepted-work and active-work bounds. Record who owns each
  unfinished item; distinguish selection from responsibility for execution.
- Choose a permitted ordering policy and keep it consistent. Record all public
  states and the valid transitions, including no-op, duplicate and error paths.
- Identify the environment's real commit boundary. Check whether state and
  result publication must survive recovery; specify the required durable data
  only where the task needs it. Do not infer external-effect atomicity.
- Check whether obsolete workers can finish after a newer attempt. Preserve the
  necessary identity across recovery where required. Omit this mechanism when
  there are no such workers or attempts.
- Check completion, receipt consistency and the stated progress continuation.
  For synchronous calculation, return or throw without background machinery.
- Cross-check the whole contract: ownership is not lost when capacity changes;
  publication follows the promised state boundary; recovery does not revive
  terminal work. Validate required inputs and preserve caller-owned data.
- Record each permitted design decision, one short reason, the allowed effects
  and exact transition triples in the common artifact. Exclude unneeded effects
  and contract-forbidden transitions. The technical facts above the checklist
  are the same as those available in the other study arms.

When asked for code, implement the task and your recorded commitments. Do not
add persistence, scheduling or abstractions solely to fill checklist categories.
Return only the artifact requested for the current stage.
