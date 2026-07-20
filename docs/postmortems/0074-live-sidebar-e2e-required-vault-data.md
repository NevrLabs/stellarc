# 0074 — Live sidebar acceptance depended on a configured vault

## Status

Resolved in the development-branch/sidebar cutover change.

## Incident

The canonical live Playwright gate added a mobile Vault note-selection flow that called the raw `/api/vaults` endpoint and required at least one preconfigured development vault. A clean development state legitimately had zero vaults, so the service installer could roll back an otherwise healthy candidate for missing operator data. The raw request also bypassed the UI API client's organization scoping and returned HTTP 403 for session-cookie users.

## Impact

- Live acceptance was coupled to mutable development data rather than the behavior under test.
- Clean installations could not pass the transactional cutover gate.
- The test could create and delete a note in an operator-configured vault.

## Root cause

The test used a convenient existing-data path to trigger a same-route Vault sidebar action. It did not preserve the distinction between UI behavior fixtures and operator-owned domain data, and it bypassed the organization-aware request adapter in `ui/src/api.ts`.

## Correction

The mobile acceptance now opens the Vault selector and invokes the same-route **Create vault…** action. It proves the drawer closes through the explicit Vault action callback and that the modal opens, without creating a vault, writing a note, depending on seeded data, or issuing an unscoped API request.

## Prevention

- Live browser gates must run from a clean development state unless their setup and cleanup are explicit and isolated.
- UI E2E must not mutate operator-owned vaults to verify shell behavior.
- Raw browser requests must use organization-scoped routes or the application API adapter.
