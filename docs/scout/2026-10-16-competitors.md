# Scout — Competitors, 2026-10-16

Beat: **competitors**. Delta window: 2026-10-15 ~19:05 UTC → 2026-10-16 19:25 UTC.
Every claim verified against a primary source (vendor changelog/release notes,
GitHub API, or repo metadata) on 2026-10-16. Context: Stellarc = self-hostable,
inert control plane (v2 charter D4) + BYO agent runtime over ACP (ADR 0011),
Tauri 2 shell, React UI. `docs/steal-reject-matrix.md` and `docs/v2-charter.md`
are the standing filters.

## The one-line read

**Multica shipped v0.6.3 today** (09:53 UTC) and the center of it is the exact
surface Stellarc has built but never shown: **per-run cost bars and token detail
in the run log** (MUL-8046), backed by a pricing-table hardening pass (Claude
Sonnet 5.5/Haiku 5.5 priced; Cursor catalog variants normalized to base models
so unmapped variants stop costing $0 — MUL-8018/MUL-8050) and **project
workflows** (MUL-7420: a workflow owns its columns and handoffs; a project
picks one). Last pass's two doctrine fixes (WS revocation MUL-8014, batch-claim
recovery MUL-7658) shipped in this release. **Paseo cut 0.12.0-beta.1** minutes
before this run (19:00 UTC): background workspaces, a reworked phone layout,
diff-pane feedback, and ~100 fixes — including two laws for us: permission
verdicts must confirm-or-error, and archived agents must not spawn provider
processes. Its license row gets a correction (below). **Factory shipped
v0.243.0**: the kill-guard class continues to calibrate (pattern kills no
longer kill the pattern's own runner; `rm -f` in background un-refused).
**OpenHands moved orgs** (All-Hands-AI → OpenHands; old path 301s) with no
release. **Plane pushed a security cluster** (URL-scoped endpoints, membership
checks) with no release. Linear, Cursor, Devin, Huly: unchanged.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Multica** | **v0.6.3 (2026-10-16 09:53Z)**. Headline: **per-run cost bars + token detail in the run log** (MUL-8046/#9288 — execution-log sidebar redesigned: totals row Spent·Tokens·Agent time; one bar per run, latest 30, height = cost relative to priciest, colour = outcome (failed/cancelled/running/dashed-no-usage); past rows gain agent · duration · tokens · short model name; Runs dialog mirrors it). Pricing hardening: **Claude Sonnet 5.5 + Haiku 5.5 priced** (MUL-8018/#9253 — backend had misclassified Sonnet 5.5 as Sonnet 5, charging 2× its cache-read rate; Haiku 5.5 was unpriced) and **Cursor catalog variants normalized** (MUL-8050/#9295 — `claude-opus-5-5-high`, `gpt-5.6-sol-medium-fast` etc. stripped of effort levels, `-thinking`, `cursor-` prefix, `[effort=…,fast=…]` overrides to resolve `cursor/<base>`; previously every unmapped variant showed $0). **Project workflows** (MUL-7420/#8814+#9293: workflow = whole pipeline with columns + per-column handoffs to agent/member/team; project picks a workflow; statuses stay a shared catalog so filters/CLI keep working; workflow brief rendered once server-side). Onboarding: runtime-guide issue opened directly, welcome modal + pre-v3 shim removed (MUL-8047). Shipped-in-release from last pass's main watch: WS revocation (MUL-8014), batch-claim recovery (MUL-7658), inbox scoped to current workspace (MUL-8012), Git content preserved during artifact GC (MUL-7893), builder-draft recovery pair. | v0.6.3 2026-10-16 | proprietary | 5 | **WATCH → steal P1** | The cost surface is the direct read. Stellarc already records what Multica just built a UI for: the runner captures ACP `usage_update` (context tokens + cumulative cost) at `apps/stellarc-node/src/runner.ts:128`, persists per-(task,attempt) into `agent_task_usage` with COALESCE-merge upsert (`packages/agents/src/store.ts:296`), and emits `usage_recorded` — but `stellarc-ui` renders none of it (zero references to `costAmount`/`tokensTotal` in the UI). The gap is presentation, not plumbing. Two design notes from their hardening: (1) **normalize model ids before price lookup** — suffix/variant drift silently zeroed a whole runtime's costs; (2) Multica needs a pricing table because their runtimes don't always self-report — ours must stay harness-reported only (charter: the plane records, never invents), so absent harness cost shows absent, not $0.00. Project workflows: the "workflow owns columns + handoffs, project picks one" model is the cleanest separation we've seen for cross-project status reuse — relevant when our board model matures. |
| **Paseo** | **v0.12.0-beta.1 (cut 2026-10-16 19:00Z, minutes before this run).** **Background workspaces** (#5039/#7141 — hidden from the sidebar unless "Show background" is on; `paseo run --background` deprecated → `--no-wait`). Reworked phone layout: floating header, fullscreen composer, tab switcher for New agent/terminal, closable sheets with Open-as-tab for subagents, Settings as large tiles. **Send feedback from the diff pane** (#6455 — review comments reach an agent without opening its chat). Sender's name on agent→agent messages (#6373). `paseo usage` CLI (quotas, balances, reset times). Option previews on Claude question cards (#6171). New Markdown renderer: selection crosses paragraphs/headings/lists on iOS+Android (#6973). ~100 fixes, notable classes: **memory** (plugin host/CLI/desktop growing to ~1 GB over 30–75 min #6847; daemon OOM during long OpenCode v2 streams #6262), **zombie processes** (archived ACP agents started a provider process on every timeline load #6766), **permission honesty** (`paseo permit allow/deny` over SSH reported success while the request stayed pending → now exits non-zero if the daemon doesn't confirm in 15s #6607), **protocol robustness** (inbound WebSocket validator split per message type #6847-class; oversized attachments fail with a size error instead of a disconnect loop #6285), schedules (a slot shared on one cron minute ran twice and skipped the next #6532; a run that couldn't be recorded never ran again #6334). | 0.12.0-beta.1 2026-10-16 | **Correction:** Apache-2.0 with an explicit third-party-components carve-out (GitHub reports NOASSERTION because of the custom header; license file last changed 2026-08-27, before this window — last pass's plain "Apache-2.0" was close but the carve-out is real) (21.1k★) | 4 | **TRIAL** | Four laws for us. (1) **Background runs hide themselves** — a run started headless (our default) shouldn't occupy sidebar/board real estate; a "show background" toggle is the whole UI cost. (2) **Permission verdicts confirm-or-error** — our NEVR-198 verdict-on-heartbeat path must treat an unconfirmed verdict as an error state, never as done; Paseo shipped exactly this as a bug fix (SSH allow "succeeded" while staying pending). (3) **Archived agents must not spawn provider processes** when their transcript loads — the read path must be inert (our charter says inert everywhere; this is the zombie-process version of that law). (4) **Oversized attachments fail with a size error**, not a disconnect loop — bounded-failure language for our ACP transport. |
| **Factory (Droids)** | **v0.243.0 / Desktop v0.200.0 (2026-10-16).** Kill-guard calibration continues: **a kill by pattern no longer ends the command that ran it** (last pass's self-kill guard was shipped by Factory as v0.242 — this is the follow-up: the guard was too broad); **background `rm -f` un-refused** (same overzealous-guard class). Browser pane keyboard input reaches its target pane or fails clearly; canceling in-flight attachment uploads; **reading very large files reads a range without OOM**; sign-in across tabs (one stuck refreshing tab no longer signs you out); org-required Droid reviews run on new PRs; subagent transcript popup keeps following output; multi-select custom-answer checkbox checks itself once you type. | CLI v0.243.0 / Desktop v0.200.0, 2026-10-16 | proprietary | 4 | **WATCH** | The guard-calibration pair is the lesson: when we land last pass's P1 self-kill guard on stellarc-node, scope it narrowly — refuse kills whose target is the node/supervisor process itself, allow everything else (including `rm -f` and pattern kills that merely match the runner's own command line). Factory shipped the broad guard, then spent the next release carving exceptions. Range-reads for large files is the same bounded-resource language as Paseo's attachment fix. |
| **GitHub Copilot / platform** | Oct 16: Xcode 27 runner image GA for Actions (was public preview). The Oct 15 wave (agentic autofix GA, AI Scan for PRs GA, Copilot model deprecations mid-Nov, Code Quality license CSV, Slack/Teams multi-repo) was covered last pass. | changelog 2026-10-16 | proprietary | 5 | **WATCH** | Quiet day; the agent-relevant wave lands at Universe (Oct 28–29). Keep the findings-triggered-tasks pattern (last pass P3) parked until then. |
| **OpenHands** | **Org move: All-Hands-AI → OpenHands** (repo is now `OpenHands/OpenHands`; the old path 301-redirects; the OpenHands org itself was created 2025-08). No release since v1.27.1 (Oct 12). Main: 25 commits in window, polish — settings saves preserve edits on failure and **show the server's reason** when an LLM profile save fails (#18549/#18372); launch fails when the automation backend exits during startup (#18311); smooth reading-pace streaming with word fade-in (#18491); syntax-highlighter tokens stay inline (#18542); Azure DevOps repos listed from every org (#18479); agent-server bumped 1.55.0→1.55.1. | main 2026-10-16; v1.27.1 2026-10-12 | MIT (91.1k★) | 4 | **WATCH** | The rename is hygiene for our radar links. The fail-at-startup fix is a small law: if the agent runtime's backend dies during boot, the launch fails loudly — our node boot should do the same for its ACP children. Show-the-server's-reason is the same transparency law as Multica's failure rows. |
| **Plane** | No release (self-host 3.3.3 Oct 8; cloud Sep 30; 60.9k★). Main: 8 commits in window, a **security cluster**: require project membership to publish (SECUR-247/#10033); scope issue-comment and relation endpoints to the project in the URL (SECUR-243/#9531); remove unused API token service flag (SECUR); preserve Redis TLS URL credentials; caddy rebuilt on 2.11.7 with x/net v0.60.0; NixOS `env bash` in host scripts. | main 2026-10-16 | AGPL-3.0 | 4 | **TRIAL** | The security cluster is a free audit checklist for our API surface when auth lands: **every endpoint that names a project id in the URL must verify the caller's membership of that project**, not just the session. Their two fixes are the classic bypass pair (publish without membership; comment/relation endpoints accepting cross-project ids). |
| **Linear** | Unchanged — top changelog entry still Oct 8 (stacked PRs, realtime diffs, AI credit usage explorer + spend limits). | changelog top 2026-10-08 | proprietary | 5 | **WATCH** | P1–P4 from the 10-13 pass stand. |
| **Cursor** | Unchanged — top changelog entry still Oct 13 (Origin App Marketplace, 20+ apps, open submissions; iOS remote). | changelog top 2026-10-13 | proprietary | 5 | **WATCH** | Origin app model (JWT + installation tokens + webhooks) remains the integration shape to study. |
| **Devin (Cognition)** | Unchanged — top release-notes entry still Oct 14 (interrupt keeps partial reply, session-link chips, Review-manager role, SARIF export). | release notes top 2026-10-14 | proprietary | 5 | **WATCH** | Steals from the 10-15 pass stand (interrupt preserves partial reply; MCP approval cards name the verb). |
| **Huly** | No commits (last push Oct 14 05:50Z). Quarterly cadence; no agent-native story. | repo pushed 2026-10-14 | EPL-2.0 (27.9k★) | 3 | **REJECT** | Row sleeps until January 2027 per the 10-13 pass. |

## Proposals

### P1 — Surface the cost/token telemetry we already record (ADOPT-grade)

Stellarc's plumbing is done and doctrine-clean; the UI never shows it. The
runner captures ACP `usage_update` (context tokens, window size, cumulative
session cost) at `apps/stellarc-node/src/runner.ts:128`; `packages/agents/src/store.ts:296`
upserts `agent_task_usage` per `(task, attempt)` with a COALESCE merge
(harness numbers are cumulative; absent fields keep the stored value); a
`usage_recorded` event lands on the org log. `stellarc-ui` has zero references
to any of it.

Multica v0.6.3 just validated the surface with MUL-8046: totals row
(spent · tokens · agent time), one bar per run coloured by outcome, per-run
rows with agent · duration · tokens · short model name.

Brief shape: task detail → attempts list gains a compact per-attempt usage row
(tokens in/out/total, context/window, cost + currency when harness-reported);
task header gains a roll-up. **No pricing table in v1** — charter law: the
plane records what the harness reports, never invents; absent cost renders
absent (em-dash), not $0.00. Multica's pricing-table hardening (model-id
normalization before lookup) is the cautionary tale that keeps us on the
harness-reported side of the line.

### P2 — Run-hygiene laws from this window (TRIAL, three small guards)

Three laws, all cheap, all in the runner/UI seam, none needing new machinery:

1. **Permission verdicts confirm-or-error** (Paseo #6607). NEVR-198's
   verdict-on-heartbeat path must treat a verdict the node never confirmed as
   an error state — never report success while the request sits pending.
   Paseo shipped this as a bug fix; the class is "optimistic UI on a control
   verdict".
2. **Archived/complete agent sessions stay inert on read** (Paseo #6766).
   Loading a finished session's transcript must never spawn or signal a
   provider process. Our inert-control-plane charter already implies this;
   write it as a test on the transcript read path.
3. **Background runs hide themselves** (Paseo #5039). Headless task runs
   shouldn't claim sidebar/board attention by default; a "show background"
   filter is the whole cost.

### P3 — Kill-guard calibration + URL-scope audit (WATCH)

- When last pass's P1 self-kill guard lands on stellarc-node, scope it
  narrowly (target = the node/supervisor process itself), and expect to
  calibrate: Factory's v0.242 guard was followed by v0.243 exceptions
  (pattern kills killing their own runner; background `rm -f` refused).
  Write the guard with the exceptions list empty but the test table populated.
- Plane's SECUR-243/247 pair is the audit checklist for our API auth pass:
  every URL-named project/issue id gets a membership check at the handler.

## Notable non-findings

- Linear, Cursor, Devin, Huly: no movement. GitHub Universe is Oct 28–29 —
  the next competitors pass after that date catches the Copilot/agent wave.
- Stellarc itself shipped no release/tag in the window, so the NEVR-198 radar
  row ("verified on a release") stays open.
- `origin/agent/nevr-239` (approval card + sources element on the transcript
  surface) is in flight — P2 item 1 should land against that surface, not
  beside it.
- Web search/extract provider still down (`9router` unregistered — **eighth**
  consecutive run); GitHub API + direct curl carried the beat again.
- Paseo license correction: last pass recorded plain Apache-2.0; the repo
  carries a custom header carving out third-party components (GitHub: NOASSERTION).
  No change to the TRIAL verdict — the carve-out doesn't restrict our use class.

## Sources

- Multica v0.6.3 release + PRs #9288/#9253/#9295/#8814/#9293/#9289: github.com/multica-ai/multica (API 2026-10-16; release published 09:53Z)
- Paseo 0.12.0-beta.1: CHANGELOG.md via API + release cut commit (19:00Z 2026-10-16); LICENSE via API (header + Apache-2.0 text, last changed 2026-08-27)
- Factory feed (244 items; 2026-10-16 = CLI v0.243.0/Desktop v0.200.0): https://docs.factory.com/docs/changelog/feed.json (fetched 2026-10-16)
- GitHub changelog Oct 16 (Xcode 27 runner GA): https://github.blog/changelog/month/10-2026/ (fetched 2026-10-16)
- OpenHands org move: api.github.com/repos/All-Hands-AI/OpenHands → 301 → OpenHands/OpenHands; org created 2025-08-11; main pushed 2026-10-16T19:15Z (API 2026-10-16)
- Plane commits in window (SECUR-247 #10033, SECUR-243 #9531, Redis TLS #9979, caddy #9988): github.com/makeplane/plane (API 2026-10-16)
- Linear (top Oct 8), Cursor (top Oct 13), Devin (top Oct 14): changelogs fetched 2026-10-16, top entries unchanged
- Huly: repo metadata via API (pushed 2026-10-14T05:50Z)
- Stellarc grounding: `apps/stellarc-node/src/runner.ts:128-138`, `packages/agents/src/store.ts:240-340` (usage upsert + `usage_recorded`); UI absence verified by search (`costAmount`/`tokensTotal` → 0 hits in `stellarc-ui`)
