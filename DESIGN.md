---
version: alpha
name: Stellarc
description: Linear-meets-terminal operator cockpit for an AI agent fleet. Graphite dark / Paper light, Geist everywhere, every colour a token.
colors:
  primary: "#9BA2FF"
  chrome: "#0B0B0D"
  side: "#111113"
  view: "#151517"
  raised: "#1B1B1E"
  card: "#1C1C20"
  hover: "#202024"
  active: "#27272C"
  line: "#232327"
  card-line: "#2A2A2F"
  line-strong: "#36363C"
  text: "#EDEDEF"
  dim: "#A6A6AE"
  faint: "#82828B"
  accent: "#9BA2FF"
  accent-wash: "rgba(139, 147, 255, 0.14)"
  accent-line: "rgba(155, 162, 255, 0.38)"
  ok: "#4CC38A"
  warn: "#E5B545"
  err: "#F0645F"
  run: "#9BA2FF"
  urgent: "#F0645F"
  btn-pri: "#EDEDEF"
  btn-pri-ink: "#0B0B0D"
  paper-chrome: "#EBEBE8"
  paper-side: "#F3F3F0"
  paper-view: "#FBFBFA"
  paper-raised: "#FFFFFF"
  paper-card: "#FFFFFF"
  paper-hover: "#E6E6E2"
  paper-active: "#DEDED9"
  paper-line: "#DFDFD9"
  paper-card-line: "#E2E2DC"
  paper-line-strong: "#C6C6BF"
  paper-text: "#1B1C1F"
  paper-dim: "#55575F"
  paper-faint: "#73757D"
  paper-accent: "#3A5BD9"
  paper-accent-wash: "rgba(58, 91, 217, 0.10)"
  paper-accent-line: "rgba(58, 91, 217, 0.40)"
  paper-ok: "#1F8A57"
  paper-warn: "#A86F00"
  paper-err: "#C8372F"
  paper-run: "#3A5BD9"
  paper-urgent: "#C8372F"
  paper-btn-pri: "#1B1C1F"
  paper-btn-pri-ink: "#FFFFFF"
typography:
  h1:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  section-h:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: 600
  side-h:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 600
  body:
    fontFamily: Geist
    fontSize: 13.5px
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: 500
  mono:
    fontFamily: Geist Mono
    fontSize: 11.5px
    fontWeight: 400
rounded:
  sm: 6px
  md: 8px
  lg: 12px
  full: 999px
spacing:
  hdr: 42px
  row: 30px
  gutter: 8px
