# Axis authentication bootstrap

A new Axis can create its first local administrator at startup:

```bash
export STELLARC_ADMIN_USERNAME=admin
export STELLARC_ADMIN_PASSWORD='use-a-random-password'
export STELLARC_DEFAULT_ORG=default   # optional; defaults to default
stellarc-axis
```

`STELLARC_ADMIN_USERNAME` and `STELLARC_ADMIN_PASSWORD` must be supplied together. Bootstrap runs only while the Axis user table is empty, creates the default organization and owner membership in one SQLite transaction, and stores only an Argon2id password hash. Axis removes both variables from its process environment immediately after reading them so agent child processes cannot inherit them. Do not put the password in a committed environment file or long-lived systemd unit.

Authentication data is stored in `~/.stellarc/auth.sqlite`. Login sessions are opaque random tokens; only BLAKE3 token hashes are persisted.

The Axis accepts browser credentials only from its exact serving origin. A separate Vite development origin or reverse-proxy origin must be explicitly listed as a complete origin, including scheme and port:

```bash
export STELLARC_ALLOWED_ORIGINS=http://127.0.0.1:5173
```

Multiple exact origins are comma-separated. Do not configure hostnames without a scheme or use wildcard origins.

Cookies are `Secure` by default. For local plain-HTTP development only, set:

```bash
export STELLARC_INSECURE_COOKIES=1
```

Do not use insecure cookies for a remotely reachable Axis. Production deployments terminate HTTPS at the Axis origin and leave secure cookies enabled.

The existing `~/.stellarc/token` remains a migration/operator credential for unscoped native automation. It is never embedded in the Web UI and does not grant organization membership.
