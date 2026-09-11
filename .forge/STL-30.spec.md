# STL-30 — T7b Rebrand frozen UI: Kaneo → Stellarc wordmark, logo, copy, i18n, public-board branding

Implementation spec. All paths relative to `/home/rpw/repos/stellarc-dev`. Only the orchestrator commits/merges/touches tracker or gate state.

## 1. Scope and premise audit

Replace every Kaneo-brand artifact in the lifted UI with the Stellarc identity from `docs/design/DESIGN_SYSTEM.md` (silver `#C9C9C9` monochrome accent, IBM Plex Sans/Mono, twin-peak monochrome mark, `Stellarc` wordmark), rename brand-bearing identifiers (imports, CSS classes, storage keys, DOM event names, header), introduce a `legacy-import` home for fork data-format values that must survive byte-identical for imported content, regenerate the 24 asserted Playwright baselines, and keep ADR 0009 landmark assertions green. No layout/spacing/colour-token/behaviour change.

Premise audit (code wins; audited against `forge/stl-14-c4` @ `83d69e2`, 2026-09-10):

- **STL-14 is still running** (`.forge/STL-14.json` last entry: implement, running, cycle 29, branch `forge/stl-14-c4`). `dev` has no `apps/`. "Blocked by #21" understates: this slice depends on the T0 merge (STL-14) plus #21's merged tree. All file facts below are from c4@83d69e2; **re-run the inventory grep at implementation start on the actual merged base** — sibling slices (esp. STL-17 worker/email copy) may have added Kaneo strings since.
- **"worker/API email templates" do not exist** at c4 (`grep -ri kaneo apps/stellarc-api apps/stellarc-worker` → 0; no email template files). Premise false for T0; becomes true only if STL-17's merge adds them → conditional scope (§5).
- **i18n catalogs are NOT in `apps/stellarc-ui/src`**: they live at repo root `i18n/` (18 locale JSONs + `resources.ts` + `schema.json`), outside the acceptance grep's `apps/ packages/` scope. They are still in scope by ticket text. `common.appName="Kaneo"` drives most rendered copy; key `breadcrumbKaneo` (2 modals) must itself be renamed (case-insensitive grep hits keys too).
- **The brand surface is far larger than "wordmark + copy"**: 593 case-insensitive `kaneo` matches across 206 UI files + `packages/contracts/src/legacy/libs/hono.ts`. Breakdown and ruling per class:
  - `@kaneo/libs` / `@kaneo/permissions` import specifiers in ~124 files are **vite aliases** (`apps/stellarc-ui/vite.config.ts` §resolve.alias) pointing into `packages/contracts/src/legacy/`; workspace pkgs are already `@stellarc/*`. Rename alias keys to `@stellarc/legacy-libs` / `@stellarc/legacy-permissions` (+ `@kaneo/api` type-only import in `hono.ts` → `@stellarc/legacy-api`) and rewrite import sites mechanically. Note: root `tsconfig.json` EXCLUDES `apps/stellarc-ui/**` and `legacy/**` — vite build is the checker, not tsc.
  - `kaneo-*` CSS classes (~40 editor/comment files + all of `src/index.css`) → `stellarc-*`, renamed in lockstep (pure renames, zero rule-body edits → pixel-neutral).
  - TipTap node names / markdown tags (`kaneoMention`, `kaneoIssueLink`, `<kaneo-mention …>`, `data-type="kaneo-embed"`, `kaneo-attachment[url]`) are a **persisted content format**: imported fork descriptions/comments contain these tags. Rename schema/serializer to `stellarc*` AND keep legacy tags parsing forever via one shared map (§5 CREATE `legacy-import/fork-identifiers.ts`). Old docs render unchanged; on edit+save they re-serialize to new tags (organic migration).
  - Task `source`/`createdFrom` union literal `"kaneo"` is a **fork wire/DB value** written by the importer → keep the literal, centralized in `legacy-import/fork-identifiers.ts` (`FORK_TASK_SOURCE_NATIVE = "kaneo"`); UI unions reference the constant. `label-source.ts` `?? "kaneo"` same treatment.
  - localStorage keys (`kaneo:board-filters:*`, `kaneo:board-sort:*`, `kaneo:board-group-by:*`, `kaneo:task-drawer-width`, `kaneo:repo-master-detail:*`, `kaneo-list-group-by`, `kaneo-public-view-mode`) — client-only, no users yet → rename inline to `stellarc:*`, no migration.
  - DOM event `kaneo:open-keyboard-shortcuts-help`, view name `kaneo-team-view`, `data-kaneo-turnstile` attr — self-referential internals → rename at all sites.
  - `X-Kaneo-Window-Id` header (`packages/contracts/src/legacy/libs/hono.ts`) — no consumer in stellarc-api/worker at c4 → rename to `X-Stellarc-Window-Id`. If a sibling slice introduced `X-Kaneo-Signature` (webhook signing) or reads the window-id header by the time this implements, rename both sides + their tests here (mechanical; flag in PR).
  - Env vars `KANEO_DEV_HTTPS` (vite.config.ts), `KANEO_API_URL` (vite-env.d.ts) → `STELLARC_DEV_HTTPS` / `STELLARC_API_URL` (only the declaration exists; `resolveApiBaseUrl` reads `VITE_API_URL`, untouched).
  - `allowedHosts: ["kaneo.entelechia.cloud", "kaneo.k3s.home"]` are **live dev hostnames**, not decoration. Parameterize: read `STELLARC_ALLOWED_HOSTS` (comma-separated, default empty). This is the one dev-workflow-visible change; document in PR.
  - `index.html`: plausible.kaneo.app analytics blocks, `canonical https://kaneo.app`, `og:image https://assets.kaneo.app/...` → **remove** analytics + canonical; **do not invent Stellarc URLs**; og:image drops to a local asset or is removed; title/meta become `Stellarc — the operator cockpit` (from the design anchor; reviewer may override the exact tagline string).
  - `constants/urls.ts` `isDemoMode` (checks `demo.kaneo.app`) → `false` constant; `demo-alert.tsx` and `version-display.tsx` external `usekaneo` links → plain text / no external link.
