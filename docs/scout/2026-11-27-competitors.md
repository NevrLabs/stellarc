# Scout — Competitors, 2026-11-27

Beat: **competitors**. Delta window: 2026-11-26 19:00 UTC → 2026-11-27 20:06 UTC (~25h —
competitors last ran 11-26, so this is a one-day read). Every claim verified against the
GitHub API (`gh api` — repo metadata, release tags + full bodies, `merged:>=` window
searches per repo, full PR bodies for the load-bearing numbers) or a fetched changelog
page/feed (Linear, Cursor, Devin — full page re-fetched and date-parsed; Copilot —
github.blog RSS with exact pubDates; Factory — npm registry + default-branch commits +
changelog dir). Context: Stellarc = self-hostable, inert control plane (v2 charter) +
BYO-agent runtime over ACP; `docs/steal-reject-matrix.md` and `docs/v2-charter.md` are
the standing filters. Dev HEAD this run: `681e8671` (scout design 11-27, #371);
effect/v4 head `4e8b1589` (NEVR-791 deps rotation, #352); all gaps re-verified at both
heads.

## The one-line read

**Paseo shipped a minor version whose two headlines sit exactly on our open seams —
remote-node URL proxying and steering integrity — while Multica merged the run-log
privacy law our transcript lane needs, and OpenHands shipped a production
replay-idempotence incident that reads like a warning label for an event-sourced UI.**
Paseo released **three times in the window** (v0.17.6 03:10Z, v0.18.0 09:56Z, v0.18.1
18:06Z; 40 window PRs; 25,961★ (+278)). v0.18.0's headline **#10944 routes remote-
workspace browser tabs through the workspace daemon as a full exit proxy**: a dedicated
secondary binary WebSocket (off the control channel so dev-server bundles and HMR
cannot head-of-line-block agent streams and terminal input), single-use 30-second
tunnel tickets, per-host Chromium partitions behind a fixed loopback SOCKS5 port
(no partition retargeting, cookies isolated per remote host, OAuth popups inherit the
opener's proxied session), **fail-closed** (a tab waits for `resolveProxy` verification
and shows explicit update/offline/reconnecting states with a one-click Browse-locally
escape, never silently leaking remote `localhost` requests to the local machine),
`workspace.write` required for ticket issuance, **cloud-metadata and link-local
destinations blocked with pinned-IP dialing against DNS rebinding**, OS socket-ownership
verification, and per-stream + connection credit backpressure. The same release and
v0.18.1 carry a **steering-integrity trio**: #5267 (a steer arriving mid-stream keeps
the streamed reply whole — the timeline projection joins chunks of the same provider
message across the intervening user row, survives reload, and forward paging reuses the
projected row), #10977 (steering an agent during a run it started itself steers it
instead of aborting it), #11077 (messages sent while an agent runs its own turn queue
instead of failing). Plus #11047 (an idle ACP agent whose process exited reopens on the
next message via `session/load` — a dead idle session is recoverable state, and the
exit is logged with pid and exit code), #11064 (host-wide instructions for generated
metadata — one instructions field superseding three earlier per-artifact PRs), #10888
(per-device two-knob notification preferences + a plugin notification API with
deduplication and rate limits), and #8976 (enterprise spending usage). v0.17.6's
hygiene cluster: #10920 (the Linux AppImage leaked its runtime environment into every
shell and child process), #10921 (background git fetches spawned orphan D-Bus daemons
and retried failing auth in a loop), #10953 (removed a background `agy -p /usage`
usage source), #10878 (worktree ownership drifting outside the configured root).
**Multica** (v0.13.0 stands; a quiet window — 2 real PRs, 2 no-op chores; 58,197★
(+121)) merged **#11727 (MUL-10284): agent owners restrict who sees tool details in
run logs** — a server-enforced `tool_details_visibility` field (`everyone` default /
`restricted`), restricted tool messages stripped of `input`/`output`/`content` and
marked `details_hidden: true` with tool name, `call_id`, timestamps and order kept,
**fail-closed when the audience cannot be resolved**, per-audience realtime where a
reader's full copy wins over a hidden one at the same `seq`, agents and machine
credentials never granted the full view, OpenAPI + migration + all eight locales. Plus
#11701 (MUL-10304): the bottom-stick pin no longer erases the reader's scroll-up
progress (a pin that lands back in the edge zone used to reset the displacement the
reader had taken; plus a 1px scroll-rounding epsilon replacing exact-equality
attribution) — the reading-position family's next datapoint. **OpenHands** (v1.46.0
stands; 8 window PRs, six of them dependabot chores) shipped **#20132 — throttle the
files auto-refresh after a production request storm**: since #19992 every bash
observation invalidates the files query, so a reconnect/history replay re-fires every
observation as new; one reopened long conversation sent **~240 `/files` requests in 30
seconds** (about 600 502s in an hour, the sandbox OOMKilled, the production 5xx alert
fired), and fleet-wide client-cancelled `/files` requests went from a few hundred per
day to **tens of thousands per day** after 1.45.0 shipped; the fix collects pending
flags and refreshes once leading + once trailing per 2s. **A replayed event re-delivers
state, never re-triggers per-event side effects.** Plane refrozen (0 window PRs,
pushed_at 11-27T09:36Z = branch work, the pushed_at≠merged-PR law holds; v1.5.1
stands). Devin shipped a Nov 26 entry (grants-based pagination of service users,
share-dialog real-access honesty, admin self-add with write access under the
Creator-only limit, Bots tile state restoration, automation dispatch pings to Slack
channels). Linear quiet day 15, Cursor quiet day 22, Copilot quiet (newest entry still
the 11-25 code-review billing default), Huly frozen day 23, Factory frozen day 7
(probe trio re-verified).
→ Proposal 1: pin **C11 — replay-side-effect idempotence** into the lifecycle
contracts §C (the OpenHands production incident is the trigger; apps/web has zero
query-invalidation surface today — grep-verified at `4e8b158`). Proposal 2: the
**G12–G14 steering-integrity extension** of the standing G7/G8–G11 pack (Paseo's trio;
our steer surface is still zero at both heads). Proposal 3: the **remote-node
preview-URL proxying** law pack for the v2 charter's remote-node seam (new lane; zero
tunnel/preview-URL surface — grep-verified; Paseo #10944 is the precedent).

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Paseo** | **v0.17.6 (11-27 03:10Z) + v0.18.0 (11-27 09:56Z) + v0.18.1 (11-27 18:06Z) — three releases in one window; 40 merged PRs in window; pushed 11-27 18:48Z; 25,961★ (+278).** **v0.18.0 #10944 remote workspace browser proxy (PR body fetched in full):** desktop browser tabs in remote workspaces (direct TCP, SSH, E2EE relay) route through that workspace's daemon as a full exit proxy by default, with an inline `<host>`/`Local` pill in the address bar; remote `localhost`/`*.localhost`/`127.0.0.1`/`[::1]` links from chat, terminal and Workspace Services open in a proxied tab; remote agent `browser_new_tab` automation routes into the proxied partition; the shape — dedicated secondary binary WebSocket (single-use 30s ticket, `tunnel_hello` before `Session`, works over direct TCP/SSH and the Noise NK relay with zero relay changes), per-host `persist:` partitions behind a fixed loopback SOCKS5 port with `proxyBypassRules: "<-loopback>"`, fail-closed (resolveProxy verification before a `<webview>` mounts; explicit update/offline/reconnecting states; one-click Browse locally), `workspace.write` for ticket issuance, **cloud-metadata and link-local destinations blocked with pinned-IP dialing against DNS rebinding**, OS socket-owner check on SOCKS5, per-stream + connection credit backpressure, non-proxied WebRTC UDP disabled on proxied guests, host partitions cleared by Clear browser data. **Steering-integrity trio:** #5267 (v0.18.1; the daemon records the steer between the reply's chunks, the timeline projection joins same-message chunks across intervening user rows, reload keeps the reply whole, a forward page ending inside source ranges reuses the existing row; regression tests fail on merge base), #10977 (v0.18.0; steering a Pi agent during a run it started itself aborted the run — now it steers), #11077 (v0.18.1; messages sent while Pi runs its own turn failed — now they queue). **#11047 (v0.18.1) idle ACP agent lifecycle:** an agent whose process exited while idle failed every later message with `ACP agent disconnected (signal SIGKILL)`; now `startTurn` throws `StaleProviderSessionError` when the provider can reopen sessions (`loadSession`/`sessionCapabilities.resume`), the prompt path reloads the agent and sends the message to the new process; providers that cannot reopen keep their history and error; the child `exit` handler logs the pid, exit code or signal, and whether a turn was running. **#11064 (v0.18.1) host-wide metadata instructions:** one host-level Instructions field guiding language/tone/formatting for generated workspace titles, branch names, commit messages and PR drafts — per-project config overrides win, contract rules non-overridable; **supersedes three earlier PRs** (a title-only language picker, four per-artifact prompt fields, a config-only four-key override — one field beat three designs). **#10888 (v0.18.0) per-device notification preferences + plugin notification API:** every device gets a master switch plus independent toggles (agentPermission, agentError, terminalNeedsInput on by default; agentFinished, terminalFinished off), mobile syncs preferences with the push token (feature-gated), and server plugins get `server.notifications.send()` with 60-second `(pluginId, key)` dedup, 10/min token-bucket rate limit, declarative open targets, `data` ≤ 1,024 UTF-8 bytes, plus `client.onNotificationOpen()` for taps after cold launch. **#8976 (v0.18.1):** Codex individual spending percentages + reset time and Claude extra-usage USD now survive the usage adapters. **v0.17.6 hygiene cluster:** #10920 the Linux AppImage leaked its runtime environment into shells and child processes; #10921 background git fetches spawned orphan D-Bus daemons and retried failing auth in a loop; #10953 removed the Antigravity usage source that ran `agy -p /usage` in the background; #10878 worktree ownership drifted outside the configured worktrees root; #10972/#10964 Android crash fixes (Samsung code blocks, model-picker clicks); #10939 macOS startup freeze from Dock progress-bar updates; #8794 timelines dropping rows when a rewind epoch changes. Also #10992 (v0.18.0): ACP providers cache model catalogs across daemon restarts instead of probing in the background. | v0.18.1 2026-11-27 | NOASSERTION, 25,961★ | 4 | **ADOPT (three brief vehicles: preview proxy, steering, replay-adjacent hygiene)** | The remote-browser-proxy release is the architectural precedent for our v2 charter's remote-node seam: a self-hostable control plane with BYO-agent runtimes must never let an agent-reported `localhost:PORT` open against the reader's own machine. The steering trio + Multica's release-grade /steer define the agent-native loop's integrity laws. The hygiene cluster (env leaks into child processes, orphan daemons, background probing) is the process-honesty pack for the desktop/node lane. |
| **Multica** | **v0.13.0 (11-25) stands — no new tag; 4 merged PRs in window, 2 of them no-op `chore: temporary check` commits; head pushed 11-27T19:16Z; 58,197★ (+121).** **#11727 (MUL-10284, body-verified, merged 19:16Z): agent owners restrict who sees tool details in run logs.** Problem, verbatim: "Every member of a workspace who can open an agent's run transcript sees the full input and output of each tool call: the commands it ran, the files it read, and what they returned... today there is no way to narrow it short of making the agent private, which also stops others from running it." The shipped shape: agent field `tool_details_visibility` = `everyone` (default) \| `restricted`, changed under Settings → Access → Run logs by the agent owner and workspace owners/admins — **agent and machine credentials cannot change it**; restricted readers are the agent owner + workspace owners/admins; a restricted tool message has `input`, `output` and `content` cleared and is marked `details_hidden: true`, with the tool name, `call_id`, timestamps and order kept; **server enforcement, not a UI toggle** — "Hide only in the client" is rejected in the PR's own alternatives list ("the data would still reach every browser and every API caller"); `GET /api/tasks/{id}/messages` and the plugin task-messages endpoint return the restricted view unless the caller is a reader, **and the response fails closed if the audience cannot be looked up**; realtime is per audience (readers get full frames before the workspace broadcast; web/desktop/mobile merge prefers a full copy over a hidden one at the same `seq`); Telegram progress strips restricted payloads; the "Produced" outcome row is hidden because it derives from tool inputs; OpenAPI `TaskMessage` gains `details_hidden`; migration `757` adds the column; known limitation honestly named (a hidden row shows the generic icon because icons derive from the input's shape). **#11701 (MUL-10304, body-verified):** in long chats every wheel notch snapped back to the newest message — the live-end latch attributed a row-height estimate jump (100px→870px inside one scroll event) to the system, pinned back, and `onAtEdgeChange(true)` then **reset the displacement the reader had taken to 0** ("the file header already says 'pins do not erase it', but this path did"); second defect: attribution compared input and displacement for exact equality while scroll offsets snap to device pixels. Fix: a pin that lands in the edge zone keeps the reader's accumulated displacement, and a 1px `SCROLL_ROUNDING_PX` epsilon bounded by the unspent claim. Three regression tests; 728 transcript-follow tests pass. | v0.13.0 2026-11-25 (stands) | NOASSERTION, 58,197★ | 5 | **WATCH (steal surfaces)** | #11727 is the run-log privacy law for the exact surface we are pre-registering (the transcript renderer + §F content bounds): tool I/O visibility is a server-enforced property that fails closed, keeps shape-and-order metadata for readability, and excludes machine credentials from both reading and changing it. #11701 extends the reading-position family: pins never erase reader progress, and input/displacement comparison needs a device-pixel epsilon. |
| **OpenHands** | **v1.46.0 (11-25) stands — no new tag; 8 merged PRs in window (six dependabot chores, #20096 a maintenance-map doc, #20132 the fix); pushed 11-27T16:32Z; 94,459★ (+50).** **#20132 fix(files): throttle auto-refresh invalidations (body-verified, with production numbers):** since #19992 every bash observation invalidates the workspace-files query; a page load or reconnect that replays history counts every replayed observation as new, and on the cloud backend each invalidation becomes `GET /api/v1/app-conversations/{id}/files`, which runs a `find` in the sandbox. In production, reopening one long conversation sent **hundreds of listings to a single sandbox within seconds** (~240 `/files` requests in 30s after a full WebSocket replay with `after_seq=-1`); they timed out (the server returned 502, about 600 in an hour), the sandbox was OOMKilled, and the 5xx alert fired. **Fleet-wide, client-cancelled `/files` requests went from a few hundred per day to tens of thousands per day after 1.45.0 shipped.** Fix: the hook collects pending file-edit and bash flags and refreshes at most once per 2s — the first event refreshes immediately (leading), one trailing refresh fetches the final state after a burst, the pending timer clears on unmount; a new test checks 50 back-to-back observations produce exactly one leading and one trailing refresh; the paired probe (200 replayed terminal observations 10ms apart) shows **396 listings on main → 6 on the branch**, with a negative control failing on main. #20096 maps the maintenance surface (docs honesty). | v1.46.0 2026-11-25 (stands) | MIT, 94,459★ | 5 | **ADOPT (C11 vehicle)** | The incident is the replay-side-effect law wearing production numbers: our append-only event log is the sole source of truth and apps/web will replay transcripts on every reconnect — any hook that invalidates or fetches per replayed event re-creates this storm at our seams. C11 (proposal 1) pins the law before the first such hook is written. |
| **Plane** | **v1.5.1 (11-25) stands — 0 merged PRs in window (search-verified); pushed_at 11-27T09:36Z = default-branch push without a merged PR (branch work; the pushed_at≠merged-PR law holds); 63,281★ (+60).** | v1.5.1 2026-11-25 (stands) | AGPL-3.0, 63,281★ | 4 | **WATCH (sweep concluded; refrozen day 2)** | Nothing to re-litigate; the v1.5.0+v1.5.1 authz sweep vehicle stays resolved. |
| **Devin (Cognition)** | **One new changelog entry (Nov 26; previous newest Nov 25; parsed in full from the page's entry blocks).** Sessions & Workspace: the Changes pane shows a deleted file's contents. Bots: returning to Bots from another tab reopens the Devin's chat as it was left, including the open session and workspace tab (state restoration, the reading-position family's sibling); Slack Enterprise Grid senders admitted under workspace-scoped "Who can message". Security: a bulk batch scan's View findings opens that scan's findings (deep-link precision). Enterprise & Settings: **the Service users list and manageable-service-users API page through the caller's grants instead of loading every service user at once** ("very large organizations no longer hit timeouts and errors" — D2 list-read honesty + bounded reads); an enterprise admin can add themselves **with write access** under the Creator-only sharing limit (upgrading Nov 25's read-only self-add); **the session share dialog lists the owner, shows role groups only where they really grant access, and hides the share button when account policy blocks sharing**; share-dialog search reads the access list from the resource's grants, not the account's (a resource-scoped read that was timing out); a Response language setting for Oncall responders and incident settings. Automations: **an automation's dispatch status notifications can post to a Slack channel** (v3 API `notifications.slack`). Slack: the "not a member" reply links to Slack settings for re-authorization. | changelog 2026-11-26 (newest) | proprietary | 5 | **WATCH (law source)** | The share-dialog trio is the sharing-visibility pack's honesty half executed: real effective access, not nominal roles; policy-blocked actions hide their affordance; access lists read from the resource's grants. Grants-based pagination is the D2 family's enterprise datapoint. Automation dispatch pings extend the automation-lane bar (an automation's runtime state is observable where the team already is). |
| **GitHub Copilot** | **Quiet — no entry in window** (RSS re-fetched; newest entry still "Copilot code review billing will default to the organization", 11-25 22:18Z, the Dec 30, 2026 default-with-deadline). Carried: the 11-23 issue-statuses/repository-boards entry remains the tracker-lane entrant. | changelog 2026-11-25 (newest Copilot) | proprietary | 5 | **WATCH (tracker-lane entrant)** | Nothing new; the attribution-lane datapoint stands. |
| **Linear** | **Quiet day 15** — changelog re-fetched (full page, 2,016,489 bytes); newest entry still **November 12** (BYOK + the agent-transcript honesty five). | changelog 2026-11-12 (newest) | proprietary | 5 | **WATCH (pattern → BYOK + honesty lines)** | Nothing new; carried rows stand. |
| **Cursor** | **Quiet day 22** — changelog re-fetched; newest embedded entry date still **2026-11-06** (Voice Chat with Agents). | changelog 2026-11-06 (newest) | proprietary | 5 | **WATCH** | Nothing new; the voice pre-registration stands. |
| **Huly** | **Twenty-third consecutive quiet day** — pushed_at still frozen at 11-09T14:14Z; 28,215★ (+6). | platform trunk 2026-11-09 | EPL-2.0, 28,215★ | 3 | **REJECT (stands)** | No agent story; nothing to re-litigate. |
| **Factory (Droids)** | **Frozen day 7** — default branch last push 11-20T07:57Z (re-verified); npm `@factory-ai/droid` still **Not found** (registry re-probed); `docs/changelog` still ends **1-10.mdx** (contents re-listed this run). Last verified release v1.9.0 (11-11). 106★. | v1.9.0 2026-11-11 (last verified) | proprietary | 5 | **WATCH (law source; feed route dead)** | The probe trio (npm + commits + changelog dir) holds; nothing to re-litigate. |

## Proposals

### Proposal 1 — ADOPT brief: C11, replay-side-effect idempotence (§C extension; docs-only)

**Precedent (verified this run):** OpenHands #20132 (PR body fetched, with production
numbers) — since #19992 every bash observation invalidates the workspace-files query, so
"a page load or reconnect that replays history, every replayed observation counts as
new"; one reopened long conversation sent ~240 `/files` requests in 30s, about 600 502s
in an hour, the sandbox OOMKilled; **fleet-wide client-cancelled `/files` requests went
from a few hundred per day to tens of thousands per day after 1.45.0**; the paired probe
measured 396 listings on main vs 6 on the fix branch. The fix: pending flags collected,
one leading + one trailing refresh per 2s, timer cleared on unmount, a burst test that
fails on main.

