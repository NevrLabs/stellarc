# ADR 0035 — Desktop Bundle, Local-First Transport, and Client Connection Scope

- Status: Proposed
- Date: 2026-07-26
- Relates to: ADR 0010 (desktop Axis connections), 0031 (install tiers),
  0032 (Lite/Full editions), 0033 (axis/orbit authority, desktop modes)
- Amends: ADR 0032 (§3 drops the TCP-loopback listener; §5 WSL orbit install
  becomes opt-in, never automatic)

## 1. Decision

### 1.1 Same-host transport is iroh with no public dependency

Stellarc Desktop on Windows runs axis natively and orbit inside WSL2. They
connect over **iroh with a local-only endpoint preset and explicit direct
addresses** — no relays, no DNS, no public internet.

1. Same-host and LAN peers MUST bind with `presets::Minimal` (crypto provider
   only) or `N0DisableRelay`, never `presets::N0`. `N0` adds
   `PkarrPublisher::n0_dns()`, `DnsAddressLookup::n0_dns()` and
   `default_relay_mode()` — i.e. publishing to and resolving via n0's public
   infrastructure. Requiring internet reachability to reach `localhost` is a
   defect, not a tradeoff.
2. Peers are dialed by `EndpointAddr` carrying **direct socket addresses**.
   Discovery is unnecessary because the address is already known locally:
   Windows reaches WSL2 on `localhost` (NAT mode `localhostForwarding=true`,
   the default), and mirrored mode (`networkingMode=mirrored`) makes
   `127.0.0.1` work in both directions.
3. **No hole punching is involved.** Windows<->WSL2 is directly routable; there
   is no NAT traversal problem to solve on one machine. The reason to use iroh
   is that it is the only transport already implemented (`--axis iroh:<id>` is
   the sole remote form orbit parses) and it brings QUIC plus mutual key
   authentication and the existing fail-closed `allowed_orbits` allowlist.
4. **No new TCP transport.** ADR 0032 step 3 (TCP-loopback listener) is
   withdrawn: it would add a `NodeTransport` variant, a listener, and a fresh
   auth story for a port every local process can reach, to duplicate what iroh
   already does with key auth. `NodeTransport::Uds` stays Unix-only and is not
   available to a Windows axis (`std::os::unix::net`).

### 1.2 The desktop app bundles everything

5. Stellarc Desktop is a Tauri shell bundling **axis + UI**, and it configures
   and supervises axis on first run — the user installs one thing and it works.
   Lite edition per ADR 0032: SQLite, single org, user tier per ADR 0031.
6. **Windows desktop cannot bundle orbit.** Verified by cross-compiling
   `x86_64-pc-windows-gnu`: axis compiles clean; orbit fails with 37 errors,
   30 of them in `pty.rs` (`forkpty`, `setsid`, `ioctl`, `waitpid`,
   `WEXITSTATUS`, `winsize`, `TIOCSWINSZ`, `SIGHUP`/`SIGKILL`, `pid_t`,
   `std::os::fd`). These are Unix process-control primitives with no Windows
   equivalent worth emulating. On Windows the node runtime lives in WSL2, which
   is Linux; on Linux and macOS the desktop bundles orbit natively.
7. **WSL orbit installation is opt-in.** The app MAY detect WSL2 distros and
   offer to install orbit into a named one; it MUST NOT install automatically.
   The prompt names the target distro (a machine may have several), and a
   decline is remembered. Silent installation into a user's Linux environment
   is unacceptable in a tool that also claims device-management ambitions.

### 1.3 Lite is single-user; the token stays

8. Lite has **no login and no user accounts** — one human, one org, their own
   machine. There is no second principal to authenticate, so a login screen
   would be theatre.
