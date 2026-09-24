# pattern-language conventions

Manifests are data (`algal.organism.v1`). Runtime: `bunx github:hraness/algal`.

## Adding a pattern

1. `patterns/<kebab-name>.algal.json` — the constructive diagram. The `note`
   field carries the Alexander metadata: `Pattern. Context: ... Forces:
   [+|-] ... Resolution: ...` plus larger/smaller links.
2. `patterns/<name>.args.json` — deterministic args so the pattern runs.
3. `patterns/<name>.responses.json` — only when the pattern has
   agent/decide cells; keyed by cell id (a list value serves per-item
   activations inside `each`).
4. Register it in `catalog/patterns.json` with context, forces, and links.

## Adding a program (method step)

Same shape under `programs/`. If it embeds a sub-manifest by digest
(`each`/`organism`/`repeat` cell), compute the digest with
`algal digest <file>` and wire `--modules programs/` for resolution.

## Delivery

- GitHub `main_policy=checked-pr`: publish task changes through a pull request,
  independent review, the full local gate and applicable GitHub checks.
- Historical `habitat/` tournaments are demonstrations: their reused holdout
  and reference-derived feedback do not establish generalization. New design
  claims need frozen code artifacts and independent behavioral evaluation.

## Gates

- `bash scripts/verify.sh` is the full gate: `check` on every manifest,
  replay of every fixture, village data integrity, and the decompose
  benchmark (historical Rand ≥ 0.6 plus ARI above a fixed size-preserving
  shuffled baseline), metric regression tests, and code-design evaluator checks.
- `bunx github:hraness/algal check <manifest>` must pass before commit.
- Deterministic manifests (no agent/decide cells) must run with `--args`
  alone. Judgment manifests must replay with `--responses`.
- Ensembles use contract `pattern.ensemble.v1`: `{name, context, misfits:
  [{id, text}], links: [{a, b, sign, why}]}`. Links are claims until a
  receipted `correlate` run re-derives them — keep the `why` honest.
- Everything is bounded: declare `budgets`; ensembles over 8 misfits exceed
  `correlate`'s `maxItems` and should be decomposed first.
- `expr` fuel ceiling is 1M per activation — decomposition-scale math on
  the village graph (141 misfits × 1434 links) does not fit; score it
  offline via `scripts/decompose-village.py`, which shares the manifest's
  linkage criterion but differs in merge/tie ordering. Do not claim exact
  partition parity without a comparison test.
- Digest discipline: editing an embedded manifest changes its digest —
  rewire every parent (`algal digest`, then update `manifest` fields in
  `decompose`, `synthesize`, `correlate`) before committing.
- Foundry configs are strict: `expect` names interface outputs only (put
  extra criteria in `args` or the scorer); configs reject unknown keys
  like `note`; candidates must run without executors if the report is to
  `foundry verify` offline.
- Live runs: `decide` cells route to Jev via `route.provider`; `agent`
  cells go through `--executor-cmd scripts/agent-executor.py` (local
  `claude -p`). Live receipts are execution evidence — they don't replay
  deterministically, so keep scripted fixtures for `verify.sh`.
- Mark proposals as proposals. A manifest that needs a host fn or tool that
  doesn't exist yet is a proposal, not a pattern.

<!-- hraness-public-copy:start -->
- Public copy (websites, READMEs, docs, package and GitHub descriptions, CLI help, `llms.txt`, generated pages) follows `STYLE.md`, synced from hraness/.github. Text a model writes for publication also follows `GENERATION_STYLE.md`.
- The delivery vocabulary in this file (admission, qualification, custody, receipt, bounded, lane, gate, surface, projection) is internal. Translate it into what the reader gets.
- Take one-line product and sibling descriptions from the portfolio registry and versions from the release record. Tests pin facts, not prose.
- Run `bun run check:copy` before handoff when the repository has it.
<!-- hraness-public-copy:end -->

