# Scout — Competitors, 2026-10-14

Beat: **competitors**. Delta window: 2026-10-13 (evening pass) → 2026-10-14 ~19:00 UTC.
Every claim verified against a primary source (vendor changelog/release notes,
GitHub API, or repo metadata) on 2026-10-14. Context: Stellarc = self-hostable,
inert control plane (v2 charter D4) + BYO agent runtime over ACP (ADR 0011),
Tauri 2 shell, React UI. `docs/steal-reject-matrix.md` and `docs/v2-charter.md`
are the standing filters for everything below.

## The one-line read

A quiet day on the product-changelog front (Linear, Cursor, Devin, Plane cloud
all unchanged since the Oct 13 evening pass) — but the delta hides two real
signals: **Factory shipped 8 releases the last pass missed entirely**
(v0.233.0 → v0.240.0, Oct 3–13), a coherent arc of **Script governance**
(permission requests for runtime-built inputs, pre-run approval cards showing
real values, hour-long waits) plus **prompt-injection hardening** (mentioned-file
safety, runtime-settings isolation) — exactly the trust model ADR 0011 parked
when it chose `allow_once`; and **GitHub made push attribution durable**
(Oct 12, limited public preview): every commit now records the authenticated
pusher alongside author/committer — the identity primitive Stellarc's D12
(actor + on-behalf-of) needs before GitHub linkage lands. Multica v0.6.2
(Oct 13) is otherwise a fix-release (Codex resume across worktrees, wakeup
scheduler drain, daemon autostart opt-in). OpenHands' post-release commits
converge on **run continuity**: hold the message until the runtime is
reachable, wake the paused sandbox from Resume. Convergence watch: **agent-run
continuity is becoming the differentiator class** — Devin's 14-day resume
window, Factory's interrupted-Script markers, OpenHands' reachable-runtime
holds, Paseo's child-agent completion covers, Multica's cross-worktree resume.
Everyone is solving "the run survives the world falling over."

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Linear** | Unchanged since Oct 8 (stacked PRs, realtime diffs, spend limits; top changelog entry still Oct 8). No new release in window. | changelog top 2026-10-08 | proprietary | 5 | **WATCH** | Nothing new to steal; P1–P4 from 10-13 stand. |
| **Plane** | Cloud changelog top entry still Sep 30 (Agents GA + Propel). Self-host CE table unchanged: 3.3.3 (Oct 8) latest; repo pushed Oct 12 (v1.4.3-rc1 tag Oct 6). | self-host 3.3.3 (2026-10-08); cloud Sep 30 | AGPL-3.0 (60.7k★) | 4 | **TRIAL** | Unchanged; agent-definition schema remains the field-for-field reference. |
| **Multica** | **v0.6.2 (2026-10-13)** — fix-release, ~50 entries. Notable: **resume Codex across continued local worktrees** (#9218); wakeup scheduler drains inputs + due checks in one pass (#9202) and surfaces recoverable PR-condition diagnostics (#9066); **opt-in daemon autostart** (#8864); fix scheduler so dense-cron autopilot triggers don't go permanently silent (#9191); preserve Hermes sessions across worktrees (ZIC-301); interrupt Codex turns after repeated Guardian 429s (#8934); patch Next.js GHSA-vcvr-r3jv-pc5j. | v0.6.2, 2026-10-13 | proprietary | 5 | **WATCH** | The reference implementation keeps hardening *run continuity* (resume across worktrees, silent-trigger fix, wakeup diagnostics) — the same class as our lease/reap machine. Their Guardian-429 interrupt is a good `agent_error.*` taxonomy candidate (provider throttle = stop, don't retry-burn). |
| **Paseo** | No new release (v0.11.2, Oct 9 still latest) but **30+ commits Oct 13–14** on main, all UX/robustness: worktree restore for subdirectory workspaces, Git diffs for quoted filenames, voice TTS via OpenAI-compatible servers, **closable sheets for files/subagents on phones**, `paseo agent ls` past 200, child-agent completion covered before `create_agent` returns, ACP provider process release after history resume. | v0.11.2 2026-10-09; main pushed 2026-10-14 | Apache-2.0 (20.9k★) | 4 | **TRIAL** | The ACP-seam daemon keeps proving the model: native-session pointers, provider process lifecycle hygiene, mobile sheets for agent surfaces. Their "cover child completion before the parent API returns" is a small but real pattern for stellarc-node's task-claim lifecycle. |
| **Cursor** | Unchanged since Oct 13 evening (Origin App Marketplace + iOS remote control top the changelog). | changelog top 2026-10-13 | proprietary | 5 | **WATCH** | Nothing new; Origin app model (JWT + installation tokens + webhooks) still the integration shape to study before any Stellarc app surface. |
| **GitHub Copilot / platform** | **Oct 14: GitHub Actions workflow lockfiles** (public preview, GHES-style pinning of workflow deps — supply-chain governance for CI). **Oct 13: GitHub App improvements for least privilege** (easier move off classic PATs, fewer sensitive permissions requested); Gemini 4 Argon GA in Copilot; enterprise-managed settings enforcement (server-managed settings at startup, min client versions); budgets search/filter (covered 10-13). **Oct 12: push attribution for commits** (limited public preview) — durable authenticated-pusher identity in UI + API alongside author/committer. | changelog 2026-10-12→14 | proprietary | 5 | **WATCH** (push attribution: **steal the requirement**) | Push attribution is the identity primitive for D12: when an agent pushes, the *run* (not just the commit author string) should be durably recorded. Stellarc's GitHub linkage should model this from day one — actor = agent principal, on-behalf-of = assigner. Actions lockfiles: same trust shape as our capability-grant manifests (D3) — pin what runs in CI. |
| **OpenHands** | v1.27.1 + main, 22 commits since Oct 13 midday: **cloud-sandbox resume/hold pair** — wake the paused cloud sandbox from Resume instead of calling its runtime (OHE-3407, #18442); hold a message until the cloud runtime is reachable instead of failing it (OHE-3314, #18443); verify-openhands adopts the shared known-bug contract (#18355); LLM-profile form fix; a11y/light-theme polish batch. | main@#18443, 2026-10-14 | MIT (90.8k★) | 4 | **WATCH** | The hold-don't-fail pair is a third confirmation of run continuity as a differentiator class — and it maps cleanly onto our state machine: a runtime-reachability failure is `platform.*` (retryable, lease machine), not `agent_error.*`. Their known-bug contract for self-verification is worth a look when we build agent-UX QA. |
| **Devin (Cognition)** | Unchanged since Oct 9 (memory/dreaming, transcript diff cards). No new release notes in window. | release notes top 2026-10-09 | proprietary | 5 | **WATCH** | P4 (event-log-derived memory + nightly distillation) from 10-13 stands. |
| **Factory (Droids)** | **Correction + catch-up: the last pass's "v0.232.0, Oct 2, cadence unchanged" missed 8 releases.** v0.233–v0.240 (Oct 3–13): **Script governance arc** — permission requests for calls whose input is built at run time (v0.236), approval cards showing real resolved values before the Script runs (v0.237), interrupted-Script markers on restart (v0.234), status lines with result + wall time, progress-instead-of-stalled, ~1h long waits (v0.238/v0.239); **prompt-injection hardening** — mentioned-file safety (@-mentioned file text can't change Droid's instructions), runtime-settings isolation (hooks/MCP/commands Droid starts don't inherit its settings file) (both v0.240); **Droid doctor** (opt-in connectivity + MCP + full-turn health check) (v0.240); latest-model aliases (pin "newest in tier"), telemetry opt-out that actually stops every Factory-bound signal (v0.238), editor MCP server local-only (v0.238), hooks that can block a message before the turn runs (v0.234), remote-control naming + faster reconnect after sleep. | CLI v0.240.0 / Desktop v0.197.0, 2026-10-13 | proprietary | 4 | **REJECT → WATCH (promoted)** | The promotion is earned: Factory is now the most explicit **approval-before-execution** implementation among the competitors, and ADR 0011's `allow_once`-for-everything interim choice is exactly the gap they're exploiting. Their @-mention injection hardening + settings isolation is the checklist for stellarc-node's harness-facing trust boundary. Doctor = the preflight/health-check pattern for node onboarding (hello + capabilities + health in one). |
| **Huly** | Repo steady, tracker-only: fix `hasWorkspacePermission` returning true for missing grants (#11067, Oct 14 — an authz correctness fix worth noting), Gantt working-day duration fix, OAuth tokens kept out of logs (#11066). | repo pushed 2026-10-14 | EPL-2.0 (27.9k★) | 3 | **REJECT** | Confirms quarterly cadence: no agent-native story. The authz-grant bug is a free lesson for our D3 grant-check implementation (absent grant ≠ implicit allow). Next check January 2027. |

## Proposals

### P1 — Replace blanket `allow_once` with a scoped permission pipeline on stellarc-node (ADOPT-grade)

ADR 0011 parks permissions at "the node answers `session/request_permission`
with `allow_once`" because the node owner chose unattended operation. Factory's
Oct 3–13 arc shows where that lands in practice: **runtime-built tool inputs
bypass review, and mentioned-file content can rewrite agent instructions** —
two injection classes our current interim choice inherits wholesale. Multica's
answer (never deliver MCP config into harness files) covers config; it does not
cover runtime tool calls. Concrete, doctrine-shaped:

- **Capability-scoped auto-allow, not blanket auto-allow.** The agent
  definition already carries `mcpServers`; extend the agent entity with a
  permission policy block (allow-list of tool patterns that auto-approve —
  `read_*`, `grep`, `glob` — everything else parks the task in a
  `needs_permission` state, the same machine as `needs_input` proposed for
  OpenHands' secrets modal). Plane's agent schema has the field-for-field
  reference shape.
- **Approval cards with resolved values** (Factory v0.237 pattern): the
  permission request the human sees must show the *actual* arguments the tool
  will run with, not the template that produced them.
- **Injection hygiene on the node** (Factory v0.240 pattern): content read
  from workspace files or MCP tool results is never concatenated into the
  harness's instruction channel; child processes (hooks/MCP) do not inherit
  stellarc-node's env/settings.
- Everything lands as `agents:*` events on the org log (D10) — permission
  requested / granted / denied are first-class audit items, which is D12's
  audit trail for tool use.

### P2 — Durable push attribution in GitHub linkage from day one (ADOPT-grade)

GitHub's Oct 12 push-attribution preview (authenticated pusher recorded
durably on every commit, surfaced in UI + API) makes "who pushed this" a
platform-level fact. Stellarc's D12 already mandates `actor` + optional
`on_behalf_of` on every action; the GitHub linkage should not be the hole in
that doctrine. When an agent's run pushes a branch, the linkage record should
capture `(commit sha, run id, agent principal, assigner)` — so the issue view
answers "which run pushed this" without forensics. Cheap now (one field on the
linkage event), expensive later (backfill is impossible for merged history).
Rides whatever issue designs the GitHub integration.

### P3 — Run-continuity parity checklist for the task state machine (TRIAL)

Four independent ships in eight days (Devin 14-day resume + queued
mid-wait messages; Factory interrupted-Script markers + hour-long waits;
OpenHands hold-until-reachable + wake-from-Resume; Multica cross-worktree
Codex resume) say run continuity is the 2026 differentiator class. Our state
machine has the bones (leases, attempts, platform-vs-agent error taxonomy,
idempotent reports keyed `(task, attempt, node)`); the checklist to audit
against: (a) a run parked by `platform.*` resumes with the same native session
pointer, not a fresh session; (b) steering messages queued while parked are
delivered on resume, not dropped (Devin's "Waiting" queue); (c) node sleep /
network loss is `platform.*`, never a silent failure; (d) `exec`-style
blocking waits don't kill the lease heartbeat. Trial: fold into the
multi-turn session work already on the roadmap (`nativeSessionId` reuse in
ADR 0011's interim table) rather than a new issue.

### P4 — Node "doctor" preflight on hello (WATCH)

Factory's Droid doctor (opt-in: model connectivity, MCP servers, a complete
turn) is the onboarding pattern for stellarc-node: when a node registers via
`hello`, an operator-triggered health check that walks harness availability →
credential reachability → a minimal ACP round-trip would catch the "agent
queued but harness missing" class before tasks land on it. Small, but it
belongs to the node-onboarding issue, not a standalone brief yet.

## Notable non-findings

- Linear, Cursor, Devin, Plane cloud: no new entries — the Oct 13 evening
  pass remains current for all four.
- GitHub Universe 2026 is Oct 28–29 (announced on the changelog page footer);
  expect a Copilot/agent release wave the following week — schedule the next
  competitors pass after it.
- Web search provider still down (`9router` unregistered — fifth consecutive
  run); GitHub API + direct changelog fetches carried the beat again.
- Last pass's Factory row ("v0.232.0 … cadence unchanged") was wrong in
  hindsight — the releases existed but weren't checked. Process fix applied
  this run: changelog *feed* (`feed.json`) diffed, not just the page top.

## Sources

- Linear changelog (top entry unchanged): https://linear.app/changelog (fetched 2026-10-14)
- Plane cloud changelog + self-host release table: https://plane.so/changelog · https://developers.plane.so/self-hosting/all-releases (2026-10-14)
- Multica v0.6.2 release notes: github.com/multica-ai/multica/releases/tag/v0.6.2 (API 2026-10-14)
- Paseo repo: github.com/getpaseo/paseo (API 2026-10-14, main@18:44Z)
- Cursor changelog (top entry unchanged): https://cursor.com/changelog (2026-10-14)
- GitHub changelog Oct 12–14 (push attribution, Actions lockfiles, GitHub App least privilege, Gemini 4 Argon): https://github.blog/changelog/month/10-2026 (2026-10-14)
- OpenHands main post-v1.27.1 (#18442/#18443 + 20 more): github.com/All-Hands-AI/OpenHands (API 2026-10-14)
- Devin release notes (unchanged): https://docs.devin.ai/release-notes/2026 (2026-10-14)
- Factory full changelog feed (241 releases; October: 10): https://docs.factory.com/docs/changelog/feed.json (2026-10-14)
- Huly repo: github.com/hcengineering/platform (API 2026-10-14, #11067/#11066)
