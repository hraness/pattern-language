# Village-decomposition replicate — stopped by spend cap — 2026-09-23

A second gateway study on `anthropic/claude-sonnet-4.6`, prepared identically
to `../2026-09-23-gateway-study`. It stopped after 11 admissions / 10 responses
($0.66) when the shared gateway API key reached its **$10.00 platform budget**
(HTTP 402 `quota_for_entity_exceeded`), recorded as `usd-budget-exceeded` —
the bounded-spend control working as designed: a hard quota is not a transient
failure, so the run stopped rather than retrying.

The 10 completed responses scored against the reference for the record
(evaluation.json): 6 valid artifacts. This is a partial run — it is not the
comparison; the completed sibling run carries that evidence.

To re-run the replicate: the shared key needs budget headroom (raise the
gateway key's cap or issue a study-scoped key), then `prepare` + `run` under
`VILLAGE_PROVIDER_FILE=provider-gateway.py`. Replay this stopped run's bytes
with the same extraction procedure as the completed study's README.
