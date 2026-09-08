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

## UI evidence: Playwright now, Maestro when the desktop returns

**Playwright** is the UI test runner for `dev`:

- The frozen UI is a web SPA; Playwright drives real Chromium against the built
  bundle with the real keyboard (needed for `:focus-visible` — programmatic
  `.focus()` does not trigger it and produced a false negative this session).
- **Screenshot parity is a gate.** `toHaveScreenshot()` against baselines
  committed under `apps/stellarc-ui/e2e/__screenshots__/`, 0.1% pixel
  threshold. Because the UI is pixel-frozen, any diff is a regression by
  definition. Baselines are captured from the Kaneo fork once at T0.
- Every UI-touching PR must include the regenerated PNGs; the reviewer checks
  they changed where the spec says and nowhere else.

**Maestro** is *not* adopted on `dev` yet. Stellarc v1 uses it (21 flows) for
the desktop shell, and it will return with the desktop stage of the rewrite.
Two runners for one web surface is duplication; Maestro's strength is mobile/
desktop apps, which `dev` does not have.

## Screenshot delivery

Screenshots are committed to the PR and linked from the review comment. They
are **not** delivered via `MEDIA:` paths (does not render in Paseo/ACP). For
human review outside GitHub, `design/` and `e2e/__screenshots__/` are served
at `https://kaneo-design.stellarc.app/` behind the existing tunnel.

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
