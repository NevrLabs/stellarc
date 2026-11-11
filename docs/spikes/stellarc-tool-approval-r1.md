# Durable tool approval + single-claim primitive — R1

Status: SOURCE DELIVERED; integration HOLD. RED receipt recorded; final GREEN,
strict typecheck, formatting and build receipts remain unavailable. Supervisor
stopped the worker's recovery poller (`proc_f1de4ffad4a1`; readback confirms
killed, exit -15). No automatic gate resumption is armed by this lane.
Independent GPT source-only council R2 is assigned; it cannot establish runtime
acceptance while builder access remains blocked.
Lane: GLM implementation slice under Terminus supervisor, worktree
`spike/auth-llmgw-maple`. Owned files: `apps/stellarc-gateway/src/tool-approval.ts`,
`apps/stellarc-gateway/src/tool-approval-check.ts`, this report. Nothing else
edited (store/main/mcp/migrate/auth/audit/manifests/lock/provider/openapi/
remote-mcp untouched).

## 1. Independent cross-model review — OpenAPI gate/dispatch callback boundary

Reviewed `openapi-operation.ts` (verified SHA-256
`a8fda8f605f9bc85920ba05ee76c23e59252775e5a53ca3b84fe9d7aafcb90f1`) read-only,
with the R1 report and Executor's `pending-approval.ts` (deployed rev
`2dc399e51094fccd2a45103a38d77179c6d648ff`) for prior art. No source changes.
Findings (all integration-contract level; the executor itself fails closed in
each case — the risk is in how an approval queue binds to it):

- **F1 — per-principal context exists only in constructor-time closure.**
  `execute(operation, input, callerSignal?)` carries no verified-context
  parameter; `hooks.authorize` is captured once at `createOperationExecutor`.
  A process-scoped shared executor binds ONE principal's authority closure to
  every caller (confused deputy). Integration must construct one executor per
  authenticated request (or thread context through the closure), never share an
  instance across principals. The queue below therefore takes context from the
  store-verified admission, not from the executor handle.
- **F2 — `identity.binding`/`requestDigest` are principal-agnostic.** Two
  principals (or orgs) submitting byte-identical frozen args produce identical
  bindings. An approval queue keyed by `identity.binding` alone lets A's
  approval release B's dispatch. The queue MUST key claims on verified
  org/actor/subject/delegation/run ∪ binding (this module persists
  `context_digest` over exactly that union and refuses release on mismatch).
- **F3 — dispatch-phase `requiresApproval` is indistinguishable from gate-phase
  pause.** A rights/approval regression between the two callbacks returns the
  same retryable paused result, inviting re-execute loops that re-resolve a
  credential each pass without dispatch. Single-claim integrations must answer
  a lost/replayed claim with `deny` (fail closed), never `requiresApproval`;
  this module's claim API has no deferral shape at all for that reason.

Verdict: boundary acceptable as a seam for the queue primitive; F1/F2 are
binding obligations on the integration, recorded in §4.

## 2. Primitive contract (delivered)

New files only — `apps/stellarc-gateway/src/tool-approval.ts` (module) and
`tool-approval-check.ts` (exercise). `docs/spikes/stellarc-tool-approval-r1.md`
(this report) is the third owned artifact. No other file touched; verified by
`git status` (only pre-existing lane modifications `apps/web/vite.config.ts`,
`bun.lock` from other agents remain).

### States

`pending → approved | declined | cancelled | expired` (human decide /
lazy expiry),
`approved → dispatching` (single claim) `→ succeeded | failed | outcome_unknown`
(executor report / lease-expired recovery classification). There is no
automatic retry, reclaim, or re-release after a claim; recovery only
classifies a lease-expired dispatch as `outcome_unknown` — an external effect
that may have started is never recorded as success.

### Owner-only schema export

`toolApprovalSchema` is a plain exported string (`gw_tool_approval` + partial
queue index on `(org, created_at) WHERE state IN ('pending','approved')`).
No runtime code path executes it; the check applies it as the PG owner, the
runtime role receives only `SELECT,INSERT,UPDATE` on the table. Migration is
a later owner action; runtime never creates or migrates (per assignment).

### API (factory `createToolApprovals(store, key, bounds)`)

- `enqueue({context, identity, projection, frozenArgs, ttlSeconds})` —
  context values MUST come from a `store.authorize()`-verified admission
  (documented in module header; the check derives them from real
  authorizations). Full frozen args are sealed with stdlib AES-256-GCM
  (random 12-byte IV, 16-byte tag) whose AAD is `context_digest` =
  SHA-256(id, org, actor, subject, delegation, runId, operation, binding,
  requestDigest). `projection` (redacted human view) is stored as plain jsonb,
  separately. Bounds: payload ≤ 1 MiB, projection ≤ 64 KiB (configurable,
  hard-ceiling-validated), pending+approved rows per org capped
  (`approval_capacity` 503), TTL ∈ [1 s, 24 h].
