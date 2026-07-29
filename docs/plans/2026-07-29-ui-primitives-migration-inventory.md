# Olympus UI primitives migration inventory

Scope: `ui/` only. No Hall/Envoy Rust touched. Goal is to stop carrying two UI vocabularies: the canonical shadcn-style wrappers in `ui/src/components/ui/*` plus the older native/class-only controls in `ui/src/index.css`.

## Current primitive sources

- React wrappers: `ui/src/components/ui/` (`button`, `input`, `textarea`, `badge`, `card`, `dialog`, `dropdown-menu`, `label`, `scroll-area`, `select`, `separator`, `sheet`, `skeleton`, `table`, `tabs`, `tooltip`). They are Radix/shadcn-shaped where accessibility needs JS: dialog, dropdown menu, select, tabs, tooltip, scroll area.
- Primitive CSS: `ui/src/design/styles/components.css`. Canonical classes are `.ol-*`; all use design tokens.
- App/view CSS: `ui/src/index.css`. It still owns shell layout and many legacy component classes: `.btn`, `.newbtn`, `.icobtn`, `.chip`, `.navitem`, `.gtag`, `.gcard`, `.stat`, `.menu`, `.mi`, `.send`, `.bp-tab`, `.dtab`, vault-specific controls.
- Design tokens: `ui/src/design/tokens/*.css`, imported by `ui/src/design/styles.css`, then `ui/src/index.css` in `ui/src/main.tsx`.
- Token aliases: `ui/src/index.css:16-35` maps legacy names (`--silver`, `--green`, `--amber`, `--red`, `--sans`, `--mono`, etc.) to canonical names (`--accent`, `--ok`, `--warn`, `--err`, `--font-sans`, `--font-mono`). Keep aliases during migration; new code should use canonical tokens.
- Focus behavior: canonical primitives use `:focus-visible` with `--ring`/`--ring-offset` in `components.css` (`.ol-btn`, `.ol-iconbtn`, `.ol-select-trigger`, `.ol-check`, `.ol-switch`, `.ol-card-interactive`, `.ol-tab`). Several legacy classes only hover or use border focus and should disappear with their call sites.

## Existing shared wrapper call sites

Already migrated enough to reuse; do not invent another layer.

| Primitive | Call sites |
| --- | --- |
| `Button` | `ui/src/AppShell.tsx`, `ui/src/views/sessions/components/SessionSidebar.tsx`, `BottomPanel.tsx`, `AgentPicker.tsx`, `ForkModal.tsx`, `HistoryPage.tsx`, `ui/src/views/vaults/components/VaultDialogs.tsx`, `NoteActionDialogs.tsx` |
| `Input` | `BottomPanel.tsx`, `HistoryPage.tsx`, `VaultDialogs.tsx`, `NoteActionDialogs.tsx` |
| `Dialog` | `AgentPicker.tsx`, `ForkModal.tsx`, `VaultDialogs.tsx`, `NoteActionDialogs.tsx` |
| `Badge` | `AgentPicker.tsx`, `HistoryPage.tsx`; semantic shell `Badge` wrapper in `ui/src/components/shell.tsx` |
| `Table` | `HistoryPage.tsx` |
| `Tabs` | `BottomPanel.tsx` |
| `ScrollArea` | `SessionSidebar.tsx`, `AgentPicker.tsx` |
| `Separator` | `AppShell.tsx` |

## Migrate first: highest-frequency duplicated controls

### 1. Buttons and icon buttons

Decision: migrate to `Button` from `ui/src/components/ui/button.tsx`. Use `variant="primary"` for `.btn.pri`/`.newbtn`/`.send`, `variant="ghost" size="icon"` for `.icobtn`/small toolbar buttons, `variant="danger"` for destructive actions.

Call sites:
- `ui/src/AppShell.tsx:111`, `145` (`.icobtn`); `153` (`.profile`, retain as avatar/sign-out until profile component exists).
- `ui/src/views/FleetView.tsx:136` (`.newbtn`), `210`, `392`, `469`, `711`, `758` (`.icobtn`), `482`, `492`, `505` (`.btn`).
- `ui/src/views/SessionsView.tsx:212`, `239`, `247` (`.icobtn`).
- `ui/src/views/sessions/components/BottomPanel.tsx:204` (`.icobtn`).
- `ui/src/views/sessions/pages/HistoryPage.tsx:168` (`Button` plus legacy `.btn hist-more`; drop `.btn`).
- `ui/src/views/sessions/pages/ChatPage.tsx:670`, `678`, `695` (`.btn`, `.btn pri`).
- `ui/src/views/VaultWorkspaceView.tsx:177` (`.btn pri`).
- `ui/src/views/vaults/editor/VaultMarkdownEditor.tsx:59`, `149` (`.btn pri`), `60`, `61`, `62`, `150`, `189` (`.vault-toolbar-button`).
- `ui/src/views/vaults/components/VaultSidebar.tsx:101`, `102`, `156`, `187`, `192` (vault buttons; keep file-tree layout classes, migrate button chrome only).
- `ui/src/views/vaults/components/VaultWorkspace.tsx:93`, `97`, `174` (tab/layout buttons; migrate chrome only after tab decision below).

