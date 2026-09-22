# Context and connected constructions

Use the public task, shared facts and artifact contract as a small construction
language. Start with the whole required outcome. Select a construction only when
its context and competing forces occur; explicitly omit its machinery otherwise.

**Owned admission.** In a context of accepted unfinished work, limited capacity
competes with keeping responsibility for everything accepted. Establish the
owner and the bounded population before choosing dispatch order. This decision
constrains completion and recovery. For a pure selection calculation, retain
only its input/output ownership and selection bound; it owns no execution.

**Committed result.** When state and published results must survive interruption,
prompt publication competes with durable consistency. Place the required state
and receipt on the actual commit boundary before allowing publication. Connect
that boundary to owned admission so freeing capacity does not lose the item.
Omit durability when the task is purely synchronous; never extend a local
transaction's promise to arbitrary external effects.

**Authority after interruption.** When old and new attempts can overlap, recovery
competes with accepting a late obsolete result. Preserve enough identity to
distinguish their authority, connected to the committed state and receipt. If
the context has no workers or interrupted attempts, omit this construction.

**Completion of the whole.** A preserved item can still fail to progress. Connect
admission, authority and terminal publication under the task's stated continuation.
Check that these local constructions agree: recovery cannot revive terminal work,
publication cannot outrun its boundary, and completion cannot discard ownership.
For a pure calculation, the whole completes with a synchronous return or throw.

Derive the common design artifact from the constructions you selected and omitted:
states, exact allowed transitions, effects and permitted decisions. Use the short
decision rationales to note the relevant context or dependency. Cover no-op and
error paths, required input validation and caller-data preservation. In the code
stage, implement the task and those commitments. Pattern names and extra
machinery have no value by themselves. Return only the requested artifact.
