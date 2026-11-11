# Stellarc Approval RED→GREEN r6 — Executive Fixes, Executed

Status: **Approval behavior GREEN 20/20; strict TypeScript remains RED (11 errors).**
Supervisor read back the RED/fix/final child receipts and final source hashes.
The differential `tsc_gate=0` is not a passing strict typecheck: raw compiler
exit is 2. The saved comparison deduplicates message text, so it does not alone
prove identical diagnostic site/multiplicity sets. Biome and host build passed;
the host build does not include this unwired approval module. Clean standalone
approval compilation and an approval artifact check remain required.
Owner-lane: `apps/toolgw/src/tool-approval.ts` + `apps/toolgw/src/tool-approval-check.ts` only.
Date: 2026-11-09 (UTC). Host: fxcompute-01. Supervisor: Terminus (post builder-root-R5 recovery).

## What this run did

Executed the R3 regression (never before run — R3 stopped at "prepared") and
fixed the three council-R2 production defects for real, with per-fix gated
runs and receipts. **Nothing below is inferred; every number is a child exit
code or a log line.**

## Environment & prerequisites (actual)

- Builder state at resume: root 5,296,185,344 B; MemAvailable 4,144,692 kB;
  memory PSI some avg10 0.00 — matches root-R5 recovery receipts.
- **Freeze**: full split tree streamed to
  `/mnt/deepvault/stellarc-approval-r6-20261109T0518Z-e4fdd3d9/`
  (payload 215,357,440 B, sha256 `c2123bd4ff1892d8d89e19a4b3d8a567e679440338ebdbf3218b5094684c6144b3`,
  readback-verified; manifest 2300 files, per-file sha256; 2299/2300 rehash
  OK on extraction — the 1 "missing" is the excluded `.git` gitlink, HEAD
  recorded in manifest metadata). No credential files in tree. No local
  archive; tar streamed over ssh. No installs.
- **Donor**: `full2` does **not exist** on the host; used
  `~/.local/share/stellarc-gates/full-v9` — the same donor the historical
  `full2-gate.sh` itself points at. Symlink-farm overlay (133 entries, 80
  workspace links remapped into the run tree, 6 nested node_modules).
- **jose resolution**: donor does not root-hoist jose; host's pinned copy
  (6.2.12, matches root `bun.lock`) lives at
  `apps/stellarc-gateway/node_modules/jose`. Layout shim: symlinked into
  run-tree root `node_modules/jose` — run-tree only, no manifest/lock edit.
  Approval check does not import jose; the host build does. Runtime oracle:
  `import("postgres")` / `import("jose")` / `import("better-auth")` all OK
  from the exact source parents.
- **Gates**: new runner `~/ws/stellarc-r6-e4fdd3d9/r6-gate.sh` — acquires
  `~/.cache/stellarc-authgw-gate.lock` (fd 9) **then** `/home/rpw/ws/gate.lock`
  (fd 8), `flock -w 600` each; all children spawned `9>&- 8>&-`; headroom
  recheck under locks before every phase (root ≥ 4 GiB, MemAvailable ≥ 2 GiB,
  memory PSI some avg10 < 5 — else blocker exit, no pressure created);
  receipt-replay / live-pid refusal before repeat (no duplicate runners);
  per-phase log + propagated child exit + post-phase headroom.
- **PG fixture**: fresh disposable `postgres:16` container per check — unique
  port (socket-bind), `-m 256m`, `--network host` + `-c listen_addresses=127.0.0.1`,
  own name `stellarc-r6-<label>-$$`, `POSTGRES_PASSWORD=disposable-only`,
  removed via trap (own container only). The check itself provisions the
  private `gateway_runtime` role from the owner DSN.

## RED (actual, not inferred)

`check red` — child_exit=1, 13s, container `stellarc-r6-red-3000489` port 54273.

**TOOL APPROVAL CHECK RED 6 of 20 groups** — exactly the council-predicted set:

| group | defect | first trace |
|---|---|---|
| lease-expiry-blocks-decision-and-claim | F1 | `+ 'pending' - 'expired'` (rollback) |
| reg-f1-claim-denied-audit-persists-row-stays-approved | F1 | `0 !== 1` (audit rolled back) |
| reg-f2-reported-row-never-gains-contradictory-unknown-audit | F2 | `1 !== 0` |
| reg-f2-concurrent-recovery-records-single-unknown-event | F2 | `2 !== 1` |
| reg-f3-terminal-replay-requires-claim-owner | F3 | Missing expected rejection |
| reg-f3-unknown-replay-requires-claim-owner | F3 | Missing expected rejection |