Superseded after migration: `.btn`, `.btn.pri`, `.btn.danger`, `.newbtn`, `.icobtn`, `.send`, `.plusbtn`, `.vault-toolbar-button`, most standalone hover/focus rules for those selectors in `ui/src/index.css`.

Risk: `Button size="icon"` applies 26x26 dimensions. Some call sites intentionally use 14-22px controls (`FleetView.tsx:210`, tab close buttons). Use `className` only for size override, not a new primitive.

### 2. Menus and popovers

Decision: migrate action menus to `DropdownMenu` from `ui/src/components/ui/dropdown-menu.tsx`; this already maps to `.ol-menu`/`.ol-menu-item` and gives keyboard/focus handling. Do not build another menu manager.

Call sites:
- `ui/src/views/sessions/components/Composer.tsx:142-167` plus menu and `:153`, `.mi` at `154`, `158`, `162`.
- `ui/src/views/sessions/components/Composer.tsx:173-232`, model/thinking menu `.modelpill`, `.menu selpop`, `.mi`.
- `ui/src/views/vaults/components/VaultSidebar.tsx:80-96`, vault selector menu.
- `ui/src/views/vaults/components/VaultSidebar.tsx:101-115`, create menu.
- `ui/src/views/vaults/components/VaultSidebar.tsx:140-150`, context menu. Keep fixed x/y positioning or defer; Radix dropdown can replace trigger menus first.
- `ui/src/views/vaults/editor/VaultMarkdownEditor.tsx:62-68`, note actions menu.

Superseded after migration: `.menu`, `.mi`, `.mi.on`, `.mi.danger`, `.selpop`, `.pluspop`, `.vault-popup`, `.vault-create-popup`, `.vault-note-menu` where no longer used. Keep `.vault-context-menu` only if fixed-position context menu is not migrated in the first pass.

Risk: Composer currently closes on outside click with local refs (`Composer.tsx:103-116`). Radix removes that code. Preserve disabled/selected checkmarks and avoid changing send/stop behavior in the same patch.

### 3. Badges, status pills, chips

Decision: migrate status labels to `Badge` from `ui/src/components/shell.tsx` when semantic (`running`, `failed`, etc.) and `ui/src/components/ui/badge.tsx` for literal visual variants. Keep plain text when color is decorative only.

Call sites:
- `ui/src/components/shell.tsx:61-67` (`StatPill` still emits `.stat`), `128-130` semantic `Badge` already wraps UI `Badge`.
- `ui/src/views/SessionsView.tsx:221` (`.proj-badge`), `229` (`.live`), `235` (`.gtag ok`).
- `ui/src/views/ProjectsView.tsx:98`, `103` (`.gtag`).
- `ui/src/views/PlaceholderViews.tsx:46` (`.gtag`).
- `ui/src/views/FleetView.tsx:312`, `538` (`.gtag`), `656` (`.live`).
- `ui/src/views/projects/components/KanbanCard.tsx:55`; `CardDetailPanel.tsx:44`, `82`, `98`; `statusUtils.ts:7`.
- `ui/src/AppShell.tsx:126` (`.chip` layout surface selector) should become `Button variant="ghost"` or a small local shell chip only if visual parity requires it.

Superseded after migration: `.gtag`, `.gtag.ok/.warn/.err`, `.proj-badge`, `.live`, `.chip` unless shell layout still needs the chip shape.

Risk: color must not be the only signal. Existing `Badge` preserves label text; use it rather than re-coding status class maps.

### 4. Cards, stats, progress, switches

Decision: migrate broad cards to `Card`; stats to `.ol-stat`/a tiny updated `StatPill`; progress bars to `.ol-bar`; switches/checks to native inputs styled by existing `.ol-check`/`.ol-switch` CSS only when the interaction exists.

Call sites:
- `ui/src/views/FleetView.tsx:290`, `363`, `528`, `546`, `568` (`.gcard`).
- `ui/src/components/shell.tsx:61-67` and `ui/src/views/sessions/pages/UsagePage.tsx:44`, `48`, `52` (`.stat`).
- `ui/src/index.css:427-434`: `.gbar`, `.gsw` generic progress/switch classes.
- `ui/src/views/projects/*` board columns/cards use `.col`, `.kcard`; leave until projects view is explicitly standardized.

Superseded after migration: `.gcard`, `.stat`, `.gbar`, `.gsw` if no longer referenced.

Risk: `.gcard.click:hover` has a small lift. `Card` supports `.ol-card-interactive`; use that class instead of recreating transitions.

### 5. Inputs, selects, tables, tabs

Decision: use existing wrappers where they add value; native is fine where the browser gives the right UX cheaply.

