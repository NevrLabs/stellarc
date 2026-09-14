# Stellarc — `dev` (v2 rewrite)

## STL-14 implementation evidence (partial)

### Continuation c28: manifests, Tempo export proof, full acceptance (complete for T0)

- `68df66a` commits `apps/stellarc-ui/e2e/fork-manifest.json` — 954 mirrored
  files (929 byte-exact sha256-verified against kaneo `2504e645`; 25 adapted:
  16 with the §5d lint-cleanup reason, 9 config/entrypoint adaptations) plus 38
  fixture endpoint contracts recorded against the lifted fetcher/authClient
  call sites. The generator (`e2e/tools/build-fork-manifest.mts`) fails on
  missing files, duplicates, or byte drift in exact mirrors. The fork's own
  co-located unit tests are enumerated-and-excluded, not silently dropped.
- `d461877` delivers the §5f export proof: `tools/verify-otel-export.mts` runs
  the real stack (disposable PG + Effect HttpApi + ShapeEngine) under
  `TelemetryLive` → local Tempo, executes mutation → snapshot → live tail, and
  verifies IN TEMPO that the caller trace carries snapshot+tail, append spans
  exist, and no SQL statement text is exported (5 traces, 7 span shapes).
  `tools/shoot-grafana-trace.mts` renders the trace in Grafana and asserts the
  span names in the live DOM before capturing `docs/evidence/
  otel-export-tempo.png`. Telemetry audit against §5f: db spans statement-free
  (asserted), `stellarc.event.append` one-per-event under the mutation trace
  (T05 test), migration version spans (T06), shape snapshot/tail with offsets
  (T01/T11), principal attrs on success and none on denials (c21/c22 tests),
  worker start/stop spans, `noConsole` proven with runtime override — all
  green. Mutation→shape one-trace propagation asserted in
  "mutation, event appends and shape emission share one trace".
- Final gate run at HEAD `d461877` + README: lint exit 0 (3 preexisting
  warnings, unused-param in `runShape` + two `!` in the T01 test);
  root typecheck exit 0; Bun bridge 2 pass / 0 fail (unit 7 passed, real-PG
  integration 41 passed); `turbo run build` 3 successful / 3 total; `bun run
  e2e` 24 passed / 0 failed over desktop/tablet/mobile/mobile-small (sign-in,
  org-shell, repo-issues, repo-pull-detail, projects, project-detail +
  responsive) with strict screenshot comparison. An e2e web-server timeout was
  diagnosed to a stale Sep-04 Kaneo `vite preview` holding the port — killed,
  rerun green.
- PR #28 Remaining list is empty of unowned items: broader domain fixtures and
  legacy typing are explicitly deferred to STL-15–21 per §5e; `docker-compose.
  otel.yml` was ruled a same-PR follow-up (optional, not delivered); legacy
  reconciliation is N/A (zero legacy tables imported). No 14/14 claim.

### Continuation c22: populated shell, responsive controls and CI (partial)

- `5a1fa36` enforces service noConsole while preserving frozen UI/test overrides.
  Full-gate verification exposed a Node shebang dependency in the regression test
  (`expected 127 to be 1`). `d8a3e8d` runs Biome through the active runtime;
  restored unit suite: `7 passed (7)`.
- `8060fed` adds synthetic populated organization navigation and four org-shell
  baselines. Removing the board response made the shell assertion fail; restored
  screenshot comparison: eight passes. Fixtures contain two members, a board,
  four statuses and three tickets plus repository counts; they do NOT yet contain
  the required project or actual issue/PR entities.
- `fc3e801` proves touch Sheet open/outside-tap close, absent closed mobile rail,
  strict 767/768 behavior in both mobile projects, and desktop/tablet keyboard
  focus order. Initial desktop failure targeted a nonfocusable div (test defect,
  not product RED). Behavioral control changed `< 768` to `<= 768`, rebuilt,
  and failed both mobile tests: `Expected: visible; element(s) not found` at 768.
  Restored original source, rebuilt: `12 passed (30.7s)`; screenshot comparison
  `8 passed (21.6s)`. No production UI source changes remain.
