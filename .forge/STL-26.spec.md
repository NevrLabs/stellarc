# STL-26 — T12 Design-token migration: fork @theme → Stellarc DESIGN_SYSTEM canon (lifts the pixel freeze)

## 1. Scope and premise audit

Remap the lifted Kaneo-fork UI's Tailwind v4 token layer — `@theme inline`, `:root`, `.dark`, `@font-face` in `apps/stellarc-ui/src/index.css` — onto the Stellarc design canon (`docs/design/DESIGN_SYSTEM.md`): self-hosted **IBM Plex Sans/Mono** replacing Cal Sans/Paper Mono, **radius scale 3/4/6/8px** replacing the 10px-derived scale, the **2px-quantum `--space-*` scale** (incl. half-steps) as first-class tokens, and the **canonical color tokens (`--bg`, `--bg-elev`, `--accent`, status `--ok/--warn/--err` + derivatives)** defined per-theme, with the existing shadcn vocabulary (`--background`, `--card`, `--primary`, …) remapped onto them as an alias shim so every frozen `.tsx` utility call-site compiles unchanged — **zero `.ts/.tsx` source edits**. The pixel freeze lifts here: all Playwright screenshot baselines are regenerated **deliberately, once, with evidence**, while landmark/structural assertions stay green. A11y contrast gates (token-level WCAG math + axe scan) must pass in **both themes**. Ships ADR 0011 (the token-merge ADR ADR 0008 §Tokens deferred) and a DESIGN_SYSTEM.md changelog entry. No backend, API, DB, sync, or event changes of any kind.

Premise audit (code wins; discrepancies reported):

1. **"remap Tailwind @theme"** — confirmed mechanism: fork `index.css` is Tailwind v4 CSS-first (`@import "tailwindcss"`, `@theme inline`, `@custom-variant dark`), byte-identical between `/home/rpw/repos/kaneo` at pin `2504e645` and the v2 lift. But theming is driven by **`.light`/`.dark` classes** applied by the frozen `theme-provider` + `user-preferences` store (default theme `"dark"`), **not** v1's `[data-theme]` attribute. Canonical tokens therefore ship as `:root` (daybreak) + `.dark` (obsidian) blocks; the `data-theme` convention from DESIGN_SYSTEM §1 is **not** portable without editing frozen TS. Deviation recorded in ADR 0011. Theme persistence key stays the fork's (`user-preferences`), not v1's `stellarc-theme`.
2. **The fork palette already *is* the Stellarc palette** (b9a1b0e lineage) under shadcn names: `--background #f6f6f7/#0a0a0b`, `--primary` light `#2a2a2e` / dark `#c9c9c9` (ink/silver), `--border #e2e2e5/#262629`, `--muted-foreground #5d5d60/#999a9c` = Stellarc `--text-dim`, `--success/--warning/--destructive` = `--ok/--warn/--err` values. The migration is **canonicalization + gap-filling**, not re-hueing: the fork set lacks `--bg-elev/--bg-elev-2/--bg-hover/--bg-active/--border-strong/--border-faint`, the accent derivative ladder (`--accent-bright/-press/-ink/--on-accent`, `--accent-subtle/-wash/-wash-2/-line/-glow`), and status `-ink/-wash/-line` derivatives. Baseline pixel deltas will come mainly from fonts, radii, and these gaps.
3. **"2px quantum" cannot mean rebasing Tailwind's utility grid.** Fork TSX is authored on the default 4px spacing multiplier; setting `--spacing: 0.125rem` would compress every `p-*`/`gap-*` ~50% — a layout re-authoring project, not a token remap. Ruling (flagged for orchestrator): land the `--space-0…--space-32` + half-step scale as tokens available to CSS and future work; **leave the utility multiplier unchanged**, guarded by test T04. Same ruling for type: `--fs-*`/`--fw-*`/`--lh-*`/`--tracking-*` land as tokens; Tailwind text utilities are not rebased.
4. **Fonts**: fork ships Cal Sans UI/Heading + Paper Mono woff2 (3 files). v1 loads IBM Plex via **Google Fonts `@import`** (network) — inapplicable for a desktop/mobile target (ADR 0009 platforms, offline builds). v2 **self-hosts** IBM Plex Sans + Mono woff2 (OFL), exactly the swap v1's `fonts.css` header anticipates. `--font-heading` keeps its name, repointed to IBM Plex Sans 600 (Stellarc has no separate display face).
5. **"Blocked by #21, #22"** — both are `spec: pass`, not yet merged. Implement gate requires both **merged**: STL-21 owns the final parity gate whose baselines must be stable before this ticket regenerates them; STL-22's UI-purity check must already be in `dev` so this slice's deliberate CSS diff is the only UI change after it. This checkout holds docs + `tools/forge` only; all paths rebind to merged code at implement start (standing ruling from STL-20/21/22).
6. **"DoD: ADR 0009"** — stale shorthand: 0009 is the (already-accepted) forge workflow ADR and governs *how* this lands, same as STL-22 found. The real doc obligation is **ADR 0008 §Tokens**: "the token merge is its own later ADR once the UI is unfrozen" → this slice ships `docs/adrs/0011-design-token-migration.md`.
7. **Fork additive tokens with no DESIGN_SYSTEM canon**: `--info` (blue), `--chart-1…5`, `--code/--code-foreground/--code-highlight`. The `--sidebar-*` family maps 1:1 onto canonical surfaces (`--sidebar`→`--bg-elev`, etc.). `--info`/`--code*`/`--chart-*` keep current values, repointed onto canonical bases where exact, and are **flagged to the design-lead gate** to ratify or extend the canon. Stellarc `--src-*` channel hues are **not** ported (no source-channel UI exists on this surface; minimality).
8. **Baselines**: 6 frozen screens × 4 viewport projects committed under `e2e/__screenshots__/`; `fork-provenance/manifest.json` (live-fork capture, SHA-pinned) is a historical record and stays untouched. Current baselines are single-theme (store default dark); **both-theme coverage is new** (`tokens.spec.ts`).