components:
  button-primary:
    backgroundColor: "{colors.btn-pri}"
    textColor: "{colors.btn-pri-ink}"
    rounded: "{rounded.md}"
    height: 28px
    padding: "0 10px"
  button-primary-hover:
    backgroundColor: "{colors.btn-pri}"
    textColor: "{colors.btn-pri-ink}"
  button-secondary:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: 28px
  button-secondary-hover:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.dim}"
    rounded: "{rounded.md}"
    height: 28px
  button-ghost-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.text}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  card-live:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
  chip:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.dim}"
    rounded: "{rounded.full}"
    height: 20px
  avatar:
    backgroundColor: "{colors.active}"
    textColor: "{colors.text}"
    rounded: "{rounded.full}"
    height: 28px
    width: 28px
  status-dot-ok:
    backgroundColor: "{colors.ok}"
    size: 8px
  status-dot-warn:
    backgroundColor: "{colors.warn}"
    size: 8px
  status-dot-err:
    backgroundColor: "{colors.err}"
    size: 8px
  status-dot-run:
    backgroundColor: "{colors.run}"
    size: 8px
  app-frame:
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.text}"
    height: 42px
  tab-active:
    backgroundColor: "{colors.side}"
    textColor: "{colors.text}"
    height: 34px
    width: 200px
  sidebar-row:
    backgroundColor: "transparent"
    textColor: "{colors.dim}"
    height: 30px
  sidebar-row-active:
    backgroundColor: "{colors.active}"
    textColor: "{colors.text}"
  search-field:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.faint}"
    height: 30px
    width: 232px
  tooltip:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  workspace:
    backgroundColor: "{colors.view}"
    textColor: "{colors.text}"
  divider:
    backgroundColor: "{colors.line}"
    height: 1px
  divider-strong:
    backgroundColor: "{colors.line-strong}"
    height: 1px
  card-edge:
    backgroundColor: "{colors.card-line}"
    height: 1px
  card-live-edge:
    backgroundColor: "{colors.accent-line}"
    height: 2px
  chip-live:
    backgroundColor: "{colors.accent-wash}"
    rounded: "{rounded.full}"
    height: 20px
  avatar-bot:
    backgroundColor: "{colors.accent-wash}"
    rounded: "{rounded.full}"
    height: 28px
    width: 28px
  today-marker:
    backgroundColor: "{colors.accent}"
    height: 8px
    width: 2px
  status-dot-urgent:
    backgroundColor: "{colors.urgent}"
    size: 8px
  # Paper (light) theme — each -paper twin carries only the colors that flip;
  # shape, size, and rounding never change with the theme, so they live on the
  # base entry alone.
  button-primary-paper:
    backgroundColor: "{colors.paper-btn-pri}"
    textColor: "{colors.paper-btn-pri-ink}"
  button-primary-hover-paper:
    backgroundColor: "{colors.paper-btn-pri}"
    textColor: "{colors.paper-btn-pri-ink}"
  button-secondary-paper:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.paper-text}"
  button-secondary-hover-paper:
    backgroundColor: "{colors.paper-hover}"
    textColor: "{colors.paper-text}"
  button-ghost-paper:
    textColor: "{colors.paper-dim}"
  button-ghost-hover-paper:
    backgroundColor: "{colors.paper-hover}"
    textColor: "{colors.paper-text}"
  card-paper:
    backgroundColor: "{colors.paper-card}"
    textColor: "{colors.paper-text}"
  card-live-paper:
    backgroundColor: "{colors.paper-card}"
    textColor: "{colors.paper-text}"
  chip-paper:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.paper-dim}"
  avatar-paper:
    backgroundColor: "{colors.paper-active}"
    textColor: "{colors.paper-text}"
  status-dot-ok-paper:
    backgroundColor: "{colors.paper-ok}"
  status-dot-warn-paper:
    backgroundColor: "{colors.paper-warn}"
  status-dot-err-paper:
    backgroundColor: "{colors.paper-err}"
  status-dot-run-paper:
    backgroundColor: "{colors.paper-run}"
  app-frame-paper:
    backgroundColor: "{colors.paper-chrome}"
    textColor: "{colors.paper-text}"
  tab-active-paper:
    backgroundColor: "{colors.paper-side}"
    textColor: "{colors.paper-text}"
  sidebar-row-paper:
    textColor: "{colors.paper-dim}"
  sidebar-row-active-paper:
    backgroundColor: "{colors.paper-active}"
    textColor: "{colors.paper-text}"
  search-field-paper:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.paper-faint}"
  tooltip-paper:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.paper-text}"
  workspace-paper:
    backgroundColor: "{colors.paper-view}"
    textColor: "{colors.paper-text}"
  divider-paper:
    backgroundColor: "{colors.paper-line}"
  divider-strong-paper:
    backgroundColor: "{colors.paper-line-strong}"
  card-edge-paper:
    backgroundColor: "{colors.paper-card-line}"
  card-live-edge-paper:
    backgroundColor: "{colors.paper-accent-line}"
  chip-live-paper:
    backgroundColor: "{colors.paper-accent-wash}"
  avatar-bot-paper:
    backgroundColor: "{colors.paper-accent-wash}"
  today-marker-paper:
    backgroundColor: "{colors.paper-accent}"
  status-dot-urgent-paper:
    backgroundColor: "{colors.paper-urgent}"
---

## Overview

Stellarc is a **calm, dense operator cockpit for an AI agent fleet** —
Linear-meets-terminal, editorial rather than flashy. One structure, two themes:
**Graphite** (dark, default) and **Paper** (light), switched by `[data-theme]`
on the app root. Depth is flat: layered surfaces plus hairline borders carry
elevation; only floating chrome (menus, tooltips, composer, drawers) casts a
shadow. The indigo **accent** is the single signal color for selection, live
activity, and focus; status colors (ok/warn/err) are held apart so status never
reads as brand.

