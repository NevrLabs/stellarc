# Spike: Tunnel MVP (ticket #13)

Status: complete (receipted) · Branch: `spike/phase0-tunnel` · Date: 2026-08-26
Build host: `fxcompute-01` (cargo blocked on dev host; all build/test/demo receipts
from there).

## What was proven

Capability-scoped exposure of one ACP harness over an iroh endpoint, per
ADR 0004 / D14:

1. **Ticket accepted** — client dials the minted ticket, gets `OK`, and speaks
   ACP through the QUIC bi-stream.
2. **ACP round-trip** — `initialize` and `session/new` requests answered by the
   harness process on the far side of the tunnel (live transcript below).
3. **Bad/expired ticket refused, fail closed** — wrong token and expired ticket
   are both rejected *before the harness spawns*, connection closed with the
   `refused` reason; proven by a spawn-marker file that shows exactly one
   harness spawn (the good connect) across the whole demo run.

`hermes` is not installed on fxcompute-01, so the demo harness is a ~40-line
Python ACP stand-in (`python3 /tmp/acp_standin.py`) speaking the ACP wire shape
(ndjson JSON-RPC over stdio: `initialize`, `session/new`). The tunnel is
harness-agnostic — it pipes stdio — so the path proven here is exactly the
`hermes acp` path modulo the argv.

## Shape

`crates/tunnel` (lib + `stellarc-tunnel` bin), direct deps: `iroh`, `tokio`,
`anyhow`, `serde`, `serde_json`.

- `Ticket { addr: EndpointAddr, token: String (hex), expires_at: u64 }`,
  serialized as hex(JSON). This is the tunnel's *entire* permission model
  (ADR 0004: anything richer belongs at the CP chokepoint, D11/D14).
- `serve [--ttl-secs N] -- <cmd>...` — binds an iroh endpoint (ALPN
  `stellarc/tunnel/0`), mints one scoped ticket (32-byte random token,
  `/dev/urandom`), prints the ticket on stdout, logs on stderr. One fresh
  harness process per authorized connection; stdio dumb-piped to the
  bi-stream.
- `connect <ticket>` — dials, sends `token\n` as the opening bytes of the
  bi-stream, requires `OK\n` back, then bridges local stdio.
- Auth: server reads exactly `token\n` within 10 s, constant-time compare,
  expiry check — any failure closes the connection with error code 1
  (`refused`) and no child process is spawned, ever.
- Pipe semantics: drain, not teardown. A direction ending half-closes that
  direction (client stdin EOF → harness stdin EOF → harness replies and exits
  → server stream FIN). Both sides found this the hard way — see self-review.
  After both directions drain, the server waits for the client's close
  (`conn.closed().await`) rather than closing first: an immediate
  `conn.close()` after `send.finish()` races the in-flight stream data and the
  client sees `ConnectionLost` instead of clean EOF.

## Demo transcript

From `/tmp/demo1.log` on fxcompute-01, final run (binary built from this
branch; `serve --ttl-secs 120`, `serve --ttl-secs 1` for the expiry case):

```
### 1. serve: bind iroh endpoint, mint scoped ticket
TICKET_LEN=878
TICKET_SHAPE={"addr": {"id": "59db8f56cc5548d46fdfa32650a42d42b62dfafcd16a9512208f7ce65d23ae7a",
                       "addrs": [{"Ip": "100.…"}, …]}, "token": "59db8f56…(redacted)",
              "expires_at": …}

### 2. good ticket: ACP round-trip through the tunnel
tunnel: connected to 59db8f56cc5548d46fdfa32650a42d42b62dfafcd16a9512208f7ce65d23ae7a
{"jsonrpc": "2.0", "id": 0, "result": {"protocolVersion": 1, "serverCapabilities": {"loadSession": false, "promptCapabi…
{"jsonrpc": "2.0", "id": 1, "result": {"sessionId": "spike-1", "modes": [{"id": "primary", "name": "Primary"}]}}
CONNECT-GOOD-RC=0

### 3. wrong token: must be refused, fail closed
# (first hex char of token flipped; same length, same addr)
CONNECT-BAD-RC=1
BAD_STDERR: Error: refused: connection lost
BAD_STDOUT_BYTES=0

### 4. expired ticket (ttl 1s, connect after 2.5s): must be refused
CONNECT-EXPIRED-RC=1
EXP_STDERR: Error: refused: connection lost
EXP_STDOUT_BYTES=0

### 5. spawn proof: exactly one harness spawn (the good connect)
HARNESS_SPAWNS=1 (expect 1: good only; refused tickets must not spawn)
{"event": "harness-spawned", "pid": 1011379}

# server stderr, same run:
tunnel: serving ["python3", "/tmp/acp_standin.py"] as 59db8f56…
tunnel: connection ended: refused: bad or expired ticket from a3d14e23…
```

The two truncated lines in §2 (marked `…`) are terminal width; full JSON was
verified on the host.

## Tests

`cargo test --workspace` on fxcompute-01 (final cycle, all RC=0):

- integration (`tests/tunnel.rs`, `cat` as the harness stand-in): 4 passed —
  good ticket round-trips an ACP frame; wrong token refused; expired ticket
  refused; garbage ticket fails decode.
