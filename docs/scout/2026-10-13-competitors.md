# Scout — Competitors, 2026-10-13

Beat: **competitors**. Delta window: 2026-10-08 → 2026-10-13 (plus Sep 24–30
items the 10-08 report missed). Every claim verified against a primary source
(vendor changelog/release notes, GitHub release API, or repo metadata) on
2026-10-13. **Evening pass (19:00 UTC run, same day):** rows for Cursor,
Devin, OpenHands and Copilot were re-verified and extended with everything
that landed after the morning cut (07:53 UTC); Linear, Plane, Paseo, Huly,
Factory, Multica re-checked and unchanged. Context: Stellarc = self-hostable,
Effect-v4 tracker (Kaneo parity, append-only event log ADR 0007) + BYO agent
runtime over ACP (ADR 0011), Tauri 2 shell, React UI.

## The one-line read

Four convergences in this short window: **spend control moved from dashboards
to enforcement** (Linear pause-on-limit spend caps, Plane daily/weekly credit
limits), **the run surface went realtime** (Linear streams diffs as the agent
codes, VS Code grids agent sessions), **capability catalogs got enterprise
governance** (Devin required/forbidden plugin policies, Copilot managed agent
permissions + free local sandboxing GA), and **stacked PRs went mainstream in
one week** (Linear Diffs Oct 8, GitHub platform GA Oct 6). Stellarc's counter
is substrate: enforcement belongs in the run scheduler over the event log,
realtime belongs in the ACP event stream, governance belongs in versioned
agent definitions. **Evening pass adds a fifth convergence: agent memory went
product-grade** — Devin ships persistent personal memory with nightly
"dreaming" distillation, OpenHands lands an in-conversation secrets-request
modal (the missing trust primitive), and Cursor's Origin App Marketplace
bakes the GitHub-Apps pattern (JWT + installation tokens + webhooks) into an
agentic marketplace.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Linear** | Stacked PRs in Diffs: move through a stack, see review/CI/merge status per PR; GitHub-native stacks preview every affected PR and merge from Linear. Realtime diffs during coding sessions — diffs update live incl. uncommitted changes from follow-up prompts, so you can steer before/after PR. AI credit usage explorer + spend limits at workspace/user/loop level; hitting a limit pauses further AI usage until reset. Guided Reviews on Basic. (Sep 24: adaptive routing to cheaper models w/ restart-on-default keeping the PR, environment secrets, open-weight GLM sessions, team loops triggers, durable project/initiative IDs.) | changelog 2026-10-08, 2026-09-24 | proprietary | 5 | **WATCH** | Realtime diffs and pause-on-limit spend caps are the two run-UX patterns to copy this cycle. Stacked-PR display pairs with GitHub's GA the same week — two independent ships = real demand. |
| **Plane** | Agents GA on cloud (Sep 30, covered last cycle) now documented for devs (Beta): instructions/skills/triggers/memory/MCP-tools schema, run panel, per-project scoping. Daily + weekly AI credit limits shipped with it. Self-host CE line moves fast: 3.3.0 (Sep 24) → 3.3.3 (Oct 8) per developers.plane.so release table; GitHub repo releases stale at v1.4.x but repo pushed Oct 12. | self-host 3.3.3 (2026-10-08); cloud Sep 30 | AGPL-3.0 (60.7k★, pushed 2026-10-12) | 4 | **TRIAL** | Their agent-definition schema remains the field-for-field reference for our agent entities; their credit caps (see Linear) confirm enforcement is table stakes. AGPL: patterns only, no code. |
| **Multica** | No new release verified this cycle; public changelog mirrors serve stale caches (Aug entries). Last verified: v0.6.1 (2026-10-01, prior report). | v0.6.1, 2026-10-01 | proprietary | 5 | **WATCH** | Benchmark unchanged this cycle; recheck next run. |
| **Paseo** | v0.11.0 (2026-10-07): **plugin registry** (paseo.sh/plugins) — `paseo plugin add owner/slug` installs reviewed plugins; SDK grew screens/sidebar items, `spawnProcess`/`execCommand`, usage sources, `playAudio`. **Usage dialog** aggregates every subscription account's quota windows, discovering ChatGPT/Claude logins from Codex CLI, Claude Code keychain, Pi, OMP. Muse Code + Antigravity providers; mid-turn steering for OMP agents; per-provider default options in config.json. v0.11.1: Claude Haiku 5.5. v0.11.2 (2026-10-09) fixes. | v0.11.2, 2026-10-09 | Apache-2.0 (custom notice; 20.7k★, pushed 2026-10-13) | 4 | **TRIAL** | The plugin registry is the distribution pattern for Stellarc skills/agent templates. Their usage aggregation across BYO accounts is the honest version of run economics when you don't bill — feeds P1. |
| **Cursor** | **Origin App Marketplace (Oct 13, evening):** 20+ apps for deployments/CI/code-review/security/monitoring/project-management (Cloudflare, Vercel, Buildkite, CodeRabbit, Sentry, Linear…); open to public submissions — apps authenticate with an app JWT + installation access tokens, receive webhook events, write back check runs/PR comments/reviews; public review with demo video. **iOS remote control for local agents (Oct 6, evening):** see/reply to agents running on your computer from the Cursor iOS app; agents stay on your machine (computer must stay online); on by default except Enterprise. IDE 3.23.10 (Oct 1): team/org **MCP allowlists** with import/export, **service tokens** (create/rotate/revoke/scopes), in-product status page, xAI account linking. (Rollouts/Security Review covered last cycle.) | changelog 2026-10-13, 10-06, IDE 3.23.10 2026-10-01 | proprietary | 5 | **WATCH** | Origin's app model (JWT + installation tokens + webhooks, write-back as check runs/PR comments) is the exact integration shape for a future Stellarc app surface — study before designing ours. iOS remote control = agent observability away from the desk: the phone is the steering wheel, the run stays local. MCP allowlists at org level = the same governance shape as Devin's plugin policies; supports P1's policy layer. |
| **GitHub Copilot coding agent** | **Budgets search/filter (Oct 13, evening)** in account management — third major platform shipping budget UX in ten days (after Linear Oct 8, Plane Sep 30). JetBrains (Oct 10): new controls + chat improvements. **Local sandboxing GA** (Oct 7) in CLI, Copilot app, VS Code Agent Host — limits agent access to files/networks/credentials, free. Claude Haiku 5.5 (Oct 7). `/model` discovers local Ollama models in CLI 1.0.94+. VS Code 1.141: agent sessions side-by-side grid. **Stacked pull requests GA** platform-wide (Oct 6). Enterprise-managed agent-operation permissions (Sep 9). | changelog 2026-10-06→13 | proprietary | 5 | **ADOPT (pattern)** | Free local sandboxing sets the floor for what "safe local run" means in 2026 — stellarc-node should treat sandbox profiles as a first-class run option. Copilot joining Linear and Plane on budget UX confirms P1 is now table stakes, not differentiation. Stacked-PRs GA + Linear's ship the same week makes P3 a real requirement, not a nicety. |
| **OpenHands** | **Post-v1.27.1 commits (evening):** `feat(secrets): let the agent request a secret through an in-conversation modal` (#18408) — the agent asks, the human approves in-chat, no pre-provisioning; MARS web bridge mounted by default, opt-in dropped (#18349); conversation overview-drawer cleanup. v1.27.0/.1 (2026-10-12): **OpenCode and Pi as built-in ACP agents**; **ACP model lists taken from the agent**; automation-setup split panel with persisted drafts. v1.26.0 (2026-10-08): "narrow needs review" status; verify-openhands self-verification harness (mock-LLM e2e behavior maps, recorded video). | v1.27.1 + main@#18408, 2026-10-13 | MIT (90.8k★, pushed 2026-10-13) | 4 | **WATCH** | The secrets-request modal is the missing trust primitive for BYO-agent: instead of pre-provisioning everything, the run pauses and asks — same shape as our `needs_input`. ACP-model-discovery is exactly what stellarc-node should do (ask the agent, don't pin lists). MIT: verify-openhands is a pattern worth stealing for agent-UX QA. |
| **Devin (Cognition)** | **Oct 9 (evening):** **Memory and dreaming** — persistent personal memory across sessions, nightly "dreaming" jobs distill recent sessions; per-user (not org-shared), reviewable files, Settings toggle; org/enterprise admin control. **Transcript diff cards for large edits** — real diffs instead of "file replaced" summaries (>5,000 lines shows counts; temp files hidden). **Repository AGENTS.md loaded on setup** — repo-root instructions now govern the session. Notification settings per-type switches + inbox All/Unread tabs + hover preview. Preferences server-sync across web/desktop/devices. Session-resume window 30→14 days. Oct 7: notification inbox + phone push; merge-queue states; playbook-pinned Devin mode. 2026 H2: **Outposts** (self-hosted execution, managed brain); required/optional/forbidden plugin-policy governance; multi-repo scans with chained attack paths; "Waiting" status for sleeping sessions + queued mid-wait messages. SWE-2 (Sep 10, Kimi K3). | release notes 2026-10-09, 10-07 | proprietary | 5 | **WATCH** | Memory-with-nightly-distillation is the agent-memory pattern to copy: personal scope, human-reviewable files, admin off-switch — maps to Stellarc agent memory as event-log-derived, inspectable, deletable (fits ADR 0007). Transcript diff cards sharpen P2: the run panel should show real diffs, not summaries. AGENTS.md-on-setup: we already do this; theirs is confirmation. Outposts = mirror image of Stellarc (self-hosted brain, BYO execution). |
| **Factory (Droids)** | CLI v0.232.0 / Desktop v0.189.0 (2026-10-02): legacy-model warnings, session sidebar sorted needs-input-first, faster MCP HTTP connects. Cadence unchanged. | CLI v0.232.0, 2026-10-02 | proprietary | 4 | **REJECT** | Unchanged: execution cadence, not architecture. |
| **Huly** | Product blog still dormant (last product-update post Oct 2024). Repo active but tracker-focused: Gantt redesign (Oct 7), auth/OIDC hardening + token-log redaction (Oct 13). CVE-2026-56769 (SSRF, CVSS 8.5) fixed after 0.7.423. | repo pushed 2026-10-13 | EPL-2.0 (27.9k★) | 3 | **REJECT** | Quarterly check confirms: no agent-native story. Next check January 2027. |

## Proposals

### P1 — Run budgets: capture *and enforce* (ADOPT-grade; extends 2026-10-08 P3)

Last cycle's run-ledger proposal was visibility. Both Linear (Oct 8) and Plane
(Sep 30) have now moved to **enforcement**: Linear pauses all AI credit usage
when a workspace/user/loop limit is hit until it resets or an admin raises it;
Plane caps daily/weekly. Stellarc is BYO-keys so this isn't billing — it's an
operator guardrail, and on our substrate it's cheap:

- Capture per-run token/cost at the stellarc-node ACP seam as events (already
  proposed; nothing new to design there).
- Add a **budget entity** (workspace / agent principal / trigger rule, with a
  window and a ceiling) checked by the run scheduler before enqueueing *and*
  before each continuation.
- Exhausted budget parks the run in a dedicated `budget_exhausted` state —
  same machine as Plane's "needs input": visible on the issue, resumable when
  the window resets or an admin raises it. One event-log pattern match, not a
  new subsystem.
- Workspace-level policy for which agent principals may exceed soft warnings
  (Devin's required/optional/forbidden governance shape).

### P2 — Realtime worktree diff stream in the run panel (ADOPT-grade)

Linear's Oct 8 ship — diffs update live during a coding session, *including
uncommitted changes from follow-up prompts*, so humans catch wrong turns and
steer before the PR exists — is the single highest-leverage run-UX idea this
cycle, and stellarc-node already sits on the repo:

- During an active run, stellarc-node emits throttled `run.diffstat` /
  `run.dirty_files` events (git status + diff --stat, cheap) into the event
  log; the run panel renders an evolving file list and +/- ticker.
- Follow with periodic full-diff snapshots on demand (click a file → fetch
  current diff) so review can start before the PR opens.
- Steering already exists via the ACP session; the diff stream is what makes
  steering *informed*.

### P3 — Stacked-PR-aware issue ↔ PR linkage (TRIAL)

Linear shipped stacked-PR display in Diffs on Oct 8; GitHub made stacked PRs
GA platform-wide on Oct 6. Two independent ships in one week means agent
workflows (which naturally produce stacks: base PR → follow-up fixes) will
hit Stellarc's issue view soon. Trial: when our GitHub linkage lands, model
stacks explicitly — group child PRs under the stack root on the issue's PR
widget, one collapsible row with per-PR CI/merge state, mirroring Linear's
blocked on the PR-linking design, hence TRIAL not ADOPT.

### P4 — Agent memory as event-log-derived artifacts, with nightly distillation (ADOPT-grade)

Devin's Oct 9 "Memory and dreaming" is the first product-grade agent memory
we can verify: persistent per-user (explicitly *not* org-shared), stored as
human-reviewable files, distilled by a nightly job that reviews recent
sessions, with per-user and org/enterprise admin on/off control. Every design
choice maps onto Stellarc's substrate:

- **Event-log-derived, not a parallel store.** Memory writes are events; the
  derived artifacts (per-agent "memory files") are projections like any other
  view — rebuildable, inspectable, deletable (ADR 0007).
- **Nightly distillation as a scheduled run.** A `memory.distill` run type
  over the agent's recent runs writes refined memory events; runs on the same
  scheduler as everything else, subject to the same budgets (P1).
- **Scope and control.** Memory belongs to the agent principal (the analog of
  Devin's per-user scope), with a workspace policy switch; a memory viewer in
  the agent's panel (read + delete) is the trust surface.
- **Why now:** OpenHands' in-conversation secrets modal (#18408) and Devin's
  reviewable memory files converge on the same principle — agent state that
  touches trust must be inspectable and revocable in-product. Stellarc can
  ship both primitives on one substrate.

## Sources

- Linear changelog 2026-10-08 (stacked PRs, realtime diffs, spend limits): https://linear.app/changelog/2026-10-08-stacked-pull-requests
- Linear changelog 2026-09-24 (coding-agent controls, adaptive routing): https://linear.app/changelog/2026-09-24-new-controls-for-linear-coding-agent
- Plane changelog / agents GA: https://plane.so/changelog/2026-09-30-plane-agents-propel-new-ai-models · self-host release table: https://developers.plane.so/self-hosting/all-releases · repo: github.com/makeplane/plane (API 2026-10-13)
- Paseo releases v0.11.0–v0.11.2: github.com/getpaseo/paseo/releases (API 2026-10-13)
- Cursor changelog + IDE 3.23.10 notes: https://cursor.com/changelog (2026-10-13)
- GitHub changelog Oct 2026 (Copilot weekly releases Oct 5, sandboxing GA, stacked PRs GA): https://github.blog/changelog/month/10-2026
- OpenHands releases v1.26.0–v1.27.1: github.com/All-Hands-AI/OpenHands/releases (API 2026-10-13)
- Devin release notes: https://docs.devin.ai/release-notes/overview (Oct 7, 2026 entry) and /release-notes/2026
- Factory full changelog: https://docs.factory.com/changelog/release-notes (CLI v0.232.0, 2026-10-02)
- Huly repo activity + CVE record: github.com/hcengineering/platform (API 2026-10-13), opencve.io CVE-2026-56769
- Cursor Origin App Marketplace + iOS remote control: https://cursor.com/changelog (entries 2026-10-13 and 2026-10-06, verified 2026-10-13 evening)
- Devin release notes Oct 9 (memory/dreaming, transcript diff cards, AGENTS.md on setup): https://docs.devin.ai/release-notes/2026 (verified 2026-10-13 evening)
- OpenHands main post-v1.27.1 (secrets-request modal #18408, MARS web bridge default): github.com/All-Hands-AI/OpenHands commits since 2026-10-12T20:00Z (API 2026-10-13 evening)
- Copilot budgets search/filter (Oct 13) and JetBrains release (Oct 10): https://github.blog/changelog/month/10-2026 (verified 2026-10-13 evening)
