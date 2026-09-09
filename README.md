# Stellarc — `dev` (v2 rewrite)

## STL-14 implementation evidence (partial)

### Continuation c13: ordering, runtime grants, upcasting and live polling

- Same-org update/delete concurrency exposed inverted projection/counter locks.
  Single delete now uses `mutateProbes`; ordered writers and different-org
  progress pass with actual PostgreSQL barriers. Independent counter allocation
  and global advisory-lock controls each failed and were restored.
- `grantRuntime` provisions a separate unprivileged principal with event INSERT/
  SELECT only, refusing owner/privileged/member roles. Domain writes succeed as
  that principal; event UPDATE/DELETE fail. Granting UPDATE/DELETE killed the test.
- Upcaster registry validates v1 payloads, supports registered test-only v0
  conversion, and fails closed on unsupported probe versions before emitting a
  partial page. Unit and real-PG emit coverage pass.
- Shape live polling requeries committed events without NOTIFY, times out at 20s
  with bodyless 204 and retained headers, cancels its wait timer on abort, and
  rechecks authorization after wake. Bun socket timeout test passes. Full socket
  disconnect/SQL cancellation accounting remains unproven.
- Health and shape failures now use a sanitized error mapper. Database shutdown
  gives 503; injected private driver/stack details produce sanitized 500 JSON.
  Production Config/SqlLive/Authz Layers and runnable entrypoints still remain.
- Explicit requested log modes go to server telemetry, not electric-schema.

Real execution excerpts (all controls restored):

```text
T16 health hardcoded-ok control: expected 200 to be 503 (exit 1)
T16 shape RED: SyntaxError: Unexpected end of JSON input (exit 1)
T16 restored: Tests 2 passed | 15 skipped (exit 0)
T11 initial RED: expected null to be truthy [electric-cursor] (exit 1)
T11 no-requery control: expected 204 to be 200 (exit 1)
T11/T13 wake, timeout, revoke: Tests 3 passed | 17 skipped (exit 0)
T18 telemetry RED: expected [] to deeply equal [ 'full', 'changes_only' ]
T18 telemetry GREEN: Tests 1 passed | 20 skipped (exit 0)
Full gate before telemetry addition: Checked 932 files. No fixes applied.
Root tsc --noEmit: exit 0
Vitest unit: Tests 2 passed (2); integration: Tests 20 passed (20)
Bun bridge: 2 pass, 0 fail
Build: Tasks: 2 successful, 2 total (UI cache hit)
Final frozen install: Checked 717 installs across 843 packages (no changes)
Final lint: Checked 932 files. No fixes applied; root typecheck exit 0
Final Vitest: 2 unit / 21 integration passed; Bun bridge: 2 pass, 0 fail
Final build: 2 successful, 2 total (2 cached); combined command exit 0
```

Partial acceptance only. Remaining: full T01 identity/reconnect accounting;
T08/T09 stock protocol and HTTP mutation settlement; T12 expired/restarted stock
client recovery; T14 collection disposal; T16-T18 production Layers, complete
shared error/validation schemas, API/worker lifecycle, fixture HTTP routes and
production exclusion; T11 disconnect resource accounting; outstanding controls,
including unrelated-only T23 advancement and T22 bridge/CI. T19-T21 still need
legacy compatibility contracts, full UI typecheck, synthetic fixtures/baselines,
four-project Playwright parity/touch/breakpoint/keyboard coverage, all-route
built-artifact smoke, and the real Mermaid sanitization test. No UI changes or
screenshot acceptance in c13. Legacy reconciliation remains N/A.

### Continuation: cursor/page integrity and frozen-lift build repair

- T12 issued opaque offsets are bound to a snapshot handle; malformed syntax is
  rejected and forged/cross-handle offsets return `must-refetch`. This does not
  yet prove expiry/restart recovery through the stock client.
- T23 unrelated plugin events advance the cursor without emitting probe changes;
  repeated pages retain keys/sequence identities and cursor decimals above 2^53
  remain exact. Stable-key application is tested; no exactly-once network claim.
- T07 preserves 205 materialized snapshot rows across intervening mutations,
  drains a 105-event tail in capped pages without premature `up-to-date`, and
  reconciles replayed values/last_seq against the SQL projection.
- RED T23: unexpected `9007199254740995` emitted for unrelated plugin; exit 1.
  GREEN: `1 passed | 8 skipped`; exit 0. Number-conversion control lost the final
  event (`finalMessages[0].value.last_seq` undefined), exit 1; restored green.
- RED T07: expected 100 messages, received 101 (premature control), exit 1.
  GREEN: `2 passed | 8 skipped` with T23. Requery-page-two control changed frozen
  row values (`expected false to be true`), exit 1; restored suite `10 passed`.
- T12 accept-unissued-cursor control: `expected 200 to be 409`, exit 1.
- Mechanical inherited lint cleanup removes only unused suppressions and formats
  tooling. Root lint has zero warnings/errors. Runtime UI build required contracts
  workspace dependencies and the fork's Better Auth 1.6.25 pin; see
  `.forge-deps-added.md`. API + lifted UI build: `2 successful, 2 total`.
- Orchestrator ruling: the 84 fork PNGs and manifest now live under
  `apps/stellarc-ui/e2e/__screenshots__/fork-provenance/`; they are provenance,
  never `toHaveScreenshot` targets. Synthetic-fixture baselines and per-screen,
  per-project structural parity remain to be implemented. Teams is provenance-only.

