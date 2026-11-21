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

## Visibility defaults

> **Status:** Pinned 2026-11-21 (NEVR-754, from NEVR-753's triage of scout
> report NEVR-751 — competitors 2026-11-21, PR #333 → `dev` `2966441a`;
> every Devin quote below re-verified live at pin time against
> docs.devin.ai/release-notes/overview, Nov 18 + Nov 20 entries).

**Pre-registered ahead of the surface**, the F4/F5/F6/E5–E7/D2 pattern:
at pin time `effect/v4` @ `9505c63d` has **no sharing/visibility surface
at all** — `git grep -iE 'sharedWith|share.?with|visibility|user.?group'`
over `apps/web` + `packages/contracts` returns exactly five hits, all CSS
`visibility` in `apps/web/src/styles/app.css`, and this document carried
no visibility axis (only an unrelated shared-store line, rate limiting
above). This is when contract lines are cheapest: the five lines below
are law for the first brief that opens a shareable object — and every
one after — **quoted as acceptance criteria, never forked**. At
implementation time each play is demonstrated red when its law is broken,
green when it holds (sabotage-and-revert) and stays in the suite as the
law's guard. This section adds no audit rule: `bun run scope:audit` reads
`packages/contracts/src/scope.ts` and the route/tool tables, not this
prose. A shareable object still declares exactly one scope root from the
taxonomy above and meets lines (a)–(h); the visibility axis rides on top
of that root, never beside it.

The precedent is Devin shipping the same pack two entries in a row —
Nov 18 private sessions, Nov 20 "Introducing Access and Sharing"
(enterprise, rolling out gradually, off by default): the largest
per-object access pack in our radar window, with user groups pickable
"wherever **Manage access** is available (secrets, environments,
sessions, automations, plugins, playbooks, skills, MCP servers,
knowledge)". We adopt the laws, not the enterprise gating. The failure
class these lines keep out is the one line (c)'s denial tests already
know, one layer up: an object born wide, a path that widens without
asking, a derived surface that leaks a share.

**V1 — Narrow by default: a newly created shareable object starts at the
narrowest visibility its creation context admits (creator-only unless
the context explicitly widens); org-wide is an explicit setting, never a
default.**
The creation context sets the floor, never the ceiling. An object
created inside a share-scoped parent — a session using a repo shared
only with you — starts at that share's width or narrower, never wider; a
freestanding object starts creator-only. Org-wide is a deliberate
setting a human makes later, through V2's confirmation, not a state
anything is born into.
*Precedent:* Devin Nov 20 — "sessions that use a repo, secret or
environment shared only with you or your group **start as just you, with
a warning before you widen it**", and per-session sharing is "**just
you, one or more user groups, your org or account-wide**"; Nov 18 — the
"Start sessions as Only you" preference.
*Regression play:* `visibility: a freshly created shareable object is
invisible to un-granted org peers` — as user A create the shareable
object in an org A shares with user B (no grant to B); assert B's direct
read fails (403/404) **and** org-data search as B does not return the
object, until A explicitly widens it. Red when a fresh object is born
org-readable — search over org data returning an object the caller's
scope does not admit is this law failing, not merely line (c).

**V2 — Widening is a confirmed, named action: increasing an object's
visibility requires an explicit confirm that names who gains access;
silent widening (invite, link, attach, migrate) is a defect class.**
No gesture or side effect raises visibility on its own. Inviting a
collaborator, generating a link, attaching the object elsewhere, or
migrating it between scopes all leave visibility untouched unless a
separate, explicit confirm — one that names the principal or group that
gains access — is given. The warning before widening is the UX half; the
refusal is the API half.
*Precedent:* Devin Nov 18 — make-visible confirmations, the composer
"Shared with" picker (the names-who surface), and "Private sessions
don't post to Slack" (a side effect that would have widened the audience
is withheld, not downgraded); Nov 20 — "**with a warning before you
widen it**".
*Regression play:* `visibility: a widening action without the explicit
confirm is refused` — drive every path that touches an object's audience
(invite, link-share, attach, migrate) without the
confirm-that-names-who-gains parameter; assert each is refused with a
4xx and the object's visibility state is unchanged. Red when any path
widens silently.

