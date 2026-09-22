# Shared design facts

These facts and the full task contract are identical in all study arms. Apply
only what the task needs. The task contract takes precedence over a general rule.

1. **Admission and ownership.** A bound needs a precise population: accepted but
   unfinished work differs from currently active work. Every accepted item needs
   an owner until its required result is available. Ordering policies can be
   legitimate alternatives; choose one consistently. A pure selection calculation
   does not accept responsibility for executing the selected work.
2. **State and publication.** Separate a tentative calculation from a committed
   state and from publication of its result. Persist enough identity and result
   data to recognize duplicates when the contract requires recovery. A promised
   atomic boundary must actually be supplied by the environment. No local store
   transaction makes arbitrary external effects atomic. Pure functions need no
   durable store or publication protocol.
3. **Recovery and stale authority.** A restarted process cannot depend on volatile
   memory. An obsolete worker must not overwrite a later valid result. A durable
   generation/token can distinguish attempts when such workers exist. If there
   are no workers, restarts or overlapping attempts, this machinery is unnecessary.
4. **Completion and omission.** Preserving an item is distinct from making it
   progress; state the continuation under which it completes. Terminal receipts
   must remain consistent with the required state. A synchronous calculation
   finishes by returning or throwing; it requires no background completion system.
5. **Whole-contract consistency.** A local change can violate another boundary:
   freeing capacity too early loses ownership, publishing too early loses
   durability, and broad recovery can revive finished work. Trace the public
   effects and no-op/error paths as well as ordinary success. Validate all inputs
   required by the task, preserve caller data, and distinguish contract obligations
   from optional implementation choices.

The design artifact records externally checkable commitments using the supplied
vocabulary. Its short rationales explain decisions, but correctness is measured
by behavior and agreement with observed executions, not persuasive descriptions.
