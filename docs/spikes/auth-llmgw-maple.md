# Auth + LLM gateway spike — OPEN

Owner: <t3-thread://v2/6799043e-270b-42b7-b647-a0d093fbe319/mcp:launch:dab213bbe0b527e77aa2b80920fff9568e886409acbc27ce3e5855d1ed52059b>
Base: effect/v4 `2dce6d069db62ebf880ec0cb7c280f3a58a7034c`.

## Human direction, 2026-11-08

Effect/Bun API + Rust arclet remains the topology. No separate auth sidecar
without a demonstrated library constraint. Proxying harness-originated calls
is not an agent loop or autonomous model use by the inert control plane.
Only Stellarc's Kaneo rewrite is frozen; existing Kaneo maintenance belongs
to its separate owner and is untouched here. This spike does not amend those
maintenance permissions. ADR 0012's migration sequence is paused, not deleted.
ADR 0010's OTel contract remains; Maple replaces the example local telemetry
backend for this spike. No Maple configuration or production routing changes.

## Bounded review disposition

One read-only design review completed with HOLD and seven blocking contracts.
The implementation must satisfy the following before claiming acceptance:

1. Grant-row lock serializes admission/revocation. Admission commits before
   provider work, never holds a transaction over a stream. Every retry and
   emitted chunk rechecks current membership, grant expiry and revocation.
   Revocation acknowledgement prevents further admission; a chunk already
   handed to transport cannot be recalled. Barrier-driven race checks required.
2. Cursor is per org, ordered by transactional org counter, not timestamp,
   txid or a global sequence. Audit identity is `authgw:<org>:<seq>` and is
   unchanged by replay. Never alter checksum-registered foundation migration.
3. Root-owned durable audit exporter uses OTLP/HTTP JSON logs; successful
   status alone is insufficient. Validate response, reject malformed/partial
   success with nonzero rejected records, and retain batch on uncertainty.
   Receiver acceptance is not proof of warehouse durability. Replay is
   at-least-once; consumers deduplicate stable event IDs.
4. Unauthenticated events use reserved `authgw-system` scope and `anonymous`
   actor, never a client-selected org. Normal pending ceiling 1000; reserved
   emergency allowance 100 admits revocation and bounded denial evidence.
   At emergency exhaustion all new traffic is denied; local gap state remains
   observable, but unlimited denial retention is explicitly impossible.
   External OOB notification delivery remains separately approved/unverified.
5. OIDC browser transaction is expiring, single-use, PKCE S256, state+nonce,
   bound to an HttpOnly SameSite browser cookie. Pin issuer/client/callback/
   algorithms, validate aud and azp. Grant scopes are current server membership
   intersected with route allowlist. No tokens in URLs/logs. Cookie-authorized
   mutations require Origin/CSRF protection. Callback/browser replay checks.
6. Provision disposable PG as owner, run requests as restricted runtime role;
   no table ownership, superuser, bypassrls or inherited privilege. Runtime
   has SELECT/INSERT but no UPDATE/DELETE/TRUNCATE on event. Grant mutation and
   audit append share a transaction; append failure rolls back mutation.
7. Ordinary TelemetryLive remains the sole ordinary signal root. Durable audit
   export is an explicitly root-owned independent delivery path, never an
   acknowledgement inferred from logger enqueue/flush. Allowlist metadata;
   exclude credential hashes, raw exceptions, URLs with query, bodies, prompts,
   completions and tool args. Sentinel privacy check over exported payloads.

## Acceptance ledger — PARTIAL, OPEN

Runtime: fxbuilder Bun 1.4.0, isolated source/deps at
`/mnt/deepvault/scratch/stellarc-authgw-2dce6d0`. Disposable existing PG image,
restricted runtime role, no production database. First successful check had
14 assertions and targeted TypeScript pass. Expanded retry check exposed a
real cursor bug at double-digit sequences: `ORDER BY seq` bound to the
SELECT's text-cast alias. Fixed to `ORDER BY event.seq` (numeric source).
Expanded checks additionally exercised retry attribution, current membership
removal, grant-row locking, generated denial detection and normal audit capacity.
Final current-source run: **23 named checks PASS, targeted TypeScript exit0**.
Post-byte fixture failure first failed its new assertion, then passed after
minimal fault-path implementation; no retry occurred after the first chunk.
Receiver-accepted/cursor-write failure retained state; a new exporter instance
replayed the identical batch. This proves restart replay at that boundary,
not process-SIGKILL recovery or exactly-once delivery.
Source hashes and check identities: auth-llmgw-receipts/summary.json.
No full-repository gate has run. Disposable container readback was empty after
cleanup. Tests are handler/Web Streams integration, not socket or daemon proof.

Maple VERIFIED for metadata probe, not yet the authenticated gateway slice:
- Existing agent receives loopback OTLP HTTP on Terminus `127.0.0.1:14318`;
  ephemeral SSH reverse forwarding allowed fxbuilder runtime to use it.
- Existing agent exports HTTPS to `https://maple-ingest.entelechia.cloud`
  using existing source key + Cloudflare service authentication; no secret
  copied or configuration changed. Ingest forwards to the existing collector.
- Query helper destination confirmed external warehouse `192.168.3.40:8123`.
- Actual warehouse readback: traces 1 row and logs 1 row, both
  trace `1bd613e2a677f615a7460a12339ff7ff`, request
  `50734840-b653-4c97-be9b-315653b02ef0`; metrics_sum 1 row named
  `authgw_telemetry_proof_total`. See receipt. Not synthetic provider usage.