- `d8a3e8d` wires pinned Chromium installation and `bun run e2e` into CI after
  build, with failure artifacts. Local command exercised; remote CI not claimed.
- Final frozen install, lint (three warnings), root typecheck, Bun bridge and
  build all exit 0. Bridge: `2 pass / 0 fail`; standalone unit suite 7 passed;
  real-PG integration suite 39 passed in the earlier gate run. Final build cached;
  fresh UI builds were exercised for the responsive control/restoration.
- Remaining T0: fixture project/issue/PR entities and source-to-destination/
  endpoint manifest; telemetry service coverage, successful-principal HTTP attrs,
  mutation-to-shape trace propagation audit, Grafana/Tempo export screenshot;
  final mandatory acceptance/control audit. PR #28 remains draft. Broader domain
  UI fixtures/typing remain deferred to STL-15–21. Legacy reconciliation N/A.

### Continuation c21: sanitized denials and sign-in baselines (partial)

- `3d1cf11` routes initial and resumed authorization denials through the shared
  sanitized JSON mapper. Focused T13 RED preceded the fix; disabling the mapper
  produced `expected 500 to be 401`; restoration passed. Full-suite verification
  then exposed two old empty-body expectations; these now assert exact sanitized
  JSON plus absence of `electric-handle` (included in `cd0d2f3`).
- `cd0d2f3` adds Playwright 1.62.0, four viewport projects, strict sign-in API
  interception, structural form assertions and four synthetic sign-in PNGs.
  `bun run e2e:screens` compares by default. Initial rendering failed before
  interception; after stubbing, four projects passed. Visual negative control:
  red input backgrounds produced `18929 pixels (ratio 0.02 ... ) are different`,
  exit 1. A body-background control was invisible and passed; it is NOT evidence.
  Both controls were removed; restored screenshots: `4 passed (12.4s)`.
- Final root gates: lint exit 0 (three warnings), typecheck exit 0;
  unit `6 passed (6)`, real-PG integration `39 passed (39)`, Bun bridge
  `2 pass / 0 fail`; build `3 successful, 3 total` (fresh UI Vite build included).
- Still incomplete: authenticated org-shell minimum synthetic fixture and its
  four-project landmarks/screenshots; responsive touch/breakpoint proof; fixture
  mirror manifest and E2E CI wiring; telemetry completeness/propagation audit,
  noConsole enforcement and Grafana/Tempo export screenshot; final acceptance
  controls audit. Sign-in alone is NOT T0 acceptance. PR #28 must remain draft.
- Legacy reconciliation remains N/A. Broader domain UI fixtures and typing are
  deferred to STL-15–21 under section 5e; no production UI source was changed.

### Continuation c19: integration cleanup and closed query contract (partial)

- `93c1e05` releases integration resources after each test; `dc7e5b2` avoids
  syncing disposable PostgreSQL seed files. Full Bun bridge now exits 0:
  `4 passed (4)` unit, `38 passed (38)` integration, `2 pass / 0 fail` bridge.
  Integration duration: 110.13 seconds. This run does not prove all flakiness gone.
- `17778c8` adds T18 closed-allowlist regression coverage: `where`, `columns`,
  `replica`, `subset__limit`, `live_sse`, `params[1]`, and arbitrary unknown keys
  all return 400 before SQL. Existing integration coverage accepts both log modes.
- Handler already satisfied the ruling: no new implementation RED is claimed.
  Negative control allowing `where` reached SQL and failed with `ECONNREFUSED`:
  `1 failed | 4 passed (5)`, exit 1. Restored: `5 passed (5)`, exit 0.
- Lint and root typecheck exit 0 (two inherited lint warnings); build reports
  `3 successful, 3 total` (cached). No UI or screenshot completion claimed.
- Remaining: synthetic four-project sign-in/org-shell E2E and CI wiring;
  telemetry/service coverage and mutation-to-shape propagation audit; noConsole
  enforcement; required span controls; Grafana/Tempo export screenshot; final
  acceptance audit. PR #28 remains draft; legacy reconciliation N/A.

