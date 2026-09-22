# Linked construction procedure

Grow a construction from the service's whole context. At each step identify the
current competing forces, apply a fitting pattern, and follow its links into
the next unresolved part. The names below organize the supplied operator facts;
they add no new operators or requirements.

## Durable history

Context: the partial service needs a durable representation. Forces: writing
each change competes with retaining and replaying its history. Resolution:
construct storage with `append-journal` when its command frames fit the current
workload, budgets and objective. Larger pattern: the recoverable service.
Smaller links: choose either **Commit now** or **Bounded accumulation** to
determine frame contents and frequency. Alternative: **Durable whole**.

## Durable whole

Context: the partial service needs a durable representation. Forces: replacing
all current totals and IDs competes with retaining and recovering historical
commands. Resolution: construct storage with `replace-snapshot` when its full
state writes fit the current workload, budgets and objective. Larger pattern:
the recoverable service. Smaller links: choose **Commit now** or **Bounded
accumulation** to determine replacement frequency. Alternative: **Durable
history**.

## Commit now

Context: the service must turn an unseen submission into a durable effect and
reply. Forces: prompt acknowledgement competes with combining writes.
Resolution: construct commit with `each` when immediate individual commits fit
the context. Prerequisite link: **Durable history** or **Durable whole** must
persist before the reply. Effect on the whole: evaluate the chosen storage's
cost under one-command commits. Alternative: **Bounded accumulation**.

## Bounded accumulation

Context: the service can hold pending work before making it durable. Forces:
combining writes competes with reply delay and loss of pending memory on crash.
Resolution: construct `bounded-batch` with an admitted size and deadline whose
actual flushes fit the arrivals and budgets. Prerequisite links: a durable
storage pattern and fair ticks. Pending duplicates share a command, add
waiters and do not extend its deadline; committed duplicates need no write.
Effect on the whole: use these batches to reconsider storage bytes and recovery
work. Alternative: **Commit now**; alternative parameters remain candidates.

## Apply the language

Begin with an empty construction and the supplied workload and objective. Choose
the unresolved part whose forces most constrain the whole. Apply one fitting
pattern, follow its prerequisite and smaller links, and reassess the context it
creates for the remaining choice. Use actual arrival timing, public encodings
and resource definitions; pattern names are not evidence of a good fit.

Once the construction is complete, check every budget and compute its objective
from the combined behavior. If a link introduces a conflict, revisit the
earlier choice or its parameters. Compare the feasible alternatives in the
small permitted space; keep a minimum-cost whole, accepting any tie. Do not
optimize an unstated goal or retain a pattern merely because it was chosen first.

Return only the closed JSON artifact for the resulting construction. Do not
return the sequence, calculations, explanations, source code or extra fields.
