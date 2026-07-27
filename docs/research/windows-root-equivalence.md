# Windows vs Unix-root device management: authoritative findings

Verdict: **Yes, Windows can match the Unix model — including interactive PTY-as-another-user.**
It is unimplemented work, not a platform limitation. But the ConPTY-as-another-user path
requires bypassing the public `CreatePseudoConsole` API and spawning `conhost.exe --headless`
yourself. That is the single real sharp edge.

Reference model on Unix: root daemon → `fork` + `initgroups`/`setgid`/`setuid` + `forkpty`.
Windows equivalent: SYSTEM service → `LogonUser`/`LsaLogonUser` → token → `CreateProcessAsUserW`
with `PROC_THREAD_ATTRIBUTE_HANDLE_LIST` + ConDrv server handle → job object.

---

## (a) Interactive PTY/console as a DIFFERENT local user — THE CRUX

### The blunt answer

`CreatePseudoConsole()` **cannot** be combined with `CreateProcessAsUser`/`CreateProcessWithTokenW`
to run the shell as another user. Not because of handle inheritance — because of *where the
ConPTY's `conhost.exe` gets created*.

`CreatePseudoConsole()` internally spawns `conhost.exe --headless` **as the calling user**. The
returned `HPCON` is then attached to your child via `PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE`. So:

- Call `CreatePseudoConsole()` from a SYSTEM service → the conhost runs as **SYSTEM**.
- Then `CreateProcessAsUserW(userToken, ...)` with that HPCON → your `cmd.exe` runs as the user,
  but its console host is a SYSTEM-owned conhost. You get a **split trust boundary**: the user's
  shell is driving a SYSTEM-privileged console host. That is a privilege-boundary smell at best
  and a broken/unsupported configuration at worst.

Microsoft confirmed this is not supported, in the exact issue asking this exact question:

> "Right now, yea, it's not technically supported. All the code is there and ready to be used,
> we just never exposed the public function signature for it (mostly because we just forgot to)."
> — zadjii-msft (Windows Terminal team), 2021-12-02

https://github.com/microsoft/terminal/issues/11865 — **still open** as of now, labels
`Issue-Feature`, `Product-Conpty`, `Area-Server`.

### The private API that does exactly what we want

`ConptyCreatePseudoConsoleAsUser(HANDLE hToken, COORD size, HANDLE hInput, HANDLE hOutput, DWORD dwFlags, HPCON* phPC)`

Source: https://github.com/microsoft/terminal/blob/main/src/winconpty/winconpty.cpp
(`_CreatePseudoConsole` at line ~119, `ConptyCreatePseudoConsoleAsUser` at line ~471)

Status:
- **Exists and is implemented** in the OS (`kernelbase.dll` carries this code path — the public
  `ConptyCreatePseudoConsole` is literally `return ConptyCreatePseudoConsoleAsUser(INVALID_HANDLE_VALUE, ...)`).
- **NOT exported from the public SDK.** Verified: `consoleapi.h` in win32metadata's recompiled
  SDK headers declares only `CreatePseudoConsole`, `ResizePseudoConsole`, `ClosePseudoConsole`,
  `ReleasePseudoConsole` — no `AsUser` variant.
  https://github.com/microsoft/win32metadata/blob/main/generation/WinSDK/RecompiledIdlHeaders/um/consoleapi.h
