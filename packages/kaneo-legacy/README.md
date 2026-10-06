# kaneo-legacy (strangler source)

The Kaneo API at `IEatCodeDaily/kaneo@2504e645`, lifted verbatim (tests
dropped). It is **not** under the root strict typecheck or lint; the Effect
host (`apps/stellarc-api`) loads it by path and serves only endpoints that
`packages/kaneo` has not yet replaced natively.

Rule: every endpoint migrated to `packages/kaneo` must pass
`tests/bun/kaneo-parity.test.ts` (native ≡ legacy, admin + member). When a
whole group is native, delete its legacy directory.

Local edits (keep minimal):
- `index.ts`: under Bun, WebSocket upgrades use `hono/bun` instead of
  `@hono/node-ws` (which only works with node:http).
- `stellarc-auth.ts`: request-independent principal resolution shared with
  the native Effect handlers.
- `drizzle/0026_*.sql`: existence-guarded. Upstream applies 0026 before 0025
  creates the table, so a fresh database could never boot.

Known upstream defects (inherited, typecheck-visible, not fixed here):
- `auth.ts` calls `deleteAccountData` without importing it, so BetterAuth
  user deletion throws a ReferenceError.
- `billing/**` and `user/controllers/delete-account-data.ts` reference tables
  that do not exist in `database/schema.ts` (dead cloud-billing code).
- `mcp/oauth-store.ts` references `mcpOauthStateTable`, which does not exist.
