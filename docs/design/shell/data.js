// Shared mock data for the Stellarc shell explorations. Realistic, not lorem.
window.DATA = {
  org: { id: "nevr", name: "Nevr Labs", initials: "NL" },
  orgs: [
    { id: "nevr", name: "Nevr Labs", initials: "NL" },
    { id: "noov", name: "Noovoleum", initials: "NV" },
  ],
  me: { name: "Raisal W", initials: "RW", email: "raisal@nevrlabs.dev" },

  // Views = the leftmost rail. Each view owns its sidebar, topbar actions and viewport.
  views: [
    { id: "home", label: "Home", icon: "inbox" },
    { id: "resources", label: "Resources", icon: "layers" },
    { id: "agents", label: "Agents", icon: "bot" },
  ],
  futureViews: [
    { id: "docs", label: "Docs", icon: "file-text" },
    { id: "insights", label: "Insights", icon: "bar-chart-3" },
  ],

  home: {
    sections: [
      { id: "main", label: null, items: [
        { id: "inbox", label: "Inbox", icon: "inbox", count: 3 },
        { id: "mine", label: "My tickets", icon: "circle-dot", count: 12 },
      ]},
      { id: "favs", label: "Favorites", items: [
        { id: "fav-agentwork", label: "Agent work", icon: "bot", ref: { view: "resources", item: "board-eng", bview: "agentwork" } },
        { id: "fav-v4", label: "Effect v4 port", icon: "folder-kanban", ref: { view: "resources", item: "p-effect" } },
      ]},
    ],
    // Pinned to the sidebar footer in every view. Most recent first.
    recent: [
      { label: "Preserve partial transcript", kind: "session", icon: "message-square-text", ref: { view: "agents", item: "s-229" } },
      { label: "Engineering, timeline", kind: "board", icon: "kanban-square", ref: { view: "resources", item: "board-eng", bview: "timeline" } },
      { label: "talos-tower", kind: "machine", icon: "server", ref: { view: "resources", item: "m-talos" } },
      { label: "Deps to latest", kind: "session", icon: "message-square-text", ref: { view: "agents", item: "s-419" } },
      { label: "Design", kind: "board", icon: "kanban-square", ref: { view: "resources", item: "board-design" } },
    ],
    inbox: [
      { who: "Stellarc Reviewer", agent: true, what: "requested changes on", ref: "NEVR-12 Agents directory", when: "12m", unread: true },
      { who: "Stellarc Builder", agent: true, what: "opened PR #163 for", ref: "NEVR-229 Runner hardening", when: "40m", unread: true },
      { who: "Talos", agent: true, what: "triaged scout report", ref: "Competitors 2026-11-01", when: "2h", unread: true },
      { who: "Faris", agent: false, what: "commented on", ref: "NEVR-150 a11y floor", when: "yesterday" },
      { who: "Stellarc Scout", agent: true, what: "filed", ref: "Libraries 2026-11-01", when: "yesterday" },
    ],
  },

  resources: {
    sections: [
      { id: "boards", label: "Boards", icon: "kanban-square", items: [
        { id: "board-eng", label: "Engineering", count: 10 },
        { id: "board-design", label: "Design", count: 5 },
        { id: "board-triage", label: "Triage", count: 9 },
      ]},
      { id: "projects", label: "Projects", icon: "folder-kanban", items: [
        { id: "p-v2", label: "Stellarc v2" },
        { id: "p-effect", label: "Effect v4 port" },
        { id: "p-desktop", label: "Desktop + mobile" },
      ]},
      { id: "repos", label: "Repos", icon: "git-branch", items: [
        { id: "r-stellarc", label: "NevrLabs/stellarc" },
      ]},
      { id: "machines", label: "Machines", icon: "server", items: [
        { id: "m-talos", label: "talos-tower", status: "ok" },
        { id: "m-zephyr", label: "zephyr-m16", status: "ok" },
        { id: "m-farm", label: "build-farm-01", status: "warn" },
      ]},
      { id: "ragents", label: "Agents", icon: "bot", items: [
        { id: "a-builder", label: "Builder", status: "run" },
        { id: "a-reviewer", label: "Reviewer", status: "idle" },
        { id: "a-scout", label: "Scout", status: "idle" },
      ]},
    ],
    // Flat ticket list; every board view (board, list, timeline, backlog, calendar, custom) is a projection of it.
    // Dates are 2026; "today" in the mockup is Mon Nov 2 2026.
    statuses: [
      { id: "backlog", label: "Backlog" }, { id: "todo", label: "To do" }, { id: "progress", label: "In progress" },
      { id: "review", label: "In review" }, { id: "done", label: "Done" },
    ],
    tickets: [
      { key: "NEVR-421", title: "Merge dev into effect/v4 and port agent features", status: "progress", pri: "urgent", who: "Builder", agent: true, live: "6m, step 2", tag: "Effect", start: "2026-11-02", due: "2026-11-06" },
      { key: "NEVR-229", title: "Preserve partial transcript on interrupt", status: "progress", pri: "high", who: "Builder", agent: true, live: "18m, step 6", tag: "Runner", start: "2026-10-30", due: "2026-11-04" },
      { key: "NEVR-223", title: "Agent transcript surface on shadcn AI elements", status: "review", pri: "high", who: "Reviewer", agent: true, tag: "UI", start: "2026-10-27", due: "2026-11-03" },
      { key: "NEVR-179", title: "Agent memory from event-log artifacts", status: "review", pri: "medium", who: "Reviewer", agent: true, tag: "Agents", start: "2026-10-26", due: "2026-11-05" },
      { key: "NEVR-430", title: "Shell: views rail, tabs and recent footer", status: "todo", pri: "high", who: "RW", tag: "UI", start: "2026-11-03", due: "2026-11-13" },
      { key: "NEVR-150", title: "A11y floor in the Playwright viewport suite", status: "todo", pri: "medium", who: "FA", tag: "UI", start: "2026-11-05", due: "2026-11-12" },
      { key: "NEVR-55", title: "React Compiler, MCP and editor updates", status: "todo", pri: "medium", who: null, tag: "Deps", start: "2026-11-09", due: "2026-11-18" },
      { key: "NEVR-72", title: "Tauri 2.12 verification pass", status: "todo", pri: "low", who: "RW", tag: "Desktop", start: "2026-11-10", due: "2026-11-13" },
      { key: "NEVR-415", title: "Attempt continuity across retries", status: "done", pri: "high", who: "FA", tag: "Agents", start: "2026-10-20", due: "2026-10-30" },
      { key: "NEVR-243", title: "Per-attempt usage on the task API", status: "done", pri: "medium", who: "FA", tag: "Agents", start: "2026-10-22", due: "2026-10-29" },
      { key: "NEVR-196", title: "Org-level spend caps for agent runs", status: "backlog", pri: "urgent", who: null, tag: "Agents" },
      { key: "NEVR-190", title: "Expo build of the mobile shell", status: "backlog", pri: "high", who: null, tag: "Mobile" },
      { key: "NEVR-180", title: "Squads: group agents and route by skill", status: "backlog", pri: "medium", who: null, tag: "Agents" },
      { key: "NEVR-181", title: "Autopilot schedules per project", status: "backlog", pri: "low", who: null, tag: "Agents" },
      { key: "NEVR-205", title: "Calendar sync for due dates", status: "backlog", pri: "low", who: null, tag: "Integrations" },
      { key: "NEVR-201", title: "Import boards from Linear", status: "backlog", pri: "none", who: null, tag: "Integrations" },
    ],
    // Board views: five defaults plus saved custom views (Linear-style).
    boardViews: [
      { id: "board", label: "Board", icon: "kanban-square" },
      { id: "list", label: "List", icon: "list" },
      { id: "timeline", label: "Timeline", icon: "gantt" },
      { id: "backlog", label: "Backlog", icon: "archive" },
      { id: "calendar", label: "Calendar", icon: "calendar" },
    ],
    customViews: [
      { id: "agentwork", label: "Agent work", icon: "bot", desc: "Assigned to an agent, grouped by agent" },
      { id: "mine", label: "Mine this week", icon: "user", desc: "Assigned to me, due within 7 days" },
    ],
    machine: {
      name: "talos-tower", id: "node_8f3a91c2d04b", version: "0.4.1", os: "Debian 12, 4 vCPU, 15 GB",
      harnesses: [
        { name: "hermes", version: "0.22.5", slots: "2 of 3" },
        { name: "claude-code", version: "2.4.0", slots: "1 of 2" },
        { name: "codex", version: "0.61", slots: "0 of 1" },
      ],
      runs: [
        { key: "NEVR-229", agent: "Builder", harness: "hermes", time: "18m", state: "run" },
        { key: "NEVR-421", agent: "Builder", harness: "hermes", time: "6m", state: "run" },
        { key: "NEVR-419", agent: "Builder", harness: "hermes", time: "41m", state: "ok" },
      ],
    },
  },

  agents: {
    sections: [
      { id: "aov", label: null, items: [
        { id: "a-overview", label: "Sessions", icon: "layout-grid", count: 2 },
      ]},
      { id: "live", label: "Live sessions", items: [
        { id: "s-229", label: "Preserve partial transcript", sub: "Builder on NEVR-229", status: "run" },
        { id: "s-421", label: "Port agent features to v4", sub: "Builder on NEVR-421", status: "run" },
      ]},
      { id: "recent", label: "Recent sessions", items: [
        { id: "s-419", label: "Deps to latest", sub: "Builder, 41m", status: "ok" },
        { id: "s-scout", label: "Competitor radar", sub: "Scout, 22m", status: "ok" },
        { id: "s-12", label: "Agents directory review", sub: "Reviewer, failed", status: "err" },
      ]},
      { id: "bots", label: "Agents and bots", items: [
        { id: "a-builder", label: "Builder", sub: "hermes, glm-5.3", status: "run" },
        { id: "a-reviewer", label: "Reviewer", sub: "hermes, deepseek-v4", status: "idle" },
        { id: "a-scout", label: "Scout", sub: "hermes, glm-5.3", status: "idle" },
        { id: "a-talos", label: "Talos", sub: "hermes, opus", status: "idle" },
      ]},
      { id: "aprojects", label: "Projects", items: [
        { id: "p-v2", label: "Stellarc v2" },
        { id: "p-effect", label: "Effect v4 port" },
      ]},
    ],
    transcript: [
      { kind: "user", who: "Orchestrator", text: "Preserve the partial transcript when a run is interrupted, and refuse requests for the agent to kill its own process." },
      { kind: "think", text: "The runner drops buffered items on SIGTERM. Flush the item queue in the finalizer before reporting the attempt as cancelled." },
      { kind: "tool", name: "terminal", arg: "rg -n \"onInterrupt|flushItems\" apps/stellarc-node/src", out: "apps/stellarc-node/src/runner.ts:212  onInterrupt(() => abort.abort())\napps/stellarc-node/src/runner.ts:388  const flushItems = (attempt) => ...", ok: true },
      { kind: "tool", name: "edit", arg: "apps/stellarc-node/src/runner.ts", out: "+ yield* flushItems(attempt).pipe(Effect.ensuring(reportCancelled))\n- abort.abort()", ok: true },
      { kind: "tool", name: "terminal", arg: "bun test tests/unit/agents-resume.test.ts", out: "14 pass, 0 fail", ok: true },
      { kind: "agent", text: "Interrupts now flush buffered items before the attempt is marked cancelled. Next: the self-kill guard in the permission pipeline." },
    ],
  },

  // Session index for the Agents overview table.
  sessions: [
    { id: "s-229", title: "Preserve partial transcript on interrupt", ticket: "NEVR-229", agent: "Builder", machine: "talos-tower", model: "glm-5.3", state: "run", started: "18m ago", dur: "18m", tokens: "184k", cost: 0.62, attempt: 2 },
    { id: "s-421", title: "Port agent features to v4", ticket: "NEVR-421", agent: "Builder", machine: "talos-tower", model: "glm-5.3", state: "run", started: "6m ago", dur: "6m", tokens: "41k", cost: 0.14, attempt: 1 },
    { id: "s-419", title: "Deps to latest", ticket: "NEVR-419", agent: "Builder", machine: "talos-tower", model: "glm-5.3", state: "ok", started: "1h ago", dur: "41m", tokens: "322k", cost: 1.08, attempt: 1 },
    { id: "s-scout", title: "Competitor radar 2026-11-02", ticket: null, agent: "Scout", machine: "zephyr-m16", model: "glm-5.3", state: "ok", started: "3h ago", dur: "22m", tokens: "96k", cost: 0.31, attempt: 1 },
    { id: "s-12", title: "Agents directory design review", ticket: "NEVR-154", agent: "Reviewer", machine: "talos-tower", model: "deepseek-v4", state: "err", started: "5h ago", dur: "9m", tokens: "58k", cost: 0.22, attempt: 3, error: "Gateway starting: deadline" },
    { id: "s-153", title: "Transcript viewer review", ticket: "NEVR-153", agent: "Reviewer", machine: "talos-tower", model: "deepseek-v4", state: "ok", started: "yesterday", dur: "14m", tokens: "77k", cost: 0.29, attempt: 1 },
  ],
  spend: { month: 54.20, cap: 150, today: 2.66, days: [1.2, 3.4, 2.1, 0.4, 0.2, 4.8, 3.9, 2.2, 5.1, 1.7, 0.3, 0.1, 3.3, 2.66] },
  agentProfiles: {
    "a-builder": { name: "Builder", role: "Implements tickets end to end and opens PRs.", harness: "hermes 0.22.5", model: "glm-5.3", machines: ["talos-tower"], owner: "RW", runs: 182, success: 91, cost: 41.82, budget: "$5 per run, $100 per month", tools: ["terminal", "edit", "git", "stellarc", "browser"], picks: "Tickets assigned to Builder in Engineering and Triage" },
    "a-reviewer": { name: "Reviewer", role: "Reviews PRs against the ticket and the house rules. Can only comment.", harness: "hermes 0.22.5", model: "deepseek-v4", machines: ["talos-tower"], owner: "RW", runs: 96, success: 91, cost: 12.10, budget: "$2 per run, $40 per month", tools: ["git (read)", "stellarc", "browser"], picks: "PRs moved to In review" },
    "a-scout": { name: "Scout", role: "Watches competitors, libraries and papers. Files a daily report.", harness: "hermes 0.22.5", model: "glm-5.3", machines: ["zephyr-m16"], owner: "RW", runs: 41, success: 100, cost: 9.40, budget: "$1 per run", tools: ["web search", "stellarc"], picks: "Daily at 08:00, Asia/Jakarta" },
    "a-talos": { name: "Talos", role: "Orchestrator. Splits work, briefs agents, gates merges.", harness: "hermes 0.22.5", model: "opus", machines: ["talos-tower"], owner: "RW", runs: 64, success: 94, cost: 18.75, budget: "$10 per run", tools: ["everything"], picks: "Direct requests and blocked tickets" },
  },
  projects: {
    "p-v2": { name: "Stellarc v2", lead: "RW", target: "Dec 15", progress: 62, desc: "Agent-native project management: tickets, sessions and machines in one app.", tickets: { done: 31, review: 4, progress: 3, todo: 12 }, repos: ["NevrLabs/stellarc"], milestones: [["Effect v4 on dev", "Nov 8", "progress"], ["Shell redesign", "Nov 20", "todo"], ["Desktop beta", "Dec 15", "todo"]] },
    "p-effect": { name: "Effect v4 port", lead: "Builder", target: "Nov 8", progress: 86, desc: "Move the backend to Effect 4, then merge into dev.", tickets: { done: 19, review: 1, progress: 1, todo: 2 }, repos: ["NevrLabs/stellarc"], milestones: [["API on v4", "Oct 19", "done"], ["Agent features ported", "Nov 6", "progress"], ["Merged to dev", "Nov 8", "todo"]] },
    "p-desktop": { name: "Desktop + mobile", lead: "RW", target: "Jan 30", progress: 12, desc: "Tauri 2 desktop shell with tabs, plus an Expo mobile client.", tickets: { done: 2, review: 0, progress: 0, todo: 14 }, repos: ["NevrLabs/stellarc"], milestones: [["ADR 0013 approved", "Nov 4", "todo"], ["Tabs shell", "Dec 1", "todo"]] },
  },
  repos: {
    "r-stellarc": { name: "NevrLabs/stellarc", branch: "dev", ahead: "effect/v4 is 69 ahead", prs: [
      { n: 163, title: "NEVR-229: flush transcript on interrupt", by: "Builder", agent: true, state: "open", checks: "running" },
      { n: 162, title: "NEVR-415: attempt continuity", by: "Builder", agent: true, state: "merged", checks: "pass" },
      { n: 108, title: "Agent transcript surface", by: "Builder", agent: true, state: "open", checks: "blocked", note: "frozen UI" },
      { n: 87, title: "ADR 0013: Tauri 2 over GPUI", by: "Talos", agent: true, state: "open", checks: "pass" },
    ], pushes: [["Builder", "agent/nevr-229", "3 commits", "12m"], ["Builder", "agent/v4-integrate", "1 commit", "6m"], ["RW", "dev", "merge #162", "yesterday"]] },
  },
  // Ticket detail for the side peek.
  ticketDetail: {
    "NEVR-229": { desc: "When a run is interrupted (SIGTERM, cancel, budget stop), the runner must flush buffered transcript items before reporting the attempt cancelled. Also refuse any agent request to kill its own process.", labels: ["Runner", "Agents"], project: "Stellarc v2", runs: [["Attempt 2", "running", "18m", "$0.62"], ["Attempt 1", "interrupted", "31m", "$0.88"]], activity: [["Talos", "assigned to Builder", "2d"], ["Builder", "started attempt 1", "2d"], ["Builder", "opened PR #163", "1h"], ["Builder", "started attempt 2", "18m"]] },
  },
};