### Continuation c18: HTTP trace, SQL privacy and cancellation (partial)

- Pushed `514bd63`, `488c501`, `b3f109e`, and `791ad40`: preserve the inbound
  HTTP shape trace, interrupt polling on client disconnect, export statement-free
  SqlLive spans, and measure scoped live connections and wait duration.
- Focused cancellation control (remove fiber signal) failed and restored green.
  SQL attribute-filter control failed and restored green. Gauge decrement control:
  `AssertionError: expected [ 1 ] to include +0`; restored `1 passed | 37 skipped`.
- `cbb2cce` adds the expected-red UI typecheck budget and CI tracking.
- Latest frozen install, lint, root typecheck and build exit 0; lint has two
  non-null-assertion warnings; build reports `3 successful, 3 total`.
- Full verification is NOT green. Repeated Bun bridge runs report `1 pass / 1 fail`.
  Latest integration run: `3 failed | 35 passed (38)`, 30-second timeouts in T01
  shape span boundaries, T16 shape failures and T12 cursor validation. Earlier
  runs timed out in T16 health and T04 rollback instead. No timeout was increased.
  Host load was 12.51 when inspected; this is correlation, not a proven cause.
- Remaining T0: diagnose full-suite timeout instability; four-project synthetic
  sign-in/org-shell fixtures, structural assertions, E2E scripts and baselines;
  finish/audit service telemetry and mutation-to-shape trace propagation,
  noConsole enforcement, required span controls and Grafana/Tempo export proof;
  wire E2E into CI and audit remaining mandatory acceptance/control coverage.
- No UI changes or synthetic screenshot acceptance claimed. PR #28 stays draft.
  Legacy reconciliation remains N/A. Broader UI/domain work belongs to STL-15–21.

### Continuation c17: recovery and tracing checkpoint (partial)

- Stock-client reconnect identity accounting and restart/expiry recovery now pass;
  recovery removes deleted snapshot rows and settles subsequent mutations.
- HTTP denied-request spans preserve inbound trace context and safe error types.
- Migration, event append, and snapshot/tail Effect entrypoints export spans under
  caller traces. Appends count committed mutations. Their focused negative controls
  failed after removing tracing and passed after restoration.
- Promise-compatible wrappers remain: this is NOT proof of end-to-end HTTP
  mutation-to-shape trace propagation. A full-suite regression exposed wrapped
  shape errors; preserving the original cause restored the failure/long-poll tests.
- Final executed gates: `bun run lint` exit 0 (938 files, two non-null assertion
  warnings); `bun run typecheck` exit 0; `bun test` reports 4 unit and 34 integration
  tests passed, Bun bridge `2 pass / 0 fail`; build `3 successful / 3 total`
  (all cached). Turbo still warns about Bun lockfile version 2.
- Remaining acceptance: complete service/runtime telemetry wiring, statement-free
  SQL tracing, mutation-to-shape context propagation, noConsole enforcement and
  real Grafana/Tempo export proof; synthetic sign-in/org-shell four-project E2E,
  structural assertions, screenshot baselines and `e2e:screens`; expected-red UI
  typecheck budget and CI; audit outstanding required negative controls and full
  disconnect resource accounting. No UI changes or screenshot acceptance claimed.
- PR #28 remains draft. Legacy reconciliation is N/A; zero legacy tables imported.

### Continuation c17: worker lifecycle telemetry (partial)

- The shipped worker uses `Effect.fn` start/stop spans and scoped finalization;
  its production entrypoint provides `TelemetryLive("stellarc-worker")`.
- A real disposable-PG test runs that worker with `TelemetryTest`, observes exactly
  one start then stop span, interrupts it, and verifies zero remaining pool sessions.
- Initial RED and `Effect.fnUntraced` negative control both returned:
  `AssertionError: expected [ 'sql.execute' ] to include 'stellarc.worker.start'`.
  Restored GREEN: `Tests 1 passed | 26 skipped (27)` (exit 0).