**Our gap (verified at effect/v4 `4e8b158` and dev `681e8671`):** apps/web carries
**zero** `invalidateQueries`/`useQuery` usage and no delta-event client yet (grep over
`apps/web/src`) — the surface that would re-create this storm does not exist, which is
exactly when the §C pattern pins laws (C1–C10 are the precedent; the 11-26 report's
F7–F10 content-bounds brief is the sibling). Our architecture is the risk multiplier:
the append-only event log is the sole source of truth, and every reconnect is a replay
— C4's on-demand history and C10's changes-only sync already shape the replay path;
what is missing is the side-effect half.

**Work (docs-only, no app code):** pin **C11** into §C of
`docs/design/agent-view-lifecycle-contracts.md` beside C1–C10, in the house style:

> **C11 — A replayed event re-delivers state, never re-triggers side effects.** A
> reconnect, reopen, or history replay that re-delivers persisted events drives the
> same state transitions the live path drove — and nothing else. Invalidation, refetch,
> and notification hooks keyed to event kinds coalesce across a replay burst (one
> leading refresh, one trailing refresh per bounded window) instead of firing once per
> replayed event; a replayed event never writes, fetches, or notifies as if it were
> fresh. Derived-query refresh driven by the event stream is burst-bounded by
> construction, and the bound is a named constant with a test.

