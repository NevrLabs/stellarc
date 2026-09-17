# STL-22 review (cycle 5)

**Verdict: REWORK**

Reviewed the DIFF of PR 32 (head 5216d005 = local forge/stl-22-c1, verified identical), 24 files +967/−1. All local gates re-run in a throwaway worktree of the head (`/tmp/stl22-rv`, removed after). Prior review-3 defects tracked below.

| # | Audit item | Verdict |
|---|---|---|
| 1 | Spec compliance | 12/12 CREATE files present and correctly mirrored (icons sha256-identical to v1; CSP real; asset protocol + baked VITE_API_URL; 1440×900/min 360×640; zero tables/events/endpoints). §5 MODIFY done: root package.json scripts + README line; standalone `desktop.yml` accepted (spec's "or trigger", review-3 precedent). Frozen tree byte-identical to dev (verified: empty `git diff mb..head -- apps/stellarc-ui packages`). c3 D2/D3 scope creep (biome.json, .forge-deps-added.md) gone. **DEVIATED:** both root scripts broken on a clean checkout (D1, D2) — the §5 MODIFY deliverable fails its own promised workflow. **Scope creep:** `desktop/.gitignore` not in manifest (D4). |
| 2 | Tests that cannot fail | Locally all 7 tests pass and every spec sabotage goes RED (pasted under §8): drop `dmg` → red; `csp:null` → red (2 asserts); delete `extendedWaitUntil` → red; `console.log` in frozen UI file → red; restore → 7/7 green. T03/T03b execute the real script in a sandbox — genuine. **BUT T02 breaks the CI suite it ships in** (D3): `bun test` → gates.test.ts → vitest runs desktop.test.ts inside ci.yml's foundation job, whose depth-1 PR checkout has no `origin/dev`; shallow-clone demo: `git merge-base origin/dev HEAD` → "Not a valid object name" → `expect(mb.status).toBe(0)` fails. Masked today only by the inherited apt failure (every foundation run on this PR for 4 days died at `postgresql-15` install, before `bun test` ever ran). |
| 3 | Migrations | None in diff — N/A. No journal touched. |
| 4 | Doctrine | Clean. No SQL (D12 n/a), zero events/mutations (spec §2 honored), `/health` probe is a client-side GET with 2 s timeout off-thread, no hardcoded hex/tokens, no model calls from the control plane, no `console.*` anywhere in shipped TS (grep 0); Rust logs via one `eprintln!` pattern, no tokens/PII. |
| 5 | Worker debris | Forge cycle/run-number references committed into shipped files: `c5 run 34914447214` (desktop.yml:67-68), `rework D3` (desktop.yml:87, build-ui.sh:6), `rework D1` (desktop.test.ts:61), `review-3 D4` (desktop.test.ts:82). Process bookkeeping that rots (D5). No commented-out code, no debug logs, no stray files otherwise. |
| 6 | Screenshots | N/A by construction: bundle is byte-frozen (T09 verified byte-identical), so no committed desktop PNGs is correct; Maestro `takeScreenshot` is a runtime artifact and the desktop flow cannot run past the O2 fail-closed gate by design. Spec names no committed screenshot deliverable for this slice. Not a deviation. |
| 7 | Spans (ADR 0010) | Zero new spans by construction — no TS service functions, endpoints, DB calls, or event paths exist in the diff. Absence verified: no un-instrumented TS smuggled in (only test file added), no PII/tokens in shell log lines. Audit passes. |
| 8 | Re-ran gates | See GATE OUTPUT below: vitest 7/7 PASS; lint PASS (948 files); typecheck PASS; negative controls RED as required; `desktop:check` **FAIL exit 101** on clean checkout; `desktop:build` **FAIL** end-to-end via real tauri CLI. CI ground truth (Desktop run 34916060524 on head 5216d005): ui-purity PASS, cargo-check ×4 PASS (with workaround step), bundle-linux PASS, **linux-smoke PASS** (real T05 gate green), bundle-signed ×2 fail with the named O2 message (designed fail-closed; maestro-desktop skipped downstream). foundation + ui-typecheck-budget fail **identically on dev's own latest runs** (postgresql-15 apt drift; 429=429 budget) — inherited red, not PR-caused, not counted. |

## GATE OUTPUT (re-run by reviewer, PR head 5216d005)

```
$ bun --bun x vitest run tests/unit/desktop.test.ts
 Test Files  1 passed (1)      Tests  7 passed (7)

Sabotage T01 (drop "dmg"):     Tests  1 failed | 6 passed   → RED
Sabotage T10 (csp: null):      Tests  2 failed | 5 passed   → RED
Sabotage T06 (del ext. wait):  Tests  1 failed | 6 passed   → RED
Sabotage T02 (console.log in apps/stellarc-ui/src/main.tsx):
                               Tests  1 failed | 6 passed   → RED
Restored:                      Tests  7 passed (7)          → GREEN

$ bun run lint      → Checked 948 files. No fixes applied. (exit 0)
$ bun run typecheck → exit 0

$ bun run desktop:check   (clean checkout, no dist)
error: proc macro panicked ... `frontendDist` is set to "../apps/stellarc-ui/dist"
       but this path doesn't exist       REAL_EXIT=101

$ cd desktop && tauri build -c target/tauri.conf.build.json   (pre-baked)
Running beforeBuildCommand `bash scripts/build-ui.sh`
scripts/build-ui.sh: line 14: DESKTOP_API_URL: ... required for a release desktop build
beforeBuildCommand failed with exit code 1                EXIT=1

Shallow checkout demo (ci.yml foundation shape):
git merge-base origin/dev HEAD → fatal: Not a valid object name 'origin/dev'
```

## DEFECTS

1. **package.json:17** — `desktop:build` env prefix is scoped to the first command only: `DESKTOP_API_URL=${DESKTOP_API_URL:-…} bash …build-ui.sh && bun run --cwd desktop tauri build …`. The second command re-runs `beforeBuildCommand: bash scripts/build-ui.sh` (tauri.conf.json:7) WITHOUT the var, and build-ui.sh:14 fails closed — proven with the real tauri CLI above (exit 1 before any compile). Exact fix: export once for the whole chain — `"desktop:build": "export DESKTOP_API_URL=\"${DESKTOP_API_URL:-https://api.stellarc.dev}\" && bash desktop/scripts/build-ui.sh && bun run --cwd desktop tauri build -c target/tauri.conf.build.json"` (alternatively strip `beforeBuildCommand` from the source conf, since the script is now invoked explicitly).
2. **package.json:18** — `desktop:check` fails exit 101 on a clean checkout (`generate_context!` panics: frontendDist missing). CI's cargo-check legs pass only because desktop.yml:83-85 carries an `ensure frontendDist exists` workaround step — the shipped script depends on CI-external state. Exact fix: make the script self-sufficient: `"desktop:check": "mkdir -p apps/stellarc-ui/dist && touch apps/stellarc-ui/dist/index.html && cargo check --manifest-path desktop/Cargo.toml --all-targets"`.
3. **tests/unit/desktop.test.ts:85** — T02 computes `git merge-base origin/dev HEAD`. The foundation job that executes this test (via `bun test` → gates.test.ts → vitest) checks out the depth-1 PR merge ref: no `origin/dev` exists, so `mb.status !== 0` and the test fails in every CI run once the inherited apt failure is cleared — the guard breaks the suite it ships in (proven by shallow-clone demo). Exact fix: resolve the base explicitly and portably, e.g. `git fetch --depth=1 origin "${GITHUB_BASE_REF:-dev}"` then merge-base `FETCH_HEAD HEAD`; fail with a distinct message when no base can be resolved.
4. **desktop/.gitignore** — not in the §5 CREATE manifest (scope creep; v1 has no desktop-local .gitignore, root .gitignore covers `/target/`). Justify in the spec or fold the two lines into the root .gitignore.
5. **Worker debris — cycle/run references committed**: desktop.yml:67-68 (`c5 run 34914447214`), desktop.yml:87 + desktop/scripts/build-ui.sh:6 (`rework D3`), tests/unit/desktop.test.ts:61 (`rework D1`), :82 (`review-3 D4`). Exact fix: rewrite each comment as a timeless statement of intent (drop cycle numbers, run ids, review numbers).

Inherited (NOT counted, not this PR's fault, reported for the orchestrator): foundation's `postgresql-15` apt install fails on ubuntu-22.04 runners for dev and PR alike; ui-typecheck-budget is a `continue-on-error` advisory that surfaces 429=429 exit 2 on dev too.