- unit (lib): 2 passed — ticket encode/decode round-trip, constant-time
  compare.
- `cargo build` RC=0, `cargo clippy --workspace --all-targets -- -D warnings`
  RC=0, `cargo fmt --all --check` RC=0.

## iroh version / API notes

Receipted against vendored source on fxcompute-01
(`~/.cargo/registry/src/index.crates.io-*/{iroh,iroh-base}-1.1.0`):

- **iroh 1.1.0** + **iroh-base 1.1.0** (Cargo.lock: 382 packages total).
- 1.x renamed the v0.x vocabulary: `NodeId`/`NodeAddr` → `EndpointId` /
  `EndpointAddr { id, addrs: BTreeSet<TransportAddr> }`
  (iroh-base-1.1.0/src/endpoint_addr.rs:42). `TransportAddr` is
  `#[non_exhaustive]` with `Relay(RelayUrl) | Ip(SocketAddr) |
  Custom(CustomAddr)` (same file, :54).
- `Endpoint::builder(preset)` takes a **preset** — `presets::N0` bundles n0
  relays + DNS lookup; presets are a trait (`Preset::apply(Builder) ->
  Builder`) so the self-hosted iroh-dns zone (ADR 0002) plugs in as a custom
  preset/address-lookup later (iroh-1.1.0/src/endpoint/presets.rs).
- Errors are `n0_error`-based; iroh results don't convert into anyhow
  directly — map with `anyhow!("{e}")`.
- `Connection::remote_id()` on an accepted connection returns `EndpointId`
  directly (infallible) — the TLS handshake already authenticated the peer
  key. The ticket token is still required: peer authenticity ≠ authorization.
- `endpoint.addr()` may hold only the relay URL early in the endpoint's life;
  for same-host/LAN dialing we union in `bound_sockets()` (mapping 0.0.0.0 →
  127.0.0.1). Real deployments would wait for `online()` or use the DNS zone.
- QUIC streams are lazy: the client sends the token as the opening bytes of
  the bi-stream, which doubles as stream activation — the server's
  `accept_bi()` + `read_exact` then completes without deadlock.
- Close-after-FIN race: calling `conn.close()` immediately after
  `SendStream::finish()` can discard undelivered stream data — the peer sees
  `ConnectionLost` instead of the FIN. Fix: wait for the peer's close
  (`conn.closed().await`). Worth remembering for every future iroh proxy.

## Deliberate spike cuts

- Token as first-line-of-stream bearer, not TLS-level auth — the stream is
  already E2E-encrypted by iroh; the token only authorizes.
- One static ticket per server run; no revocation, no per-connection tickets,
  no single-use.
- `/dev/urandom` directly for token entropy (Linux-only); swap for
  `getrandom` if this outlives the spike.
- Harness stderr inherited, not tunneled.
- `main.rs` connect bridge awaits stdin EOF then full drain — designed for
  scripted/pipe use, not interactive TTY sessions (see weaknesses).

## Self-review

**Verified with receipts** (logs at `/tmp/build3.log`, `/tmp/demo1.log` on
fxcompute-01; reproducible via `/tmp/build3.sh` + `/tmp/demo1.sh`):

- Build, tests (4 integration + 2 unit), clippy `-D warnings`, fmt — all
  RC=0 on the final cycle.
- Live: good ticket connects, ACP `initialize` + `session/new` round-trip,
  exit 0; wrong-token and expired tickets both exit 1 with `refused` on
  stderr and zero bytes on stdout; exactly one harness spawn across the
  entire demo (spawn-marker file), i.e. refusals never spawn the harness.
- iroh API notes above are grep-receipted from the vendored 1.1.0 source,
  not from memory.

**Unverified / not tested**:

- Cross-machine connectivity (both endpoints were same-host on fxcompute-01,
  dialed via the 127.0.0.1 mapping). Relay fallback path (N0 relay) was never
  exercised.
- Real `hermes acp` — no hermes binary on the host; stand-in speaks the same
  stdio ndjson shape.
- Auth-timeout path (client that connects and goes silent) is covered by the
  10 s timeout code but has no dedicated test.
- Concurrency: multiple simultaneous good connections each spawn their own
  harness (by construction) but no test exercises two at once.

**Known weaknesses**:

- A harness that never exits after stdin EOF holds the connection open
  (drain semantics wait for both directions). Fine for request/response ACP;
  needs an idle timeout policy for long-lived sessions.
- The token has no rate limiting on attempts — each attempt costs a QUIC
  handshake and one `ct_eq`. ACP-scoped, not internet-scoped; revisit when
  the tunnel is CP-mounted.
- Ticket expiry is checked at auth time only; long-lived authorized
  connections outlive their ticket (no mid-stream re-check). Documented cut,
  matches "scoped connection ticket" semantics.
- During the spike, teardown-on-first-EOF bugs (both sides) silently
  truncated the final ACP reply — the failure mode is *correct-looking but
  incomplete output*, not an error. The drain-semantics rewrite fixed it;
  kept here as a note because that class of bug will recur in byte-pipe code.
