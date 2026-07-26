# ADR 0036 — Cross-Platform Root-Level Device Management: Console Identity on Windows and macOS

- Status: Accepted
- Date: 2026-07-26
- Amends: ADR 0031 §3c rules 12–13 (macOS and Windows are no longer capped at
  user tier by assumption; the cap becomes conditional on an implemented
  isolation mechanism), ADR 0021 (console target eligibility)
- Relates to: ADR 0005 (org = hard boundary), 0011 §5 (where root lives),
  0022 (human RBAC), 0032 (lite/full editions), 0033 (authority + desktop
  modes), 0035 (desktop bundle)
- Evidence: `docs/research/windows-root-equivalence.md`,
  `docs/research/macos-root-equivalence.md`
- Postmortem that motivated it: `docs/postmortems/console-authz-any-user.md`

## 1. Decision

**Root-level device management is achievable on all three platforms.** ADR 0031
§3c capped macOS and Windows at user tier pending proof; the capability
research now supplies it. Windows and macOS are removed from that cap and
become **system-tier-capable**, gated on implementation, not on platform.

The tier cap is restated as a **mechanism test**, replacing the
platform-name test:

> A node runs at system tier if and only if it can place a process under an
> OS identity **other than orbit's own**, enforced by the kernel. No such
> mechanism compiled and proven on that platform → user tier → the ADR 0031
> scope cap of exactly one user and one org applies.

This is the same structural argument ADR 0031 §1 already makes ("a user
install has one uid and no way to isolate a second user — so it doesn't offer
them"), lifted from install shape to platform capability. It needs no
per-platform branch and nothing to repeal when a platform gains the mechanism.

**Console eligibility follows the same test.** `NodeRole::TerminalHost` is
advertised only by a node that can place the console under the requesting
principal's identity. Today every orbit advertises it unconditionally
(`crates/orbit/src/entry.rs:1181`), which is the defect this ADR closes.

### Consequences per platform

| Platform | Mechanism | Tier today | Tier after implementation |
|---|---|---|---|
| Linux | `fork` + `initgroups`/`setgid`/`setuid` + `forkpty`; cgroup slices | user (privilege drop **not implemented**) | system |
| macOS | `launchd` root daemon + `sysadminctl` accounts + `setuid`/`forkpty` | user | system, with degraded resource containment (§4) |
| Windows | `LogonUserExExW` → `CreateProcessAsUserW` + `conhost.exe --headless` + job objects | user (orbit does not run on Windows) | system |

**Windows console support is unimplemented work, not a platform limitation.**
This retires the ADR 0031 §3c rule 13 position and the
`crates/orbit/src/entry.rs:63` "out of scope" comment as the *reason* — the
scope decision may stand on cost grounds, but not on capability grounds.

## 2. Why (compressed)

The question "can Windows nodes have controlled consoles?" was posed as a
platform-capability question. It is not one. Three alternative designs were
considered and rejected:

1. **Declare Windows console permissions uncontrollable; expose Windows nodes
   only via workflow or to trusted users.** Rejected: encodes a temporary TODO
   as a permanent platform inferiority, and would have to be repealed. Windows
   has the full primitive set (§3).
2. **Require a sandbox on Windows unless the caller has stellarc root.**
   Rejected: no sandbox primitive exists anywhere in the tree (grep for
   `sandbox` across `crates/` returns nothing), so the rule would be
   unenforceable prose. It also invents a second authorization axis when tier
   already answers the question.
3. **A "trusted user" concept for console access.** Rejected: ADR 0022 RBAC
   plus the tier cap already express this. A third overlapping mechanism is
   the kind of app-level policy this project deliberately pushes into the
   kernel.

The mechanism test is preferred because it is falsifiable in code (does the
node have a working privilege-drop path?) rather than a per-platform opinion
maintained by hand.

## 3. Normative rules

1. **Console eligibility is a node fact, not a client choice.** A node
   advertises `NodeRole::TerminalHost` only when it can place the PTY under an
   identity other than orbit's own. Orbit MUST NOT advertise it
   unconditionally.
2. **`Hello` MUST carry the platform and tier facts** Axis needs to schedule
   fail-closed: OS family and whether a proven privilege-drop mechanism is
   available. `Hello` carries no such field today
   (`crates/proto/src/frames.rs:309`), so Axis cannot distinguish a
   system-tier node from a user-tier one at all — it must be added before any
   tier-dependent decision is trustworthy.
3. **`TerminalOpen` MUST carry the authorized principal.** It currently
   carries only `terminal_id`, `cols`, `rows`, `cwd`
   (`crates/proto/src/frames.rs:217`), so orbit cannot place the shell under
   the right identity even if it had the mechanism, and cannot refuse when it
   does not.
4. **Fail closed on absent mechanism.** A node without a proven privilege-drop
   path MUST refuse a console for any principal other than its own installing
   user, rather than falling back to orbit's identity. A silently-permissive
   fallback for an identity boundary is the same fail-open class of defect
   ADR 0031 §3c rule 14 already flags for non-Unix secret permissions.
5. **Privilege drop is a precondition for system tier on every platform,
   including Linux.** It is currently implemented on none: grep for
   `setuid`/`initgroups`/`pre_exec`/`CreateProcessAsUser` across `crates/`
   finds only `kill_group` in `crates/orbit/src/job_table.rs`. Linux is not
   ahead of Windows here; it is equally unimplemented and merely closer to the
   documented path.
6. **Elevated is not sufficient on Windows — orbit must run as a SYSTEM
   service.** `SeAssignPrimaryTokenPrivilege` is not granted to
   Administrators by default.
7. **No undocumented API surface.** `ConptyCreatePseudoConsoleAsUser` exists in
   `kernelbase.dll` but is unexported and absent from the SDK and
   win32metadata. Reaching it via `GetProcAddress` is forbidden. The supported
   composition is §3.1 below.

### 3.1 Windows console mechanism (normative)

The public `CreatePseudoConsole` **cannot** be combined with
`CreateProcessAsUserW`: it spawns its `conhost.exe` as the *calling* user, so a
SYSTEM-hosted console driving a user shell creates a split trust boundary.
Microsoft confirms this is unsupported in microsoft/terminal#11865 (open since
2021-12-02, no ship date).