- Health initially 38 pass/6 fail, later 37 pass/7 fail: new info STAT-04
  corresponds to an internal-only metadata probe. Do not invent Server kind
  to clear it; real fixture gateway Server spans are a separate run.
- Actual fixture streaming run also stored 5 spans under trace
  `3bdef5c999b31cfb30f1e57618578c61`, with 3 logs sharing request
  `375e00b6-8e73-4f00-9d8d-ca227774a219`. A later warehouse query found the
  `authgw_requests_total` metric (value8, timestamp05:16:01.281Z). This is an
  aggregate counter from that process, not per-request/provider usage.
- Fresh isolated live-fixture.ts ran issue -> stream -> revoke -> durable audit
  export. Maple readback contains all three audit events under
  `stellarc.authgw.audit`, event IDs authgw:spike-dev:1..3, and actual issue,
  request and revoke traces. Stream request `68a0766d-8e9e-44b3-b60f-15ab82c93d45`,
  trace `e451a9052faa0d2ae7a0e35ad3639af9`, has five spans and four logs
  (three ordinary logs + durable admission audit). See live-fixture.json and
  maple-live-audit-readback.log. No OIDC or daemon-hop claim.
- Collector drops untraced INFO logs for most services. Issue/revoke create
  actual Effect spans and persist their real trace IDs; their INFO audit
  records were read back without changing severity or Maple configuration.
  Receiver ack still does not establish future retention/backup durability.
- Disposable event identity is stable only within one database's history.
  Reusing the same org/sequence in another discarded DB can collide in a shared
  warehouse; production needs a stable installation namespace. Do not dedupe
  unrelated disposable histories solely by the demonstration event IDs.

OIDC discovery VERIFIED at `https://auth.entelechia.cloud`, RS256 supported.
Talos's old Stellarc backup references client `383441398738714668`, but live
management readback proves this is **Kaneo Public**, registered only for
`https://kaneo.entelechia.cloud/api/auth/oauth2/callback/custom`. It is NOT a
Stellarc app. The stale local PAT returned401; chief of staff supplied the
existing `fxk3s-02/zitadel/iam-admin-pat` secret path and read-only management
queries then succeeded. No credentials printed, reused or changed. Returned
project/app catalog originally contained no dedicated Stellarc app/callback.
Raisal subsequently AUTHORIZED the exact dedicated native client, proof and
exact-ID guarded cleanup (owner position234). Dedicated resources were created
and exact metadata re-read on continuation; no shared app was changed and no
duplicate provisioning occurred. See auth-llmgw-oidc-approval.md and private
provisioning receipt. Actual interactive sign-in is not yet complete. Local
signed identity vectors now exercise callback replay, browser mismatch,
signature/issuer/audience/azp/nonce/expiry and HTTPS-cookie preservation; this is
not real Zitadel sign-in, shipping auth-library selection or a sidecar justification.

Continuation: six signed-identity check groups and targeted TypeScript PASS.
`oidc-live.ts` booted with disposable PG as restricted runtime; the approved
client's real code+PKCE flow reached HTTPS Zitadel `/ui/v2/login/loginname`.
Browser had no authenticated session or saved Zitadel login; no token exchange
or human identity verification occurred. This is an interaction/access blocker,
not a missing-approval blocker. Server, forward and disposable PG were stopped;
only the created IdP project/app were guard-checked and deleted, with absence
readback. Guards are repeated checks, not atomic compare-and-delete; the IdP API
leaves a residual check/delete race. Continuation receipts preserve original
23-check/Maple receipts and record new source hashes separately.
Agent-native independent/delegated modes are explicitly NOT IMPLEMENTED;
requirements/current-source gap matrix: auth-llmgw-agent-auth.md.

Further local checks: receiver-accepted timeout replay, emergency reserve/
exhaustion rollback, and private marker absence across audit/spans/logs/metrics.
Malformed `partialSuccess:null` first failed its rejection assertion, exposing
cursor advancement on invalid OTLP responses. Fixed the shared response guard;
null/array/scalar/unknown partial-success shapes are now rejected before cursor
write. RED receipt: auth-llmgw-receipts/audit-response-red.json. Capacity edges
use artificial counter positions in disposable PG, not a full backlog load test.
No additional live IdP/Maple writes or inference calls were made.
Expanded final run: **27 named checks PASS; targeted TypeScript exit0** on
fxbuilder. Source hashes and receipt: auth-llmgw-receipts/audit-expanded.json.
Original 23-pass and live Maple receipts remain historical evidence; this
latest local run does not establish new live-Maple or OIDC acceptance.

OPEN: real OIDC browser login and grant issuance from verified identity;
Rust arclet W3C hop; full concurrent admission/revocation races;
full backlog load/process-kill recovery; independently scheduled exporter;
OIDC-authenticated audit->Maple path; full-repo lint/typecheck/build; complete
detection rule fixture execution; independent telemetry-gap/OOB email/Discord delivery.
No full SIEM completion claim. Alert routing, IdP changes and production rollout
remain separate approval gates. Existing Kaneo maintenance is not frozen and
belongs to its own owner; only the Stellarc rewrite is paused.

No paid/subscription provider probes; fixture cannot establish live provider
behavior or Anthropic permission. No commit/push/PR/deploy/restart performed.
Additional operational ceiling/access/retention details: tools/spikes/auth-llmgw/README.md.
Test source and receipts remain uncommitted for owner continuation.