- **Referenced icons are missing**: `index.html` links `/favicon.svg` + `/apple-touch-icon.png`; `public/` contains only `logo-dark.svg`, `logo-light.svg`, `site.webmanifest`, `web-app-manifest-192/512.png`. The fork SVGs are fork brand → replace; **create** `favicon.svg` + `apple-touch-icon.png`; regenerate both PNGs from the new mark. `logo.tsx` keeps filenames (`logo-dark.svg` shown in light mode via `dark:hidden`), changes `alt="Kaneo"`→`alt="Stellarc"`.
- **Baselines**: 24 asserted PNGs (6 screens × 4 playwright projects) + 85 fork-provenance PNGs/manifests. Provenance is never regenerated (STL-14 ruling 5d-Q1). Only org-shell-class screens contain the sidebar Logo; title/meta are PNG-invisible. `kaneo-branding.tsx` consumers: `error-view.tsx`, `public-board.$boardId.tsx` (not asserted screens).
- **fork-manifest.json** (2 kaneo lines) is point-in-time provenance of the fork pin: never edited, never regenerated. No live-tree hash gate exists at c4; if one appears before implementation, brand-edited paths join its allowlist via the orchestrator — not silently.
- STL-26 owns design-token migration; this slice must NOT touch `index.css` rule bodies or tokens (class renames only).

**OUT of scope / owners:** layout, spacing, colour tokens, component behaviour — STL-15–21 as ticket states; design-token/`.ol-*` system application — STL-26 (T12); sync-transport hardening — STL-25; desktop/mobile shells — STL-22/23; schema-per-org — STL-24; public-board *function* — STL-16; analytics/telemetry for Stellarc (ADR 0010 unaffected — no OTel change here, only removal of fork plausible scripts); root `README.md`/docs brand copy — outside acceptance grep, unassigned (orchestrator to file); upstream-sync ergonomics (this rename intentionally diverges from fork file identity — cherry-picks get conflicts by design; note in PR only).

## 2. Tables, columns, events

None. No database table, column, migration, or event type is created or changed (`schema_version` n/a). This slice is UI/brand/identifier-only; the sync engine and event log are untouched.

## 3. HTTP API shape

No endpoint, request/response Schema, or error union changes (all owned by sibling slices). Single wire delta: the legacy hono client shim (`packages/contracts/src/legacy/libs/hono.ts`) sends `X-Stellarc-Window-Id` instead of `X-Kaneo-Window-Id`; e2e stubs match on method/path, not headers, so frozen specs are unaffected. Any header/type renames surfaced by the re-audit in sibling-owned api/worker code are renamed in the same PR with those slices' tests updated (reported, not hidden).

## 4. Sync shapes affected

None. No collection changes; no `sync_probe`-class additions. Regression risk on imported content is covered by the e2e legacy-tag round-trip (§7 T5), not by sync changes.

