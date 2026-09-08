# ADR 0008: Frontend stack — Vite SPA, TanStack Router + DB, Base UI via shadcn, Tailwind v4

Status: **accepted** (2026-09-08, operator-ratified). Constrains the `stellarc-ui`
rewrite. The UI is **pixel-frozen** against the Kaneo-fork surface during the
backend rewrite; this ADR fixes the stack underneath it.

## Decision

| Layer | Choice | Not chosen |
|---|---|---|
| Runtime / build | **Bun**, **Vite** SPA | TanStack Start |
| Routing | **TanStack Router** (unchanged from fork) | — |
| Domain data | **TanStack DB** collections via `@tanstack/electric-db-collection` → ADR 0007 shape server | TanStack Query for domain data |
| Primitives | **Base UI** (`@base-ui/react`, 1.8.x) via **shadcn Base variants** (`shadcn add <component>`; docs default to `/docs/components/base/*`) | Radix; any third-party kit as the base layer |
| Styling | **Tailwind v4**, `cva`, `tailwind-merge`/`cn`, `data-slot` | StyleX (revisit later), CSS Modules, vanilla-extract |
| Auth client | **better-auth** (ADR 0002) | — |
| Icons | **lucide-react** | — |

## Why not TanStack Start

Start's value is SSR + server functions + streaming. A work cockpit behind auth
has no SEO and no cold-load content; after first sync the client is the source
of truth. Adopting Start would touch every route file during a *backend*
rewrite (two rewrites at once) and create a second RPC surface beside the
Effect `HttpApi`. Revisit if a public/SEO surface appears; the upgrade is
one-directional and cheap later, expensive now.

## Why not StyleX

StyleX's advantages (type-checked style props, deterministic specificity, no
`tailwind-merge`) are real but would cost a full UI rewrite for ~20% more
safety than `cva` already gives. Tailwind v4's CSS-first `@theme` closed most
of the DX gap. Every free Base UI component kit is Tailwind-shaped; StyleX has
no component ecosystem, which collides with "don't start from zero." Revisit
after the design-system merge.

## Evidence (recon lane 40571c6a, 2026-09-08)

- Fork `apps/web/src/components/ui`: **43 of 65 primitives already import
  `@base-ui/react`**; only `form.tsx` and `timeline.tsx` still import Radix.
  The fork already speaks the shadcn-base dialect: `cn`, `cva`, `data-slot`,
  Base UI `useRender`/`mergeProps`.
- Base UI 1.8.0 ships 38 primitives incl. Toast, Combobox, Menubar, Drawer,
  Autocomplete. Missing: Calendar, Command, Data grid, Tree.
- shadcn `4.21.0` (2026-09-04): 65 `/docs/components/base/*` components,
  installed by plain `shadcn add`. `base/command` wraps `cmdk`.
- Free kits checked (Tailwind v4 required): **basecn** MIT, Base UI verified in
  `package.json` — use as Radix→Base diff reference. **coss/ui** AGPL-3.0 —
  **inspiration only, no verbatim copy** (would drag the Apache-2.0 client
  boundary into copyleft; see `LICENSING.md`). 9ui MIT but 7 months stale.
  Magic UI / Kibo / Origin / Cult / Aceternity rejected (Radix-based or paid).

## Complex components — keep the fork's choices

| Need | Keep | Why |
|---|---|---|
| Data table | TanStack Table + shadcn `base/data-table` conventions | no data-fetching assumption; TanStack DB-safe |
| Kanban DnD | `@dnd-kit` | ecosystem standard; no Base UI DnD |
| Gantt / timeline | fork-owned | no credible free OSS gantt on Base UI |
| Command palette | `cmdk` | shadcn's own `base/command` uses it |
| Rich text | TipTap 3 | no Base UI editor |
| Date picker | `react-day-picker` 9 + shadcn `base/calendar` | no Base UI calendar |
| Toast | **Base UI Toast** (fork already wraps it); drop `sonner` | consolidate |
| Virtualised lists | `@tanstack/react-virtual` | orthogonal |

## Migration shape

Not a rewrite — a mop-up. Port `form.tsx` + `timeline.tsx` to Base UI
Field/Form + Collapsible; delete ~17 dead `@radix-ui/*` deps; optionally
re-pull drifted primitives from the shadcn base registry. Sub-day.

The real UI work is the **data layer**: 97 fetcher files and 130 imports of
the `hc<AppType>` Hono client become TanStack DB collections + Effect-API
mutations. **Pixels frozen, hooks rewritten.**

## Tokens

The fork's `index.css` is the shadcn token convention plus additive extensions
(`--warning`, `--success`, `--font-heading`). It stays verbatim for now.
Stellarc's canonical design system (`docs/design/DESIGN_SYSTEM.md`, IBM Plex,
2px quantum, 4/6/8 radii) is **not** applied in this phase; the token merge is
its own later ADR once the UI is unfrozen.

## Open

- `cn` from `@/lib/cn` vs the new `cn` package (`shadcn migrate cn`) — cosmetic, decide at scaffold.
- Base UI 1.6 → 1.8 bump: bundle with the form/timeline port.