- Full gates: lint `Checked 938 files ... No fixes applied`; `tsc --noEmit` exit 0;
  Vitest `4 passed` unit / `27 passed` integration; Bun bridge `2 pass, 0 fail`;
  build `Tasks: 3 successful, 3 total` (exit 0). Frozen install succeeded.
- Earlier full and focused runs hit T07's 30-second timeout. No timeout/config or
  T07 implementation was changed; the next focused run took 4.88s, and the full
  default-timeout bridge subsequently passed. This remains intermittent evidence,
  not a claim that the timeout's root cause was fixed.
- No UI changes. Remaining §§5e–5f acceptance below is still open except worker
  lifecycle instrumentation. Keep PR #28 draft; legacy reconciliation remains N/A.

### Continuation c14: HTTP settlement and scoped runtimes (partial)

The latest acceptance is brief §§5e–5f; older Remaining lists below are historical.
Root typecheck intentionally excludes the frozen legacy UI until STL-15–21.

- Real test-only Effect HttpApi POST/DELETE now commit through the domain service;
  stock collection `awaitTxId` settles both operations. Unauthorized/invalid writes
  are rejected without events. Production fixture paths return 404.
- ConfigLive requires DATABASE_URL and validates PORT; AuthzLive fails closed.
  SqlLive owns an Effect PostgreSQL pool. API health uses that client. API and
  worker startup and SIGTERM are exercised as real Bun subprocesses against
  disposable PostgreSQL; the worker does no domain work.
- TelemetryLive exporter factory and TelemetryTest in-memory span/metric/log
  exporters exist. They are NOT yet wired into service runtimes. The Effect logs
  bridge requires the tested 0.203.0 logs SDK/exporter pins; 0.222.0 emitted no
  records in the behavioral test. This is infrastructure, not completed §5f.

Execution excerpts:
```text
Telemetry initial RED: Cannot find module '/packages/telemetry/src/index'
Telemetry behavioral RED: expected [] to include 'safe log'
Telemetry GREEN: Tests 1 passed | 3 skipped (4)
T09 headers.txids removal: TimeoutWaitingForTxIdError (exit 1); restored exit 0
T17 invalid-port validation removal: exit 1; restored exit 0
Final lint: Checked 938 files in 4s. No fixes applied.
Root typecheck: tsc --noEmit (exit 0)
Vitest: Tests 4 passed (4); Tests 26 passed (26)
Bun bridge: 2 pass, 0 fail
Build: Tasks: 3 successful, 3 total (API, worker, UI)
Frozen install: Checked 754 installs across 880 packages (no changes)
```

Remaining T0 acceptance: full T01 reconnect identity accounting; stock T12
expiry/restart recovery; required outstanding negative controls; fixture-backed
four-project sign-in/org-shell E2E and structural assertions; e2e:screens;
expected-red UI typecheck script/count budget and CI. OTel still needs SQL
statement-free tracing, Effect.fn service conversion, append/shape/HTTP/worker
instrumentation, traceparent and mutation-to-shape propagation, required span
assertions/negative control, noConsole gate, and real Grafana/Tempo export proof.
Collector compose is an optional follow-up within this PR. Full legacy UI typing
and domain-specific matrix coverage are deferred to STL-15–21 per §5e, not silently
claimed complete. No UI source or screenshot changes this cycle. Keep PR #28 draft.
Legacy reconciliation: N/A (zero legacy tables imported).

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
| `desktop/` | Tauri 2 shell around the frozen UI (`desktop:build` / `desktop:check`) | MIT OR Apache-2.0 |

Not in this branch yet: arclet, tunnel, the v1 UI. They
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
5. `docs/adrs/0009-development-workflow.md` — forge: triage → spec → implement → adversarial review → merge gate; four Playwright projects
6. `docs/adrs/0010-opentelemetry-native.md` — **OTel-native**: Effect spans/metrics/logs via `@effect/opentelemetry`, OTLP export, span assertions in tests
7. `docs/primitives-v1.md` — structural entities vs resource kinds
8. `docs/design/DESIGN_SYSTEM.md`, `VISION.md` — the design target (not yet applied)
9. `LICENSING.md` — FSL core / Apache client split

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
