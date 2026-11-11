# Dedicated Stellarc web OIDC registration — created and verified

This is separate from the completed temporary native-loopback approval.
The destination is the authenticated candidate at https://stellarc.entelechia.cloud.
Existing application clients, grants and policies must remain unchanged.

## Exact proposed scope

- Personal issuer: https://auth.entelechia.cloud.
- Create project `Stellarc gateway development` only if no exact project exists.
- Create one confidential web application `stellarc-gateway-web` under it.
- Sole redirect: `https://stellarc.entelechia.cloud/api/auth/oauth2/callback/zitadel`.
  This matches the installed candidate Better Auth 1.6.25 genericOAuth route.
- Authorization-code response/grant only; PKCE S256 in candidate; client-secret
  basic token authentication, matching the current strict getToken hook.
- Request `openid` only. No refresh/client-credentials/implicit grants, wildcard
  callbacks, role assertions, project grants, extra origins or logout callbacks.
- Preserve issuer, MFA, login/session/token policies and all existing apps.
- Save newly issued client secret directly into a private Talos candidate file;
  do not print it, send it in chat, or copy another application's credential.
- Read back exact project/app IDs, client ID, app/auth/grant types and redirects.
- Initialize the candidate's owner-only issuer/client pin only after readback.
  Bootstrap membership only for the explicitly selected real issuer/subject;
  management identity lookup alone is not proof of human sign-in.
- Provisioning is not public route cutover. Existing Access gate, API/web,
  shared PostgreSQL, Kaneo and Maple configuration stay unchanged.

## Decision and cleanup

The earlier temporary-native approval did not authorize this confidential web
app. The later explicit direction to continue toward the authenticated public
hostname was acted on for this dedicated registration. Creation and exact
management readback are recorded in `auth-llmgw-receipts/stellarc-web-oidc-created.json`.
Retain private IDs/configuration for the candidate. Exact-ID deletion of only
newly created app/project requires explicit cleanup authorization and guarded
readback. No automatic deletion or mutation of existing registrations.

## Current evidence

The dedicated project/app now exist. Owner migration initialized the immutable
issuer/client binding, Better Auth tables and explicit membership for the selected
real human subject. Restricted runtime and candidate service run on Talos loopback
55438/1438; v81 full source gates passed. Only this hostname's ingress was switched
to the candidate transport, with existing Cloudflare Access unchanged. Live login
initiation produces the exact callback, openid, code, S256 and Secure transaction
cookies; real Zitadel authorization reaches its loginname page. Public browser
access currently needs the user's Google sign-in at the existing Access gate.
There is no completed human callback/session. Real anonymous MCP denial audit and
its matching Server span were read back from Maple by exact IDs. See
`auth-llmgw-receipts/talos-v81-activated.json`; inference remains local-fixture-only.
