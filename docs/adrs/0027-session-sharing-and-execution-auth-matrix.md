# ADR 0027 — Session Sharing, Multi-User Attribution, and the Execution/Auth Matrix

- Status: Accepted
- Date: 2026-07-18 (condensed 2026-07-18)
- Amends: ADR 0024 (lease continuity, per-harness delivery modes), ADR 0004
  (mandatory signed vault provenance)
- Relates to: ADR 0005, 0006, 0008, 0010, 0016, 0017

Stellarc is the self-hosted gateway a team runs its agents through. That
requires: sharing (sessions, team vaults, cross-Axis movement), BYOK (each
user brings their own provider subscription, even on shared nodes), and
availability (agents keep running when Axis is down — Axis never sits on the
inference data path).

## 1. Session sharing

**In-Axis = trust, cross-Axis = transform.**

- **In-Axis share = access grant on the same session.** A `SESSION_GRANT` row
  in `auth.sqlite` (`session_id`, `grantee_user_id`, `granted_by`, mode
  `read|drive`, `revoked_at`). Same event-log rows, no copy, **no per-viewer
  redaction** — the org is the trust boundary (ADR 0005/0010). `read` = view +
  fork; `drive` = also send. Handlers check `owner ∨ live grant`; revocation
  removes future access, never rewrites history. v1 ships `read`+fork; `drive`
  lands after attribution (§2).