**OUT of scope / owner:** any `.ts`/`.tsx` source change or utility-class re-authoring onto canonical tokens — the "adoption gap" is unassigned future work post-unfreeze (orchestrator to file; precedent: STL-14's unassigned list); Tailwind `--spacing`/text-size utility rebase — rejected in §1.3, would need an explicit orchestrator ruling and its own ticket (unassigned); rebrand/wordmark/icons (STL-30/T7b); desktop + mobile shells, which rebuild from the changed bundle after this merges (STL-22/STL-23); every backend/schema/sync surface (STL-14…STL-21); `--src-*` channel hues (no surface uses them; unassigned); reconciliation #13/#14 canon (STL-27); `data-theme` attribute migration (frozen TS owns theming; unassigned, likely never).

## 2. Tables, columns, events

**None.** Zero tables, zero columns, zero migrations. Zero event types (`pluginId:type` does not apply; no `schema_version` applies). No importer rows. This slice is not a data path.

## 3. HTTP API shape

**None.** No endpoints, no request/response schemas, no error-union changes. The UI bundle's fetchers are untouched; `GET /health` and every slice API behave identically.

## 4. Sync shapes affected

**None.** No collection is added, removed, or re-scoped. The frozen client's electric-db collections and shape URLs are byte-untouched (enforced by T11).

## 5. File manifest

CREATE (each mirrors the named existing file; v2 paths under repo root, rebound to merged `dev`):

- `apps/stellarc-ui/src/assets/fonts/IBM Plex Sans + Mono woff2 set` — mirrors the fork's `assets/fonts/` slot plan (Cal Sans/Paper Mono files are deleted, not kept); sourced from IBM Plex OFL releases, subsetted weights 400/500/600/700.
- `apps/stellarc-ui/e2e/tokens.spec.ts` — mirrors `apps/stellarc-ui/e2e/frozen.spec.ts` (fixtures, landmarks, `document.fonts.ready`, `toHaveScreenshot`): both-theme screenshot coverage + axe contrast assertions on key screens.
- `tests/unit/design-tokens.test.ts` — mirrors `tests/unit/foundation.test.ts` harness: token catalog exactness, shim completeness, WCAG ratio math, radius/spacing/source purity over `index.css` + built CSS.
- `docs/adrs/0011-design-token-migration.md` — mirrors `docs/adrs/0008-frontend-stack.md` §Tokens (decision, full shadcn→canonical mapping table, deviations §1.1/§1.3/§1.7, freeze-lift + baseline-regen protocol).
- `apps/stellarc-ui/e2e/__screenshots__/**` (regenerated artifacts): updated frozen baselines + new both-theme baselines from `tokens.spec.ts`.

MODIFY after STL-21/STL-22 merge:

- `apps/stellarc-ui/src/index.css` — **the only `src/` file touched**: replace `@font-face` blocks; extend `@theme inline` (radius scale literals 3/4/6/8 + `--radius: 4px`, `--space-*` scale, Stellarc `--ease-*`, font tokens); rewrite `:root` + `.dark` as canonical Stellarc blocks (daybreak/obsidian) with the shadcn alias shim on top; repoint the handful of `calc(var(--radius) ± Npx)` sites in the component layer onto `--radius-*` tokens. Utility classes, component rules, and reduced-motion blocks otherwise unchanged.
- `apps/stellarc-ui/package.json` + `bun.lock` — add `axe-core` (and `@axe-core/playwright`) devDependency for T06.
- `docs/design/DESIGN_SYSTEM.md` — changelog entry (what shipped, where the system now lives in v2) + "Where the system lives" header pointer to the v2 `@theme`/`:root`/`.dark` home; §2 gains the shim note (mirrors the v1 alias-layer precedent).
- Root `README.md` only if it names the font stack (check at implement; likely no change).

## 6. UI surfaces (pixel-frozen → rendering-frozen)

The freeze **lifts here**: pixels change deliberately (fonts, radii, elevation gaps). What must keep rendering identically is **structure**: every `frozen.spec.ts` + `responsive.spec.ts` landmark/role/text assertion stays green with **zero test-code edits** — sign-in, org-shell (sidebar + board table), repo-issues, repo-pull-detail, projects, project-detail across all four viewport projects (1440×900, 1024×768, 390×844, 360×640). No horizontal scroll, no clipped or overlapping controls at 360×640; navigation, i18n strings, and theme toggle behavior unchanged; `color-scheme` stays correct for `light-dark()` third-party components in both themes. Baselines are regenerated exactly once (§7 T09/T10) and the `fork-provenance/` manifest is untouched. Post-regen, the suite is frozen again for subsequent tickets.

## 7. TEST PLAN

Each case: RED before the code exists, GREEN after, then one-variable sabotage-RED.

- **T01 Canonical catalog exactness** — `:root` (daybreak) and `.dark` (obsidian) define every DESIGN_SYSTEM §2 token with the documented hex values (surfaces 5, borders 3, text 3, accent 5+5 alphas, ok/warn/err + ink/wash/line). RED: tokens absent. Sabotage: change `--bg-elev` one hex.
- **T02 Shim completeness** — every `--color-*`/font/radius key in `@theme inline` resolves, in both themes, to a defined token (computed-style probe + built-CSS parse; no dangling `var()` → transparent). RED: shim absent → utilities unstyled. Sabotage: delete one `--card` definition.
- **T03 Radius scale** — `--radius-sm/md/lg/xl` = 3/4/6/8px, bare `--radius` = 4px, `--radius-full` = 999px; no `0.625rem` remains; `calc(var(--radius)…)` sites repointed. RED: old scale ships. Sabotage: revert `--radius` to `0.625rem`.
- **T04 Spacing guard** — `--space-0…--space-32` + `--space-3-5/-4-5/-5-5` present at 2px quantum; Tailwind `--spacing` utility multiplier **unchanged** (0.25rem). RED: scale absent. Sabotage: set `--spacing: 0.125rem`.
- **T05 Fonts** — `@font-face` IBM Plex Sans/Mono self-hosted; woff2 assets present and served from `dist` (200, no remote font URL in built CSS); `--font-sans/-heading/-mono` repointed; zero Cal Sans/Paper Mono references; `document.fonts.check` passes in-browser. RED: swap absent. Sabotage: delete one `@font-face`.
- **T06 Token-level WCAG gates, both themes** — unit math from parsed values: `--text/-dim/-faint` on `--bg/--bg-elev/--bg-elev-2` ≥4.5:1 (faint per DESIGN_SYSTEM §9.3), status inks on their washes ≥3:1 (body-text inks ≥4.5:1), `--on-accent` on `--accent` ≥4.5:1, daybreak + obsidian. RED: assertions absent. Sabotage: drop `--text-faint` to `#5E5E60`.
- **T07 axe contrast scan, both themes** — `@axe-core/playwright` over sign-in, org-shell, board, ticket detail, inbox, settings: zero serious/critical color-contrast violations in each theme. RED: suite absent. Sabotage: inject `color: #5E5E60` on body text.
- **T08 color-scheme integrity** — `:root` declares `color-scheme: light`, `.dark` declares `dark` (kept from fork); `light-dark()` third-party chrome renders correct palette per theme (probe `<file-tree-container>` if present, else computed `color-scheme`). RED: property dropped. Sabotage: remove the `.dark` declaration.
- **T09 Deliberate-diff proof** — for each frozen screen, the regenerated baseline **differs** from the committed pre-migration baseline (both themes), proving the re-skin actually landed; old baselines archived under a named dir for the ADR evidence. RED: pre-migration (identical). Sabotage: regenerate without applying tokens → zero diff → fails.
- **T10 Post-regen suite green** — `bun run e2e` (frozen + responsive + tokens specs) green against regenerated baselines with landmark assertions untouched, all four viewport projects. RED: pre-migration baselines (deliberate diff). Sabotage: edit one landmark assertion — must fail on the untouched-assertions check (git diff on e2e specs = empty).
- **T11 Diff purity** — PR diff touches only the §5 allowlist (`index.css`, `assets/fonts`, `package.json`/`bun.lock`, new tests, `__screenshots__`, `docs/`); **zero** `.ts`/`.tsx` under `apps/*/src` or `packages/` changed. RED: check absent. Sabotage: add `console.log` to a `.tsx`.
- **T12 Full gates** — `bun run lint`, `typecheck`, `test`, `build`, `e2e` green in a **clean worktree at HEAD** (merge-gate runs them itself; typecheck proves no TS broke). RED: pre-change tree lacks new tests. Sabotage: break `index.css` syntax → build fails.
- **T13 Both-theme screenshot evidence** — `tokens.spec.ts` captures light + dark per key screen; committed; per the operator's evidence rule, screenshots delivered in the PR. RED: spec absent. Sabotage: force dark-only capture.
- **T14 Docs obligations** — ADR 0011 exists with the full mapping table + deviations; DESIGN_SYSTEM.md changelog entry + location pointer present; `fork-provenance/manifest.json` byte-identical. RED: docs absent. Sabotage: delete ADR 0011.

**Reconciliation queries owned: 0 of 14** (no data; #1–3 STL-15, #4–6 STL-16, #7 STL-19, #8 STL-17, #9/#11/#12 STL-20, #10 STL-18, #13/#14 STL-27/final gate STL-21).

**Observability (ADR 0010):** no new service methods, endpoints, DB calls, or event paths exist in this slice → zero new spans, by construction. No `console.*` can appear (T11 forbids any TS change). The reviewer's named audit item: **verify absence** — no TS smuggled in via the diff, no un-instrumented path introduced, PII impossible (no code paths added).

## 8. Suggested vertical build order

1. Rebind paths to merged `dev` (post STL-21/22); confirm blockers merged; re-run fork-vs-v2 `index.css` identity check; snapshot pre-migration baselines for T09.
2. RED T01/T02 → canonical `:root`/`.dark` blocks + `@theme` shim GREEN (colors only; palette already aligned — cheapest full-suite-visible step).
3. Fonts: assets + `@font-face` + token repoints (T05, T13 offline proof) — thinnest visible change; no regen yet.
4. Radius + motion + spacing tokens (T03/T04), repointing the `calc(var(--radius))` sites.
5. Contrast: run T06/T07; fix any failing token values in both themes (design-lead consult if a canon value fails — canon wins, report).
6. Baseline regeneration, once, both themes + T09 deliberate-diff evidence + T10 suite green.
7. ADR 0011 + DESIGN_SYSTEM changelog (T14); T11 purity + T12 full gates in a clean worktree; design-lead review against `docs/design/` (the named gate) + adversarial review from a different model family; orchestrator alone merges.
