# Stellarc Caddy edge

Stellarc requires Caddy 2.11.1 or newer because that release fixes CVE-2026-27589.
Verify with `caddy version` before enabling the unit. The admin API is loopback-only
and rejects requests whose Origin does not match. Axis is the only process allowed
to write the `stellarc` server's route array.

The service runs unprivileged with filesystem protections. Artifact roots are
under `~/.stellarc/<org>/artifacts`; Axis rejects traversal components and generated
file-server handlers disable symlink following. Protected routes strip client
credentials and identity headers before Axis forward-auth sets the narrow
`X-Stellarc-User`, `X-Stellarc-Org`, and `X-Stellarc-Session` contract.
