# Object scope roots — the per-route authorization inventory (NEVR-603)

Precedent: Plane v1.5.0-rc1 (tagged 2026-11-10) is a 30+-fix object-level
authorization sweep — nested resources scoped to their URL parent (#9335,
#9466, #9467, #9460, #9486, #9709, INFRA-772…), with a same-day follow-up
burst (#10207, #10213, #10214, #10216). The lesson is the accumulation
itself: a mature tracker with a dedicated security engineer collected this
entire failure class in one minor cycle because nothing held the line
per-route. Behavioral checklist only (Plane is AGPL-3.0; no code).

This document is the prose. **The law the audit reads is code:**
`packages/contracts/src/scope.ts` (taxonomy + foundation/identity tables),
`packages/kaneo/src/scope.ts` (kaneo tables), and the `scope` field of every
`McpToolSpec`. `bun run scope:audit` fails the build when a route lacks a
declared scope root; the `scope-audit` CI job is blocking from day one
(zero-finding baseline — the young surface makes that nearly free).

## Taxonomy (ours, not Plane's)

| Scope root | Meaning |
|---|---|
| `org` | The authorization decision hangs off one organization's membership/role statements. |
| `board` | Hangs off one board (itself org-scoped; `Access.guardBoard` resolves board → org). |
| `task` | Hangs off one task (task → board → org; `Access.guardTask`). |
| `user-self` | The caller acting on their own user object / rows readable by their principal. |
| `public` | No principal. |

Nested classes we actually have (triage correction 1): **board,
column-under-board, label (byOrganization / byTask / assign / unassign),
org member, role, team, team-member, invitation, api-key.**

## Inventory (what the audit walks today)

- **foundation (2)** — `health` (public), `shape` (org, `:org` path param).
- **identity (26)** — `packages/contracts/src/identity/http.ts`; contract-only
  (no handlers yet). All `/api/identity/orgs/:org/**` routes are scope `org`
  by the path-prefix law (audit R7); `active-org`, `list-organizations`,
  `create-organization` are `user-self`; `accept-invitation` is `user-self`
  (org resolved from the invitation); `user-avatar` is `user-self`.
- **kaneo (20)** — boards 7, columns 5, labels 8 (`packages/kaneo/src/groups.ts`),
  served natively with `Access` guards. Kaneo wire compatibility keeps three
  parents out of the path (board list org from **query**, board create and
  label create org from **payload**) — recorded as such in the table so the
  audit keeps that set from growing, and gated by `requireMember` regardless
  (proven by the cross-scope denial tests).
- **MCP tools (32)** — `packages/kaneo/src/mcp/tools.ts`; `scope` (and for
  org/board/task scopes, `parent`) are **required fields of `McpToolSpec`**, so
  the compiler itself refuses an undeclared tool. MCP results are free-form
  proxy payloads (no declared result schema), so line g for MCP is enforced on
  the proxied HTTP surface's own response schemas.
- **Legacy fallthrough** — anything else under `/api/*` is served by the lifted
  kaneo-legacy tree (`kaneo/src/http.ts` `isNative`). The strangler contract:
  a route migrates to the native surface only by landing in a scope-root
  table. Its credential routes (better-auth) are rate-limited (line f below).

## Acceptance lines and how each is pinned

| Line | Rule | Pinned by |
|---|---|---|
| (a) nested routes derive the parent from the URL path, never the body | audit R6 (provenance must name a field that exists; `path` preferred) + R7 (org-prefix law) | `scope:audit` in CI; kaneo exceptions recorded; denial tests prove body/query orgs are still membership-gated |
| (b) actor/identity fields and timestamps are server-derived | three pins, static + runtime: audit **R13** fails any request schema (path/query/payload, HttpApi *and* MCP args) declaring `created_by`/`created_at`/`updated_at`/`updated_by`-shaped names; kaneo-native decode CONSTRUCTS from the declared struct, so body-supplied `createdBy`/`createdAt`/`userId` are dropped before the handler runs — proven at runtime by B1; the same construction-drop holds for MCP args (M4), where `onExcessProperty: "ignore"` only shapes the *advertised* JSON Schema, not the decode (see `packages/kaneo/src/mcp/tools.ts`) | R13 probes in `tests/bun/scope-audit-gate.test.ts`; B1 + M4 in `tests/bun/scope-denial.test.ts`; identity excess-key case: `tests/unit/identity-contracts.test.ts` U4 |
| (c) list endpoints return only readable rows | denial tests: board list of a foreign org → 403, labels byOrganization foreign → 403; identity lists declared org/user-self scoped | `tests/bun/scope-denial.test.ts` |
| (d) permission checks cover nested reads, not just the parent | denial tests: columns by foreign board, labels byTask of a foreign task | `tests/bun/scope-denial.test.ts` |
| (e) pagination cursors validated and bounded | audit R10: cursor-ish request fields must be registered in `BOUNDED_CURSORS`, and an entry is not a name — it must carry `{ max, test }` (the hard page bound + the repo-relative test that proves the clamp), enforced by the registry-contract test. Both registries are empty today, so the first cursor PR must land behaviour, not a name, or fail CI | `scope:audit` in CI + registry-contract test in `tests/bun/scope-audit-gate.test.ts` |
| (f) credential endpoints rate-limited | better-auth `rateLimit.enabled: true` for all deployments (was `isCloud()`), sign-up 3/min, invite 5/min; identity `create-apikey` / `create-invitation` / `accept-invitation` declared `credential` and must carry `RateLimited` in their error union (audit R8) | config pin in `tests/bun/scope-audit-gate.test.ts` + `scope:audit` |
| (g) no response schema carries secret material; api-key plaintext at create only | audit R9 walks every success schema property (nested included); `secret` appears only on `create-apikey` (`returnsSecret`) | `scope:audit` + negative control |
| (h) redirect/callback targets reject authority-relative paths | audit R11: redirect-ish request fields must be registered in `REDIRECT_SAFE`, and an entry must carry `{ rejectsAuthorityRelative: true, test }` — the named proof that the handler refuses `//host`/`scheme:` targets. Registry empty today (no webhook/connection-token surface exists yet); the first webhook PR meets this line or fails CI | `scope:audit` in CI + registry-contract test in `tests/bun/scope-audit-gate.test.ts` |

Secret/cursor/redirect matching runs on the lower_snake_case normalisation of
a field name, so `aiDefaultTokenLimit` (a quota) is not credential material
while `accessToken` is, and `dueBefore` (a date filter) is not a cursor while
`startingAfter` would be.

## Audit contract (`packages/contracts/src/scope-audit.ts`)

- R1 every route declared; R2 no stale rows; R3 scope ∈ taxonomy.
- R4 `public` carries no parent; R5 org/board/task record a parent.
- R6 provenance is structural: `path`/`query`/`payload` must name a field that
  exists there; `resolved` must record the resolution path (and the runtime
  guard must fail closed — that is what the denial tests prove).
- R7 org-prefix law; R8 credential ⇒ `RateLimited` error tag; R9 secret
  material only on `returnsSecret`; R10/R11 cursor & redirect discipline
  (registrations carry their bound/proof, not just a name).
- R12 every MCP tool's scope value validates against the taxonomy.
- R13 request schemas must not declare server-derived actor/timestamp field
  names — the static half of line (b).

Negative controls (seeded violations must redden the exact rule) live in
`tests/bun/scope-audit-gate.test.ts`, mirroring the knip-gate test
(NEVR-586): wiring pins (CI job blocking, script pinned), the clean-tree
baseline, and per-rule catch-behaviour probes against the pure engine.

## Rate limiting decision (line f)

The limiter previously fired only when `KANEO_CLOUD` was set, i.e. never on
self-hosted deployments — exactly the enumeration window the limiter exists
to close (Plane #9335 rate-limited sign-in+sign-up for every deployment).
`enabled: true` keeps the conservative global window (100 / 10 s) and the
tightened custom rules (sign-up 3/min, invite 5/min). Better-auth's limiter
is in-memory per instance by default; a shared store lands with the first
multi-instance deployment that needs it.

**Effectiveness condition (NEVR-604 defect 3):** the limiter buckets by
client IP read from `cf-connecting-ip` / `x-forwarded-for`
(`packages/kaneo-legacy/src/auth.ts`, `advanced.ipAddress`). Those headers
are only trustworthy behind a proxy that actually sets them — Cloudflare
strips client-supplied `cf-connecting-ip`, and `trustedProxies`
(`TRUSTED_PROXIES`, loopback + RFC1918 by default) anchors multi-hop
`x-forwarded-for` chains. A self-hosted deployment exposed DIRECTLY (no
proxy) lets a client rotate `x-forwarded-for` to mint fresh buckets and
sidestep the 3/min sign-up limit: there, the limiter narrows the
enumeration window but does not close it. Front the API with a proxy that
overwrites these headers (or a CF tunnel) for the limit to hold per client.

## What the audit does and does not enforce

The audit is a static contract over **declarations**: every route/tool
declares a scope root, parent provenance, and credential/secret flags, and
the rules keep those declarations honest (existing fields, taxonomy values,
registered names). It does NOT prove the handler calls its guard — that is
the runtime half's job, and it is deliberately sample-based, not exhaustive:

- `tests/bun/scope-denial.test.ts` S1/S2 cover the kaneo-native HTTP surface
  probed there (board/column/label CRUD against a foreign org);
- M1–M4 cover the MCP surface on `get_task` (guard denies before the proxy),
  `list_organization_labels` / `attach_label_to_task` (proxied route denies);
  `labels.byTask` has no MCP tool — its coverage is S1's
  `/api/label/task/:id` probe;
- a route NOT probed there is declared-but-not-runtime-verified; new probes
  land with the route that needs them (the strangler contract above).