## 5. Files to CREATE / MODIFY

CREATE (each mirrors the stated existing file):
| File | Mirrors |
|---|---|
| `apps/stellarc-ui/src/components/public-board/stellarc-branding.tsx` | `apps/stellarc-ui/src/components/public-board/kaneo-branding.tsx` (same structure; `StellarcBranding`; plain `<span>` — no invented external href) |
| `apps/stellarc-ui/src/legacy-import/fork-identifiers.ts` | new; the designed home the acceptance grep's `legacy-import` filter anticipates. Exports: legacy TipTap selectors/tags (`kaneo-mention`, `kaneo-issue-link`, `kaneo-embed`, `kaneo-attachment`, `data-type` values), `FORK_TASK_SOURCE_NATIVE="kaneo"`, legacy storage-key prefixes (documentation only). This is the ONLY tree location allowed to contain the `kaneo` literal outside provenance |
| `apps/stellarc-ui/e2e/tools/generate-brand-assets.mts` | mirrors `e2e/tools/capture-fork-baselines.mts` harness style; renders the new mark/wordmark SVGs in chromium → writes `web-app-manifest-192x192.png`, `web-app-manifest-512x512.png`, `apple-touch-icon.png` (committed outputs) |
| `apps/stellarc-ui/public/logo-dark.svg`, `public/logo-light.svg` (replace), `public/favicon.svg` (new) | fork's `logo-{dark,light}.svg`; wordmark in Plex-style display face + monochrome twin-peak mark, silver ink for dark-mode variant — per DESIGN_SYSTEM §1/§8 |
| `tests/unit/rebrand-inventory.test.ts` | mirrors `tests/unit/foundation.test.ts` harness; node-env file-reading tests T1–T3, T7 (§7) |
| `apps/stellarc-ui/e2e/rebrand.spec.ts` | mirrors `e2e/frozen.spec.ts` (fixtures, per-project run); T4–T5 (§7) |

MODIFY (grouped; exact list re-derived by the §7 T1 grep at implementation start):
- `apps/stellarc-ui/index.html` — title/meta/og/canonical/plausible/apple-title/application-name per §1 rulings.
- `apps/stellarc-ui/public/site.webmanifest` — `name`/`short_name` → Stellarc; icons unchanged filenames.
- `apps/stellarc-ui/vite.config.ts` — alias keys → `@stellarc/legacy-libs` / `@stellarc/legacy-permissions`; `STELLARC_DEV_HTTPS`; `allowedHosts` ← `STELLARC_ALLOWED_HOSTS` env.
- `apps/stellarc-ui/src/vite-env.d.ts` — `STELLARC_API_URL`.
- `packages/contracts/src/legacy/libs/hono.ts` — `@stellarc/legacy-api` type import, `X-Stellarc-Window-Id`.
- ~124 import-site files (`@kaneo/*` → `@stellarc/*`) across `src/fetchers/**`, `src/components/**`, `src/hooks/**`.
- ~40 `src/components/task/**` + `src/components/activity/**` editor files: CSS classes `kaneo-*`→`stellarc-*`; TipTap node names/serializers → `stellarc*` with `parseHTML`/`parseMarkdown` rules consuming `legacy-import/fork-identifiers.ts` (both old and new tags parse; only new tags emit).
- `apps/stellarc-ui/src/index.css` — class-selector renames in lockstep; **no rule-body edits**.
- `src/components/common/logo.tsx` (alt), `src/constants/urls.ts` (`isDemoMode = false`), `src/components/demo-alert.tsx`, `src/components/version-display.tsx` (drop `usekaneo` links), `src/components/keyboard-shortcuts-help.tsx` (event name, all dispatch sites), `src/components/team/members-table.tsx` (`stellarc-team-view`), `src/components/task/label-source.ts` (legacy constant), `src/components/connections/*` + `shared/modals/*` + settings copy (brand strings), storage-key sites listed in §1.
- `src/components/public-board/error-view.tsx`, `src/routes/public-board.$boardId.tsx` — import `StellarcBranding`; DELETE `kaneo-branding.tsx`.
- `i18n/*.json` ×18 + `i18n/schema.json` — byte-exact edits: values with Kaneo → Stellarc phrasing; rename key `breadcrumbKaneo` → `breadcrumbBrand` (+ 2 tsx call sites). No reformat, no key-set changes otherwise.
- DELETE: `apps/stellarc-ui/src/components/public-board/kaneo-branding.tsx`.
- Baselines: regenerate the 24 `e2e/__screenshots__/{desktop,tablet,mobile,mobile-small}/*.png` (never `fork-provenance/`).

