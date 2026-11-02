# Vendored `@shadcn/react` message-scroller (post-#11465)

Source: <https://github.com/shadcn-ui/ui> at commit
`4aaea19d9cff3e0908e12a8c1d504b8c5ec34610` — the merge commit of
[shadcn-ui/ui#11465](https://github.com/shadcn-ui/ui/pull/11465)
("fix(react): drain released tail spacer after manual scroll during anchored
stream", merged 2026-11-02, fixing #11125), PR #165 / NEVR-427 / NEVR-428.

The published `@shadcn/react` npm package is still `0.3.1` (2026-08-31),
which predates the fix, so the sources are vendored here instead of resolved
from the registry. `@shadcn/react` remains a dependency for the
`questionnaire` subpath; only `message-scroller` is vendored.

## Layout

Mirrors the upstream monorepo paths so future `diff -r` against upstream is
trivial:

- `message-scroller/` ← `packages/react/src/message-scroller/*` (sources only;
  upstream tests are not vendored — the four anchored-stream laws are guarded
  by `apps/stellarc-ui/e2e/message-scroller.spec.ts`)
- `use-render/index.ts` ← `packages/react/src/use-render/index.ts` (the only
  sibling module the message-scroller sources import)

No other upstream module is pulled in. The files are unmodified from the
commit above; local TypeScript strictness fixes, if ever needed, must be
listed here.

## Removal

Delete this directory and revert the import in
`src/components/ui/message-scroller.tsx` back to
`@shadcn/react/message-scroller` on the day the registry publishes a release
that contains #11465 (`bun info @shadcn/react` → version > 0.3.1 with the
drain fix). The e2e law plays double as the regression guard for that swap:
they fail against pre-#11465 sources.
