# STL-22 review — cycle 8 (adversarial)

**VERDICT: PASS**

PR https://github.com/NevrLabs/stellarc/pull/58 · head 4136c9de · diff vs origin/dev: 25 files, +1084/−6. Review worktree /mnt/deepvault/forge-merge/review-stl-22-c8 (detached at head), removed after.

## Per-item audit

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| 1 | SPEC COMPLIANCE | **pass** | All 13 CREATE files present. v1 mirrors verified byte-level: icons ×8 sha256 MATCH, package.json + bun.lock + build.rs + main.rs byte-identical, Cargo.toml = v1 minus Axis/serde/tokio/tracing deps (spec-mandated drop; reqwest gains blocking+rustls-tls for the spec's /health probe), tauri.conf.json = v1 with exactly the mandated rebinds (frontendDist ../apps/stellarc-ui/dist, 5 targets, real CSP replacing v1's csp:null, no ui-dist resources). lib.rs: asset protocol, 1440×900/min 360×640, no free_loopback_port/Axis/axis_endpoint. build-ui.sh bakes VITE_API_URL from DESKTOP_API_URL + manifest + resolved CSP copy. launch-smoke.sh per conventions. Maestro flow = launchApp → extendedWaitUntil landmark → takeScreenshot (landmark regex matches frozen i18n strings, per review-7). Root package.json + README lines present. ci.yml untouched — justified: v1 precedent is a standalone self-triggering desktop.yml (verified in v1 repo). desktop/.gitignore trivial hygiene (ruled acceptable review-7). c7→c8 delta touches only the 5 files the rework named. |
| 2 | TESTS THAT CANNOT FAIL | **pass** | 7/7 green at head (my run). Replayed ALL spec saboteurs + guards for both c8 fixes, each red → revert → green: drop dmg `1 failed|6 passed`; console.log in UI file `1 failed|6 passed`; unset DESKTOP_API_URL `2 failed|5 passed`; delete extendedWaitUntil `1 failed|6 passed`; csp:null `2 failed|5 passed`; remove img-origin sed arm `1 failed|6 passed`; remove style-src directive `1 failed|6 passed`; reverted → 7/7. T02 depth-1 fix replayed with a real shallow clone: old logic `fatal: Not a valid object name origin/dev`, new deepen+merge-base → cef9c5f9 OK. Decorative tests: none. |
| 3 | MIGRATIONS | **pass** | Zero migration/DB paths in diff; slice is not a data path. |
| 4 | DOCTRINE | **pass** | No SQL, no events, no mutations. Shell only consumes spec-sanctioned best-effort GET /health (2 s, off-thread, non-fatal). Structured stderr lines service.name=stellarc-desktop; no tokens/PII/credential URLs; localhost:1337 in lib.rs is the compile-time fallback of a token-free env var, named by the spec's own premise audit. |
| 5 | WORKER DEBRIS | **1 item** | build-ui.sh carries the same 4-line "Rework defects 1-2" comment block TWICE verbatim (lines 42–45 and 46–49) — leftover churn from the c8 edit. No TODO/FIXME/dbg!/console.* elsewhere. → defect 1. |
| 6 | SCREENSHOTS | **n/a (correctly)** | Slice adds zero UI surfaces; spec names no screenshot deliverable for T8. T09 proven by byte-diff instead of a local run: zero paths under apps/stellarc-ui (incl. e2e baselines) differ from dev — and a local e2e run would be invalid anyway (port 1337 occupied by kaneo-dev-web; CI foundation is the e2e gate per attribution rule). CI at head: bundle-linux ✓, linux-smoke ✓ (real AppImage under xvfb: window-created + health-probe asserted, clean SIGTERM). |
| 7 | SPANS (ADR 0010) | **pass (by absence)** | Zero TS under apps/ or packages/ in the diff — no un-instrumented path can exist; no console.* outside tests; shell logs carry status codes/errors only, no PII. Verified absence per spec. |
| 8 | GATES RE-RUN | **pass** | At 4136c9de in the review worktree: biome lint ✓ (948 files), tsc --noEmit ✓, focused desktop.test.ts 7/7 ✓, full unit suite 14/14 ✓, turbo build 3/3 ✓. CI at head: ui-purity ✓, cargo-check 4/4 triples ✓, bundle-linux ✓, linux-smoke ✓; bundle-signed ✗ both legs = T07's DESIGNED fail-closed (named `::error::T07: … signing secret missing` — verified in job logs; O2 open item, spec-sanctioned); foundation ✗ = pre-existing infra (last 5 dev-branch runs all fail at disposable-PostgreSQL install — not this diff); maestro-desktop skipped behind bundle-signed (review-7 defect 5, correctly carried as an O2 orchestrator dependency with the re-run expectation documented in the PR body). Race-fix (defect 4) replayed with a fake app logging health-probe 6 s after window-created: old logic FAIL, c8 script PASS with clean SIGTERM + no orphans. |
| | | | |

## DEFECTS

1. **MINOR (cosmetic, non-blocking) — duplicated comment block.** `desktop/scripts/build-ui.sh:46-49` duplicates verbatim the comment at lines 42-45 ("Rework defects 1-2: also resolve the img-src origin placeholder…"). Fix: delete lines 46-49 (keep one copy). Zero functional impact — the sed on line 55 is correct and guarded by the T03 red control.

## Carried open items (not defects)

- **O2 / T06:** maestro-desktop never executed against a real bundle (skipped behind the designed fail-closed). Standing expectation from review-7 defect 5: once signing secrets land, re-run desktop.yml and attach the maestro-desktop green run + desktop-boot screenshot to PR #58 before merge; "secrets landed but maestro still red" = new rework.
- **Foundation CI infra:** disposable-PostgreSQL install fails on plain dev too — blocks the suite's CI execution, unrelated to this PR.
