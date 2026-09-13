# STL-22 review (cycle 3)

**Verdict: REWORK**

| # | Audit item | Verdict |
|---|---|---|
| 1 | Spec compliance | 12/12 CREATE files present; §5 MODIFY root package.json + README done; CI as standalone self-triggering `desktop.yml` (acceptable "or trigger"). **Scope creep:** `biome.json` (`!**/target`, `!**/gen`) and `.forge-deps-added.md` appended section — neither in §5 manifest. Asset protocol + baked `VITE_API_URL`, 1440×900 / 360×640, `/health` 2s non-fatal probe, zero DB/events all correct. |
| 2 | Tests that cannot fail | T01/T06/T10 verified RED on sabotage (dropped `dmg`, deleted `extendedWaitUntil`, `csp:null`). T03/T03b real (run the actual script in a sandbox, assert manifest+bundle+resolved CSP). **T02 unit test is decorative in CI** — `git diff HEAD` is empty on a clean checkout, so it can never catch a committed UI-tree change. |
| 3 | Migrations | None in diff — N/A. |
| 4 | Doctrine | Clean. No SQL (D12 n/a), zero events/mutations, no model call from control plane (health probe is a client-side data-plane GET), no hardcoded hex/tokens. |
| 5 | Worker debris | Clean. No commented code, no debug logs; icons are expected binaries; bun.lock is 37 lines, not a giant diff. |
| 6 | Screenshots | Maestro flow carries `takeScreenshot` (runtime artifact). No committed desktop PNGs because the bundle is byte-frozen (T09) — correct. Note: smoke asserts only a sign-in landmark, not §6 "render identically" pixel parity (spec-internal gap, not an implementer deviation). |
| 7 | Spans (ADR 0010) | Zero new spans by construction — no TS service fns/endpoints/events. No `console.*` (Rust logs via `eprintln!`; T02 proves no TS added). No PII/credentials in shell logs. Absence verified. |
| 8 | Re-ran gates | `cargo check -p stellarc-desktop --all-targets` (linux) **PASS** (5m15s); `bun vitest` desktop.test.ts **6/6 PASS**; negative controls T01/T06/T10 **RED** as required. |

## DEFECTS

1. **package.json:17** — `desktop:build` is broken on a clean checkout. `bun run --cwd desktop tauri build -c target/tauri.conf.build.json` points `-c` at `desktop/target/tauri.conf.build.json`, which only exists after `build-ui.sh` runs — but that script is the `beforeBuildCommand`, which executes AFTER the CLI parses `-c`. Verified: `tauri build -c target/tauri.conf.build.json` fails with `failed to read configuration file … No such file or directory` before any build runs. Fix: pre-bake before invoking tauri, e.g. `"desktop:build": "DESKTOP_API_URL=${DESKTOP_API_URL:-https://api.stellarc.dev} bash desktop/scripts/build-ui.sh && bun run --cwd desktop tauri build -c target/tauri.conf.build.json"`.

2. **biome.json:17-18** — adds `!**/target` and `!**/gen` ignores. Not in the §5 file manifest → scope creep. Either justify in the spec or drop (harmless infra, but unauthorized).

3. **.forge-deps-added.md** — appended `## STL-22 cycle 2` section. Forge bookkeeping, outside the §5 manifest → scope creep. Route through the forge driver rather than shipping in the feature PR.

4. **tests/unit/desktop.test.ts:61-71** — T02 unit test diffs `git diff --name-only HEAD -- apps/stellarc-ui packages`, which is always empty in a CI clean checkout and therefore cannot catch a committed change to the frozen tree. The workflow `ui-purity` job (diff vs `origin/base_ref...HEAD`) is the real guard. Fix: either delete the decorative unit test or diff against the merge-base (`origin/dev...HEAD`) instead of `HEAD`.
