# STL-25 review — cycle 10 (adversarial re-review, PR #60 @ 3edafb8a, base dev @ merge-base 97bdef7)

REWORK

Independent re-review (fresh checkout of the PR head into
`/mnt/deepvault/forge-merge/review-stl-25-c10` twice — the first worktree was
swept mid-audit by an external driver sweep, killing my vite preview with
SIGTERM/143 mid-e2e; all evidence re-derived after re-creation). Gate check:
latest implement entry = pass (cycle 10, 2026-09-18T09:27:57Z). Findings below
are my own reproductions; they corroborate and extend the 14:32 review-10.

## Per-item audit

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | SPEC COMPLIANCE S01–S16 + §5 manifest | **implemented, 2 defects** | All §5 CREATE files present (sse.ts, 5 test files, proxy-fixture, both tools, ADR 0012); MODIFY set correct (index.ts allowlist+SSE branch, http.ts streaming via `HttpServerResponse.raw(response.body,…)` — the `.stream` evidence line satisfied, no `response.text()` on the SSE path; test-server.ts revoke/sseTiming fixtures; foundation.test.ts T18 drops only `live_sse`). S01–S15 each map to ≥1 real test (verified by ID in shape-sse/shape-proxy/unit suites). S16: foundation+identity green under the PR (43 unit incl. updated T18 + 8 identity; 65 integration incl. 27→65 growth). Deviations, judged: `package.json`+`bun.lock` add root `playwright@1.62.0` — documented in `.forge-deps-added.md`, tsc-resolution necessity, accepted; extra unit files (shape-concurrency, shape-edge-verdict) are the S12/S13 rows, accepted; `.forge-blocker.md` deleted — defect 2; gauge acquire/release manual in stream start/finish (not acquireUseRelease) — stream must outlive the Effect, once-only proven, accepted; mid-cycle up-to-date boundary frames — protocol necessity (stock client publishes only on up-to-date), documented, accepted. |
| 2 | TESTS THAT CANNOT FAIL | **pass** | For each new test a concrete code change that reddens it exists; I replayed the spec's negative control myself (S01/S11): removed both params from the `page()` allowlist (packages/sync/src/index.ts:353-354) → `S11 ×, S02-related × (2 failed)` [pasted below]; restored → green. Prior-cycle sabotages (txids strip → S05 red; offset-advance removal → S04 red; abort neuter → S06 red; re-authz skip → S07 timeout; flush-lie → S09 red; span rename → S15 red; per-frame gauge → S15 red) each name a real code change. No decorative tests found. |
| 3 | MIGRATIONS | **pass** | `git diff dev...HEAD --name-only` ∩ packages/db = ∅. No migration touched, no journal rewrite. |
| 4 | DOCTRINE | **pass** | No new mutations/events (transport-only); engine SQL read-only; spans carry no statement text/PII (attributes: table, offset_from, events_sent, close, org, principal.kind — no token/email; `stellarc.principal.kind` handler-derived via `principalKindFrom` http.ts:21, asserted "anonymous" in S15); no hex secrets; no model calls from the control plane. |
| 5 | WORKER DEBRIS | **1 defect** | Defect 2 (orchestrator-owned `.forge-blocker.md` deleted). Nit: `SsePageError.detail` never read. No debug logs (`console.*` only in tools + pre-existing fatal handler main.ts:64); no stray files; no giant generated diffs (18 files +2510/−73). |
| 6 | SCREENSHOTS | **pass** | Zero UI changes (`git diff dev...HEAD -- apps/stellarc-ui/` empty) — baselines must NOT differ and don't; no PNGs regenerated (correct for a transport-only slice; regenerating desktop-only would itself be the REWORK trigger). Frozen+responsive suites run unmodified; all four projects (desktop/tablet/mobile/mobile-small, hasTouch on the latter three) exercised in my e2e runs. |
| 7 | SPANS (ADR 0010) | **pass** | `sseEffect = Effect.fn("Sync.sseEffect")` (index.ts:162); per-connection `stellarc.shape.sse` span (Effect.makeSpan) with spec'd attributes + `stellarc.shape.sse.close`; page runs as `pageEffect` child via explicit `Tracer.ParentSpan` override; S15 asserts the span AND that page spans are direct children; assertion reddens on rename (prior sabotage). http.route/method/status inherited from the existing requestTelemetry middleware on the same handleRaw route. |
| 8 | GATES RE-RUN | **1 defect** | `bun test`: unit gate 27/27 PASS, integration gate **RED by kill-timer** — `tests/gates.test.ts:16` `setTimeout(() => child.kill(), 300000)` fires while the integration suite needs ~700s on this host (my direct run: **65/65 pass, exit 0, 698.73s**; NFS worktree; CI-runner times ~542s per prior review — still >300s). `Received: 143`. This is defect 1, and it is why merge-gate `bun test` failed at 3edafb8 in every attempt (14:18, 14:45, 15:35, 16:15, 17:23, 19:20 — 6/6). `bun run build` OK (FULL TURBO). `bun run e2e`: desktop+tablet fully green in my cleanest run; every failure I observed was the vite preview server being SIGTERMed (code 143) — twice by the external sweep that deleted my first worktree mid-run, once by a transient port-4173 collision; combined with prior-review obs-2 (fixtures.ts route/fulfill race, 2/12 in isolation, zero UI files in diff) the e2e merge-gate failures are environmental/flake, not PR-caused — but they still block merge-gate and are noted as obs, not a PR defect. |