*Regression play (pre-registered):* `replay: fifty replayed observations produce one
leading and one trailing refresh` — reconnect a view whose transport replays 50
persisted observations 10ms apart; assert exactly one leading and one trailing
derived-query refresh, and zero per-event writes/fetches/notifications. Red when each
replayed observation invalidates or fetches — the #20132 pre-fix shape (396 listings
from 200 replayed events; a sandbox OOMKilled in production).

Also append #20132 to §C's pinned-sources list.

**Ready-to-file brief posted as an issue comment.**

### Proposal 2 — ADOPT brief: G12–G14, steering-integrity laws (extension of the standing G7/G8–G11 pack; docs-only)

**Precedent (verified this run):** Paseo shipped a steering-integrity trio inside one
window — **#5267** (v0.18.1, PR body fetched, regression tests fail on merge base): a
steer arriving mid-stream keeps the streamed reply whole; the daemon records the steer
between the reply's chunks; the timeline projection joins chunks of the same provider
message and turn across intervening user rows; the live app keeps the reply and the
intervening rows together in the streaming portion; catch-up after reconnect uses the
projected row's source sequence ranges; a forward page ending inside those ranges
reuses the existing row. **#10977** (v0.18.0): steering a Pi agent during a run it
started itself **aborted** the run instead of steering it. **#11077** (v0.18.1):
messages sent while an agent runs its own turn **failed** instead of queuing. These
land on top of the law sources already in the standing row: Multica #10715
(non-interrupting steering, delivery receipts, requeue atomicity) and #11419 (steer via
the agent's own `/steer`, release-grade in v0.13.0), plus Paseo #10404 (queue ordering)
— the G7a–G7c and G8–G11 briefs.

