# Verification blocker R14 — routed to Chief of Staff

The owner remains on the same branch/model. No replacement delegates or live
activation. This is a real capacity blocker, not a completed integration gate.

Fresh under-lock regression refusal:
- root available: **4,187,426,816 bytes**, below required **4,294,967,296**;
- MemAvailable: **2,907,226,112 bytes**;
- CPU PSI some avg10 **11.16**, above threshold **5**;
- no regression child launched.

Later read-only probe showed pressure worsening: CPU PSI **45.83**, memory some
**13.52** / full **6.68**, I/O some **5.29**. No loads were started by this owner.
No resource guard was weakened, shared process killed, service restarted or disk
cleanup performed. Chief of Staff received and read the exact blocker message
`message:mcp:30d111e2-81ff-497f-8437-d452535d1cd9:thread-send:stellarc-builder-capacity-blocker-r13`.
Chief is coordinating compute availability; this owner retains source/integration
ownership. Do not duplicate that infrastructure work.

## Useful work completed while blocked

Traced the existing OpenAPI gate/dispatch flow end to end against the council
integration contract. Current executor still requires input before its first gate;
claim remains the sole consuming payload release. Non-consuming internal preparation,
original admitted-run binding, approval/run lifetime and late callback settlement
remain required before any authenticated dispatch wiring. No shortcut by supplying
fresh resume arguments or consuming at the first gate is acceptable.

Located the fullrepo R8 runner root cause: its sanitized `BASE_ENV` omits both
`XDG_RUNTIME_DIR` and `DBUS_SESSION_BUS_ADDRESS` while launching `systemd-run --user`.
The live user bus exists at `/run/user/1000/bus`, and `systemctl --user show-environment`
exits 0 under an explicit matching environment. This explains the observed
`Failed to connect to bus: No medium found` as a runner defect, not product RED.

Prepared a separate, NOT EXECUTED runner candidate:
`/home/rpw/.hermes/cache/scratch/stellarc-fullrepo-r14-prepared.py`.
It sets the actual child bus environment, probes that environment, preserves child
exit before post-capacity checks and requires a new snapshot path. It does not
reuse passed receipts or launch an automatic wait loop. It is not launch-ready:
before use, replace inherited cleanup with exact run-owned handles, use approved
scratch locations, audit test subprocess behavior and mint a complete current-source
manifest/PG prerequisite closure. Historical R8 inputs and receipts remain unchanged.

## Coordinated slot ordering — not clearance

IAM coordinator placed the frozen inherited-store regression ahead of IAM's next
broad batch. Existing accepted jobs yield only at their natural phase boundary;
terminal receipts and the quiet window are still pending. This ordering does not
authorize a launch, cleanup, restart, resource change or threshold waiver. No new
worker is created. After authorized execution actually finishes, send its exact
terminal receipt and slot completion to both Chief of Staff and IAM coordinator.
Until then retain the original frozen inputs and ordered-lock/capacity checks.

## Frozen harness mismatch — source review, not execution

Frozen store `026f4ecb…` / check `9920a695…` remain untouched. The check contains
12 calls to the cancelled R10 `reauthorize` interface, while R13 implements
`recheckRun`. Its R10 section also expects a caller-lock rejection contract that
R13 currently documents as a caller prerequisite. Therefore the whole frozen
check cannot honestly be described as only the inherited regression suite or
expected green. Do not silently add an alias, weaken assertions, or modify the
frozen snapshot to hide this difference. Reconcile the harness contract in a
separate proposed revision before calling it launch-ready; preserve original
checks and provenance. No new execution or green result follows from this review.

IAM's MacBook authorization is IAM-only. It neither clears fxbuilder nor proves
Linux/systemd gate portability. Quiet-window admission requires Chief's release,
the exact authorized recovery receipt, original under-lock root/RAM/all PSI floors
(including CPU **some**, not another owner's full-pressure metric), and a fresh
inventory of actual workers/cgroups including Maple image phases. Absence of jobs
in this snapshot alone does not establish host-wide quietness. No retry loop.

## Resume boundary

After Chief confirms safe approved compute, independently recheck locks, root,
RAM and PSI before any child. Run only the missing inherited store regression
against R13 bytes, then current approval/host regression and complete repo gates
on one frozen combined snapshot. No inference, live tool writes, credential
rotation, IdP/Maple changes or deployment is inferred. Approval dispatch stays off;
old candidate and 9router/Executor stay unchanged.
