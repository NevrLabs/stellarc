# Scout — Competitors, 2026-10-15

Beat: **competitors**. Delta window: 2026-10-14 ~19:00 UTC → 2026-10-15 19:05 UTC.
Every claim verified against a primary source (vendor changelog/release notes,
GitHub API, or repo metadata) on 2026-10-15. Context: Stellarc = self-hostable,
inert control plane (v2 charter D4) + BYO agent runtime over ACP (ADR 0011),
Tauri 2 shell, React UI. `docs/steal-reject-matrix.md` and `docs/v2-charter.md`
are the standing filters for everything below.

## The one-line read

Last pass's P1 **landed**: NEVR-198 (PR #103, merged to dev 10-15) replaced the
blanket `allow_once` on stellarc-node with a scoped permission pipeline —
`permission_policy` on the agent entity, `needs_permission` parked status with
the ACP session held open, verdicts on heartbeat, `agent_error.permission_denied`
in the never-retried taxonomy, harness env allowlist, and
`agents:task_permission_{requested,granted,denied}` on the org log. The
competitor window itself was thin on headline ships: **Devin shipped a broad
Oct 14 release** (interrupt-keeps-partial-reply, session-link chips, child
sessions across the archive split, Review-manager role, SARIF export,
observability plugins) and **Factory shipped v0.241/v0.242** (resume by session
id, spec-continuation chats, mid-stream cutoff retries — a fifth and sixth
run-continuity ship in the class). Paseo shipped v0.11.3/v0.11.4 (Hoplite as
first sponsor + opt-in provider; scoped model discovery) and pushed ~35 commits.
GitHub's Oct 15 brings **agentic autofix for code scanning to GA** plus
HydraFusion Max. Multica's unreleased main carries two lessons: **revoke
workspace WebSocket access when membership ends** (MUL-8014) and **recover
undelivered batch claims after timeout** (MUL-7658). Linear, Cursor, Plane
cloud, OpenHands releases: unchanged.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Linear** | Unchanged since Oct 8 (top changelog entry still Oct 8: stacked PRs, realtime diffs, spend limits). No new release in window. | changelog top 2026-10-08 | proprietary | 5 | **WATCH** | Nothing new; P1–P4 from 10-13 stand. |
| **Plane** | Cloud changelog top entry still Sep 30 (Agents GA + Propel). Self-host CE table unchanged: 3.3.3 (Oct 8) latest. Repo: two commits Oct 15 — persist generated AIO secrets / stop regenerating SECRET_KEY for an existing DB (#9987), dependabot alerts resolved (#10011); v1.4.3-rc1 (Oct 6) still latest tag. | self-host 3.3.3 (2026-10-08); cloud Sep 30 | AGPL-3.0 (60.9k★) | 4 | **TRIAL** | Unchanged product-wise. The AIO SECRET_KEY regen fix is a free lesson for our self-host story: never regenerate secrets for an existing database on upgrade. |
| **Multica** | No new release (v0.6.2, Oct 13, still latest) but main carries 7 merged PRs Oct 15, two doctrine-relevant: **revoke workspace WebSocket access on member removal** (#9249/MUL-8014 — server revokes live connections *and* checks primary-DB membership before every broadcast write, covering delayed/lost remote removal signals); **recover undelivered batch claims after timeout** (#8774/MUL-7658/ZIC-260 — batch claim commits but payload construction fails → release omitted claims via generation checks + daemon wakeup, deliver successful payloads before recovery work). Plus: builder-draft recovery pair (#9265, #8514), preserve Git content during artifact GC (#7893), mixed RTL/LTR editor text (#9261). | v0.6.2 2026-10-13; main pushed 2026-10-15 | proprietary | 5 | **WATCH** | Both fixes are directly in our lane. Membership revocation must reach *live* sockets and re-check membership at write time — our realtime plane needs the same two-layer rule (revoke + write-time check) once org-level realtime lands. Batch-claim recovery is the exact shape of our task-claim machine: a committed claim whose delivery failed must be releasable by generation check, not lost. |
| **Paseo** | **v0.11.3 + v0.11.4 (both 2026-10-15)** — Hoplite joins as **first company sponsor**; Hoplite added as opt-in provider in the ACP provider catalog with searchable grid (#6953/#7030); v0.11.4 scopes project-dependent model discovery to linked workspaces. ~35 commits in window, themes: **question/answer UX at the ACP seam** (multi-select OpenCode v2 questions answered from the question card #6149; malformed Claude question answers stay retryable #6936; slash-command argument hints preserved #6920), **session identity hygiene** (explicit Claude session names preserved on import #6930; resume session by id — see Factory), mobile sheets stacked on one stack with agent facts in-sheet (#6958), streamed OpenCode v2 chunks not holding their whole message (#6262), ACP provider process release after history resume. | v0.11.4 2026-10-15 | Apache-2.0 (21.0k★) | 4 | **TRIAL** | The ACP-seam daemon remains our closest architectural cousin, now with a funding signal (sponsor = validation of the BYO-agent gateway model). Their question-card pattern — every `session/request` question type gets a native UI affordance, malformed answers retryable — is the reference for our `needs_input`/`needs_permission` transcript UX. Session-name preservation on import: when we adopt multi-harness support, our session identity mapping must not silently rename native sessions. |
| **Cursor** | Unchanged since Oct 13 (Origin App Marketplace + iOS remote control still top the changelog; last entry 2026-10-13). | changelog top 2026-10-13 | proprietary | 5 | **WATCH** | Nothing new; Origin app model (JWT + installation tokens + webhooks) remains the integration shape to study before any Stellarc app surface. |
| **GitHub Copilot / platform** | **Oct 15: agentic autofix for code scanning alerts GA** (autonomously explores files and proposes fixes across the codebase); email notifications for repo push events retired (spam/abuse); **HydraFusion updates + Max option** (updated model pool, orchestration workflows; VS Code + Copilot app + coding agent). Oct 14 lockfiles/App-least-privilege covered last pass. | changelog 2026-10-15 | proprietary | 5 | **WATCH** | Agentic autofix GA is the template for **closed-loop remediation wired into findings**: alert → agent → PR. When Stellarc's GitHub linkage lands, "spawn a task from a code-scanning alert with the finding as context" is the same pattern — our D10 event log is the natural trigger bus. |
| **OpenHands** | No new release (v1.27.1, Oct 12, latest). Main: 9 commits in window, all small-batch polish — automations setup UX (error-pillar contrast on every theme #18463, draft-refusal reason shown #18462, setup page mapped as F28 #18452), settings switches keyboard-accessible (#18370), agent-profiles kept on per-launch LLM picks and in /new (#18419), agent-server bumped to 1.55.0. | main@#18482, 2026-10-15 | MIT (91.0k★) | 4 | **WATCH** | Their verify-openhands self-test now maps *maintenance windows* into the known-bug contract — QA of the agent surface is treated as first-class docs. Agent-profile persistence on per-launch model picks is a small UX law for our agent definitions: an ad-hoc runtime override must not overwrite the saved profile. |
| **Devin (Cognition)** | **Oct 14 release (new since last pass)** — breadth across surface + enterprise: **Interrupting Devin keeps the partial reply** (interrupt no longer discards what the user already saw); session links render as **chips with ticket key + title**; child sessions show in the sidebar across the archive split (unarchived child of archived parent → Recents; archived child of active parent → Archived); **Review Manager role** (org-level, Manage Review without integrations admin); merge method remembered per repo+branch; **SARIF 2.1.0 export** for code-scan findings (UI + API, alongside CSV); new observability plugins (Splunk, Elastic, Dynatrace, Chronosphere, GCP Monitoring); clearer MCP-server approval cards (state the requested action: delete/enable/disable; keep server name visible after verdict); GHES app permissions aligned with github.com app; repositories + blueprint APIs promoted v3beta1→v3; Terraform provider gains blueprint/repo-indexing resources; browser previews shared to Slack threads; venv picker uses starred default; chat-width preference. | release notes 2026-10-14 | proprietary | 5 | **WATCH** | Three steals. (1) **Interrupt preserves the partial reply** — our interrupt path must write what streamed so far as a transcript item before killing the run; users lose trust when an interrupt erases evidence. (2) **Session-link chips with ticket key + title** — cross-references between runs/issues in agent output should render as first-class entities, not raw URLs; this is the same "everything is an entity" law as our D10 event log. (3) **MCP approval cards that name the requested action** — NEVR-198's approval transcript should state the verb (delete/enable/disable/execute) not just the server; copy review when the permission UI ships. SARIF export + Terraform provider: enterprise-integration table stakes to keep on the radar, not yet us. |
| **Factory (Droids)** | **v0.241.0 + v0.242.0 (10-13/10-15)**. v0.242: **resume a session by id** (`/resume` + `/sessions` open directly by id); Ask Side Chat on highlighted text; **continue a spec in chat** (approved spec continues in a new chat seeded with its context); timeout retries (a timed-out request retries instead of failing the turn); mid-stream cutoffs retried so the turn finishes; custom-model output limits respected; turn that switches models drops the first model's unfinished reasoning/tool calls; **Droid refuses kill commands that would signal its own process**; Excel skill installs a pinned spreadsheet library and skips install scripts (supply-chain). v0.241: batched design-mode comments; Slack follow-up guidance; Script startup fallback (run commands directly when Script fails to start); context usage measured on active conversation after compaction, not whole history. | CLI v0.242.0 / Desktop v0.199.0, 2026-10-15 | proprietary | 4 | **WATCH** | The continuity arc continues (resume-by-id is ship #5–6 in the class). Four concrete steals: (1) **refuse self-kill** — stellarc-node's exec surface must reject a command whose target is the node process itself or its daemon; cheap guard, real footgun. (2) **Spec continuation** — an approved plan (our approval cards) should be able to seed a fresh session with the plan as context, so long runs don't die of context rot; pairs with our compaction work. (3) **Timeout retry as default** — provider timeouts are `platform.*` retryable, never turn-fatal; our taxonomy already says this, Factory confirms the UX expectation. (4) **Pinned deps + skipped install scripts for skills** — if Stellarc ever ships skills/tools with dependencies, pin versions and skip postinstall scripts; Factory treated script-runs-at-install as a security class. |
| **Huly** | No commits in window (last push Oct 14, 05:50Z). Quarterly cadence confirmed; no agent-native story. | repo pushed 2026-10-14 | EPL-2.0 (27.9k★) | 3 | **REJECT** | Row sleeps until January 2027 per last pass. |

## Proposals

### P1 — Interrupt-path transcript preservation + self-kill guard on stellarc-node (ADOPT-grade)

Two small, doctrine-shaped hardening items that fall out of this window's
delta, both in the runner's blast radius:

- **Interrupt keeps the partial reply** (Devin Oct 14). When a task is
  interrupted — operator cancel, lease loss, or harness interrupt — the
  runner must flush whatever the assistant already streamed into the
  transcript as a final item (marked interrupted) before the session is
  torn down. Today an interrupt mid-stream risks losing the only record of
  what the agent did. This is a transcript-write ordering guarantee, not a
  UI feature; it belongs next to NEVR-198's approval-transcript writes.
- **Refuse self-kill** (Factory v0.242). The exec surface on stellarc-node
  must reject a command whose target PID/process matches the node itself or
  its supervisor before it reaches the harness — Factory shipped this as a
  bug fix, meaning agents actually did this. One guard function + a
  rejected-exec transcript item.

### P2 — Plan/spec continuation sessions (TRIAL)

Factory's "continue a spec in chat" + our existing approval-card machinery
point at the same gap: once a plan is approved, the working session that
executed it accumulates context debt, and a fresh session seeded with the
approved plan (and the approval decision) starts clean. For Stellarc this is
"fork a task from an approval": new attempt, same task, transcript seeded
with the approved plan artifact. Trial: design note first (how the seeded
context interacts with our compaction and the `(task, attempt, node)`
idempotency keys), then a brief if it survives.

### P3 — Findings-triggered tasks via the event log (WATCH)

GitHub's agentic autofix GA (Oct 15) closes the loop alert → agent → PR
inside the platform. Stellarc's equivalent is already half-built: D10's org
event log is a trigger bus, and ADR 0011's agent definitions support
schedules/triggers. The pattern to watch for: when the GitHub linkage lands,
a code-scanning alert (or any webhook-sourced finding) should be able to
spawn a task with the finding as structured context, with the spawn itself
logged as `agents:*`. Not a brief yet — it depends on the linkage issue —
but the event-log design should not preclude subscribe-and-spawn.

## Notable non-findings

- Linear, Cursor, Plane cloud, OpenHands: no new releases — the Oct 13/14
  entries remain current.
- GitHub Universe 2026 is Oct 28–29: expect the Copilot/agent release wave
  the following week. **Schedule the next competitors pass after Oct 29.**
- Web search/extract provider still down (`9router` unregistered — sixth
  consecutive run); GitHub API + direct curl fetches carried the beat again.
- Last pass's Factory row said "v0.240.0, 2026-10-13, latest" while
  v0.241.0 carries the same feed date — the two shipped the same day and the
  feed lists newest-first; the 10-14 pass read only the top item. Feed
  pagination check added to the process: count the day's entries, not just
  the head.

## Sources

- Linear changelog (top entry unchanged): https://linear.app/changelog (fetched 2026-10-15)
- Plane cloud changelog + self-host release table: https://plane.so/changelog · https://developers.plane.so/self-hosting/all-releases (2026-10-15)
- Multica repo main (7 PRs merged 10-15, incl. #9249/MUL-8014, #8774/MUL-7658): github.com/multica-ai/multica (API 2026-10-15)
- Paseo v0.11.3/v0.11.4 release notes + main: github.com/getpaseo/paseo (API 2026-10-15); LICENSE (Apache-2.0) verified via API
- Cursor changelog (top entry unchanged): https://cursor.com/changelog (2026-10-15)
- GitHub changelog Oct 15 (agentic autofix GA, push-event emails retired, HydraFusion Max): https://github.blog/changelog/month/10-2026 (2026-10-15)
- OpenHands main post-v1.27.1 (#18419–#18485): github.com/All-Hands-AI/OpenHands (API 2026-10-15)
- Devin release notes Oct 14: https://docs.devin.ai/release-notes/2026 (2026-10-15)
- Factory changelog feed (243 releases; Oct 15 = v0.242.0): https://docs.factory.com/docs/changelog/feed.json (2026-10-15)
- Huly repo (no commits in window): github.com/hcengineering/platform (API 2026-10-15)
- NEVR-198 landing: stellarc dev @ 681e418 (PR #103, merged 2026-10-15)