**Our gap (re-verified this run at dev `681e8671` and effect/v4 `4e8b158`):** still
**zero steering surface** — `git grep -i steer` over `apps/` + `packages/` hits only an
a11y-spec comment and scout docs; the runner has no mid-run input path. ACP v2 Preview
carries held/inserted prompts — the protocol vehicle exists at the NEVR-309 bump.

**Work (docs-only, no app code):** extend the briefed G7/G8–G11 pack (the row pinned
for §G of `docs/design/agent-view-lifecycle-contracts.md`) with the integrity tranche,
so the whole G7–G14 set lands as one pin when the brief executes:

1. **G12 — A steer never breaks the reply it lands in.** Guidance delivered mid-stream
   joins the transcript as its own row while the streamed reply stays one row — chunks
   of the same provider message project across the intervening user row, the joined
   reply survives reload, and paging into its source ranges reuses the row rather than
   duplicating it.
2. **G13 — Steering a self-started run steers; it never aborts.** A run the agent began
   on its own (scheduled, delegated, background) treats an incoming steer as guidance
   for that run — never as an interruption that cancels it.
3. **G14 — A message during a busy turn is delivered or queued, never failed.** The
   composer's send path during an active turn either steers the turn or queues for the
   next one per the non-interrupting law; a busy agent is never a send error.