14 groups green including all race-barrier groups — **no harness defects
found, no oracle corrections needed** (deterministic barriers held; held
promises settled on error paths as written).

## Fixes (minimal, production semantics only)

All in `apps/toolgw/src/tool-approval.ts`; check file unchanged semantically
(only formatter/assist pass). No schema/migrate/endpoint/policy changes; no
replay/unknown semantics altered.

- **F1 — commit refusal sentinel** (reuse of `store.authorize` `{error}`
  pattern): `decide` and `claim` transactions now return
  `{ refused: Denied }` after their audit/transition writes; the `Denied` is
  thrown **after commit**. Covers the expired path (both functions) and the
  `claim_denied` path. Real audit failures still throw inside the tx and roll
  everything back.
- **F2 — proof-first recovery**: both `recover()` loops now run a conditional
  `UPDATE … WHERE <state + DB-time predicate> RETURNING` first and append the
  audit only if a row actually transitioned, in the same tx (audit failure
  rolls the transition back). Candidate SELECTs slimmed to `id,org` (actor/
  subject/run_id come from RETURNING). Covers stale-dispatch and expiry loops.
- **F3 — owner validation before idempotent no-op**: `report` checks
  `claimed_by === worker` before the same-outcome early return, so a foreign
  worker can never silently ack a terminal row; same-owner/same-outcome
  idempotency preserved.

Per-fix gated progression (each on a fresh PG, locks, headroom receipts):
`red` 6/20 → **f1** (sha `5c3639ee…`) 4/20, both F1 groups PASS →
**f2** (`e1e5d90f…`) 2/20, both F2 groups PASS, audit-denial-rollback still
PASS → **f3** (`661dda83…`) **PASSED 20 groups**, child_exit=0, 14s.

## Format + final GREEN

Biome 2.4.6 `format --write` + `check --write --linter-enabled=false`
(assists only — no lint rewrites; an auto-"fix" of the check's `env!`
assertions would change types) on the two owned files. Final bytes:
- `tool-approval.ts` `9927bbf59b9c178998f7e57f4e25edda750d366d60513e50bf37e6692bdf9629`
- `tool-approval-check.ts` `e14504b6cf70f53af508428c01253a9ff122dae87f9aa5c908b843dc603f171f`

`check green-final` on the formatted bytes: **TOOL APPROVAL CHECK PASSED 20
groups**, child_exit=0, 15s, fresh PG. Same bytes shipped back to the shared
worktree (hash-verified both directions).

## Static gates (actual)

`static` phase — `tsc_raw_exit=2 new_vs_baseline=0 tsc_gate=0`;
`biome_exit=0` (13 pre-existing `noNonNullAssertion` style warnings, exit 0);
`build_exit=0` — bundled 1227 modules, `dist/main.js` 3.40 MB, artifact-check
`PASS built-console-assets-byte-identical`.

**Exact base proof for tsc** (not a claim): identical scoped-strict tsc run
against the frozen BASE (`30862c95…`) vs fixed tree — BASE has 11 errors (5
distinct messages, 9 sites in the check file + 2 in enqueue/recheck-call code
this diff never touched); fixed tree has the **same 11**, only line numbers
shifted (`338→343`, `422→434`). Zero new type errors introduced; comm-diff
receipt archived (`static.tsc-baseline` / `static.tsc-messages`).

## Integrity, cleanup, headroom

- **Drift vs freeze manifest**: 2299 files rechecked — exactly 2 changed, both
  owned. No core-auth/host/llmgw/manifest edits.
- **Cleanup**: zero own containers remaining (`docker ps -a` filtered), zero
  own runner processes; locks are per-invocation flock, released on exit;
  PG containers removed per-phase by trap (only exact own names).
- **Post headroom**: root 5,082,554,368 B; MemAvailable 4.24 GB; PSI avg10
  1.14 (build release transient).
- **Receipts**: 48 files under
  `/mnt/deepvault/stellarc-approval-r6-20261109T0518Z-e4fdd3d9/receipts-r6/`
  (per-phase exit/log/pg-id/headroom/post-headroom/src-hashes), plus
  `final-source-hashes.txt` alongside. Private scratch mirror:
  `~/.hermes/cache/scratch/stellarc-approval-r6/`.

## Boundaries kept

Fixture-only execution; no live candidate/Maple/IdP/provider/inference
contact; no commits/push/deployment/subagents/restarts/prunes/resource
changes/background pollers. Historical gate scripts read for prerequisites
only; old runner/paths never executed.
