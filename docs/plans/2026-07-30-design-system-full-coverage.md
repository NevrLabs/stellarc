# Stellarc Design System Full-Coverage Plan

> **For Hermes:** Execute through the resource-capped design-system swarm described below. Workers commit isolated slices; controller reviews, integrates, verifies, pushes, and deploys dev only.

**Goal:** Make Stellarc's design system and shadcn registry complete enough that every common UI interaction is implemented once, documented as an interactive Component Playground, and reusable by application Views without inventing ad-hoc controls or CSS.

**Architecture:** Keep `ui/src/components/ui/*` as source-owned shadcn/Base UI primitives, organized in docs by Foundations → Atoms → Molecules → Organisms → Templates → Pages. `DocsView` remains the catalog shell; playground implementations move out of the monolith into tier-specific modules and every playground owns controls matching its actual API. Application-specific organisms/templates compose primitives; Dockview, Xterm, Milkdown, CodeMirror, and force-graph remain third-party canvases.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind v4, shadcn `base-nova`, Base UI, TanStack Router/Query/Charts/Table/Virtual, Vitest, Playwright/Maestro.

---

## Scope and coverage contract

A registry component is **covered** only when all applicable rows are true:

1. Source-owned wrapper exists under `ui/src/components/ui/` and uses Stellarc semantic tokens.
2. Export/import is stable through `@/components/ui/<name>`.
3. Component Playground exists in its correct atomic tier.
4. Playground controls expose actual public states—not generic width/compact knobs.
5. Keyboard, focus-visible, disabled, invalid, loading/empty, overflow, and reduced-motion states are exercised where applicable.
6. At least one runnable interaction assertion exists for nontrivial behavior.
7. Desktop + narrow viewport screenshots are captured and vision-reviewed.
8. Registry manifest documents status: `available`, `covered`, `application-only`, or `native/third-party`.

## Canonical tiers

- **Foundations:** naming/hierarchy, themes/colors, typography, spacing, radius, motion, icons, accessibility.
- **Atoms:** button, badge, input, textarea, label, checkbox, switch, toggle, avatar, separator, skeleton, spinner, progress, marker, native controls, radio, slider, aspect ratio.
- **Molecules:** fields/input groups, select/combobox, tabs, card, table, dialog/alert dialog, popover, tooltip, dropdown/context/menubar/navigation menus, sheet/drawer, accordion/collapsible, breadcrumb, pagination, calendar/date inputs, OTP, carousel, hover card, toast/alert/empty/loading states.
- **Organisms:** command palette, data table, chart, page/panel header, session status, org/agent/node selectors, notification/status patterns, editable table/filter composition.
- **Templates:** single-panel View, panel-grid View, Panel with left/bottom/right Drawers and hidden/full/floating modes, auth/error/empty/loading templates.
- **Pages:** representative Sessions, Vaults, Projects, Fleet, Settings, Docs pages assembled only from covered layers.

## Phase 0 — Registry manifest and test harness

### Task 0.1: Generate machine-readable registry manifest

**Files:**
- Create: `ui/src/views/docs/registry.ts`
- Create: `ui/src/views/docs/registry.test.ts`
- Modify: `ui/src/views/docs/DocsView.tsx`

**Steps:**
1. Define one typed entry per component: slug, name, tier, source path, registry source, status, playground component, applicable state checklist.
2. Add one test asserting unique slugs, existing source files, canonical tier order, and every `covered` entry has a playground.
3. Render content and floating TOC from this manifest; remove the remaining parallel hand-maintained arrays.
4. Commit: `refactor(docs): drive catalog from registry manifest`.

### Task 0.2: Create reusable playground structure—not reusable state

**Files:**
- Create: `ui/src/views/docs/playgrounds/ComponentPlayground.tsx`
- Create: `ui/src/views/docs/playgrounds/controls.tsx`
- Create: `ui/src/views/docs/playgrounds/ComponentPlayground.test.tsx`

**Steps:**
1. Move structural `Preview | Configuration` shell out of `DocsView`.
2. Provide layout-only control rows (`ToggleControl`, `SelectControl`, `RangeControl`, `TextControl`) with labels and values; no assumed component state.
3. Test accessible region names and responsive stacking.
4. Commit: `refactor(docs): extract component playground shell`.

## Phase 1 — Foundation completeness

### Task 1.1: Finish foundation pages

**Files:**
- Create: `ui/src/views/docs/foundations/{Naming,Themes,Typography,Spacing,Radius,Motion,Icons,Accessibility}.tsx`
- Modify: `ui/src/views/docs/registry.ts`

**States/checks:** both themes, contrast, focus ring, reduced motion, keyboard/touch target rules, icon sizes/stroke, RTL readiness. Naming diagram must use View → Sidebar + Page → Viewport → Panel(s) → Content + Drawers.

**Commit:** `feat(docs): complete design-system foundations`.

## Phase 2 — Atom coverage

Separate work per independent family; no bulk registry install.

### Task 2.1: Feedback atoms

Split Progress / Spinner / Skeleton into independent playgrounds.

- Progress controls: value, max, indeterminate (only if wrapper supports it), size, semantic status, label visibility.
- Spinner controls: size, speed, accessible label, inline/block context, reduced motion.
- Skeleton controls: shape, width/height, count, density, text/avatar/card composition, motion on/off.

**Files:** `ui/src/views/docs/playgrounds/atoms/{Progress,Spinner,Skeleton}Playground.tsx` plus focused tests.

### Task 2.2: Form atoms

Install only missing official wrappers justified now: radio group and slider. Cover input/textarea/label/checkbox/switch/toggle/native-select.