*Regression plays (pre-registered):* (a) steer mid-stream and reload — the reply
renders as one whole row above the steer, before and after reload; a forward page
ending inside the reply's ranges reuses the row; (b) steer an agent mid-self-started
run — the run continues with the guidance applied, no cancel/abort transition; (c) send
while a turn is active — the message is delivered as guidance or visibly queued, the
send never errors.

**Ready-to-file brief posted as an issue comment.**

### Proposal 3 — ADOPT brief: remote-node preview-URL proxying laws (new lane; new design note; docs-only)

**Precedent (verified this run):** Paseo v0.18.0 **#10944** (PR body fetched in full) —
desktop browser tabs in remote workspaces route through the workspace daemon as a full
exit proxy. The design decisions worth stealing as laws: **(a) the browser's localhost
is the wrong localhost** — before the fix, remote `localhost` links opened dead local
tabs and remote agents' `browser_new_tab` inspected the desktop instead of the remote
host; **(b) a dedicated secondary binary WebSocket for tunnel traffic** so dev-server
bundles, images and HMR streams cannot head-of-line-block interactive agent streams
and terminal input; **(c) single-use, 30-second tunnel tickets** authenticated before
session creation, working identically over direct TCP, SSH and the E2EE relay; **(d)
per-host Chromium partitions behind a fixed loopback SOCKS5 port** — no partition
retargeting across reconnects, cookies isolated per remote host, OAuth popups inherit
the opener's proxied session; **(e) fail-closed** — a tab waits for `resolveProxy`
verification before mounting its webview, shows explicit update/offline/reconnecting
states, and offers one-click Browse locally rather than silently leaking remote
requests to the local machine; **(f) `workspace.write` gates ticket issuance**;
**(g) cloud-metadata and link-local destinations are blocked, with pinned-IP dialing
against DNS rebinding**; **(h) per-stream and connection credit backpressure**;
non-proxied WebRTC UDP disabled on proxied guests; host partitions cleared by Clear
browser data.

