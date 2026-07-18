# 0071 — Envoy development home was only partially applied

## Incident

After Talos was re-enrolled with `OLYMPUS_HOME=~/.olympus-dev`, its identity and
managed session workspace correctly moved under the development root, but the
startup log still reported `~/.olympus/control.sock`. The bootstrap installer
also created the new root with the caller's default `0755` permissions and the
generated service had no restrictive umask.

## Impact

Remote iroh execution did not use the local control socket, so the managed
Talos prompt succeeded. The split path resolution nevertheless made the
environment boundary false for local-transport Envoys and left state-root
metadata visible to other local users. A local development Envoy without an
explicit `OLYMPUS_CONTROL_SOCKET` could connect to the production/default Hall
socket despite having a development identity and workspace root.

## Root cause

The node-local workspace change introduced a shared `olympus_home()` resolver,
but `resolve_socket()` retained an older independent `$HOME/.olympus` fallback.
The installer persisted `OLYMPUS_HOME` but used ordinary `mkdir -p` and relied
on the user's ambient umask. The rollout checked identity and workspace paths,
which did not exercise the unused UDS path on an iroh-connected node.

## Repair

- Route the default control socket through `olympus_home()`.
- Create the selected state root and binary directory with mode `0700`.
- Install the Envoy user service with `UMask=0077`.
- Extend enrollment-route coverage to assert the private-root and umask
  invariants in the served bootstrap script.

## Prevention

`OLYMPUS_HOME` is the single authority for every default Envoy state path.
Environment-split acceptance must inspect the running process environment,
identity, workspace, socket path, root permissions, and generated service—not
only the path used by the exercised transport.