<!-- hraness-delivery:start -->
- Treat the user's request to change this repository as standing authorization for routine task-owned commits, pushes, pull requests, merges, releases, deployments, and production verification after the gates applicable to that action pass. Do not ask for duplicate confirmation. Build confidence through relevant automated checks, bounded diagnostics, and independent review, not another human approval. Passing checks does not expand task scope or authority.
- Prefer agentic service provisioning for new infrastructure. Check Vercel Marketplace for a native product that can provision the required resource first; use Stripe Projects as a supported alternative when it better covers the service or the Marketplace route only connects an existing account. Verify the current catalog, account, region, plan, recurring cost and resource capabilities before selecting a route. Prefer supported provider CLIs or APIs over browser-only setup when neither catalog fits, and explain the concrete exception. Reuse existing owner-controlled resources where appropriate; this preference alone does not authorize migrations, duplicate accounts, paid upgrades or wider access. Continue setup already authorized by the task and budget without duplicate confirmation. Keep provider credentials and generated environment files private, complete required interactive authentication, and verify deployment, persistence and recovery separately from successful provisioning.
- Separate artifact admission from live qualification and operational activation. Use applicable automated source, security, package/install, and provenance evidence for artifact admission; live provider qualification is not a universal publication prerequisite. Preserve explicit live acceptance criteria and require relevant live evidence for claims that depend on it. If publication or an artifact's install, upgrade, or default-use path activates risky unqualified behavior, keep that behavior guarded or disabled, or obtain bounded relevant evidence before shipping or activation.
- Use the repository's documented delivery workflow and preserve the identity, target, capacity, migration, and recovery guards applicable to operational activation. Replace an obsolete gate through a reviewed source and policy change with corresponding tests, never an ad hoc skip. Preserve every runtime-enforced approval, access control, branch protection, environment rule, safety policy, and required final gate. Ask for user input only when delivery needs a material product decision, missing credentials or authority, unavoidable interactive authentication, an irreversibly destructive action outside task scope, or resolution of a failure that cannot be handled safely and autonomously.
- Preserve production and user data throughout delivery. Inspect the exact account, environment, deployment, and data target before writes. For data changes, inspect a dry run or equivalent migration plan and validate the recovery path before any effect that could lose or corrupt data. Prefer additive, backward-compatible migrations and bounded batches. Record mutation intent, use idempotency or conditional writes, and reconcile uncertain results before retrying. Verify deployed identity, health, and relevant data invariants after delivery. Routine delivery never authorizes resetting, truncating, dropping, or overwriting user data; stop the unsafe operation if preservation or recovery cannot be established.
- Prefer short-lived repository workload identities such as OIDC trusted publishing, GitHub Apps, and narrowly scoped machine identities. Use unattended stable publication and production promotion when supported by the provider and repository. Establish supported machine authority once and verify it with a non-publishing preflight where available; routine releases should not require recurring interactive authentication or conversational approval. Releases and deployments run without a human in the loop: do not add required reviewers, manual approval environments, or wait timers to release or deployment paths, and remove any you find through a reviewed change. Keep account two-factor authentication, and do not add long-lived personal tokens.
- Keep delivery gates proportional to the failure they prevent. Prefer required checks on the current integration candidate, independent agent review, and atomic or conditional integration. Add a merge queue or another approval stage only for a demonstrated coordination or safety need. Replace redundant queues, serial waits, and duplicate checks through reviewed policy changes while retaining evidence for the integrated result.
- Preserve useful reasoning fan-out, but avoid unnecessary checkout fan-out. Prefer subagents in the current task for bounded research, review, diagnosis, and focused checks when they can safely share one working tree; create a separate task or worktree only for independently deliverable divergent edits, an isolated verification tree, or a different execution environment.
- Give each expensive focused validation command and external wait one owner. The integration owner reviews that evidence and runs the repository-required aggregate or final gate once after convergence. Reuse evidence only for the exact Git tree, command, lockfiles, toolchain, relevant environment, and validity period, and never to skip a required final integration, merge, release, deployment, or production-verification gate.
- On Hraness development machines, use the installed host scheduler for heavyweight top-level commands when available. Keep ordinary work in the compute lane; give authenticated browser/dev-server/Chromium work one `browser-auth` owner and Mac-only validation one `mac-native` owner.
- When a CI or policy gate scans complete Git history, check out the exact governed SHA and fetch only the fully qualified governed refs before scanning. Preserve the complete-history gate and reject unexpected refs instead of importing unrelated concurrent heads.
- At closeout, record applicable branch, PR, check, merge, release, deployment, and production evidence. Archive only conclusively finished tasks, never from silence alone, and reclaim only freshly revalidated clean merged worktrees through the guarded exact-path flow.
<!-- hraness-delivery:end -->
