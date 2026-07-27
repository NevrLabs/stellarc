# Console authorization: any authenticated user gets a root shell on any node

**Status:** open. Found while scoping Windows console parity (ADR 0031 §3c).
**Severity:** high — full lateral movement across a fleet from any account.

## What I found

`GET /ws/operator/terminals/{terminal_id}?node=<any>` grants an interactive
shell on **any connected node** to **any authenticated session**, with no
per-node, per-org, or per-role check.

Three independent gaps line up to produce this:

1. **`route_class` classifies the path as `RouteClass::User`**
   (`crates/axis/src/server/principal.rs`) — the permissive class, not
   `Operator`. The path literally contains `/operator/`.

2. **`authorize_operator` does not check for an operator.**
   (`crates/axis/src/server/ws.rs:257`) It resolves any valid session token and
   returns `true` if one exists:

   ```rust
   super::identity::session_token(headers)
       .and_then(|token| state.auth_store.resolve_session(token, now).ok().flatten())
       .is_some()
   ```

   The name asserts a privilege check the body never performs. This is the
   core defect — the misleading name is why the `RouteClass::User` entry in the
   route table looks deliberate rather than wrong.

3. **No per-node authorization anywhere in the open path.**
   `terminal_ws.rs` never references `principal`, `user_id`, or
   `organization_id`. The `?node=` parameter is taken from the client and used
   directly to select an orbit connection. `AxisFrame::TerminalOpen`
   (`crates/proto/src/frames.rs:217`) carries `terminal_id`, `cols`, `rows`,
   `cwd` — **no principal**, so orbit could not enforce identity even if it
   wanted to.

## Why it is worse than a missing role check

Orbit spawns the shell as **its own process identity**
(`crates/orbit/src/entry.rs:831` → `conn.pty.open(...)`). Privilege drop is not
implemented anywhere in the tree — grep for `setuid`/`initgroups`/`pre_exec`
finds only `kill_group` in `crates/orbit/src/job_table.rs`. So on a system-tier
node (ADR 0031: orbit = root system daemon) the shell is **root**.

Combined: one low-privilege account in any org → root on every node in the
fleet. Org boundaries (ADR 0005 "org = hard boundary") do not apply to this
path at all.

## Not a Windows problem

This is platform-independent and is the reason the Windows console question
came up at all. Windows is *less* exposed today only because orbit refuses to
run there.

## Fix direction (not yet implemented)

- `authorize_operator` must actually require `Principal::Operator`, or be
  renamed and given an explicit capability argument. Grep every caller first —
  `/ws` and other WS routes use it too, so tightening it in place is the
  root-cause fix rather than patching this one route.
- `TerminalOpen` needs to carry the authorized principal so orbit can place
  the shell under the right OS identity (and refuse if it cannot).
- Console target enumeration (`/api/terminal/targets`) must filter by what the
  caller is actually entitled to, not just node liveness.

## Measured against a live axis

Probed `/ws/operator/terminals/{id}?node=axis` on a real axis instance
(`curl_exit=28` = socket upgraded and stayed open, i.e. authorized):

| Credential | Result |
|---|---|
| none | `401` — rejected |
| bogus session cookie | `403` — rejected |
| installation token | **`101` Switching Protocols** — console opened |

So credential *validation* works. The defect is the missing
**authorization** step after validation: `authorize_operator` accepts any
principal a valid session resolves to, and nothing downstream narrows by node
or org.

## Severity bound — what limits this TODAY

`auth_store` (`crates/axis/src/auth_store.rs`) exposes only `bootstrap_admin`
for user creation — there is no route or CLI that mints an ordinary member
account. Every session that can exist today therefore belongs to an admin or
the operator, so the privilege *escalation* is currently latent rather than
exploitable.

It becomes live the moment non-admin users can be created (ADR 0022 human
RBAC, ADR 0027 session sharing — both planned). The fix belongs in place
before that, not after.

## Verify before re-asserting

The table above was measured with the installation token, not with a
non-operator user session (no such account can be created yet). When member
accounts land, re-run the same probe with a member session cookie and confirm
whether it still upgrades.