**Our gap (verified at effect/v4 `4e8b158` and dev `681e8671`):** the v2 charter makes
the node (BYO-agent runtime) potentially remote from the reader — and apps/web has
**zero** preview-URL surface (`git grep -i preview` hits only fork-manifest/embed
tooling; `localhost` and `tunnel` hit nothing in `apps/web/src`). The class our gateway
already owns by construction (exact-Host at the loopback ingress, exact-Origin, pinned
URL origin — the OpenHands #20061 guard set) extends here: the moment any surface
renders a URL an agent reported, the wrong-machine failure exists.

**Work (docs-only, no app code):** create `docs/design/remote-node-preview.md` with the
law pack (the F4/F5/F6/C10 pre-registration pattern applied to a new lane):

1. **P1 — An agent-reported loopback URL never opens against the reader's machine.** A
   URL a run reports (`localhost`, `*.localhost`, `127.0.0.1`, `[::1]`, or the node's
   own interface) routes through the owning node's authenticated channel; external
   links open in the system browser as today.
2. **P2 — Proxy traffic rides its own channel.** Preview/proxy traffic never shares the
   control stream (no head-of-line blocking of run events, terminal input, or delta
   frames); admission is a short-lived, single-use ticket minted for the authenticated
   session, honored by the node, never a bearer credential in a URL.
3. **P3 — Fail closed, escape named.** A proxy that is offline, unsupported, or
   unverified renders an explicit state (offline/reconnecting/unsupported) and a
   browse-elsewhere action — never a silent local-network request.
4. **P4 — The proxy dials only what the node owns.** Cloud-metadata and link-local
   destinations are refused; dialing is pinned-IP against DNS rebinding; per-stream
   and connection backpressure is enforced.
5. **P5 — Per-host isolation.** Proxied sessions partition storage and cookies per
   remote host (fixed local port or equivalent), so two remote hosts on the same port
   never share credentials, and popups inherit the opener's proxied session.

*Regression plays (pre-registered):* (a) a chat/terminal `localhost:PORT` link in a
remote-node run opens through the node's channel and the local machine observes zero
connections to that port; (b) killing the tunnel renders the explicit offline state
and the escape action, never a local fallback request; (c) a proxied request to
`169.254.169.254` is refused with the class named; (d) two remote hosts behind the same
fixed port hold disjoint cookie jars.

**Ready-to-file brief posted as an issue comment.**

### Proposal 4 — pre-registration pack (no new Stellarc surface; acceptance lines folded into standing rows)

- **Multica #11727 (MUL-10284) → the sharing-visibility row (fifth vendor, the run-log
  half):** tool-detail visibility is a server-enforced property — restricted rows keep
  name/call_id/timestamps/order and clear input/output/content with a `details_hidden`
  marker; the audience that cannot be resolved fails closed; realtime merges a reader's
  full copy over a hidden one at the same seq; agent and machine credentials neither
  read the full view nor change the setting; derived outcome rows that leak hidden
  inputs are hidden too.
