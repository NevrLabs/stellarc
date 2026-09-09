# STL-14 c3 — stock Electric query contract conflicts with strict allowlist

BLOCKED: spec gap

Gate checked: latest spec stage in /home/rpw/repos/stellarc-dev/.forge/STL-14.json is pass at 2026-09-09T03:21:00+00:00. Full implement brief read before other actions.

## Conflicting requirements

Brief §3 (line 86) permits only table, offset, handle and live and requires unsupported/arbitrary query options to return 400. Sections 4 and 7 require the stock Electric client unchanged, including initial, live and expired-handle recovery paths. The pinned protocol reference is @electric-sql/client@1.5.27 (ADR 0007 line 40).

The actual published client necessarily sends additional protocol parameters:

- package/src/client.ts:784: `this.#mode = this.options.log ?? 'full'` (upstream uses backticks).
- package/src/client.ts:1347: `fetchUrl.searchParams.set(LOG_MODE_QUERY_PARAM, this.#mode)` — unconditional, including initial request.
- package/src/constants.ts:26: `LOG_MODE_QUERY_PARAM = 'log'`.
- package/src/client.ts:1353: sets EXPIRED_HANDLE_QUERY_PARAM for cached expired handles.
- package/src/constants.ts:9: EXPIRED_HANDLE_QUERY_PARAM is `expired_handle`.
- package/src/client.ts:1020 and :2292: sets CACHE_BUSTER_QUERY_PARAM during retry paths.
- package/src/constants.ts:34: CACHE_BUSTER_QUERY_PARAM is `cache-buster`.
- package/src/constants.ts:8: LIVE_CACHE_BUSTER_QUERY_PARAM is `cursor`.

Evidence obtained directly by downloading https://registry.npmjs.org/@electric-sql/client/-/client-1.5.27.tgz with Python urllib and reading its source members with tarfile. Both source inspection commands exited 0; no package install, source mutation or fabricated client execution was used.

## Required orchestrator ruling

Amend the query schema to explicitly name permitted stock-client protocol parameters and their validation/semantics. At minimum resolve unconditional `log=full`; also resolve `cursor`, `expired_handle`, and `cache-buster` for required live/recovery behavior. Keep unsupported filtering, arbitrary tables, subset requests and SSE rejected. Alternatively explicitly select and justify a different compatible adapter/client pair whose requests satisfy the four-parameter contract.

This is not missing alias/config plumbing or an undeclared dependency. Accepting undocumented parameters changes API behavior; dropping them in a custom fetch transport hides the protocol mismatch and undermines the unchanged-stock-client requirement. No such choice was made.

## Delivery state

Only this blocker file was written. No application implementation, T01, test run, negative control, gates, screenshots, commit, push or PR is claimed. No tracker, gate state, main checkout or licenses changed. Resume implementation after the HTTP query contract is amended.
