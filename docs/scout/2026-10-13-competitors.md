# Scout — Competitors, 2026-10-13

Beat: **competitors**. Delta window: 2026-10-08 → 2026-10-13 (plus Sep 24–30
items the 10-08 report missed). Every claim verified against a primary source
(vendor changelog/release notes, GitHub release API, or repo metadata) on
2026-10-13. Context: Stellarc = self-hostable, Effect-v4 tracker (Kaneo
parity, append-only event log ADR 0007) + BYO agent runtime over ACP
(ADR 0011), Tauri 2 shell, React UI.

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
agent definitions.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Linear** | Stacked PRs in Diffs: move through a stack, see review/CI/merge status per PR; GitHub-native stacks preview every affected PR and merge from Linear. Realtime diffs during coding sessions — diffs update live incl. uncommitted changes from follow-up prompts, so you can steer before/after PR. AI credit usage explorer + spend limits at workspace/user/loop level; hitting a limit pauses further AI usage until reset. Guided Reviews on Basic. (Sep 24: adaptive routing to cheaper models w/ restart-on-default keeping the PR, environment secrets, open-weight GLM sessions, team loops triggers, durable project/initiative IDs.) | changelog 2026-10-08, 2026-09-24 | proprietary | 5 | **WATCH** | Realtime diffs and pause-on-limit spend caps are the two run-UX patterns to copy this cycle. Stacked-PR display pairs with GitHub's GA the same week — two independent ships = real demand. |
| **Plane** | Agents GA on cloud (Sep 30, covered last cycle) now documented for devs (Beta): instructions/skills/triggers/memory/MCP-tools schema, run panel, per-project scoping. Daily + weekly AI credit limits shipped with it. Self-host CE line moves fast: 3.3.0 (Sep 24) → 3.3.3 (Oct 8) per developers.plane.so release table; GitHub repo releases stale at v1.4.x but repo pushed Oct 12. | self-host 3.3.3 (2026-10-08); cloud Sep 30 | AGPL-3.0 (60.7k★, pushed 2026-10-12) | 4 | **TRIAL** | Their agent-definition schema remains the field-for-field reference for our agent entities; their credit caps (see Linear) confirm enforcement is table stakes. AGPL: patterns only, no code. |
| **Multica** | No new release verified this cycle; public changelog mirrors serve stale caches (Aug entries). Last verified: v0.6.1 (2026-10-01, prior report). | v0.6.1, 2026-10-01 | proprietary | 5 | **WATCH** | Benchmark unchanged this cycle; recheck next run. |
| **Paseo** | v0.11.0 (2026-10-07): **plugin registry** (paseo.sh/plugins) — `paseo plugin add owner/slug` installs reviewed plugins; SDK grew screens/sidebar items, `spawnProcess`/`execCommand`, usage sources, `playAudio`. **Usage dialog** aggregates every subscription account's quota windows, discovering ChatGPT/Claude logins from Codex CLI, Claude Code keychain, Pi, OMP. Muse Code + Antigravity providers; mid-turn steering for OMP agents; per-provider default options in config.json. v0.11.1: Claude Haiku 5.5. v0.11.2 (2026-10-09) fixes. | v0.11.2, 2026-10-09 | Apache-2.0 (custom notice; 20.7k★, pushed 2026-10-13) | 4 | **TRIAL** | The plugin registry is the distribution pattern for Stellarc skills/agent templates. Their usage aggregation across BYO accounts is the honest version of run economics when you don't bill — feeds P1. |
| **Cursor** | IDE 3.23.10 (Oct 1): team/org **MCP allowlists** with import/export, **service tokens** (create/rotate/revoke/scopes), in-product status page, xAI account linking. (Remote control for local agents + Rollouts/Security Review covered last cycle.) | IDE 3.23.10, 2026-10-01 | proprietary | 5 | **WATCH** | MCP allowlists at org level = the same governance shape as Devin's plugin policies; supports P1's policy layer. |
| **GitHub Copilot coding agent** | **Local sandboxing GA** (Oct 7) in CLI, Copilot app, VS Code Agent Host — limits agent access to files/networks/credentials, included at no extra cost. Claude Haiku 5.5 (Oct 7). `/model` discovers local Ollama models in CLI 1.0.94+. Copilot app: separate license vs repository accounts. VS Code 1.141: agent sessions side-by-side grid in Agents window, worktree cleanup. **Stacked pull requests GA** platform-wide (Oct 6). Enterprise-managed agent-operation permissions (Sep 9). | changelog 2026-10-06→09 | proprietary | 5 | **ADOPT (pattern)** | Free local sandboxing sets the floor for what "safe local run" means in 2026 — stellarc-node should treat sandbox profiles as a first-class run option. Stacked-PRs GA + Linear's ship the same week makes P3 a real requirement, not a nicety. |
| **OpenHands** | v1.27.0/.1 (2026-10-12): **OpenCode and Pi as built-in ACP agents** on local backends; **ACP model lists taken from the agent instead of hardcoded**; automation-setup split panel with persisted drafts + agent-assisted form. v1.26.0 (2026-10-08): "narrow needs review" automation status; verify-openhands self-verification harness (mock-LLM e2e behavior maps, recorded video). | v1.27.1, 2026-10-12 | MIT (90.8k★, pushed 2026-10-13) | 4 | **WATCH** | ACP-model-discovery is exactly what stellarc-node should do (ask the agent, don't pin lists). MIT: their verify-openhands harness (agent tests the product with a mock LLM) is a pattern worth stealing for our own agent-UX QA. |
| **Devin (Cognition)** | Oct 7: **notification inbox** with per-type routing + phone push; merge-queue states across the app; playbook-pinned Devin mode. 2026 H2: **Devin Outposts** (run execution on your own worker nodes, brain stays in their cloud — self-hosted execution, managed reasoning); **centralized plugin/skill governance** (required/optional/forbidden plugin policies, orgs inherit enterprise policies); multi-repo code scans with chained attack paths; scheduled scans as automations; dedicated "Waiting" status for sleeping sessions; queued messages delivered mid-wait. SWE-2 model (Sep 10, post-trained Kimi K3). | release notes 2026-10-07 | proprietary | 5 | **WATCH** | Outposts proves customers want self-hosted execution with a managed brain — the mirror image of Stellarc (self-hosted brain, BYO execution). Their plugin-policy inheritance is the governance model for `.stellarc/agents/` policy. Inbox with per-type routing remains the UX bar for multi-agent notifications. |
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
grouping. Blocked on the PR-linking design, hence TRIAL not ADOPT.

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