This file is the day-one spec for `apps/web` (the ADR 0014 frontend). It is
derived from the approved mockup shell, `docs/design/shell/shell.css`; the
shipped token layer is `apps/web/src/styles/app.css` (Tailwind v4 `@theme
inline`, so utilities like `bg-side`/`text-dim` resolve to the live vars and
flip with the theme). The retired `apps/stellarc-ui` system documented in
`docs/design/DESIGN_SYSTEM.md` (IBM Plex, silver accent) does **not** apply to
new work. Typography for a CJK locale is intentionally unspecified until one
ships (NEVR-404 is parked).

## Colors

Every colour is a token; components never use raw hex. Reference tokens as
`var(--name)` in CSS or Tailwind utilities generated from them. The values
below are the **Graphite (dark)** theme — the `paper-*` tokens carry the Paper
(light) counterparts defined in the frontmatter.

### Surfaces

| Token | Graphite | Paper | Usage |
|-------|----------|-------|-------|
| `--chrome` | `#0B0B0D` | `#EBEBE8` | App frame: header, rail |
| `--side` | `#111113` | `#F3F3F0` | Sidebar, active tab |
| `--view` | `#151517` | `#FBFBFA` | Workspace canvas |
| `--raised` | `#1B1B1E` | `#FFFFFF` | Inputs, search, secondary buttons |
| `--card` | `#1C1C20` | `#FFFFFF` | Cards, tool panels |
| `--hover` | `#202024` | `#E6E6E2` | Row / control hover |
| `--active` | `#27272C` | `#DEDED9` | Pressed, selected, avatar fill |

### Lines

| Token | Graphite | Paper | Usage |
|-------|----------|-------|-------|
| `--line` | `#232327` | `#DFDFD9` | Default hairline dividers |
| `--card-line` | `#2A2A2F` | `#E2E2DC` | Card edges |
| `--line-strong` | `#36363C` | `#C6C6BF` | Emphasized borders, tab dividers, dashed empties |

### Text

| Token | Graphite | Paper | Usage |
|-------|----------|-------|-------|
| `--text` | `#EDEDEF` | `#1B1C1F` | Primary: headings, body, values |
| `--dim` | `#A6A6AE` | `#55575F` | Secondary: meta, labels, idle controls |
| `--faint` | `#82828B` | `#73757D` | Tertiary: icons, counts, timestamps |

### Accent and status

| Token | Graphite | Paper | Usage |
|-------|----------|-------|-------|
| `--accent` | `#9BA2FF` | `#3A5BD9` | Selection, live activity, focus ring, today marker |
| `--accent-wash` | `rgba(139,147,255,.14)` | `rgba(58,91,217,.10)` | Soft accent fill (live chips, bot avatars) |
| `--accent-line` | `rgba(155,162,255,.38)` | `rgba(58,91,217,.40)` | Accent borders (live cards) |
| `--ok` | `#4CC38A` | `#1F8A57` | Done, healthy |
| `--warn` | `#E5B545` | `#A86F00` | In progress, attention |
| `--err` | `#F0645F` | `#C8372F` | Error, blocked, urgent |
| `--run` | `#9BA2FF` | `#3A5BD9` | Running state (accent by design) |
| `--urgent` | `#F0645F` | `#C8372F` | Urgent priority |

Buttons carry their own ink pair: `--btn-pri` / `--btn-pri-ink` (`#EDEDEF` on
`#0B0B0D` in Graphite; `#1B1C1F` on `#FFFFFF` in Paper) — the primary button is
an inverted ink slab, not an accent fill.

## Typography

**Geist** for all UI text, **Geist Mono** for data, timestamps, counts, and
keycaps — nothing else, no system-ui fallbacks beyond the stack's own. The
scale is dense: 13.5px body, 12–14px chrome, mono micro-data at 11–11.5px
(`.mono` drops 0.92em inside Geist context). Hierarchy is carried by size +
weight, not color. Tabular numerals (`font-variant-numeric: tabular-nums`) on
every time, count, and date column.

## Layout

The shell is a fixed header over a three-column body: 52px icon rail, 252px
sidebar, flexible workspace; the tab strip is the only element that absorbs
pressure (`flex: 1 1 0; min-width: 0`). Header height is 42px (`--hdr`), list
rows 30px (`--row`), board columns `minmax(264px, 1fr)`. Corner radii: 6px
small (chips, kbd, inner controls), 8px default (buttons, cards, inputs), 12px
large (columns, panels), 999px pills. Density lives in these four constants;
never re-space a view by hand.

