# Recon: UI Component Strategy for Stellarc (fork @ /home/rpw/repos/kaneo)

Date: 2026-09-08. Read-only recon. Method: npm registry, base-ui.com docs, ui.shadcn.com docs/changelog, GitHub API (search + releases), raw package.json greps, direct file reads of the fork. Anything not proven is marked **UNVERIFIED**.

**Correction to operator premise:** the fork's web package.json pins `"@base-ui/react": "^1.6.0"` (apps/web/package.json). Upstream latest on npm is `@base-ui/react@1.8.0` (author: MUI Team; https://registry.npmjs.org/@base-ui/react/latest). The old name `@base-ui-components/react` is not what the fork uses — code wins.

---

## Q1 — Base UI status

- **Latest version:** `@base-ui/react@1.8.0` (npm registry, fetched 2026-09-08). Fork is on `^1.6.0`. basecn pins `@base-ui/react ^1.3.0` (Mar 2026) → cadence ≈ monthly minors (1.3 → 1.6 → 1.8 in ~6 months). Cadence claim is **approximate/inferred** from three datapoints.
- **1.0 stability:** the package is a stable 1.x line with SLSA provenance attestations (registry metadata). A specific "1.0.0 announcement" was **UNVERIFIED** (no changelog fetched).
- **Primitives that exist** (https://base-ui.com/react/components, fetched 2026-09-08 — 38 components): Accordion, Alert Dialog, Autocomplete, Avatar, Button, Checkbox, Checkbox Group, Collapsible, Combobox, Context Menu, Dialog, Drawer, Field, Fieldset, Form, Input, Menu, Menubar, Meter, Navigation Menu, Number Field, OTP Field, Popover, Preview Card, Progress, Radio, Scroll Area, Select, Separator, Slider, Switch, Tabs, **Toast**, Toggle, Toggle Group, Toolbar, Tooltip.
- **Still missing** (not in the docs index): **Date picker/Calendar** (→ react-day-picker), **Command palette** (→ cmdk / Autocomplete-adjacent), **Data grid / Table** primitive, Stepper, Floating labels, Tree. Toast, Combobox, Autocomplete, Menubar, Drawer all EXIST — the operator's worry list is mostly resolved upstream.

## Q2 — shadcn/ui on Base UI

- **Official and shipped.** ui.shadcn.com now serves a full Base UI docs tree at `/docs/components/base/*` — 65 entries including base/combobox, base/command, base/data-table, base/date-picker, base/calendar, base/toast, base/menubar, base/sheet, base/sidebar, base/drawer (fetched 2026-09-08, sidebar TOC of /docs).
- **CLI installs them:** the base/command page's install block is literally `pnpm dlx shadcn@latest add command` (https://ui.shadcn.com/docs/components/base/command) — the docs default to Base UI variants; no separate registry hop observed.
- **CLI currency:** latest release `shadcn@4.21.0`, 2026-09-04 (https://api.github.com/repos/shadcn-ui/ui/releases/latest). Sept-2026 changelog: all registry components now import `cn` from the new **`cn` package**; `shadcn migrate cn` codemod exists (https://ui.shadcn.com/docs/changelog).
- The terms `--base` flag and "base-nova" style: **UNVERIFIED** — not found on the pages I fetched. Evidence supports "base is the docs default + `add <component>`".
- shadcn base/command still wraps **cmdk** ("The `<Command />` component uses the `cmdk` component", same URL).

## Q3 — Ready-made libraries (Tailwind v4-native ruling applied)

| Library | License | Base UI today? | Components | Tailwind v4 | Styling mechanism | Stars | Last push | Verdict |
|---|---|---|---|---|---|---|---|---|
| **shadcn/ui base set** (shadcn-ui/ui) | MIT (registry code) | ✅ docs default | ~65 (`/docs/components/base`) | ✅ | Tailwind v4 + `cn` pkg (twMerge+clsx), cva, data-slot | (CLI repo, stars n/a) | 2026-09-04 | **Primary** |
| **coss.com/ui** (cosscom/coss) | **AGPL-3.0** | ✅ (docs component set mirrors Base UI primitives: Number Field, OTP Field, Preview Card…) — dep file not directly read | ~40 (coss.com/ui/docs) | ✅ | Tailwind v4, cva, `cn` | ★10,558 | 2026-09-08 (active) | Use selectively; **AGPL contamination check** before copying |
| **basecn** (akash3444/basecn) | MIT | ✅ **verified**: root package.json has `"@base-ui/react": "^1.3.0"`, `"tailwindcss": "^4.1.11"` | shadcn-shaped set (small) | ✅ | Tailwind v4 + cva + tailwind-merge | ★283 | 2026-03-14 (5 mo stale) | Good reference for Radix→Base diffs |
| **9ui** (borabaloglu/9ui) | MIT | ✅ per 9ui.dev/docs ("built with Base UI and Tailwind CSS"); root package.json dep grep empty (copy-paste registry, no npm pkg) | ~30 | ✅ | Tailwind v4, cva conventions | ★666 | 2026-02-06 (7 mo stale) | Optional source of patterns |
| **Animate UI** (animate-ui.com) | MIT **UNVERIFIED** (repo not located) | Partial ✅ — docs: "Multi-primitive support: …(Radix UI, Base UI, Headless UI)" | ~100 animated | ✅ | Tailwind v4 + Motion (framer-motion successor) | n/a | n/a | Use for motion presets only |
| Magic UI (magicuidesign/magicui) | MIT | ❌ shadcn/Radix-based | ~180 | ✅ | Tailwind v4 + Motion + cva | ★22,219 | 2026-09-08 | **Rejected** (not Base UI) |
| Kibo UI (shadcnblocks/kibo) | MIT | ❌ shadcn registry (dep grep empty for @base-ui) | ~40 custom (kanban, file-tree, gantt-ish) | ✅ | Tailwind v4 + shadcn conventions | ★3,928 | 2026-05-04 | **Rejected** as base layer; peek at patterns |
| Origin UI | MIT **UNVERIFIED** (repo not located via API) | ❌ Tailwind-only components, not Base UI | ~400 | ✅ | Tailwind v4 classes | n/a | n/a | **Rejected** (not Base UI) |
| ReUI | open-core (free tier) **UNVERIFIED** | ❌/❓ shadcn-based, no Base UI evidence found | free+pro | ✅ | Tailwind v4 + cva | n/a | n/a | **Rejected** (paid tier + no Base UI proof) |
| Cult UI | MIT **UNVERIFIED** | ❌ shadcn/Radix | ~30 | ✅ | Tailwind v4 + cva | n/a | n/a | **Rejected** |
| Aceternity UI | Free + **Pro** | ❌ Tailwind + Framer, not Base UI | ~100 | ✅ | Tailwind v4 + Motion | n/a | n/a | **Rejected** (paid tier, wrong primitive) |
| daisyUI (incidental hit) | MIT | ❌ CSS-class framework, not cva/merge conventions | many | ✅ | CSS classes, no tailwind-merge | ★42,328 | active | **Rejected** (convention mismatch) |

Verification note: Base UI targeting was checked via package.json greps (basecn ✅) or docs statements (9ui, Animate UI); coss dep file wasn't read directly — its docs component names match Base UI's primitive set 1:1, which is strong but not proof. Marked accordingly.

## Q4 — Complex components

| Need | Fork has today | Keep/replace | Recommended option | Why |
|---|---|---|---|---|
| Data table | TanStack Table-based data-table components dir | **Keep** | TanStack Table + shadcn base data-table conventions | shadcn base/data-table is exactly TanStack Table + styling; no data-fetching assumptions (TanStack DB-safe) |
| Kanban DnD | @dnd-kit/core 6.3.1 (+sortable, modifiers) | **Keep** | @dnd-kit | shadcn ecosystem standard; no Base UI DnD exists |
| Gantt/timeline | custom gantt + timeline.tsx | **Keep** (timeline is 1 of 2 Radix stragglers → port to Base UI Collapsible/Dialog or leave) | fork-owned | No credible free OSS gantt on Base UI found (Kibo's gantt demos are showcase-level) |
| Command palette | cmdk 1.1.1 command.tsx | **Keep** | cmdk (shadcn base/command uses cmdk) | Verified above; Base UI Autocomplete is close but cmdk is the convention |
| Rich text | TipTap 3.28 suite | **Keep** | TipTap | No Base UI editor; TipTap is unstyled-friendly |
| Date picker | react-day-picker 9.14.0 (exact pin) + calendar.tsx | **Keep** | react-day-picker 9 + shadcn base/calendar wrapper | Base UI has no calendar primitive |
| Toast | toast.tsx on Base UI Toast + sonner ^2.0.6 both present | **Consolidate → Base UI Toast** (already done in toast.tsx); keep sonner only if promise-API convenience is wanted | Base UI Toast | Base UI Toast shipped; fork already wraps it (`Toast.createToastManager()`) |
| Virtualised lists | @tanstack/react-virtual 3.14.9 | **Keep** | @tanstack/react-virtual | Orthogonal to primitives; no assumption conflict |
| Radix residue | ~17 `@radix-ui/*` deps in apps/web/package.json; only timeline.tsx + form.tsx still import Radix | **Remove** deps after porting those 2 files | Base UI Field/Form; timeline → keep or rebuild | Dead weight + audit noise |

## Q5 — Fork reuse audit (8 sampled from apps/web/src/components/ui)

| File | Class | Evidence (imports + pattern) |
|---|---|---|
| button.tsx | (a) shadcn/coss-Base-UI-shaped, reusable as-is | `import { mergeProps } from "@base-ui/react/merge-props"; import { useRender } from "@base-ui/react/use-render"; import { cva, type VariantProps } from "class-variance-authority";` + `data-pressed:scale-[0.97]`, `pointer-coarse:after:size-full` |
| tabs.tsx | (a) minimal, matches shadcn base tabs | `import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";` + `data-slot="tabs"`, `TabsPrimitive.List.Props` variant `"default" | "underline"` |
| select.tsx | (a/b) coss-style cva sizes; aligns with shadcn base select conventions | `import { Select as SelectPrimitive } from "@base-ui/react/select";` + `selectTriggerVariants = cva("... rounded-lg border border-input bg-background ... data-disabled:opacity-64")` |
| menu.tsx | (b) needs tiny re-alignment: keeps an `asChild` compat shim over Base UI `render` | `import { Menu as MenuPrimitive } from "@base-ui/react/menu";` … `const resolvedRender = asChild && React.isValidElement(children) ? children : render;` |
| dialog.tsx | (c) fork-custom: i18n close label, createHandle, asChild shim | `import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";` … `const DialogCreateHandle = DialogPrimitive.createHandle;` + `import { i18n } from "@/lib/i18n";` |
| combobox.tsx | (c) fork-custom chips/multi wrapper on the Base UI primitive — keep | `import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";` + `ComboboxContext` with `chipsRef`, `multiple` |
| sidebar.tsx | (c) fork-specific (cookie state, i18n, nav-* wiring) — keep as-is | `const SIDEBAR_COOKIE_NAME = "sidebar_state";` + `import { useTranslation } from "react-i18next";` + Sheet/Tooltip from Base UI |
| toast.tsx | (c) fork wrapper over Base UI Toast — keep | `import { Toast } from "@base-ui/react/toast";` + `const toastManager = Toast.createToastManager();` + TOAST_ICONS map |

Common denominators: `cn` from `@/lib/cn`, `data-slot` attributes, cva variants, lucide icons — i.e., **the fork already speaks the shadcn-base/coss dialect**.

## Q6 — Migration cost ("adopt shadcn base conventions")

Shape: **not a rewrite — a mop-up.**
- 43/65 primitives already on `@base-ui/react` (verified via import grep; specifiers incl. `/merge-props` ×10, `/use-render` ×9, `/dialog`, `/toggle`, `/field`, `/toast`, `/tabs`, …).
- Files that actually change: `timeline.tsx` and `form.tsx` (the 2 Radix stragglers) — port to Base UI Field/Form + Collapsible; small.
- `apps/web/package.json`: drop ~17 unused `@radix-ui/*` entries (currently all still declared).
- `cn` alignment: shadcn now emits `import { cn } from "cn"` (cn package). Fork uses `@/lib/cn` — either keep (works fine; it's a 2-line module) or run `shadcn migrate cn` and alias. Cosmetic.
- Optional: re-pull any primitive from `/r` base registry where the fork drifted (button/tabs/select are near-identical already). Estimate: **2 files ported + 17 dep removals + 0 rewrites**. Sub-day of mechanical work plus gate time.

## Q7 — Theming / token compatibility

Fork `apps/web/src/index.css` defines `@theme`-style vars including `--color-warning`, `--color-success`, `--color-secondary(-foreground)`, `--font-sans/heading/mono`, `--ease-*`, `--animate-skeleton` (grepped 2026-09-08). shadcn base components consume the shadcn token set (`--background`, `--foreground`, `--primary`, `--sidebar`, `--ring`, `--input`, `--radius`…). Since the fork's tokens are the shadcn convention **plus extensions**, keeping `index.css` verbatim is compatible; what breaks is only if a pasted component references a token the fork lacks (e.g. `--chart-*` for base/chart, `--sidebar-*` group vars if sidebar components are re-pulled). Rule: paste component → check its `--theme()`/`bg-background`-class token usage against index.css; add missing vars, never rename. No breakage expected from the fork's custom `--warning/--success/--font-heading` additions (they're additive). Specific `--chart-*` presence in fork index.css: **UNVERIFIED** (only first 12 tokens grepped).

## Recommendation (≤150 words)

Adopt **"shadcn base variants + fork primitives, no third kit."** The fork's 43 Base UI primitives are already shadcn-base/coss-shaped (cn, cva, data-slot), Base UI is stable at 1.8.0, and shadcn's docs default to Base UI with plain `shadcn add`. Migration is a mop-up: port `form.tsx` + `timeline.tsx` to Base UI, delete ~17 unused `@radix-ui/*` deps, optionally re-pull drifted primitives from the base registry. Reach for **basecn** (MIT, deps-verified Base UI) as a Radix→Base diff reference, **Animate UI** for motion presets, and treat **coss.com/ui** as inspiration only — it's AGPL-3.0, so copy nothing verbatim unless license counsel approves. Keep cmdk, @dnd-kit, TipTap, react-day-picker, TanStack virtual/table; consolidate toast on Base UI Toast.

## Open questions for the operator

1. Is AGPL-3.0 (coss.com/ui) acceptable for verbatim copies, or inspiration-only? (Kaneo root package.json carries no license field — fork licensing itself **UNVERIFIED**.)
2. Should `cn` move to the `cn` package (`shadcn migrate cn`) or keep `@/lib/cn`?
3. Base UI 1.6.0 → 1.8.0 upgrade window: bundle with the form/timeline port or separate ticket?
4. sonner: keep alongside Base UI Toast or delete (promise-toasts usage audit needed)?
5. Is "base-nova" an internal name you've seen elsewhere? Not found in current shadcn docs — confirm which registry/style tag you meant.
6. Chart components (base/chart) — needed? Fork chart-token presence unverified.
