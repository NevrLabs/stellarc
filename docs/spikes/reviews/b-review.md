# Adversarial Review — Spike b: Tunnel MVP (ticket #13)

- Reviewed: branch `spike/phase0-tunnel` @ `e1e469f` (diff `v2-main...HEAD`: 5 files,
  +600/-2 — `crates/tunnel/{Cargo.toml,src/lib.rs,src/main.rs,tests/tunnel.rs}`,
  `docs/spikes/tunnel-mvp.md`)
- Method: full diff read; every material claim in `docs/spikes/tunnel-mvp.md`
  re-verified against host artifacts on `fxcompute-01` (`/tmp/build3.sh`,
  `/tmp/demo1.sh`, `/tmp/build3.log`, `/tmp/demo1.log`, `/tmp/acp_standin.py`,
  vendored iroh source) **and** against an independent reviewer-owned cold
  rebuild + behavioral probe suite run from `git archive HEAD` of this exact
  commit (fresh cargo target dir, reviewer-authored harness stand-in and demo
  script; log `/tmp/reviewb.log` on fxcompute-01).

## VERDICT: PASS

No blocking findings. All receipts are genuine; none fabricated; all pass/fail
counts reproduce. One factual transcription error inside the spike doc's own
receipt (finding N1) should be corrected by the author in a follow-up line edit.

## Claim-by-claim verification

| Spike-doc claim | Independent check | Result |
|---|---|---|
| Build/test/clippy/fmt RC=0 ("final cycle") | Worker log `/tmp/build3.log` shows BUILD/TEST/CLIPPY/FMT-RC=0 with real compiler output; reproduced by reviewer cold build (fresh target, 253 s): all RC=0 | CONFIRMED |
| 4 integration + 2 unit tests pass | Both worker log and reviewer rerun: `tests::ct_eq_basics`, `ticket_roundtrip`, `good_ticket_round_trips`, `wrong_token_is_refused`, `expired_ticket_is_refused`, `garbage_ticket_fails_decode` — 6/6 ok | CONFIRMED |
| Good ticket: ACP round-trip through tunnel, exit 0 | Reviewer rerun: connect → `initialize` + `session/new` answered by far-side process, GOOD-RC=0 | CONFIRMED |
| Wrong token refused, fail closed, zero stdout | Reviewer rerun: BAD-RC=1, `BAD_STDOUT_BYTES=0`, stderr `Error: refused: connection lost` | CONFIRMED |
| Expired ticket refused (ttl 1 s, connect at +2.5 s) | Reviewer rerun: EXP-RC=1, `EXP_STDOUT_BYTES=0`, refused | CONFIRMED |
| Refusals never spawn harness (spawn-marker proof) | Reviewer-owned stand-in writes its own spawn marker: SPAWNS=3 = exactly good + 2 concurrent authorized connections; both refusals spawned nothing | CONFIRMED |
| `hermes` absent on host; Python stand-in used | `command -v hermes` → not found; `/tmp/acp_standin.py` = 42 lines (~"40-line") | CONFIRMED |
| iroh 1.1.0 + iroh-base 1.1.0, lockfile 382 packages | Reviewer fresh resolve picked iroh 1.1.0; `grep -c 'name = '` on worker lock = 382 | CONFIRMED |
| API citations: `EndpointAddr` fields, `TransportAddr` non-exhaustive enum, preset-based builder, `bind(preset)` | Read vendored source: `iroh-base-1.1.0/src/endpoint_addr.rs:42` (struct) ✓; enum at :52-56 (doc says :54 — off by 2, see N2); `iroh-1.1.0/src/endpoint.rs:952` `builder(preset)`, `:957` `bind(preset)`; `endpoint/presets.rs` exists | CONFIRMED (one line-number nit) |
| Auth: exactly `token\n` within 10 s, constant-time compare, expiry check, close code 1 `refused` pre-spawn | Code `crates/tunnel/src/lib.rs:116-131`; refusal path closes conn before any spawn (`lib.rs:133` spawn is strictly post-auth); behavior reproduced | CONFIRMED |
| Drain-not-teardown pipe semantics; `conn.closed().await` rationale | Code `lib.rs:144-171`; round-trip tests would catch first-EOF truncation (they assert exact echo bytes) | CONFIRMED |
| Source provenance: receipts built from this branch | md5 of all four `crates/tunnel` files identical between this worktree and worker's `~/stellarc-spike` build tree on fxcompute-01 | CONFIRMED |

### Anti-pattern sweep (requested focus)

- **Fabricated/overstated receipts**: none found. Logs contain mutually
  consistent details that would be hard to fake (PIDs ordered under server PIDs,
  per-server stderr split matching which server saw which refusal, spawn count
  arithmetic). One transcription slip — N1 below.
- **Zero-test false greens**: none. Tests assert observable behavior over real
  QUIC loopback (exact echo bytes; refusal errors; decode failure), not plumbing.
- **Security fail-open**: none found. Auth precedes spawn; timeout/error/garbage
  length all funnel to the same refuse path; `kill_on_drop(true)` prevents
  orphaned harnesses; token is 256-bit `/dev/urandom` (`lib.rs:222-227`);
  comparison constant-time (`lib.rs:229-231`; length short-circuit leaks nothing
  since wire format fixes length at 64 hex).