## DEFECTS

1. **`tests/gates.test.ts:16` — `bun test` cannot go green: the integration suite (~542s CI / ~700s NFS-host) exceeds the 300s hard kill timer.** The PR adds `tests/integration/shape-sse.test.ts` (~75s: SSE cycle/ka waits) and `tests/integration/shape-proxy.test.ts` (~78s: two 16s S12 holdMs legs at default 15s ka cadence), pushing a suite that ran ~460s at merge-base past the cap with margin. Reproduced twice: exit 143 after `[300066.65ms]` / `[300044ms]`; direct vitest run of the same config passes 65/65. Merge-gate `bun test` failed 6/6 at this head. Exact fix expected: EITHER raise the kill+test budget (e.g. 600000/610000) in `tests/gates.test.ts` (orchestrator to sanction — manifest admits gates.test.ts for gate-owned necessity), OR cut wall time: set `server.sseTiming = { kaMs: 500 }` + `holdMs ≈ 2000` on both S12 legs (tests/integration/shape-proxy.test.ts:164,188) and reuse short-cycle overrides elsewhere (S06/S07 already do).
2. **`.forge-blocker.md` deleted (commit 982c92e, 55-line STL-18 blocker record)** — orchestrator-owned bookkeeping outside the §5 manifest; merging erases the record from dev. Exact fix expected: `git checkout 97bdef7 -- .forge-blocker.md` and commit on forge/stl-25.

## Non-blocking observations (orchestrator-owned)

- **obs-1**: e2e merge-gate flake (repo-pull-detail/org-shell miss `lin-fixture` intermittently; fixtures.ts route/fulfill race) — pre-existing at merge-base, needs fixtures fix or retry policy before any merge-gate can go green; not this PR.
- **obs-2**: GHA Foundation red at head AND dev (`postgresql-15` absent on the runner image) — repo infra, not this PR.
- **obs-3**: review-worktree sweeps killed my first audit's processes mid-run (worktree deleted under me, vite SIGTERM 143). Recommend the driver not sweep `/mnt/deepvault/forge-merge/*` while a review stage is `running` for that ticket.
- **obs-4**: `SsePageError.detail` (packages/sync/src/index.ts) written, never read — drop or surface it.

## My negative-control transcript (this audit)

- Sabotage: removed `"live_sse"` + `"experimental_live_sse"` from the `page()` allowlist (packages/sync/src/index.ts:353-354):
  `tests/unit/shape-sse.test.ts (9 tests | 2 failed) — × S11 allowlist accepts literal live_sse/experimental_live_sse … (T18 successor); × S02-related` → RED.
- Restore: `27/27 unit green` (vitest.config.ts) → GREEN.
- Direct gate evidence: `bun test` → unit `(pass) Vitest gate: vitest.config.ts [25996ms]`; integration `(fail) … Expected: 0, Received: 143 … [300066.65ms]`; same config run directly: `Test Files 5 passed (5), Tests 65 passed (65), 698.73s, INTEG_EXIT 0`.
- e2e evidence: clean segments green (14 passed incl. all desktop/tablet runnable), failures all post-`[WebServer] error: script "preview" exited with code 143` (external sweep/port), never assertion mismatches.