- Consequently **not in `windows`/`windows-sys` crates** (they're generated from win32metadata).
  No windows-rs issue tracking it (searched: 0 results).

Using it would mean `GetProcAddress` on an undocumented, unexported symbol → **undocumented hack, do not ship**.

### What actually works, and is what OpenSSH ships

Skip `CreatePseudoConsole` entirely. Reimplement its ~120 lines and pass your own token to
`CreateProcessAsUserW`. This is a *documented-primitives* implementation of an
*undocumented-composition* — every individual call is public.

Two field-proven variants:

**Variant 1 — Win32-OpenSSH (simplest, fully documented surface).** Spawn
`%SystemRoot%\system32\conhost.exe --headless --width N --height M --signal 0x<handle> -- <shell>`
with `CreateProcessAsUserW`, stdio wired to your pipes. conhost creates the ConDrv session itself
and becomes the child's console host — and because *conhost itself* is created under the user
token, the entire tree (conhost + shell) runs as the target user. No split trust boundary.

Verified in source:
- https://github.com/PowerShell/openssh-portable/blob/latestw_all/contrib/win32/win32compat/win32_pty.c
  (`exec_command_with_pty`, lines ~88–130) — builds exactly that conhost command line.
  Note it feature-detects ConPTY via `GetProcAddress(kernel32, "CreatePseudoConsole")` merely as a
  *version probe*, then never calls it.
- https://github.com/PowerShell/openssh-portable/blob/latestw_all/contrib/win32/win32compat/w32fd.c
  (`spawn_child_internal`, lines ~1104–1190) — the `CreateProcessAsUserW(as_user, ...)` call, with
  `CreateEnvironmentBlock(&lpEnvironment, as_user, TRUE)` + `CREATE_UNICODE_ENVIRONMENT`.

Caveat: `conhost.exe --headless --signal --server` flags are **not documented on Microsoft Learn**.
They are stable in practice (ConPTY itself depends on them; OpenSSH ships on them in-box since
Windows 10 1809) but they are an implementation detail, not a contract.

**Variant 2 — replicate `_CreatePseudoConsole` exactly.** Needs `CreateServerHandle`/`CreateClientHandle`
against `\Device\ConDrv` (NT-level `NtCreateFile` on `\Device\ConDrv\Server`) — genuinely
undocumented. **Not recommended**; Variant 1 gets the same result with public APIs plus undocumented
*command-line flags*, which is a much smaller bet than undocumented *NT device semantics*.

### Handle inheritance — the pitfalls, concretely

From `_CreatePseudoConsole` (the reference implementation, lines 213–241):

1. **Use `PROC_THREAD_ATTRIBUTE_HANDLE_LIST`, not `bInheritHandles=TRUE` alone.** ConPTY passes
   exactly 4 handles: ConDrv server handle, hInput, hOutput, signal-pipe-conhost-side. Blanket
   inheritance from a service that holds user tokens, LSA handles, and other sessions' pipes is a
   privilege-escalation hazard — a leaked inheritable handle crosses into the unprivileged user's
   process. This is called out in the `CreateProcessAsUser` docs too:
   https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessasusera
   ("This can be problematic for applications which create processes from multiple threads
   simultaneously yet desire each process to inherit different handles.")
2. `bInheritHandles` must **still** be `TRUE` — the handle list filters inheritance, it doesn't enable it.
3. Signal pipe: create with `sa.bInheritHandle = FALSE`, then explicitly
   `SetHandleInformation(h, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT)` on *only* the conhost-side end.
   Getting this backwards leaks the master end into the child.
4. **Close the child-side pipe ends in the parent immediately after `CreateProcess`**, or
   `ReadFile` on the output pipe never returns `ERROR_BROKEN_PIPE` on shell exit → hung session.
   https://learn.microsoft.com/en-us/windows/console/creating-a-pseudoconsole-session
5. **Service the input and output pipes on separate threads.** MS explicitly warns single-threaded
   synchronous servicing deadlocks (a full buffer on one channel while you block on the other).
6. Pipes must be **synchronous** — `CreatePseudoConsole` docs: "This is currently restricted to
   synchronous I/O", no `OVERLAPPED`. Plan on blocking reader threads, not IOCP, for the PTY itself.
7. `0xC0000142` (`STATUS_DLL_INIT_FAILED`) at child startup is the canonical symptom of a bad
   HPCON handle **or** of the window-station/desktop problem below. Two very different root causes,
   one error code.

### The other blocker nobody expects: window station + desktop

Even with a valid token, the spawned process fails `0xC0000142` when `user32.dll` loads if the
token's logon session lacks access to a window station/desktop. Authoritative explanation from
eryksun on the same issue thread:

> "the Secondary Logon service enables access to the client's interactive window station and desktop
> by adding the client's logon-session group to the new token... Without this access, the spawned
> process (e.g. conhost.exe) will fail with `STATUS_DLL_INIT_FAILED` (0xC0000142) when user32.dll
> loads, since it tries and fails to open the window station and desktop. Creating a token with the
> client's logon-session group requires calling `LsaLogonUser()` or `LogonUserExExW()` with
> SeTcbPrivilege... The alternative is to open the client's window station and desktop objects to
> add a DACL entry that grants all access to the new logon-session group."

Two fixes:
- **`LsaLogonUser` / `LogonUserExExW` with `SE_TCB_NAME`** to mint a token carrying the right
  logon-session group (`SE_GROUP_LOGON_ID`). This is what OpenSSH does —
  https://github.com/PowerShell/openssh-portable/blob/latestw_all/contrib/win32/win32compat/win32_usertoken_utils.c
  (`LsaLogonUser` at lines ~206, ~287; `pLogonUserExExW` at ~378, ~648, ~818).
- Or ACL the window station/desktop for the new logon SID (`windows-acl` crate, but see maintenance below).

Also `si.lpDesktop`: `CreateProcessWithTokenW` docs state that if `lpDesktop` is NULL/empty the
child inherits the parent's window station and desktop *and the function adds permission for the
specified user account*. `CreateProcessAsUser` gives you no such favour — you handle it.
OpenSSH sets `si.lpDesktop = NULL`.

### Why not `CreateProcessWithTokenW` / `CreateProcessWithLogonW`

Both are **wrong for a service**, and this is documented + explained:

- They are **delegated to the Secondary Logon service (seclogon)**, not executed in-process. That
  delegation is why `CreateProcessWithLogonW` returns `ERROR_INVALID_PARAMETER` (87) when handed a
  `STARTUPINFOEX` with a pseudoconsole attribute — seclogon doesn't marshal proc-thread attributes.
  This is the original bug report in issue 11865, and eryksun's diagnosis of it.
- `CreateProcessWithTokenW` explicitly cannot cross sessions: "**Terminal Services: The caller's
  process always runs in the caller's session**, not in the session specified in the token. To run
  a process in the session specified in the token, use the `CreateProcessAsUser` function."
  https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createprocesswithtokenw
- `CreateProcessWithLogonW` requires the target account have interactive logon rights and takes a
  **cleartext password** — unacceptable for a daemon managing accounts it provisioned.

**Use `CreateProcessAsUserW`.** It honours the token's session (`SetTokenInformation` +
`TokenSessionId` to retarget), accepts `STARTUPINFOEX`, and runs in-process.

### Privileges required (a)

| Need | Privilege / right | Notes |
|---|---|---|
| `CreateProcessAsUserW` with unrelated token | **`SE_ASSIGNPRIMARYTOKEN_NAME`** (`SeAssignPrimaryTokenPrivilege`) | Not required if token is a *restricted version of caller's own* token. Docs: "if the necessary privileges are not already enabled, CreateProcessAsUser enables them for the duration of the call." |
| same | **`SE_INCREASE_QUOTA_NAME`** (`SeIncreaseQuotaPrivilege`) | typically also needed |
| `LogonUser` / `LsaLogonUser` minting session-group-correct token | **`SE_TCB_NAME`** (`SeTcbPrivilege`) | required for `LogonUserExExW` w/ logon-session group |
| `LoadUserProfileW` | `SE_BACKUP_NAME` + `SE_RESTORE_NAME` | OpenSSH enables around the call then disables again (`win32_usertoken_utils.c` ~432-438) |
| `CreateProcessWithTokenW` (if used at all) | `SE_IMPERSONATE_NAME` | |

Token handle needs `TOKEN_QUERY | TOKEN_DUPLICATE | TOKEN_ASSIGN_PRIMARY`.

**Running as LocalSystem gives you all of these.** Verified against
https://learn.microsoft.com/en-us/windows/win32/services/localsystem-account :
`SE_ASSIGNPRIMARYTOKEN_NAME` (disabled), `SE_INCREASE_QUOTA_NAME` (disabled),
`SE_TCB_NAME` (**enabled**), `SE_IMPERSONATE_NAME` (enabled), `SE_BACKUP_NAME`/`SE_RESTORE_NAME` (disabled).
"Disabled" ≠ absent — present-but-disabled privileges are enabled on demand via
`AdjustTokenPrivileges`. OpenSSH's `EnablePrivilege()` helper is the pattern
(`win32_usertoken_utils.c` line ~72).

Important: **`SeAssignPrimaryTokenPrivilege` is NOT held by Administrators by default** — default
assignment is Network Service + Local Service only.
https://learn.microsoft.com/en-us/windows/security/threat-protection/security-policy-settings/replace-a-process-level-token
Implication: the control plane **must run as a SYSTEM service**. An elevated-admin user-mode process
is not sufficient. Same conclusion as "must be root", so the architecture maps cleanly.

Don't forget the environment: `CreateProcessAsUser` does **not** build the user's environment for
you — "USERNAME and USERDOMAIN variables are inherited from the calling process if lpEnvironment is
NULL. It is your responsibility to prepare the environment block." Use
`CreateEnvironmentBlock`/`DestroyEnvironmentBlock` + `LoadUserProfileW`/`UnloadUserProfile`.

### Minimum version (a)

- `CreateProcessAsUserW`: Windows XP / Server 2003.
- ConPTY / `conhost --headless`: **Windows 10 1809 / Server 2019**.
  https://learn.microsoft.com/en-us/windows/console/createpseudoconsole
- → **1809 is the floor. Matches the stated acceptable minimum.**

### Rust crates (a)

| Crate | Version / updated | Verdict |
|---|---|---|
| `windows` / `windows-sys` | 0.62.2 / 0.61.2, 2025-10-06, Microsoft-maintained | **Use.** Has `CreateProcessAsUserW`, `LogonUserW`, `LsaLogonUser`, `CreateEnvironmentBlock`, `InitializeProcThreadAttributeList`, `UpdateProcThreadAttribute`, `CreatePseudoConsole`. Lacks `CreatePseudoConsoleAsUser` (not in metadata). |
| `portable-pty` | 0.9.0, 2025-02-11, wezterm, 3.8M recent dl | Actively maintained, **but no as-user support**: `pty/src/win/psuedocon.rs::spawn_command` calls plain `CreateProcessW` (line ~139). Would need a fork/patch to accept an `hToken`. |
| `conpty` (zhiburt) | 0.7.0, 2024-09-23, 143k recent dl | Plain `CreateProcessW` only (`src/lib.rs` ~164). Same gap. Lightly maintained. |
| `winpty-sys` | 0.5.0, **2020-02-17**, 1.4k recent dl | **Dead. Ignore** — winpty is the pre-1809 hack anyway. |
| `windows-acl` | 0.3.0, **2021-01-11** | Unmaintained (trailofbits). If you need window-station ACLs, do it via `windows-sys` directly. |

**Conclusion: no crate wraps PTY-as-another-user. This is net-new code (~300–400 lines unsafe Rust),
or a patch to `portable-pty` adding an optional token to `spawn_command`.** The latter is the lazy path
and plausibly upstreamable.

---

## (b) Create/delete local users and groups

Fully supported, fully documented, no drama.

| Operation | API | Header / lib |
|---|---|---|
| Create user | `NetUserAdd` (level 1 → `USER_INFO_1`) | `lmaccess.h` / `Netapi32.dll` |
| Delete user | `NetUserDel` | same |
| Modify user | `NetUserSetInfo` | same |
| Create group | `NetLocalGroupAdd` | same |
| Delete group | `NetLocalGroupDel` | same |
| Add member | `NetLocalGroupAddMembers` (the `initgroups` analogue) | same |
| Free buffers | `NetApiBufferFree` | mandatory |

https://learn.microsoft.com/en-us/windows/win32/api/lmaccess/nf-lmaccess-netuseradd
https://learn.microsoft.com/en-us/windows/win32/api/lmaccess/nf-lmaccess-netlocalgroupadd

**Privilege:** no named `SE_*` privilege. It's **ACL-based**: "On a member server or workstation,
only Administrators and Power Users can call this function." SYSTEM's token includes
`BUILTIN\Administrators` → satisfied.

**Minimum version:** `NetUserAdd` — Windows 2000 Professional. `NetLocalGroupAdd` — Windows 2000.
Non-issue.

**Rust crates:** none worth using. `windows-sys` has the raw bindings (`Win32::NetworkManagement::NetManagement`).
Write a thin safe wrapper — `USER_INFO_1` marshalling is UTF-16 string juggling, maybe 100 lines
including delete/group paths. `NERR_*` return codes are plain `NET_API_STATUS` u32s, easy to map.

Gotcha: `NetUserAdd` returns `NERR_PasswordTooShort` for *any* password-policy violation — too
short, too long, insufficient unique chars, reuse. Don't surface it literally.

Design note: consider `LogonUserExExW` with a **virtual account** (`LOGON32_LOGON_SERVICE` +
`SE_SERVICE_LOGON_NAME`) instead of real accounts — OpenSSH does this for its
`VIRTUALUSER_DOMAIN` accounts (`win32_usertoken_utils.c` ~642-666). Avoids password management
entirely. Worth evaluating before committing to `NetUserAdd`.

---

## (c) Resource limits + reliable process-tree kill

**Job objects. Strictly better than Unix process groups for this.** No `setrlimit` gaps, no
double-fork escape, no PID reuse race.

| Operation | API |
|---|---|
| Create | `CreateJobObjectW` |
| Attach | `AssignProcessToJobObject` — "After a process is associated with a job, the association cannot be broken." |
| Limits | `SetInformationJobObject` |
| Kill entire tree | `TerminateJobObject` |
| Accounting | `QueryInformationJobObject` |
| Membership check | `IsProcessInJob` |
| Limit events | `JobObjectAssociateCompletionPortInformation` + `GetQueuedCompletionStatus` |

https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-setinformationjobobject

Limits available:
- `JOBOBJECT_EXTENDED_LIMIT_INFORMATION` — `JobMemoryLimit`, `ProcessMemoryLimit`,
  `ActiveProcessLimit`, `PerProcessUserTimeLimit`, `PerJobUserTimeLimit`, working-set bounds.
- `JOBOBJECT_CPU_RATE_CONTROL_INFORMATION` — `JOB_OBJECT_CPU_RATE_CONTROL_HARD_CAP` (hard %),
  `WEIGHT_BASED`, `MIN_MAX_RATE`. **Windows 8 / Server 2012 minimum.**
  https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_cpu_rate_control_information
- `JOBOBJECT_NET_RATE_CONTROL_INFORMATION` — network bandwidth.
- `JOBOBJECT_BASIC_UI_RESTRICTIONS` — clipboard/desktop/exit-windows lockdown.

### The two flags that make this airtight

`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` — every process in the job dies when the last job handle
closes. **This is the crash-safety property Unix has no clean equivalent for**: if the control plane
crashes, the OS reaps every orphaned user shell. OpenSSH relies on exactly this:

```c
job_info.BasicLimitInformation.LimitFlags =
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_BREAKAWAY_OK;
```
https://github.com/PowerShell/openssh-portable/blob/latestw_all/contrib/win32/win32compat/w32-doexec.c (line ~440)

And note the trick right after (lines ~454–457): after `AssignProcessToJobObject`, it
`DuplicateHandle`s the job handle **into the child** so the child is the last holder — the job
outlives the parent's handle but still dies with the tree.

### Pitfalls (c)

1. **Assign the job BEFORE the process runs code**, else children spawned in the gap escape.
   Correct approach: `CREATE_SUSPENDED` → `AssignProcessToJobObject` → `ResumeThread`. Or better,
   `PROC_THREAD_ATTRIBUTE_JOB_LIST` in `STARTUPINFOEX` (Windows 10+) — atomic, no race.
   OpenSSH uses the racy `OpenProcess`-after-spawn form; don't copy that part.
2. `JOB_OBJECT_LIMIT_BREAKAWAY_OK` / `SILENT_BREAKAWAY_OK` are **escape hatches** — a child with
   `CREATE_BREAKAWAY_FROM_JOB` leaves the job. OpenSSH sets `BREAKAWAY_OK` deliberately (shells need
   it). If containment matters more than compatibility, **omit both flags**.
3. `Win32_Process.Create` (WMI) children are **not** job-associated. Documented escape.
4. Nested jobs need Windows 8+. Fine at 1809.
5. Job object is a securable object — set a DACL so the unprivileged user can't
   `OpenJobObject` + `TerminateJobObject` their way sideways. Prefer **unnamed** jobs
   (`CreateJobObjectW(NULL, NULL)`) — "Only named job objects can be opened."

### Minimum version (c)

`CreateJobObject`/`SetInformationJobObject` — XP/Server 2003. CPU rate control — Windows 8.
Nested jobs — Windows 8. **All well under 1809.**

### Rust crates (c)

| Crate | Version / updated | Verdict |
|---|---|---|
| **`win32job`** | **2.0.3, 2025-05-15, 406k recent dl** | **Actively maintained. Use it.** Safe wrapper over `CreateJobObject` / `SetInformationJobObject` / `AssignProcessToJobObject` / limits. https://github.com/ohadravid/win32job-rs |
| `windows-sys` | current | fallback for anything `win32job` doesn't expose (net rate control, completion-port notifications, `PROC_THREAD_ATTRIBUTE_JOB_LIST`) |

Verify `win32job` exposes `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` and CPU rate control before
committing; if not, it's a small PR or a direct `windows-sys` call.

---

## Summary table

| Capability | Unix | Windows mechanism | Privilege | Min ver | Rust crate | Verdict |
|---|---|---|---|---|---|---|
| Spawn as another user | `setuid`+`exec` | `CreateProcessAsUserW` + `LogonUserExExW` | `SE_ASSIGNPRIMARYTOKEN_NAME`, `SE_INCREASE_QUOTA_NAME`, `SE_TCB_NAME` | XP (ConPTY: 1809) | `windows-sys` (raw) | ✅ documented |
| Interactive PTY as that user | `forkpty` | `conhost.exe --headless` via `CreateProcessAsUserW` | same | **1809** | **none — net-new** | ⚠️ works; undocumented conhost flags |
| …via public `CreatePseudoConsole` | — | — | — | — | — | ❌ **not supported** (MS confirmed, terminal#11865) |
| …via `CreateProcessWithTokenW` | — | — | — | — | — | ❌ seclogon-delegated; can't cross session; rejects HPCON attr |
| Create/delete users | `useradd`/`userdel` | `NetUserAdd`/`NetUserDel` | Administrators (ACL) | Win2000 | `windows-sys` (raw) | ✅ documented |
| Groups + membership | `groupadd`/`initgroups` | `NetLocalGroupAdd`/`NetLocalGroupAddMembers` | Administrators (ACL) | Win2000 | `windows-sys` (raw) | ✅ documented |
| Resource limits | `setrlimit`/cgroups | `SetInformationJobObject` | none | XP (CPU cap: Win8) | **`win32job` 2.0.3** | ✅ documented, **better than Unix** |
| Kill process tree | `killpg` | `TerminateJobObject` + `KILL_ON_JOB_CLOSE` | none | XP | **`win32job` 2.0.3** | ✅ documented, **better than Unix** |

## What is genuinely NOT possible / needs hacks

1. **Public-API ConPTY as another user — impossible.** `CreatePseudoConsoleAsUser` exists in
   `kernelbase` but is unexported and absent from the SDK/win32metadata. terminal#11865 open since
   Dec 2021, no ship date. Reaching it via `GetProcAddress` = undocumented hack, don't.
2. **`conhost.exe --headless --signal --server` flags are undocumented.** The recommended path
   depends on them. Mitigation: they're in-box-stable since 1809 (ConPTY itself uses them) and
   Win32-OpenSSH — a Microsoft-shipped, in-box component — depends on them. Low but nonzero risk.
   Wrap in one function and feature-probe at startup.
3. **Replicating ConDrv server-handle creation directly** (`\Device\ConDrv\Server` via `NtCreateFile`)
   is fully undocumented. Avoid — Variant 1 makes it unnecessary.
4. **No async PTY I/O.** ConPTY pipes are synchronous-only, no `OVERLAPPED`. Blocking reader/writer
   threads per session, not IOCP. Real design constraint for a many-session control plane.
5. **Elevated-admin is not enough — must be a SYSTEM service.** `SeAssignPrimaryTokenPrivilege` is
   not granted to Administrators by default.
6. **Window station / desktop access must be handled explicitly** or every spawn dies `0xC0000142`.
   Either `LogonUserExExW`+`SE_TCB_NAME` for the logon-session group, or hand-ACL the winsta/desktop.
   This is the least-obvious failure mode and the one most likely to burn a week.

## Bottom line for the architecture decision

Windows console support is **unimplemented work, not a platform limitation**. Effort estimate:

- (b) users/groups — trivial, ~150 lines over `windows-sys`.
- (c) limits/kill — near-free, `win32job` + a few direct calls. Better semantics than Linux.
- (a) PTY-as-user — the real work. ~300–400 lines of unsafe Rust, no crate to lean on, plus the
  winsta/desktop and token-minting minefield. Budget a week+ and a real Windows test box.
  Cheapest path: patch `portable-pty`'s `spawn_command` to take an optional `HANDLE` token and use
  the conhost-direct spawn — plausibly upstreamable, and keeps the cross-platform PTY abstraction
  the rest of the control plane already wants.

Reference implementation to read before writing a line: Win32-OpenSSH `win32_pty.c` + `w32fd.c` +
`win32_usertoken_utils.c` + `w32-doexec.c`. It is a working, in-box, Microsoft-shipped answer to
precisely this problem.
