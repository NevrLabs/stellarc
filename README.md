# Stellarc — `dev` (v2 rewrite)

**This branch is a full reset.** It shares history with nothing on `main`.
`main` is Stellarc v1 (Rust cockpit + arclet); it stays as reference and keeps
running. `dev` is where v2 is built from the ground up.

## What this branch is

The first step of the Stellarc v2 rewrite: **the work-management surface of the
Kaneo fork, rebuilt on Effect, rebranded as Stellarc.** Same UI, new everything
underneath.

Three deployables, nothing else yet:

| Package | What | License |
|---|---|---|
| `apps/stellarc-api` | Effect control plane: HTTP API, auth (better-auth), event log, embedded sync engine (ADR 0007) | FSL-1.1-Apache-2.0 |
| `apps/stellarc-worker` | Effect outbox consumer: notifications, search projection, integrations | FSL-1.1-Apache-2.0 |
| `apps/stellarc-ui` | Vite SPA: TanStack Router + TanStack DB, Base UI via shadcn, Tailwind v4 (ADR 0008) | Apache-2.0 |

Not in this branch yet: arclet, tunnel, desktop, Maestro flows, the v1 UI. They
arrive as later stages of the rewrite per `docs/v2-charter.md`.

## What it is not

- Not a port of Kaneo. No Kaneo code is carried over; behaviour was informed by
  the fork, the code is new. See `LICENSING.md` → Provenance.
- Not a new design. The UI is **pixel-frozen** against the fork's current
  surface until the backend lands. Stellarc's canonical design system
  (`docs/design/`) is the target for a later token-merge ADR.
- Not Kaneo's feature set. Only what the frozen UI actually renders is
  implemented; upstream-Kaneo features the fork never surfaced are dropped.

## Doctrine that governs this branch

Read in order:

1. `docs/v2-charter.md` — D1–D19, the ratified rewrite doctrine
2. `docs/adrs/0001`–`0006` — founding ADRs (inert CP, Bun/TS + Effect-as-library, transcript schema, tunnel, templates, primitives)
3. `docs/adrs/0007-embedded-sync-engine.md` — **decision B**: Electric-protocol shape server over our event log, in-process
4. `docs/adrs/0008-frontend-stack.md` — Vite SPA, TanStack Router + DB, Base UI/shadcn, Tailwind v4
5. `docs/primitives-v1.md` — structural entities vs resource kinds
6. `docs/design/DESIGN_SYSTEM.md`, `VISION.md` — the design target (not yet applied)
7. `LICENSING.md` — FSL core / Apache client split

`docs/adrs/v1-0037`, `v1-0038` are carried from `main` because 0007 builds on
them.

## Working rules

- One ticket → one PR into `dev`. Tickets live on the Stellarc GitHub project.
- TDD with negative controls: a test that cannot fail does not count.
- Every mutation goes through the API and appends to the event log. Direct SQL
  writes are doctrine-illegal (D12) — the sync engine depends on it.
- Verify the shipped artefact: served bundle hash, real keyboard, measured DOM.
- Design changes are out of scope on this branch. If a pixel must move, it is a
  bug in the freeze, not a feature.

## Agents

Implementation: `cx/gpt-6-astra`, `glm/glm-5.3-flash`. Review: `glm/glm-5.3`
(different family from the implementer, always). Recon: goose. Dispatched via
Paseo; orchestrated by Talos.