## 6. UI surfaces (pixel-frozen)

Asserted baseline screens that must keep rendering identically **except the legitimate brand delta** (sidebar Logo/wordmark pixels; nothing else may move): `sign-in`, `org-shell`, `projects`, `project-detail`, `repo-issues`, `repo-pull-detail` × {desktop 1440×900, tablet 1024×768, mobile 390×844, mobile-small 360×640}. Structural landmarks (ADR 0009) unchanged: sign-in Email textbox/Sign In button, org-shell Foundation Board cell/Progress columnheader, repo tabs, "New project" button, etc. Fork-provenance screens (kanban, list, inbox, calendar, gantt, members, developer, backlog) are reference-only and untouched. Reviewer diffs every regenerated PNG against this list — any non-logo pixel delta is a defect.

## 7. TEST PLAN

Reconciliation queries owned: **0 of 14** (no data/API change; the all-14 gate stays STL-21's).

| # | Case | RED condition (must fail before code exists) | Negative control (sabotage → red) |
|---|---|---|---|
| T1 | `tests/unit/rebrand-inventory.test.ts` replicates the acceptance pipeline over `apps/`+`packages/` (`-ri kaneo`, `--include=*.{ts,tsx,html,json,md}`, filter `fork-provenance`, `legacy-import`) → exactly `e2e/fork-manifest.json` lines remain | fails today: ~207 files/593+ matches | append one `Kaneo` string to any src file |
| T2 | same file: all 18 `i18n/*.json` parse, key-sets equal `en-US`, no `kaneo` (ci) in keys/values, `common.appName === "Stellarc"`, `schema.json` clean | fails today (`appName:"Kaneo"`) | revert one locale value to Kaneo |
| T3 | same file: `e2e/fork-manifest.json` + `__screenshots__/fork-provenance/manifest.json` byte-identical to pre-branch hashes (provenance immutability) | guard: must exist and match (fails if manifest absent/edited) | edit one byte of fork-manifest.json |
| T4 | `e2e/rebrand.spec.ts`: `document.title` starts `Stellarc`; visible logo `img[alt="Stellarc"]` resolves `/logo-dark.svg`; `site.webmanifest` name Stellarc; `/favicon.svg` 200 | fails today (title "Kaneo - …") | revert `index.html` title |
| T5 | same spec: fixture task description containing legacy `<kaneo-mention id label>` + `<kaneo-issue-link …>` renders mention chip/issue chip; open editor → save unedited → serialized markdown contains `stellarc-` tags only | fails today: editor emits `kaneo-` tags on save | delete the legacy `parseHTML` rule → chip-render assertion fails |
| T6 | existing `e2e/frozen.spec.ts` landmark assertions pass with regenerated baselines (roles/text identical pre/post rebrand) | fails pre-rebrand only if a landmark was brand-coupled (none are — verifies coupling absence) | change a landmark string in a component |
| T7 | unit: `site.webmanifest` icons exist with declared sizes, PNG magic bytes, `favicon.svg` present | fails today: `favicon.svg` missing | delete `favicon.svg` |
| T8 | full `bun run e2e` green on all four projects post-regen; pre-regen run (old baselines, new logo) must be RED on `org-shell` — proving baselines actually bite | pre-regen run red on org-shell is the RED proof | run with stale baselines → org-shell diff fails |

## 8. Suggested vertical build order

1. Land T1 inventory test first (RED on c4-derived base) — it is the worklist and the gate.
2. Brand assets: SVGs, `generate-brand-assets.mts` → PNGs/favicon/manifest; `logo.tsx` alt; `index.html` title. Run e2e desktop → regen desktop baselines → T4/T8 vertical slice green.
3. Copy sweep: `i18n` ×18 (+key rename + call sites), onboarding/settings copy, `urls.ts`, demo/version components.
4. Identifiers, mechanical waves with build+e2e after each: (a) vite aliases + 124 imports; (b) CSS classes + `index.css` lockstep; (c) storage keys, event names, env vars, `allowedHosts`, `hono.ts` header.
5. `legacy-import/fork-identifiers.ts` + TipTap renames + legacy dual-parse → T5.
6. `stellarc-branding.tsx` + public-board consumers + delete old file.
7. Regenerate all 24 baselines; full four-project e2e + unit suites; acceptance grep clean; PR note listing every legitimate pixel delta + the `allowedHosts` env change.
