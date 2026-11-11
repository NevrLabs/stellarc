# Approval request: dedicated Stellarc loopback spike OIDC client

Status: AUTHORIZED including exact-ID guarded cleanup; dedicated project/app created and read back.

Approval: chief-of-staff human message `5b4189d0-faf0-4223-8c7f-154c0d31889e`,
relayed to this owner at position234 (`stellarc-oidc-approved-agent-native-auth-20261108`).
The earlier NOT AUTHORIZED status was stale and is superseded.
Provisioning receipt: `/home/rpw/.hermes/cache/scratch/stellarc-oidc-approved/provision.json`.
Exact project/app metadata was verified again on continuation; no duplicate was created.
Interactive initiation reached the real HTTPS Zitadel login page; callback/token
exchange remains OPEN because the browser has no authenticated session or saved
Zitadel login. Proof server/forward/disposable PG were stopped. Guarded deletion
of only the created project/app was executed and GET readback confirmed absence.
See `auth-llmgw-receipts/oidc-continuation.json`; no human login was fabricated.

## Exact requested live write

Create a dedicated Zitadel project `Stellarc development spike` and one public
native OIDC application `stellarc-authgw-loopback-spike` under that project.
Do not reuse or modify Kaneo Public, Maple, Executor or another application's
credentials, callbacks, grants or policy.

- Issuer: `https://auth.entelechia.cloud` (existing personal provider).
- Application type: native; public client; no client secret.
- Response type: authorization code only.
- Grant type: authorization_code only; no refresh or client_credentials grant.
- Client authentication: none; require PKCE S256 in our client flow.
- ID-token signing algorithm: RS256; validate signature, exact issuer,
  client audience/azp, nonce and expiry.
- Sole registered callback: `http://127.0.0.1:18790/oidc/callback`.
- No wildcard callbacks, post-logout redirects, role mappings or project grants.
- Request only `openid`; no profile/email/offline_access scope.
- No automatic user creation, linking or tenancy grant. A verified issuer/sub
  must match an explicitly configured local development membership.
- Preserve existing login/MFA/session/token policies; do not weaken them.

Read back exact created IDs, application type, grant/response types and callback
before treating provisioning as complete. If the deployed Zitadel version does
not support this native loopback profile, STOP and report its response; do not
substitute another app, enable insecure web mode or broaden callback matching.

## Local test placement (no deployment)

A temporary proof process runs on fxbuilder, not Terminus. Its callback is
reachable by the user's browser through a short-lived SSH local forward of
port 18790. This is a test process with disposable PG, not a new persistent
service, DNS hostname, tunnel route, Kubernetes workload or production route.
The user performs their normal passkey/MFA sign-in; no password or code is
relayed in chat. The client sends code+PKCE to the pinned HTTPS token endpoint.
Credentials, code and tokens never enter telemetry, URLs beyond the standard
short-lived authorization callback, or saved receipts.

Current oidc.ts requires HTTPS callbacks. After approval, add a narrow native
loopback exception for this literal callback only; keep issuer/token/JWKS HTTPS
mandatory. Exercise cookie browser binding for loopback using HttpOnly,
SameSite=Lax and a non-__Host cookie (HTTP cannot satisfy Secure/__Host rules),
state+nonce, TTL and single-use consume. Keep HTTPS production cookie policy
unchanged. This is an explicit native-loopback test contract, not permission
to expose HTTP auth on a LAN or publish a new route. The temporary forward and
proof process must stop after acceptance; remove local pending state.

## Scope and rollback

Approval would authorize only the new project/application metadata above and
interactive proof using that new public client. It would NOT authorize a
Maple/9router/Kaneo change, production rollout, alert routing, service restart,
new infrastructure, subscription/paid provider canary or a shared app edit.

Record new project/app IDs privately with the provisioning receipt. If the
proof fails, stop local processes/forwarding and leave existing systems
unchanged. Remove only the newly created spike application/project if that
cleanup is explicitly included in the approval; otherwise report their IDs
as pending cleanup. No unrelated credential revocation or session termination.

## Existing evidence

Original 23-check + targeted TypeScript and live Maple durable-audit receipts
are preserved. The continuation reran all 23 checks plus types successfully and
added six signed OIDC fixture groups with targeted types. Real OIDC callback,
agent/delegation implementation, Rust daemon propagation, full repository gates
and full SIEM remain OPEN. See oidc-continuation.json for current source hashes;
original receipt hashes describe the original run, not subsequent OIDC edits.