- **Cross-Axis share = export/fork.** Sessions never span Axiss (ADR 0010).
  Moving one (team Axis ↔ personal Axis) is an export bundle (transcript
  events + optional space artifacts) imported by the receiving Axis as a fork
  with origin provenance. **The export step is the only place a
  strip-PII/secrets option exists** (pattern scrub + ADR 0024 secret
  fingerprints, exporter's choice). No live link; edits don't propagate back.

## 2. Multi-user attribution — metadata, not content

- Every message event carries **`sender_id`** (new V2 stored variant, append
  at enum end; existing events read as session owner). Populated even for
  single-user sessions.
- When a session first becomes shared, Axis appends one real transcript
  event: *"This session is now shared with user A, user B…"*. That is the
  **only content injection**.
- While a session has >1 distinct sender, the runtime adapter renders user
  messages to the agent as `<name>: <message>` **at prompt-build time**.
  Stored content stays raw; UI renders sender chips from `sender_id`.
  Un-sharing reverts cleanly because nothing is baked into storage.
- Concurrent sends queue through the existing single-writer turn order.

## 3. Execution matrix: AgentRuntime × Auth

- **Runtime:** `node-bound` (harness lives on the node; Orbit drives via
  ACP/CLI — today) or `remote-dispatched` (Orbit materializes an **ephemeral
  sandbox**: harness + the ADR 0006 setup overlay rendered as a deterministic
  config tree; create → run → scrub → destroy). The durable **environment**
  (session space, ADR 0005) is separate from the disposable runtime; remote
  dispatch re-binds a fresh runtime to the same space.
- **Auth:** `node-bound` (the node's ambient credentials) or `axis-managed`
  (per-user credential from the ADR 0024 Secret Store, delivered as a lease).

| | Auth node-bound | Auth axis-managed |
|---|---|---|
| **Runtime node-bound** | today (personal nodes) | BYOK on shared nodes |
| **Runtime remote-dispatched** | ✗ rejected — ephemeral sandbox has no ambient auth | **target**: sandbox + injected lease |

New work for remote dispatch is the sandbox lifecycle and credential path
only — the config system is ADR 0006 as-is.

## 4. Credential leases: Axis issues, Orbit holds (amends ADR 0024)

Axis's Auth Broker stays the sole authorization/linearization point; its
output for agent sessions is a **lease** delivered to Orbit, and **Orbit —
never Axis — sits on the provider data path** (node-local auth proxy).

A lease binds: credential ref (payload delivered once), grantee
session/sandbox, provider + scope, delivery mode, TTL, and for OAuth an
**exclusive refresh delegation** — the broker delegates refresh authority for
a credential to at most one Orbit at a time (preserves ADR 0024's
single-refresher invariant), and that Orbit runs the refresh loop locally
with backoff, off the request hot path. On reconnect it reports the new
credential version; Axis CASes it into the Secret Store. Lease cache is
encrypted at rest.

**TTL is the availability/security dial** (default: hours — longer than
expected Axis recovery; Axis renews proactively). Revocation = Axis tells
Orbit to drop the lease (ADR 0024 fencing applies); if Orbit is unreachable
the TTL is the backstop — the explicit price of offline continuity.

**Axis down:** in-flight turns and new turns on leased sessions work until
TTL; OAuth refresh works locally; **new session spawns fail closed** (spawn
needs Axis for capability resolution anyway); lease renewal defers. This
refines ADR 0024 §11: new *authorizations* require Axis; continuing under a
standing lease does not.

**Threat model:** Orbit is security-critical (holds materialized credentials;
compromise = lease compromise for that node — accepted, it already runs the
agents) and gets ADR 0012 signing discipline. Under `materialize` delivery
the agent can read its token; under `proxy` it cannot — hence the preference.
Subscription use on shared nodes is a **provider-ToS question**: tracked,
not solved here.

## 5. Per-harness delivery: `proxy` and `materialize`

Each ADR 0006 adapter declares supported modes; the broker picks the
strongest both sides support. Refines ADR 0024 §8 tiers 2–4 for harnesses.

- **`proxy` (preferred):** credential never enters the sandbox — it gets a
  local Orbit endpoint + dummy token; Orbit injects the real credential per
  request. Revocation is immediate.
- **`materialize` (fallback):** Orbit writes the credential into the
  ephemeral config dir at spawn, scrubs at teardown, harvests harness-side
  token refreshes back into the lease. Weaker (sandbox holds the token) but
  TTL- and ephemerality-bounded, and the only path where subscription auth
  can't be interposed.

| Harness | proxy | materialize | Notes |
|---|---|---|---|
| Claude Code (key or subscription OAuth) | ✅ `ANTHROPIC_BASE_URL` → Orbit header-swap | ✅ ephemeral `CLAUDE_CONFIG_DIR` | proxy MUST be transparent (header swap only) — Anthropic fingerprints OAuth traffic as Claude-Code-shaped |
| Codex (API key) | ✅ `model_providers.base_url` in ephemeral `CODEX_HOME` | ✅ | |
| Codex (ChatGPT subscription) | ❌ pinned to built-in provider | ✅ tokens into `CODEX_HOME/auth.json`, harvest-back | **verify by spike** — surface churns across releases |
| Hermes / other CLIs | ❌ no injectable auth seam | ✅ session-scoped config (adapter-owned) | |

Both modes honor ADR 0024 §8 injection rules: one child context only; never
shared homes, argv, session workspace, or agent context.

## 6. Vault provenance (amends ADR 0004)

- **Every vault write is a jj commit with a mandatory signature**; unsigned
  writes are rejected at the write path (all vault backends).
- Human write: author = committer = the user, user's key. Agent write:
  **author = the user on whose behalf; committer + signature = the agent's
  Axis-minted key** — "agent X wrote this for user Y" is native VCS metadata;
  revoking an agent key never touches user identity.
- Key registry in `auth.sqlite`; agent key material is Secret Store payload.
- Sync is composition, not a new engine: jj (git objects) + content-addressed
  blobs over iroh (ADR 0016). Two sync substrates total — cr-sqlite for
  structured, jj+blobs for vault content.
- Team vaults = existing org-scoped vault (ADR 0005/0026), default org-member
  read, capability-gated agent access.

## 7. Migration path

1. `sender_id` on message events (V2 variant + DTO/UI chip).
2. `SESSION_GRANT` + handler checks + share/revoke API/UI (`read`+fork).
3. Share-notice event + prompt-build prefixes; then `drive`.
4. Session export/import bundle with strip option.
5. Lease object + Orbit lease cache + degradation ladder *(blocked on
   ADR 0024 §12 prerequisites)*.
6. Orbit auth proxy (`proxy` mode) — Claude Code first.
7. `materialize` + harvest-back; Codex-subscription spike gates its cell.
8. Remote-dispatched sandbox lifecycle on the ADR 0006 overlay.
9. Vault signature enforcement + agent key minting.

Steps 1–4 are independent of ADR 0024 implementation; start immediately.

## 8. Rejected

Per-viewer redaction for in-Axis shares (contradicts org-trust; redaction
lives only at export) · baked-in sender prefixes (unshareable history,
string-parsing UIs) · Axis-hosted auth proxy (control plane on the data
path = SPOF) · raw long-lived tokens at spawn (same availability, strictly
worse security) · remote-dispatched + node-bound auth (structurally empty
cell) · a third sync substrate for provenance (jj commits already carry it).