- `decide(id, org, humanPrincipalId, "accept" | "decline" | "cancel")` —
  authority is a verified `gw_principal` row (exists, `kind='human'`,
  enabled, same org) inside the claim's transaction; there is **no caller
  boolean**. Expired rows are transitioned to `expired` + audited, then
  denied 410.
- `claim(id, org, worker, recheck)` — runs inside `store.transaction`
  (advisory-locked, same seam as every store mutation). Order: row
  `FOR UPDATE` → tenant/org match → expiry → state gate → context-digest
  recompute → envelope decrypt+verify (inside the transaction, before any
  state change) → `recheck` callback → conditional
  `UPDATE … WHERE state='approved' RETURNING` → claim audit. Exactly one
  caller gets the payload; losers/replays get `not_claimable`/`not_approved`
  and never decrypt. `recheck` contract (documented on the type): it runs
  inside the transaction under the global advisory lock — no network I/O,
  prompt return, `false` fails closed leaving the row `approved`. It is a
  trusted server callback, not caller authority.
- `report(id, org, worker, "succeeded" | "failed" | "outcome_unknown")` —
  only the claiming worker, only from `dispatching`; same-outcome replay is
  an idempotent no-op, anything else is `not_reportable`.
- `recover()` — bounded (64 rows) lazy expiry of `pending/approved` and
  lease-expired `dispatching → outcome_unknown` classification with
  `externalEffect: "unknown"` audit. Never releases payloads.
- `queue(org, {limit ≤ 50, before})` / `detail(org, id)` — bounded,
  tenant-scoped projections for the future browser approval queue; neither
  ever returns `envelope`. No approval UI is built in this slice — the UI
  remains a REQUIRED next integration before any activation.

### Audit + fail-closed

Every lifecycle mutation and its audit row commit in the same transaction
(reusing `store.audit`); audit failures (including revoked INSERT) surface as
a fixed safe `Denied(503, "audit_denied")` and roll the whole mutation back.
All error reasons are fixed strings; neither audits nor projections ever
contain args, secrets, or envelope material.


## 3. RED → GREEN evidence

### RED (check written first; implementation absent) — COMPLETE

- Gate: `fxbuilder` snapshot `~/.cache/stellarc-tool-approval-r1-red-2dce6d0`
  (worktree HEAD `2dce6d0`), donor `node_modules` symlink (read-only, no
  installs), disposable `postgres:16` on `:5551`, shared
  `~/.cache/stellarc-authgw-gate.lock` flock receipt `GATE_ACQUIRED
  2026-11-08T16:41:20Z … GATE_DONE 2026-11-08T16:41:29Z host=fxcompute-01`.
- `red.exit=1` with `error: Cannot find module './tool-approval'` (Bun
  v1.4.0) — proof the check exercises the not-yet-written module.
- Hashes at RED time: `tool-approval-check.ts`
  `78a97dd82bbc48d0f7885efa6b7d8144124ca70a9b7e5bea7f4945ea026eaf0a`
  (byte-identical to the final worktree copy), `store.ts`
  `ee32a71c608028d3c886068dcc63e495473f3fa009054d68d436347df166bea6`
  (store seam untouched).

### GREEN (final gate: check + strict tsc + Biome + build + bundles)

TODO: receipts.


## 4. Integration obligations / next steps

- **Approval UI remains REQUIRED** before any activation: `queue()`/`detail()`
  are bounded, tenant-isolated, envelope-free projections intended for the
  browser queue, but no UI was built in this slice (per assignment). A human
  approver surface (authenticated human principal of the row's org) is the
  next integration, and the human-permission context it displays must be the
  verified `projection`/context persisted here — never client-asserted.
- **MCP wiring** (GPT LLM worker owns main/stream): the openapi executor's
  `requiresApproval` callback should `enqueue` with context derived from the
  store-verified admission and identity from the frozen executor
  (`identity.binding` + `requestDigest`); the claim side runs behind the
  dispatch callback only after a human `accept`. Per review F1: one executor
  per authenticated request, never a process-shared closure. Per F2: never
  key approvals on `identity.binding` alone — this module's `context_digest`
  already binds the union.
- **Lost/replayed claim answers must be `deny`, not `requiresApproval`** (F3):
  the queue has no deferral shape by design.
- **Claim lease sizing**: `claimLeaseSeconds` must exceed the executor's
  dispatch deadline (openapi executor caps at 60 s); default 120 s planned.
- **Key management**: the 32-byte key is an owner handle (env/KMS-derived at
  the integration boundary); rotating it invalidates all pending envelopes —
  rotation policy is a GPT-council item before activation.
- **Schema migration**: `toolApprovalSchema` applied owner-only; a future
  `migrate.ts` lane adds it to the owned migration list — this slice
  deliberately does not touch `migrate.ts`.
- **GPT council before integration/activation** (per assignment): this report
  is the input; activation requires council sign-off on the transaction
  contract, lease sizing, and the no-UI/no-redispatch semantics.