Controls: type, value, placeholder, disabled, required, readOnly, invalid/error, min/max/step, checked/indeterminate, orientation where supported.

### Task 2.3: Identity/layout atoms

Cover avatar, badge, marker, separator, aspect ratio. Controls: fallback/image error, status/variant, orientation, decorative/semantic, ratio.

## Phase 3 — Molecule coverage

### Task 3.1: Select and combobox family

Keep existing Select Playground; add honest components as distinct implementations:
- Base UI single Select (normal + long scrolling list).
- Native select.
- Searchable Combobox using official Base UI/shadcn combobox/command composition.
- Multi-select composition with removal and keyboard behavior.

Controls: type, disabled, required, invalid, scrolling/options count, placement, selected values, clearable/searchable where supported. Add interaction tests for keyboard select, search filtering, multi-toggle, and disabled behavior.

### Task 3.2: Overlay family

Dialog, alert dialog, popover, tooltip, dropdown menu, context menu, hover card, sheet/drawer. Controls must match each: modal/nonmodal, side/alignment, destructive action, open state, delay, collision, drawer side/mode. Verify focus trap/restore and Escape.

### Task 3.3: Disclosure/navigation family

Tabs, accordion, collapsible, breadcrumb, pagination, navigation menu, menubar. Controls: orientation, activation mode, selection, disabled items, overflow, single/multiple disclosure.

### Task 3.4: Data-entry family

Field, InputGroup, OTP, calendar, date picker/date range (native date first unless richer current requirement proves necessary), phone input only if a real Stellarc need appears. No speculative dependency.

### Task 3.5: Feedback/content family

Card, table, alert, toast/sonner, empty state, loading state, carousel. Cover compact/comfortable table density, sticky header, overflow, loading/empty/error states.

## Phase 4 — Organisms

### Task 4.1: Data table organism

Use existing TanStack Table/Virtual dependencies. Cover sorting, filtering, column visibility, resizing, selection, pagination, virtual rows, loading/empty/error, keyboard row activation, narrow viewport.

### Task 4.2: Chart organism

Expand TanStack Charts playgrounds: line, bar, area, dots/sparkline; theme tokens, tooltip, keyboard focus, missing data, responsive size, loading/empty/error, dense-data strategy. No alternate chart library.

### Task 4.3: Command and selector organisms

Command palette, agent selector, node selector, organization selector. Cover searching, recent/empty, unavailable/disconnected, keyboard navigation, selected detail.

### Task 4.4: Status and notification organisms

StatusBar, SessionStatusPopover, connection status, semantic status badges, notification/toast patterns. Cover connected/degraded/offline, stale heartbeat, runtime held/not held, permission/input required.

## Phase 5 — Templates and representative pages

### Task 5.1: Panel/Drawer templates

Implement interactive docs template states only after reading actual Dockview split and drawer code:
- Single-panel Sessions View.
- Panel-grid Projects View.
- Panel Header + Content.
- Left/bottom/right Drawer.
- Drawer hidden/full/floating modes.
- StatusBar placement at View level.

### Task 5.2: Page states

Representative Page playgrounds for Sessions, Vaults, Projects, Fleet: loading, empty, populated, error, disconnected, permissions, long content, narrow viewport. Use MSW fixtures already present; do not duplicate production state logic.

## Phase 6 — Registry and application convergence

### Task 6.1: Drain legacy controls

Use the existing migration inventory; replace only call sites covered by approved playgrounds. Delete `.btn/.ibtn/.menu/.gtag/.ol-*` rules only after final usage reaches zero. Preserve third-party canvas CSS.

### Task 6.2: Registry verification command

Add `bun run design-system:check` that verifies manifest/source/playground parity and runs focused interaction tests. Add to `verify-ui` after it is stable.

### Task 6.3: Full visual acceptance

For every tier:
- desktop 1500×900;
- narrow/mobile;
- obsidian + light;
- keyboard path and focus visibility;
- reduced motion;
- extended catalog toggle;
- screenshot + vision review.

Commit proof under `docs/evidence/design-system/` only for durable overview matrices; do not commit hundreds of redundant screenshots.

## Swarm execution graph

**Resource cap:** one implementation worker at a time on Terminus; parallel work happens as read-only audits or isolated worktrees on fxcompute. Never allow multiple workers to dirty `~/stellarc-dev` because the service guard intentionally fails dirty trees.

1. **Wave A (parallel read-only, already dispatched):** official registry audit; ucollect-nexus dev-doc audit; Stellarc application-pattern audit.
2. **Wave B (controller):** merge audit findings into this plan; land Phase 0 registry manifest/harness.
3. **Wave C (parallel isolated worktrees):** Foundations; Atoms; Molecules. Each worker has a dedicated worktree from the Phase 0 commit and may commit but not push/deploy.
4. **Review gate:** independent reviewer checks immutable commits for manifest compliance, accessibility, token use, dependency restraint, and visual evidence.
5. **Integration:** controller cherry-picks dependency order, runs merged typecheck/tests/build/browser proof, then pushes `dev` by bundle relay.
6. **Wave D:** Organisms and Templates/Pages in isolated worktrees, then the same review/integration gate.
7. **Wave E:** legacy migration/deletion only after all target primitives are covered.

## Global acceptance

```bash
cd ui
bun run typecheck
bun test
bun run build
bun run test:e2e
bun run design-system:check
```

Runtime proof on fxcompute:

```bash
systemctl --user is-active stellarc-dev-axis stellarc-dev-orbit stellarc-dev-ui
curl -fsS http://127.0.0.1:8799/api/health
curl -fsS http://127.0.0.1:5177/docs >/dev/null
```

No production promotion until dev visual QA and explicit approval.