- **Paseo #11047 → the runner-honesty row:** an idle agent process that died is
  recoverable state — the next message reopens (reload + `session/load` where the
  provider can resume), providers that cannot reopen keep their history and error, and
  the exit is logged with pid and exit code.
- **Paseo #11064 → the generated-metadata row:** one host-wide instructions field for
  machine-generated titles/branches/commits/PRs beat a language picker and four
  per-artifact fields (it superseded three PRs); per-project overrides win;
  non-overridable contract invariants (valid slugs, JSON shapes) stay.
- **Paseo #10888 → the notification-lane row:** per-device two-knob preferences with
  useful defaults (permission/error/needs-input on; finished off), preferences synced
  with the push token behind a capability flag, and a plugin notification API with
  60s dedup, 10/min rate limit, declarative open targets, `data` ≤ 1,024 bytes, and
  tap handling after cold launch.
- **Paseo #8976 → the usage-lane row:** enterprise spending fields (Codex individual
  percentages + reset time, Claude extra-usage USD) must survive the adapter contract
  — the provider-supplied budget numbers are first-class, not dropped fields.
- **Paseo v0.17.6 hygiene cluster → the node/desktop process-honesty row:** #10920 a
  packaged runtime environment leaks into every shell and child process it spawns
  (secrets ride env to every child); #10921 background fetches spawning orphan
  daemons and retrying failing auth in a loop; #10953 a background usage probe removed
  outright; #10992 model catalogs cached across restarts instead of background
  probing.