9. The **installation token and Origin gate remain**, and are not user-facing.
   They are already auto-generated (`auth::load_or_create_token`), so this
   costs the user nothing. They exist because axis binds a local HTTP port and
   `127.0.0.1` is not a trust boundary on a multi-process desktop: any browser
   page or local process could otherwise drive the API. "No auth required"
   means **no human credential**, not an unauthenticated socket.
10. Actor attribution (ADR 0034 §1.4) still applies with a single local
    principal. Lite writes a real actor identity, so a Lite install that later
    joins an org has a coherent history rather than a gap.

### 1.4 Client connection scope is structural

11. **Web UI: exactly one axis.** It is served *by* an axis, so its API origin
    is that axis. This is not a product limitation being imposed; it is what
    being served by an origin means. Org count follows the edition, not the
    client: SQLite/Lite = single org, PostgreSQL/Full = multi-org.
12. **Desktop: many axes.** A native client has no serving origin, so it keeps
    a connection catalog — N axes, each with its own identity and credential —
    and switches or fans out across them.
13. **Axis MUST NOT know which client is talking to it.** Multi-axis is purely
    client-side composition. If desktop-specific behaviour leaks into axis, the
    server becomes coupled to one client and the web UI is permanently a
    degraded special case. No `X-Client: desktop` branching in axis.

## 2. Why

The immediate driver is a Windows machine controlling a WSL orbit. The general
rule it forces is worth stating once: **a same-machine link must not depend on
the public internet.** `presets::N0` was chosen for remote nodes, where relay
and DNS discovery earn their cost; inherited unexamined for a loopback peer it
means an offline laptop cannot talk to its own WSL distro.

Bundling everything follows from Lite's purpose. A single-user desktop install
that asks the user to separately provision a control plane has failed at the
one thing that edition exists to do.

## 3. Build and distribution

14. Windows artifacts are produced by **CI on `windows-latest`** (`.msi`
    installer via Tauri), not by cross-compiling from Linux: Tauri on Windows
    needs WebView2 plus WiX/NSIS, and cross-building those from Linux is a
    known tarpit. A self-hosted Windows runner may replace the hosted one
    later without changing the workflow shape.
15. CI MUST gate `cargo check -p stellarc-axis --target x86_64-pc-windows-msvc`
    on every change. Axis is Windows-clean today; nothing currently prevents a
    regression, because every existing workflow is `ubuntu-latest`.
16. `crates/orbit` is **not** expected to build for Windows. CI must not gate
    it on that target; the WSL2/Linux/macOS path is the supported one.

## 4. Migration order

1. Local-first endpoint preset for same-host/LAN peers (§1.1) — smallest change
   with the largest correctness win, and independent of the desktop work.
2. Windows CI gate for axis (§3.15) — cheap, prevents regression of a property
   already true.
3. `src-tauri` scaffold + `windows-latest` bundle workflow (§3.14).
4. First-run flow: configure and supervise bundled axis (§1.2.5).
5. Opt-in WSL distro detection and orbit install prompt (§1.2.7).
6. Desktop connection catalog for multiple axes (§1.4.12).

## 5. Rejected

- **TCP loopback transport** — a new listener and auth surface duplicating what
  iroh already provides with key auth; withdrawn from ADR 0032.
- **`presets::N0` for same-host peers** — requires n0 DNS/relay reachability to
  connect two processes on one machine.
- **Automatic WSL orbit installation** — silently modifying a user's Linux
  environment, in a product whose pitch is auditable control. Detect and offer.
- **A login screen for Lite** — one human on their own machine; there is no
  second principal for a credential to distinguish.
- **Dropping the installation token in Lite** — conflates "no human login" with
  "no authentication". The port is reachable by every local process.
- **Compiling orbit for Windows** (native `ConPTY` + job-object port) — a
  parallel process-control implementation for a platform where WSL2 already
  provides Linux. Revisit only if a Windows-native node becomes a requirement.
- **Multi-axis in the web UI** — would mean a served page holding credentials
  for other axes; the origin model exists for a reason.