- **Stale artifacts**: none in diff; scaffold replaced cleanly, no TODOs.
- **Schema-doctrine conflicts**: none. Implementation matches ADR 0004 exactly
  (transport-only bytes, scoped ticket as entire permission model, dumb-pipe
  relay posture); D11/D14 references in the doc are accurate; CONTEXT.md
  topology entry ("standalone Rust tunnel (capability-scoped iroh)") consistent.
- **Unnecessary code/deps**: none. All five direct deps used; tokio features all
  exercised (`process`, `io-util`, `io-std`, `time`, `macros`, `rt-multi-thread`).

## Blocking findings

None.

## Non-blocking findings

1. **Doc misquotes its own receipt (transcription error)** —
   `docs/spikes/tunnel-mvp.md:62`. The redacted token is shown as
   `"59db8f56…(redacted)"`, identical to the endpoint-id prefix; the actual
   minted token began `d274…` (verified by decoding `/tmp/ticket.txt` on
   fxcompute-01 and by the unredacted `TICKET_SHAPE` computation in
   `/tmp/demo1.log`). The id-prefix value was evidently pasted into the token
   field when transcribing. The underlying claim (ticket shape/fields) is true;
   fix the one line. Reproduction: decode the archived ticket on the host and
   compare `token[:8]` vs `addr.id[:8]`.
2. **Receipt line-number nit** — `docs/spikes/tunnel-mvp.md:115` cites
   `endpoint_addr.rs:54` for the `TransportAddr` definition; actual location is
   `#[non_exhaustive]` :52 / `pub enum TransportAddr` :53. Immaterial.
3. **Headline security property not pinned by an in-repo test** — "refusal
   never spawns the harness" is proven only by the external marker-file demo.
   `tests/tunnel.rs` uses `cat` and asserts client-visible refusal only. A
   marker-writing harness stand-in as the test fixture would pin it. (Reviewer
   verified the property behaviorally — SPAWNS=3 accounting.)
4. **Auth-timeout path untested** (doc admits) — static reading of
   `lib.rs:119-126` is sound (timeout → same refuse path); no automated cover.
5. **Ticket TTL ≠ server lifetime** — discovered interactively: a
   `serve --ttl-secs N` process accepts until killed; expiry gates auth only.
   Consistent with the doc's model but worth stating explicitly; also bit the
   reviewer's own first script (bare `wait` hung on the immortal server).
6. **Library-level panic on empty `cmd`** — `Server::run(&[])` /
   `handle_conn` index `cmd[0]` (`lib.rs:133`) without a guard; the CLI
   prevents it (`main.rs:25`). Guard or debug_assert if the lib outlives the
   spike.
7. **No committed `Cargo.lock`** — builds float within semver (`iroh = "1.1"`);
   the doc cites lock state that lives only on the build host. Fine for a spike;
   commit a lockfile (or say why not) before this becomes the product wedge.
8. **CI unexercised** — branch is unpushed; `.github/workflows/ci.yml` will run
   these tests on GitHub runners where `presets::N0` relay/DNS reachability adds
   flake potential (tests passed twice with real network on fxcompute-01).
9. **Ticket embeds host private addresses** — bound-socket union puts NetBird/
   LAN/docker-bridge IPs into the ticket (`lib.rs:62-75`). Harmless for
   same-host demos; revisit address hygiene when tickets leave the operator's
   hands.
10. **Demo log fidelity** — long lines in `/tmp/demo1.log` carry literal `…`
    truncations (terminal-width capture, disclosed at doc §91). Cross-checked
    numerically; treated as capture artifact, not tampering.

## Verification commands & results (reviewer-run)

On fxcompute-01, from `git archive HEAD` of `e1e469f` into a clean tree with a
cold `CARGO_TARGET_DIR`:

```
cargo build -p stellarc-tunnel                          # BUILD-RC=0
cargo test --workspace                                  # TEST-RC=0  (6/6 ok)
cargo clippy --workspace --all-targets -- -D warnings   # CLIPPY-RC=0
cargo fmt --all --check                                 # FMT-RC=0
```

Behavioral probes (reviewer-authored script + stand-in):

```
good ticket: initialize+session/new answered            # GOOD-RC=0
two concurrent authorized connections                    # C1-RC=0, C2-RC=0
wrong-token ticket                                       # BAD-RC=1, stdout 0 B, "refused"
expired ticket (ttl 1 s, dial at +2.5 s)                 # EXP-RC=1, stdout 0 B, "refused"
spawn-marker accounting across whole run                 # SPAWNS=3 (= authorized conns only)
iroh resolution                                          # iroh 1.1.0
```

Artifact checks on fxcompute-01: worker scripts/logs present with timestamps
consistent with commit time (+0700 03:03 UTC ≈ artifacts 02:50–03:00 UTC); md5
of `crates/tunnel/**` identical to this branch; cited iroh source lines read in
vendored registry sources.

Provenance disclosure: while fixing a filename mismatch in the reviewer's own
first transfer, the worker's `/tmp/src.tar.gz` input tarball on fxcompute-01 was
overwritten with the reviewer's archive of this commit. All four code files had
already been md5-verified identical before the overwrite, so no evidentiary
value was lost; noted for completeness.

## Merge recommendation

**Approve.** No code changes required. Land the one-line doc erratum (N1,
optionally N2 in the same touch) from the author either in this branch before
merge or as an immediate follow-up. N3–N9 are recorded debt for the
productization pass, appropriate to defer for a phase-0 spike.