**Acceptance gap:** root `typecheck` excludes the lifted UI and legacy contracts.
The UI's own `bun run --cwd apps/stellarc-ui typecheck` exits 2 (556 diagnostic
lines), including unresolved `@kaneo/api` types. Root-green is NOT workspace-green.
Do not mark T21 or merge readiness complete. The build previously never exercised
this lift successfully. No screenshot assertion run or fixture acceptance is claimed.


Setup: `bun install --frozen-lockfile`. Local integration tests require PostgreSQL
15 binaries at `/usr/lib/postgresql/15/bin` (override with `PG_BIN`). The harness
creates isolated temporary clusters; do not supply a production database.
Gates: `bun run lint && bun run typecheck && bun test && bun run build`.

Continuation adds the shared `mutateProbes` transaction service: contiguous batch
reservation under the org row lock, one checked PostgreSQL txid, upsert/delete
events, rollback on missing delete, and the original single-write wrapper.
This is domain-service coverage, not HTTP delete or sync-delete acceptance.

Real execution evidence:
- Initial RED: `2 failed | 2 passed (4)`; `mutateProbes is not a function`.
- GREEN: integration `4 passed (4)`.
- T05 wrong-connection txid control initially passed; the test was strengthened
  against event-row `xmin` in the fresh disposable cluster (no wraparound).
  Behavioral RED: `expected [ '725', '725' ] to deeply equal [ '726', '726' ]`.
- T04 counter-outside-transaction control: behavioral RED,
  `expected [ { seq: '3' } ] to deeply equal [ { seq: '1' } ]`.
- Both controls restored. Gates previously returned lint exit 0 (4 inherited
  warnings), typecheck exit 0, `7 pass / 0 fail`, build `1 successful, 1 total`.
  Turbo warns that Bun lockfile v2 is unsupported.

Remaining: full T01 reconnect/pagination identity coverage; concurrency controls;
append-only runtime permissions; Config/SqlLive/Authz Layers, error mapping and
worker lifecycle; HTTP mutation routes; deletion-aware sync, upcasters, opaque
cursor/expiry and long polling; remaining T01–T23 controls; frozen UI mirror,
fixture contracts, four-viewport fork baselines, route smoke and CI. No UI/E2E or
merge-readiness claim. Reconciliation N/A: zero legacy tables imported.
The explicit STL-14 Effect HttpApi requirement supersedes ADR 0002's Hono premise;
that ADR is retained unchanged pending its owner's update.

**This branch is a full reset.** It shares history with nothing on `main`.
`main` is Stellarc v1 (Rust cockpit + arclet); it stays as reference and keeps
running. `dev` is where v2 is built from the ground up.

## What this branch is

The first step of the Stellarc v2 rewrite: **the work-management surface of the
Kaneo fork, rebuilt on Effect, rebranded as Stellarc.** Same UI, new everything
underneath.

Three deployables, nothing else yet:

| Package | What | License |
|---|---|---|
| `apps/stellarc-api` | Effect control plane: HTTP API, auth (better-auth), event log, embedded sync engine (ADR 0007) | FSL-1.1-Apache-2.0 |
| `apps/stellarc-worker` | Effect outbox consumer: notifications, search projection, integrations | FSL-1.1-Apache-2.0 |
| `apps/stellarc-ui` | Vite SPA: TanStack Router + TanStack DB, Base UI via shadcn, Tailwind v4 (ADR 0008) | Apache-2.0 |

Not in this branch yet: arclet, tunnel, desktop, Maestro flows, the v1 UI. They
arrive as later stages of the rewrite per `docs/v2-charter.md`.

## What it is not

- Not a port of Kaneo. No Kaneo code is carried over; behaviour was informed by
  the fork, the code is new. See `LICENSING.md` → Provenance.
- Not a new design. The UI is **pixel-frozen** against the fork's current
  surface until the backend lands. Stellarc's canonical design system
  (`docs/design/`) is the target for a later token-merge ADR.
- Not Kaneo's feature set. Only what the frozen UI actually renders is
  implemented; upstream-Kaneo features the fork never surfaced are dropped.

## Doctrine that governs this branch

Read in order:

1. `docs/v2-charter.md` — D1–D19, the ratified rewrite doctrine
2. `docs/adrs/0001`–`0006` — founding ADRs (inert CP, Bun/TS + Effect-as-library, transcript schema, tunnel, templates, primitives)
3. `docs/adrs/0007-embedded-sync-engine.md` — **decision B**: Electric-protocol shape server over our event log, in-process
4. `docs/adrs/0008-frontend-stack.md` — Vite SPA, TanStack Router + DB, Base UI/shadcn, Tailwind v4
5. `docs/primitives-v1.md` — structural entities vs resource kinds
6. `docs/design/DESIGN_SYSTEM.md`, `VISION.md` — the design target (not yet applied)
7. `LICENSING.md` — FSL core / Apache client split

`docs/adrs/v1-0037`, `v1-0038` are carried from `main` because 0007 builds on
them.

## Working rules

- One ticket → one PR into `dev`. Tickets live on the Stellarc GitHub project.
- TDD with negative controls: a test that cannot fail does not count.
- Every mutation goes through the API and appends to the event log. Direct SQL
  writes are doctrine-illegal (D12) — the sync engine depends on it.
- Verify the shipped artefact: served bundle hash, real keyboard, measured DOM.
- Design changes are out of scope on this branch. If a pixel must move, it is a
  bug in the freeze, not a feature.

## Agents

Implementation: `cx/gpt-6-astra`, `glm/glm-5.3-flash`. Review: `glm/glm-5.3`
(different family from the implementer, always). Recon: goose. Dispatched via
Paseo; orchestrated by Talos.
