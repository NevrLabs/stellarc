# Stellarc tool-approval — types round r7 (r6 follow-up)

**Run:** `stellarc-approval-types-r7` · 2026-11-09T05:44Z · builder `fxcompute-01`
**Own:** `apps/toolgw/src/tool-approval.ts`, `apps/toolgw/src/tool-approval-check.ts` (+ this doc, private scratch)
**Parent directive:** r6's "no-new-vs-baseline" tsc verdict is not acceptance. Fix the owned type errors for real; prove strict RAW exit 0, a standalone module bundle, and 20/20 groups from source AND from the artifact.

## RED evidence (inherited, not re-run)

r6 static receipt (`/mnt/deepvault/stellarc-approval-r6-20261109T0518Z-e4fdd3d9/receipts-r6/static.log`): scoped strict tsc **raw exit 2, 11 diagnostics**, 5 unique messages, across both owned files. Baseline-dedup (message-only equality) was rejected as proof — correctly: the errors were real and are fixed at the type level here, not baselined.

## Fixes (type soundness only; behavior preserved by receipts below)

| r6 diagnostic | Fix |
|---|---|
| `tool-approval.ts(344)` TS2345 `Record<string, unknown>` → `tx.json(JSONValue)` | `enqueue` now parses the **already-validated** `projectionText` (boundary-checked `JSON.stringify` + size gate) into a `Parameters<TransactionSql["json"]>[0]`-typed value and stores that. Stored jsonb bytes are identical — postgres.js re-serializes to the same string the boundary checked. No `any`, no suppressing cast: the parse is itself a checked boundary. |
| `tool-approval.ts(428)` TS2345 `Row` → contextDigest input | `claim` shapes the row once into a structural `record` (id/org/actor/subject/delegation/runId/operation/binding/requestDigest) that `contextDigest` and the `recheck` callback both consume. Digest inputs byte-equal the previous inline reads (`run_id`/`request_digest` are NOT NULL; `delegation ?? null ?? ""` ≡ old `delegation ?? ""`). |
| `tool-approval-check.ts` TS2339 `args.text`/`args.marker` on `{}` (×4) | `enqueue` keeps `args` a general unknown payload. Groups that read fixture text/marker first assert `isFixtureArgs(args)` — a real runtime type predicate (property + string checks), after which TS narrows. No cast at access sites. |
| `tool-approval-check.ts` TS2722 possibly-undefined release handles (×3: race, F2a, F2b) | Each barrier release is proven armed via `assert.ok(unlock/release !== undefined)` immediately before invocation; the sibling `finally` keeps `?.` so cleanup stays mandatory on every error path. |

No strict flags weakened, no excludes, no `@ts-ignore`, no baseline logic (removed entirely), no manifest/deps edits, no donor/jose shim changes.

## GREEN receipts — `/mnt/deepvault/stellarc-approval-r7-20261109T0544Z-7b5191e1/`

All phases under the same two locks (authgw → `~/ws/gate.lock`, `flock -w 600`, children `9>&- 8>&-`), fresh headroom gate each phase (root ≥4 GiB, mem ≥2 GiB, PSI <5 — actual 4.9–5.07 GiB / ~4.2 GiB / ≤0.08).

| Phase | Verdict | Receipt detail |
|---|---|---|
| `static` | **exit 0** | `tsc_raw_exit=0 diagnostics=0` (both owned files, one scoped strict invocation, same flags as r6) · `biome_exit=0` (13 pre-existing style warnings, warnings-only) · `module_bundle_exit=0` — standalone `bun build tool-approval.ts --target bun` → 15.2 KB · `check_bundle_exit=0` → 132.2 KB |
| `green-source` | **child_exit=0, 18s** | fresh own PG16 (256 MiB, loopback, disposable-only) · `TOOL APPROVAL CHECK PASSED 20 groups` |
| `green-artifact` | **child_exit=0, 14s** | fresh own PG16 · check source **hidden** (`mv` → `.hidden-r7`, restored in trap) · entry = bundled `tool-approval-check.js` · `TOOL APPROVAL CHECK PASSED 20 groups` — including the cross-process claim group, so the self-spawned workers (`import.meta.path`, runtime-evaluated in the bundle) provably executed from the artifact, not source |

**TDD frame:** r6 `static.log` is the RED receipt (11 diagnostics against r6 final hashes 9927bbf5/e14504b6). r7 fixes turn it GREEN with raw exit 0. Behavior surface is unchanged (type-level edits only), so the existing 20-group regression on both source and artifact IS the GREEN proof — no new regression group owed; none added.

## Hashes

- final sources: `tool-approval.ts` `615b871f…d10ab7` · `tool-approval-check.ts` `f4cfdd47…051324` (worktree = r7 tree = source-manifest)
- artifacts: `module/tool-approval.js` `5c024c44…61ef16b` · `check/tool-approval-check.js` `5a91238c…d37be79`
- source-manifest `7b5191e1…` (immutable, hashed into the DeepVault dirname), runner scripts hashed inside it
- toolchain: bun 1.4.0 · tsc/biome from the pinned donor (`full-v9`), zero installs

## Isolation, drift, cleanup

- r7 run tree is a **hardlink clone** of the r6 tree (134 symlinks / 2303 files identical counts); rsync replace-on-write kept the **r6 tree byte-identical** (re-verified after all runs: 9927bbf5 / e14504b6).
- Drift vs r6 freeze manifest (2300 files): changed = exactly the 2 owned files; missing-in-tree = `.git` only (same as r6's own count arithmetic).
- Closure re-verified: 0 own containers (`stellarc-r7-*`), 0 live gate pids, no lock holders, hidden-source leftover 0, post headroom root 4.99 GiB / mem ~4.1 GiB / PSI 0.

## Notes / ceilings

- `ponytail:` the fixture-args predicate asserts only `text`+`marker` — the two fields groups read; widen if future groups read more of the fixture payload.
- The 13 Biome warnings are pre-existing `noNonNullAssertion` style warnings on fixture/env accesses (exit 0 in r6 and r7); not type errors, left untouched to keep the diff minimal.