The mechanism is therefore the Win32-OpenSSH approach — spawn the console host
itself under the user token:

```
LogonUserExExW(user, ..., LOGON32_LOGON_INTERACTIVE)   -> token (needs SE_TCB_NAME)
CreateProcessAsUserW(token,
    "conhost.exe --headless --width N --height M --signal 0x<h> -- <shell>",
    STARTUPINFOEX with PROC_THREAD_ATTRIBUTE_HANDLE_LIST + PROC_THREAD_ATTRIBUTE_JOB_LIST)
```

Every individual call is public and documented; the composition is what is
novel. Required privileges: `SE_ASSIGNPRIMARYTOKEN_NAME`,
`SE_INCREASE_QUOTA_NAME`, `SE_TCB_NAME`. Minimum Windows 10 1809.

Accepted risk: the `conhost.exe --headless --signal --server` flags are not
documented on Microsoft Learn. They are in-box stable since 1809 (ConPTY
itself depends on them) and Win32-OpenSSH — a Microsoft-shipped in-box
component — ships on them. Mitigation: confine them to one function and
feature-probe at startup.

Mandatory implementation details, each a known failure mode:

- Use `PROC_THREAD_ATTRIBUTE_HANDLE_LIST`; never rely on blanket
  `bInheritHandles=TRUE` alone from a process holding user tokens and other
  sessions' pipes. `bInheritHandles` must still be `TRUE` — the list filters
  inheritance, it does not enable it.
- Window station / desktop access MUST be handled explicitly
  (`LogonUserExExW` with `SE_TCB_NAME`, or hand-ACL the winsta/desktop) or
  every spawn dies `0xC0000142` when `user32.dll` loads. Same error code as a
  bad HPCON handle; two unrelated root causes.