**V3 — Derived surfaces inherit, never widen: search, digests, exports,
agent-readable projections and downstream sessions answer from the
source object's scope — a share-scoped object never reaches a wider
audience through a derived surface.**
Every surface computed from an object — search indexes, digests, exports,
the projections agents read, sessions spawned downstream — resolves
access against the source object's scope at answer time, so the narrowest
link in the chain bounds the audience. Attaching or linking a
share-scoped object into a wider one does not carry it there; a reply
arriving through a wider channel is rendered as not-shown, never funneled
in.
*Precedent:* Devin Nov 20 — "**Review lists only repos and PRs you can
access, including SCM mirrored access. DeepWiki and Ask answer from the
repos you can access, including SCM mirrored access**"; Nov 18 —
"**Attachments follow session visibility**" (an org attachment linked to
sessions "can now be opened only by people who can read one of those
sessions, in the web app and the API"), and a watched-Slack-thread reply
from someone without session access renders "under their name" with a
note "that Devin wasn't shown it".
*Regression play:* `visibility: a derived surface returns nothing for a
share-scoped object to a caller outside the share` — share an object
with exactly one user group; as a caller outside that group, query
search, the digest/export surfaces, the agent-readable projection, and a
downstream session fed by the object; assert the object is absent from
every answer. Red when any derived surface answers from a wider scope
than its source.

**V4 — Non-human principals get explicit grants: agent/service
credentials see only resources explicitly granted to them; they never
inherit a human's org-role breadth.**
An agent or service credential's readable set is the union of its
explicit grants — full stop. The human who created it, their org role,
and the object's org all stop at the credential boundary: nothing about
a principal being non-human widens it, and nothing about the owning
human's breadth leaks through it. (The Multica credential-class line,
restated as a visibility law.)
*Precedent:* Devin Nov 20 — "**Service users and shared bots use only
the repos and resources explicitly given to them**"; same lane,
Multica's task-token workspace-binding trio and credential-class weeks
(carried radar rows).
*Regression play:* `visibility: an agent principal reading an object it
was not explicitly granted fails` — issue an agent/service credential
whose owning human can read object O; assert the credential's read of O
fails while the human's succeeds; grant O to the credential explicitly
and assert the read now succeeds. Red when any org-role breadth flows
through a non-human principal.

**V5 — Drift is reported, not assumed: where the control plane mirrors
an upstream SCM's access, an admin-visible check reports mismatches
between the two.**
Mirrored access is a cache with an upstream, and caches drift. The check
is an admin-visible report of every object whose control-plane access
differs from the SCM's — not an auto-reconciliation, and not silent
trust of either side. The report names both sides' answers per object;
reconciliation stays a human decision.
*Precedent:* Devin Nov 20 — the "**SCM access mismatch checker**" gives
"**admins a report of repos where access in Devin is different from
access in GitHub or GitLab**".
*Regression play:* `visibility: SCM-vs-control-plane access drift
surfaces in the admin report` — seed one repo whose SCM-side access
differs from the control-plane mirror and one that matches; run the
check as an admin and assert exactly the drifted repo is listed with
both sides' access named; run it as a non-admin and assert the report is
not reachable. Red when drift is silent — or the report itself widens
beyond admins.

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
| (b) actor/identity fields and timestamps are server-derived | three pins, static + runtime: audit **R13** fails any request schema (path/query/payload, HttpApi *and* MCP args) declaring `created_by`/`created_at`/`updated_at`/`updated_by`-shaped names; kaneo-native decode CONSTRUCTS from the declared struct, so body-supplied `createdBy`/`createdAt`/`userId` are dropped before the handler runs — proven at runtime by B1, whose verified negative control seeds the full regression on `boards.create` (declare `createdAt` in the payload struct **and** write it through into the insert → echo/stored-row assertions go red; a storage-half edit alone, such as spreading the decoded payload into the insert, is a no-op precisely because decode drops excess keys); the same construction-drop holds for MCP args (M4), where `onExcessProperty: "ignore"` only shapes the *advertised* JSON Schema, not the decode (see `packages/kaneo/src/mcp/tools.ts`) | R13 probes in `tests/bun/scope-audit-gate.test.ts`; B1 + M4 in `tests/bun/scope-denial.test.ts`; identity excess-key case: `tests/unit/identity-contracts.test.ts` U4 |
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
