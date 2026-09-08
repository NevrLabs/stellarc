# ADR 0009: Development workflow — `forge` staged pipeline, merge gate, UI evidence

Status: **accepted** (2026-09-08). Governs how every change lands on `dev`.

## Decision

All work flows through **`forge`** (`tools/forge/forge.py`), a six-stage gated
pipeline over **Paseo** (agent runner) and **GitHub** (ledger):

```
triage ──► spec ──► implement ──► review ──► merge-gate ──► merged
                      ▲              │
                      └─── rework ───┘   max 3 cycles → human
```

| Stage | Who | Writes | Gate to enter |
|---|---|---|---|
| **triage** | goose (cheap) | issue comment + `forge:*` label | — |
| **spec** | reviewer-family model | `.forge/<T>.spec.md` (committed) | triage = ACCEPT |
| **implement** | `cx/gpt-6-astra` ↔ `glm/glm-5.3-flash` (alternating by cycle) in a **Paseo worktree** on `forge/<t>-c<N>` | its own branch + PR with `Closes #N` + screenshots | spec = pass |
| **review** | **different family** from this cycle's implementer (enforced; refuses otherwise) | `.forge/<T>.review-<N>.md` + PR comment | implement = pass |
| **merge-gate** | **orchestrator only** — fresh worktree at PR head, runs every gate itself | squash-merge, branch delete | review = PASS |

State is `.forge/<T>.json`, **committed with the work**, so a new session or a
peer agent can read where a ticket stands. Every transition is also a GitHub
issue/PR comment, so the ledger survives the box.

## Why this shape

- **Stage files, not chat.** A timed-out agent leaves its spec/review on disk.
  This session lost an entire recon report to a summarize-step failure; that
  cannot happen to a spec.
- **The merge gate trusts nobody.** Agents paste green output; the gate re-runs
  lint/typecheck/unit/build/e2e in a clean worktree at the exact PR SHA and
  audits the diff for debris. An agent's green is a hypothesis.
- **Family diversity is a hard check.** `forge review` picks a reviewer whose
  model family differs from the implementer's and *dies* if none exists. A
  reviewer sharing the implementer's reasoning style rubber-stamps.
- **Rework is bounded.** Three cycles, then escalate with both artefacts. An
  unbounded implement↔review loop burns budget silently.
- **Isolation is Paseo's.** `--new-workspace worktree --worktree-mode
  branch-off` per cycle. No agent ever runs in the main checkout; two
  implementers never share a tree.

## Gates (run by the merge gate, in `.forge/config.json`)

```
bun run lint · bun run typecheck · bun test · bun run build · bun run e2e
```

plus a debris scan (`*.log`, `*.tmp`, `console.log`, `/debug`). Any red = PR
labelled `forge:rework`, spec re-armed, cycle counter advances.

## Target platforms

Stellarc ships to **web, desktop (Linux/Windows/macOS), and mobile (Android/iOS)**
from **one React codebase**. The shell is **Tauri 2** — already the v1 choice
(`desktop/Cargo.toml`, `@tauri-apps/cli ^2`) and Tauri 2 targets iOS and
Android from the same webview app. No second UI stack (Capacitor, Expo,
React Native) — that would fork the pixel-frozen UI.

Consequence for the freeze: the fork's **responsive layer is part of the
frozen surface**. It exists today — 473 Tailwind breakpoint prefixes
(`sm:` 358, `md:` 70, `lg:` 34), `useIsMobile()` at **768px** in 12 sites, the
sidebar collapsing to a Sheet below it — but it was **never under test**.
`dev` puts it under test from T0.

## UI evidence: Playwright projects per viewport, Maestro per native shell

**Playwright** runs the web bundle under **four projects**, every PR:

| Project | Viewport | Emulates | Why |
|---|---|---|---|
| `desktop` | 1440×900 | Chromium | primary cockpit |
| `tablet` | 1024×768 | iPad, touch | `lg:` boundary, sidebar still visible |
| `mobile` | 390×844 | iPhone 14, touch, `hasTouch`, `isMobile` | below 768 — Sheet sidebar, stacked layouts |
| `mobile-small` | 360×640 | Android small, touch | the smallest layout we promise |

- Real keyboard on desktop (needed for `:focus-visible`); **real touch** on
  mobile projects (`page.tap`, swipe) — a mobile layout driven by a mouse is not
  tested.
- **Screenshot parity is a gate on every project.** `toHaveScreenshot()` against
  baselines committed under `apps/stellarc-ui/e2e/__screenshots__/<project>/`,
  0.1% threshold. Baselines are captured from the Kaneo fork **at all four
  viewports** at T0. Any diff on any project is a regression by definition.
- Each frozen screen gets one spec that runs across all projects; project-
  specific assertions (Sheet open on mobile, sidebar rail on desktop) are
  branched on `testInfo.project.name`, not skipped.
- Every UI-touching PR includes regenerated PNGs for all four projects; the
  reviewer checks they changed where the spec says and nowhere else.

**Maestro** covers the **native shells** (Tauri desktop, Tauri iOS/Android) when
those stages land. v1 already has `.maestro/config.mobile.yaml` and 21 flows;
they return with the desktop/mobile packaging tickets. Maestro is not run
against the web bundle — that is Playwright's job, and one surface does not
get two runners.

## Screenshot delivery

Screenshots are committed to the PR and linked from the review comment,
grouped by project. They are **not** delivered via `MEDIA:` paths (does not
render in Paseo/ACP). For human review outside GitHub, `design/` and
`e2e/__screenshots__/` are served at `https://kaneo-design.stellarc.app/`
behind the existing tunnel.

## What forge does not do

- It does not plan. Tickets come from the wave plan (`docs/plans/`) and are
  filed as GitHub issues by the orchestrator, with `Blocked by` edges in the
  body.
- It does not merge to `main`. `dev` is the integration branch; promotion to
  `main` is a separate, human-triggered release step.
- It does not replace judgement. `forge merge` refuses drafts and conflicts and
  fails loudly; a human reads the failure.

## Consequences

- Every merged commit on `dev` has: a committed spec, a committed adversarial
  review from a different model family, orchestrator-run gates at that SHA,
  and screenshot evidence for any UI surface. That is the audit trail.
- Cost: ~3 agent runs per clean ticket (spec, implement, review) + orchestrator
  gate time. Rework adds 2 per cycle.
- `forge` is Python + `gh` + `paseo`; it has no dependency on the repo's
  language and can be lifted to any repo with `forge init`.