- **Paseo #10727 → the timeline-plugin row:** tool-call intent preserved in
  `item.metadata.intent` for timeline consumers.
- **Multica #11701 → the reading-position row:** a pin that lands back in the edge
  zone keeps the reader's accumulated displacement ("pins do not erase progress"), and
  input-vs-displacement attribution needs a device-pixel epsilon, never exact equality.
- **Devin Nov 26 → the sharing-visibility + D2 rows:** share dialogs show real
  effective access (role groups only where they grant), hide affordances policy
  blocks, and read access lists from the resource's grants, in pages; Bots tile
  restores the conversation as left (state restoration); automation dispatch status
  posts to Slack channels (runtime state observable where the team is).
- **OpenHands #20096 → the maintenance-honesty row:** a dated maintenance map of the
  verify surface, in the repo.

---

Verification appendix (fetched 2026-11-27 20:06Z, window 11-26T19:00Z→11-27T20:06Z):
GitHub API — getpaseo/paseo (meta 25,961★/pushed 11-27T18:48:52Z; releases v0.17.6
03:10:21Z, v0.18.0 09:56:22Z, v0.18.1 18:06:05Z, all three bodies fetched in full; 40
window-precise merged PRs of 69 since 11-26; PR bodies fetched for #10944, #5267,
#11047, #11064, #8976, #10888), multica-ai/multica (meta 58,197★/pushed
11-27T19:16:45Z; v0.13.0 stands, no new tag; 4 window PRs; bodies fetched for #11727,
#11701), OpenHands/OpenHands (meta 94,459★/pushed 11-27T16:32:07Z; v1.46.0 stands; 8
window PRs; body fetched for #20132; #20096 read from the list), makeplane/plane (meta
63,281★/pushed 11-27T09:36:15Z; v1.5.1 stands; 0 window PRs, search-verified),
hcengineering/platform (meta 28,215★/pushed 11-09T14:14:12Z), Factory-AI/factory (meta
106★/pushed 11-20T07:57:01Z; npm @factory-ai/droid 404 re-probed; docs/changelog ends
1-10.mdx, contents re-listed; no default-branch commits since 11-20). Changelog pages:
linear.app (full page fetched, 2,016,489 bytes; newest Nov 12 — quiet day 15),
devin.ai (full page fetched, 1,441,911 bytes; newest Nov 26, entry parsed in full from
the page's entry blocks), cursor.com (180,698 bytes; newest embedded date 2026-11-06 —
quiet day 22). Copilot: github.blog changelog RSS with pubDates (newest 11-25 22:18Z;
nothing in window). Stellarc gaps: git grep at effect/v4 `4e8b1589` and dev `681e8671`
— steer: zero code hits (one a11y-spec comment); tunnel: zero; localhost in
apps/web/src: zero; preview in apps/web: fork-manifest/embed tooling only;
details_hidden: zero; invalidateQueries/useQuery in apps/web/src: zero (both heads).
effect/v4 head verified by ls-remote (`4e8b1589`, NEVR-791 #352); dev HEAD `681e8671`
(#371). Contracts doc read at effect/v4: §A–§G with C1–C10, F1–F6, G1–G6 pinned;
G7a–G7c/G8–G11 briefed (row 29 of INDEX), not yet pinned.