Call sites:
- `HistoryPage.tsx:91-97` already uses `Input`; `102-113` and `197-209` are native `<select>` filters. Retain native selects for dense filters unless keyboard/a11y testing shows Radix select is needed; `.ol-select` exists for native select styling.
- `VaultDialogs.tsx:71` disabled backend `<select className="ol-select">`: retain native; disabled one-option select does not need Radix.
- `TablesPage.tsx:131` and `VaultTablePage.tsx:55` native tables with `.hist-table`; migrate to `Table` only when touching those views for table work.
- `BottomPanel.tsx:196` uses `Tabs` wrapper plus legacy `.bp-tab`; migrate class to `.ol-tab`/active data-state once BottomPanel tabs are cleaned.
- `VaultWorkspace.tsx:92-98` vault tabs are workspace document tabs, not Radix tabs. Retain local structure; only migrate button chrome/focus.

Superseded after migration: `.hist-select` may stay as native select class or be folded into `.ol-select`; `.hist-table` stays for layout specifics unless `Table` covers it; `.bp-tab` can be deleted after BottomPanel uses wrapper styling only.

## Retain / do not migrate

- Dockview-style vault workspace panes and resizers: `ui/src/views/vaults/components/VaultWorkspace.tsx`, CSS `ui/src/index.css:754-783`. No Dockview package is installed; this is local pane chrome. Keep native/custom because layout/resizing is domain-specific.
- Xterm: no current `xterm` dependency or `xterm` source call site found in `ui/package.json` or `ui/src`; if added later, keep the terminal surface native/library-owned.
- Milkdown: `ui/src/views/vaults/editor/MilkdownRichEditor.tsx`; retain library DOM and editor-specific classes.
- CodeMirror: `ui/src/views/vaults/editor/VaultMarkdownEditor.tsx:160-168`; retain CodeMirror component and editor decorations. Only toolbar buttons around it should migrate.
- Force graph: `ui/src/views/vaults/pages/GraphPage.tsx`; retain `react-force-graph-2d` canvas rendering and inline canvas colors until a graph-specific token helper exists. Do not wrap graph nodes as UI primitives.
- Native controls preferable:
  - simple form inputs/password fields in `ui/src/auth.tsx:183-194` already use `.ol-input`/`.ol-btn` classes directly; no wrapper needed unless auth is converted to component imports for consistency.
  - simple one-option/disabled selects (`VaultDialogs.tsx:71`) and dense filter selects (`HistoryPage.tsx`) can remain native with `.ol-select`/`.hist-select`.
  - file/tree rows in `VaultSidebar.tsx:185-193` should remain native buttons with tree ARIA; shared primitive can style chrome but should not abstract tree behavior.

## CSS deletion checklist after call sites move

Delete only when `rg` confirms zero TSX use:

- Buttons: `.btn`, `.newbtn`, `.icobtn`, `.send`, `.plusbtn`, `.vault-toolbar-button`.
- Menus: `.menu`, `.mi`, `.selpop`, `.pluspop`, `.vault-popup`, `.vault-create-popup`, `.vault-note-menu`; keep `.vault-context-menu` until context menu is migrated.
- Badges/chips: `.gtag`, `.proj-badge`, `.live`, `.chip`.
- Cards/stats/progress/switch: `.gcard`, `.stat`, `.gbar`, `.gsw`.
- Tabs: `.bp-tab` after BottomPanel, `.dtab` only after detail tabs are audited, never as a blanket delete.
- Alias tokens in `index.css:16-35`: delete last, only after app/view CSS no longer references `--silver`, `--green`, `--amber`, `--red`, `--chrome`, `--elev`, `--dim`, `--faint`, `--sans`, `--mono`.
- Raw color fallbacks to clean while nearby: `ui/src/index.css:226`, `382-385`, `418`; `BottomPanel.tsx:314-316`; `lib/format.ts:34-42` should use source hue tokens; `GraphPage.tsx` can wait because canvas colors are graph-local.

## Incremental order

1. Button/icon-button sweep in shell, Fleet, Sessions, Chat, Vault editor toolbar. Smallest diff, highest duplicate count.
2. DropdownMenu sweep for Composer and VaultSidebar trigger menus. Leave fixed-position context menu for a second pass if it fights Radix positioning.
3. Badge/chip sweep: replace `.gtag`, `.proj-badge`, `.live`, and `StatPill` emissions with existing shared primitives.
4. Card/stat/progress cleanup in Fleet and Usage pages.
5. Tables/tabs cleanup only where wrappers already exist: BottomPanel tabs, Vault table pages if touched.
6. CSS prune pass using `rg` after each migration group; delete only unused classes, no speculative CSS rewrites.

## Regression risks to test

- Dialog stacking and focus trap: AgentPicker, ForkModal, Vault create/new/rename/delete dialogs.
- Composer: Enter-to-send/steer, stop button, queue-add button, model/thinking selection, outside-click close.
- Vault sidebar: keyboard access to vault/create/context menus, tree open/close, details dialog, disabled planned item types.
- History filters: native select behavior, search input, archived checkbox, show-more button.
- Mobile `@media (max-width: 820px)`: sidebar overlay, dialogs within viewport, no horizontal overflow.
- Theme parity: obsidian and light tokens; no new raw hex outside token files unless library/canvas owned.