## Elevation & Depth

Depth is mostly flat — surface layering (`--chrome` → `--side`/`--view` →
`--raised`/`--card`) plus hairline borders. Exactly one shadow ladder:
Graphite `--shadow: 0 12px 32px rgba(0,0,0,.5)` for floating chrome, cards
flat (`--card-shadow: none`); Paper softens to `rgba(30,30,25,.16)` with a
`0 1px 2px` card shadow. Focus is a global `:focus-visible` ring: 2px solid
`--accent`, offset 1px, radius-matched — never re-implemented per component.

## Shapes

Softly squared, never puffy: pills are reserved for chips, avatars, status
dots, and progress meters; everything else stays at 6/8/12px. Status dots are
8px circles; running dots pulse a 4px `--accent-wash` ring (1.6s loop, fully
disabled under `prefers-reduced-motion`). Live cards earn a 2px accent
gradient sweep along the bottom edge — the only animated decoration in the
system.

## Components

Components compose from token classes ported in `apps/web/src/styles/app.css`
(`.btn`, `.card`, `.chip`, `.av`, `.st`, …) and owned React primitives in
`apps/web/src/components/ui` (Button variants `default`/`ghost`/`primary`,
sizes `md`/`sm`). Owned components own their spacing and shape — consumers may
pass layout classes (margin, width) but never restyle internals; a new size or
variant belongs in the component file, not at the call site. Buttons: primary
is the inverted ink slab, secondary is raised-with-border, ghost is dim text
that gains `--hover` on hover. Cards pair `--card` with `--card-line`, brighten
the border to `--line-strong` on hover, and take `--accent-line` + wash when
live. Status reads through 8px dots on `--ok`/`--warn`/`--err`/`--run` plus a
text label — color never carries meaning alone.

The front-matter `components:` map documents both themes. Each entry is the
Graphite (dark) definition; its `-paper` twin carries only the colors that
flip in Paper — shape, size, and rounding never change with the theme, so
they live on the base entry alone. Hairline chrome is modeled as the strip
that renders it (`divider`, `divider-strong`, `card-edge` are 1px
background strips; `card-live-edge` is the 2px accent sweep), and the wash
fills (`chip-live`, `avatar-bot`) state fill and shape — the glyph on both is
`--accent` in Graphite and Paper per the Colors table, not repeated as a
`textColor`, because a translucent wash cannot be contrast-checked against
the surface it overlays.

### Changes to this file

Every PR that edits this file pastes the output of
`bunx @google/design.md@0.4.0 diff <before> <after>` — tokens added, removed,
and modified, plus the regression boolean — into the PR body, the design-doc
sibling of the agent-view §E ship-evidence law
(`docs/design/agent-view-contracts.md`). The `design-doc-lint` CI job runs
the same pinned version and fails on any error or warning. The pin is
deliberate: the spec is `version: alpha` and its schema moves, so version
bumps are deliberate folds like any dependency, never `latest`.

## Do's and Don'ts

### Do

- **Do** use a token for every colour, in **both** theme blocks; a new visual
  need is a new token first.
- **Do** use Geist / Geist Mono and the dense scale; tabular numerals for data.
- **Do** respect the layout constants (`--hdr`, `--row`, radii) instead of
  hand-spacing views.
- **Do** verify both Graphite and Paper after any visual change.
- **Do** keep the accent as the only signal color; status stays ok/warn/err.
- **Do** pass `layout` classes to owned components; add variants in the
  component file when the design calls for one.

### Don't

- **Don't** hardcode a hex, `rgba()`, or arbitrary Tailwind value in a
  component — `ui-design-contracts` (CI) fails the PR.
- **Don't** invent gradients, glassmorphism, or neon glow; depth is flat.
- **Don't** use Inter, Roboto, IBM Plex, or raw `system-ui` as a primary face.
- **Don't** re-implement focus rings or restyle owned components at call sites.
- **Don't** carry meaning by colour alone; every status has a label.
- **Don't** animate under `prefers-reduced-motion` — the pulse and sweep
  collapse to static equivalents.
