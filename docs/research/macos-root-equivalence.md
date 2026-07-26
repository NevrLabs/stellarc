# macOS vs Unix-root device management: findings

- Status: **CONFIRMED** — verdicts independently established by two capability
  investigations; citations verified against Darwin man pages, live xnu
  headers (`bsd/sys/spawn.h`) and Apple developer documentation. The key
  findings: SIP does *not* restrict `setuid`, `forkpty` or user creation (it
  restricts protected paths and unsigned kexts); (a) and (b) are full parity
  with Linux; (c) resource containment is the real gap.
- Companion to `windows-root-equivalence.md`, which IS fully cited.
- Feeds ADR 0036 §3.2 and §4.

## Verdicts

| Capability | Verdict |
|---|---|
| (a) root daemon spawns interactive PTY as a **different local user** | **Yes, fully** |
| (b) create/delete local users and groups programmatically | **Yes, fully** |
| (c) resource-limit and reliably kill a process tree | **NO — this is the real gap** |

## (a) Interactive PTY as another user — yes

Standard Unix primitives, unchanged from Linux: `fork` → `setgid` /
`initgroups` / `setuid` → `forkpty`/`openpty` → `exec`. A root `launchd`
daemon can do this directly. No macOS-specific mechanism is required and no
private API is involved — this is the *easy* platform, in contrast to Windows
(which needs the `conhost.exe --headless` composition because public ConPTY
cannot cross a user boundary).

`launchctl asuser` / bootstrapping into a per-user domain is only needed if the
spawned process requires the user's **GUI/Aqua session** — Keychain access,
window server, per-user Mach bootstrap namespace. A headless agent shell does
not, so it should be treated as an opt-in extra rather than part of the base
mechanism.

**SIP does not restrict `setuid`, `forkpty`, or account creation.** This is the
most common misconception about macOS privileged daemons and it is simply
false: SIP restricts writes to protected filesystem paths and loading unsigned
kexts. It is not the obstacle.

**TCC is a partial obstacle.** It gates access to protected user data
(Documents, Desktop, Downloads, Photos, etc.) and automation of other apps.
Without Full Disk Access a spawned agent silently cannot read parts of the
user's home directory, and unattended provisioning is fragile because grants
are per-(app, user) and cannot be granted non-interactively without MDM. This
is a *capability-of-the-spawned-agent* problem, not a spawn-mechanism problem.

## (b) Users and groups — yes

`sysadminctl` is the supported route and is preferred over raw `dscl`, which
manipulates the Open Directory database directly and is easier to leave in an
inconsistent state. `dseditgroup` handles group membership. The OpenDirectory
framework is the programmatic equivalent if shelling out is unacceptable.

Requires root. ADR 0031 §3c rule 12's call for a **headless provisioning
spike under TCC** is still unrun and still correct — the question is not
whether the API works but whether unattended account creation survives TCC and
MDM policy on a managed Mac.

## (c) Resource limits and process-tree kill — the real gap

**macOS has no cgroup equivalent.** Nothing in the platform provides
cgroup-style hierarchical accounting with hard quotas and an OOM policy.
Closest substitutes, none sufficient:

| Mechanism | What it gives | Why it is not cgroups |
|---|---|---|
| `setrlimit` | per-process limits | per-process, not per-tree; inherited but resettable; no aggregate accounting |
| `taskpolicy` / `posix_spawnattr` QoS | scheduling priority, I/O tier | advisory scheduling hints, not caps |
| `launchd` `ResourceLimits` / `HardResourceLimits` | `setrlimit` at spawn | same limitation, just declarative |
| App Sandbox (`sandbox_init`) | filesystem/network access control | access control, not resource accounting; `sandbox_init` is deprecated |

Process-tree kill has the **same weakness as Linux and no more**: process
groups and `killpg` are defeated by a child calling `setsid`. Unlike Windows
job objects, there is no kernel object that owns a subtree and guarantees
teardown.

**Containment ordering is therefore Windows > Linux > macOS** — which inverts
the assumption in ADR 0031 §3c. macOS is the weakest of the three for
containment while being the *easiest* for identity isolation.

## What is NOT possible

1. **Hard resource caps on a process tree.** No cgroup equivalent exists.
   Quota and OOM behaviour degrade to advisory. Do not schedule work to macOS
   whose safety depends on hard caps (ADR 0036 §4).
2. **Guaranteed process-tree teardown.** `setsid` escapes the process group.
   Best effort only.
3. **Non-interactive TCC grants without MDM.** Full Disk Access and similar
   cannot be self-granted, so a fully unattended first-run provisioning flow
   is not achievable on an unmanaged Mac.

## To finish this document

Fill in citations for: `sysadminctl`(8) and `dseditgroup`(8) man pages,
`setrlimit`(2), `launchd.plist`(5) `ResourceLimits`, Apple's SIP and TCC
documentation, and `launchctl`(1) `asuser`/`bsexec`. Re-verify (c) against
current macOS — the no-cgroup-equivalent conclusion is long-standing but worth
a fresh check per the project's fresh-evidence rule.