- Assign the job **atomically** via `PROC_THREAD_ATTRIBUTE_JOB_LIST`, not
  `OpenProcess` after spawn (OpenSSH's racy form).
- Prefer **unnamed** job objects; only named ones can be opened, so an
  unprivileged user cannot `OpenJobObject` + `TerminateJobObject` sideways.
- Omit `JOB_OBJECT_LIMIT_BREAKAWAY_OK` / `SILENT_BREAKAWAY_OK` where
  containment outranks shell compatibility.
- ConPTY pipes are **synchronous only** — no `OVERLAPPED`, no IOCP. Budget
  blocking reader/writer threads per session. This is a real scaling
  constraint on a many-session control plane, not a detail.

Windows job objects give **stronger** containment than Unix here:
`TerminateJobObject` + `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` is a genuine
process-tree kill, where `killpg` is defeated by `setsid`.

### 3.2 macOS console mechanism (normative)

`setuid`/`setgid`/`initgroups` + `forkpty` from a root `launchd` daemon; local
accounts via `sysadminctl` (preferred over raw `dscl`). SIP does **not**
restrict `setuid`, `forkpty`, or account creation — it restricts protected
filesystem paths and unsigned kexts, so it is not the obstacle it is commonly
assumed to be. TCC is a partial obstacle: unattended provisioning and any
access to protected user data require explicit grants, and Full Disk Access
changes what a spawned agent can read.

macOS has **no cgroup equivalent** (§4).

## 4. Resource containment is not portable — and that is the real gap

Identity isolation ports cleanly to all three platforms. Resource containment
does not, and it fails on the platform the tier model was written for.

| | Linux | Windows | macOS |
|---|---|---|---|
| Resource limits | cgroup slices (quota, OOM) | job objects (CPU rate, memory, process count) | `setrlimit`/`taskpolicy` only — **advisory** |
| Process-tree kill | `killpg` (defeated by `setsid`) | `TerminateJobObject` — **reliable** | process groups — same weakness as Linux |

So the honest ordering for containment is **Windows > Linux > macOS**, which
inverts the assumption embedded in ADR 0031 §3c. macOS system tier is
therefore accepted with a **documented containment ceiling**: uid isolation
and file ACLs are real and kernel-enforced; quota and OOM behaviour are
advisory. macOS MUST NOT be scheduled work whose safety depends on hard
resource caps.

## 5. Migration order

Ordered so that each step is independently verifiable and none of them ships a
fail-open intermediate state.

1. **Fix console authorization** (`docs/postmortems/console-authz-any-user.md`).
   `authorize_operator` (`crates/axis/src/server/ws.rs:257`) resolves any
   valid session and returns `true` — it does not check for
   `Principal::Operator`, despite the name. Grep every caller before changing
   it in place; `/ws` and other WS routes share it. **Blocks everything else:
   identity plumbing on top of an open door is wasted work.**
2. **Add platform/tier facts to `Hello`** (rule 2) and make
   `NodeRole::TerminalHost` conditional (rule 1). Axis filters
   `/api/terminal/targets` by caller entitlement, not just node liveness.
3. **Add the principal to `TerminalOpen`** (rule 3) and make orbit fail closed
   when it cannot honour it (rule 4).
4. **Implement privilege drop on Linux** — the documented path, and it makes
   the existing platform correct before adding a new one.
5. **Implement privilege drop on macOS** — same Unix primitives, plus
   `sysadminctl` provisioning; ship with the §4 containment ceiling stated in
   the docs.
6. **Implement the Windows console** (§3.1). Requires a real Windows test box.
   Cheapest path: extend `portable-pty`'s `spawn_command` to accept an
   optional token `HANDLE` rather than writing a PTY layer from scratch.
   Budget a week-plus; the winsta/desktop and token-minting failure modes are
   where the time goes.

Steps 1–3 are protocol and authorization work that pay off on every platform
including Linux, and are worth doing whether or not step 6 is ever funded.

## 6. Spike flags

- **`conhost.exe --headless` flag stability** — undocumented. Feature-probe at
  startup; one function owns the dependency.
- **`win32job` coverage** — confirm it exposes
  `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` and CPU rate control before committing;
  otherwise a small PR or direct `windows-sys` calls.
- **Synchronous-only ConPTY I/O at session scale** — thread-per-session is the
  only option; measure before promising node counts.
- **macOS headless account provisioning under TCC** — ADR 0031 §3c rule 12
  called for this spike and it has still not been run. It gates step 5, not
  this ADR's decision.
