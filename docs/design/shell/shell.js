// Stellarc shell prototype v2: Tabs (desktop only) > Views (rail) > Sidebar (+ pinned Recent) > Viewport.
// Graphite = dark mode, Paper = light mode. State lives in the URL hash so every state is linkable.
(() => {
  const D = window.DATA, I = window.ICONS;
  const icon = (n, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[n] || ""}</svg>`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const R = D.resources;

  const defaults = {
    theme: "dark", platform: "desktop", review: "1", frame: "1", recent: "1",
    tabs: [
      { view: "resources", item: "board-eng", bview: "board" },
      { view: "agents", item: "s-229" },
      { view: "home", item: "inbox" },
      { view: "resources", item: "m-talos" },
    ],
    active: 0, drawer: 0,
  };
  const S = loadState();

  function loadState() {
    const s = structuredClone(defaults);
    const h = new URLSearchParams(location.hash.slice(1));
    for (const k of ["theme", "platform", "review", "frame", "recent", "peek"]) if (h.get(k)) s[k] = h.get(k);
    if (h.get("tabs")) s.tabs = h.get("tabs").split(",").map((t) => { const [view, item, bview] = t.split(":"); return { view, item, bview: bview || "board" }; });
    if (h.get("active")) s.active = Math.min(+h.get("active"), s.tabs.length - 1);
    if (h.get("drawer")) s.drawer = +h.get("drawer");
    return s;
  }
  function saveState() {
    const h = new URLSearchParams({ theme: S.theme, platform: S.platform, review: S.review, frame: S.frame, recent: S.recent, ...(S.peek ? { peek: S.peek } : {}),
      tabs: S.tabs.map((t) => [t.view, t.item, t.bview && t.bview !== "board" ? t.bview : ""].filter(Boolean).join(":")).join(","), active: S.active, drawer: S.drawer });
    history.replaceState(null, "", "#" + h.toString());
  }

  const tab = () => S.tabs[S.active];
  const sectionsFor = (view) => D[view].sections;
  const findItem = (view, id) => { for (const s of sectionsFor(view)) for (const it of s.items) if (it.id === id) return { sec: s, it }; return null; };
  const firstItem = (view) => sectionsFor(view)[0].items[0].id;
  const viewMeta = (id) => D.views.find((v) => v.id === id);
  const allBoardViews = () => [...R.boardViews, ...R.customViews];
  const bviewMeta = (id) => allBoardViews().find((v) => v.id === id) || R.boardViews[0];
  const isBoard = (t) => t.view === "resources" && findItem("resources", t.item)?.sec.id === "boards";
  const tabTitle = (t) => { const f = findItem(t.view, t.item); const base = f ? f.it.label : viewMeta(t.view).label; return isBoard(t) && t.bview !== "board" ? `${base}, ${bviewMeta(t.bview).label}` : base; };
  const tabIcon = (t) => { if (isBoard(t)) return bviewMeta(t.bview).icon; const f = findItem(t.view, t.item); return f?.sec.icon || f?.it.icon || viewMeta(t.view).icon; };
  const openTab = (ref) => { S.tabs.push({ view: ref.view, item: ref.item, bview: ref.bview || "board" }); S.active = S.tabs.length - 1; };
  const go = (ref) => { const t = tab(); t.view = ref.view; t.item = ref.item; t.bview = ref.bview || "board"; };

  // ---------------- Header: org | tabs (desktop) | search | avatar | window controls ----------------
  // Tabs shrink (flex 0 1 200px, min 88px) and the strip clips with an overflow count; search, avatar and
  // window controls are flex:none so tabs can never eat them.
  function header() {
    const desktop = S.platform === "desktop";
    const org = `<button class="org" title="Switch organization"><span class="mark">${D.org.initials}</span><span class="on">${D.org.name}</span>${icon("chevron-down", "sm")}</button>`;
    const tabs = desktop ? `<div class="tabs" role="tablist" aria-label="Open tabs"><div class="tabs-track">${S.tabs.map((t, i) => `
        <div class="tab ${i === S.active ? "on" : ""}" role="tab" aria-selected="${i === S.active}" data-tab="${i}" title="${esc(tabTitle(t))}">
          ${icon(tabIcon(t), "sm")}<span class="t">${esc(tabTitle(t))}</span>
          <button class="x" data-close="${i}" aria-label="Close tab">${icon("x", "sm")}</button>
        </div>`).join("")}</div>
        <button class="tabs-more" data-more title="All tabs">${icon("chevron-down", "sm")}<span class="mc"></span></button>
        <button class="newtab" data-newtab aria-label="New tab" title="New tab (Ctrl+T)">${icon("plus")}</button></div>` : '<span class="hdr-fill"></span>';
    const search = `<button class="search ${desktop ? "" : "center"}">${icon("search", "sm")}<span class="ph">Search</span><span class="k">Ctrl K</span></button>`;
    const ava = `<button class="avatar" title="${D.me.name}, ${D.me.email}">${D.me.initials}</button>`;
    const win = desktop ? `<div class="win"><button aria-label="Minimize">${icon("minus", "sm")}</button><button aria-label="Maximize">${icon("square", "sm")}</button><button class="close" aria-label="Close">${icon("x", "sm")}</button></div>` : "";
    return `<header class="header ${desktop ? "" : "web"}">${org}${tabs}${search}${ava}${win}</header>`;
  }

  // ---------------- Rail ----------------
  function rail() {
    const v = (x, future) => `<button class="v ${!future && x.id === tab().view ? "on" : ""} ${future ? "future" : ""}" ${future ? "" : `data-view="${x.id}"`} aria-label="${x.label}">
        ${icon(x.icon)}${x.id === "agents" ? '<span class="dot"></span>' : ""}<span class="tip">${x.label}${future ? " (later)" : ""}</span></button>`;
    return `<nav class="rail" aria-label="Views">${D.views.map((x) => v(x)).join("")}<span class="sep"></span>${D.futureViews.map((x) => v(x, true)).join("")}
      <span class="grow"></span><button class="v" data-theme-toggle aria-label="Toggle theme">${icon(S.theme === "dark" ? "sun" : "moon")}<span class="tip">${S.theme === "dark" ? "Light mode" : "Dark mode"}</span></button>
      <button class="v" aria-label="Settings">${icon("settings")}<span class="tip">Settings</span></button></nav>`;
  }

  // ---------------- Sidebar: view-owned groups + pinned Recent footer ----------------
  const RECENT_WHEN = ["now", "4m", "12m", "1h", "3h"];
  function sidebar() {
    const t = tab(), view = t.view;
    const head = viewMeta(view).label;
    const groups = sectionsFor(view).map((s) => `
      <div class="grp">${s.label ? `<div class="grp-h">${s.icon ? icon(s.icon, "sm") : ""}<span>${s.label}</span><button class="ib add" aria-label="Add to ${s.label}">${icon("plus", "sm")}</button></div>` : ""}
        ${s.items.map((it) => {
          const two = !!it.sub;
          const on = it.ref ? it.ref.item === t.item && (it.ref.bview || "board") === t.bview : it.id === t.item;
          return `<button class="row ${two ? "two" : ""} ${on ? "on" : ""} ${s.label ? "" : "top"}" ${it.ref ? `data-ref='${JSON.stringify(it.ref)}'` : `data-item="${it.id}"`}>
            ${it.status ? `<span class="st ${it.status}"></span>` : it.icon ? icon(it.icon, "sm") : ""}
            <span class="t">${esc(it.label)}${two ? `<small>${esc(it.sub)}</small>` : ""}</span>${it.count ? `<span class="n">${it.count}</span>` : ""}</button>`;
        }).join("")}</div>`).join("");
    const recent = S.recent === "1" ? `<div class="recent" aria-label="Recent">
        <div class="recent-h"><span>Recent</span><span class="kbd">Ctrl E</span></div>
        ${D.home.recent.map((r, i) => `<button class="row rrow" data-ref='${JSON.stringify(r.ref)}' title="Open here. Ctrl+click opens a new tab.">${icon(r.icon, "sm")}<span class="t">${esc(r.label)}</span><span class="when">${RECENT_WHEN[i]}</span></button>`).join("")}
      </div>` : "";
    return `<aside class="side" aria-label="${head} sidebar"><div class="side-h">${head}<span class="acts"><button class="ib" aria-label="New">${icon("plus", "sm")}</button></span></div>
      <div class="side-scroll">${groups}</div>${recent}</aside>`;
  }

  // ---------------- Workspace ----------------
  function work() {
    const t = tab(), f = findItem(t.view, t.item);
    if (isBoard(t)) return boardWork(t, f);
    const crumbs = `<div class="crumbs">${f?.sec.label ? `<span>${esc(f.sec.label)}</span>${icon("chevron-right", "sm")}` : ""}<b>${esc(f ? f.it.label : "")}</b></div>`;
    let tools = "", body = "";
    if (t.view === "agents" && f.sec.id === "aov") {
      tools = `<div class="seg"><button class="on">All</button><button>Live</button><button>Failed</button></div><button class="btn pri">${icon("play", "sm")}Run agent</button>`;
      body = sessionsOverview();
    } else if (f.sec.id === "projects" || f.sec.id === "aprojects") {
      tools = `<button class="btn">${icon("kanban-square", "sm")}Open board</button><button class="btn pri">${icon("plus", "sm")}New ticket</button>`;
      body = projectView(t.item);
    } else if (f.sec.id === "repos") {
      tools = `<button class="btn">${icon("arrow-up-right", "sm")}Open on GitHub</button>`;
      body = repoView(t.item);
    } else if (t.view === "home" && t.item === "mine") {
      tools = `<div class="seg"><button class="on">Assigned</button><button>Created</button><button>Subscribed</button></div>`;
      body = myTickets();
    } else if (t.view === "resources" && f.sec.id === "machines") {
      tools = `<button class="btn">${icon("terminal", "sm")}Open shell</button><button class="btn pri">${icon("plus", "sm")}Connect machine</button>`;
      body = machineView(f.it);
    } else if ((t.view === "resources" && f.sec.id === "ragents") || (t.view === "agents" && f.sec.id === "bots")) {
      tools = `<button class="btn">${icon("settings", "sm")}Configure</button><button class="btn pri">${icon("play", "sm")}Run on a ticket</button>`;
      body = agentProfile(t.item);
    } else if (t.view === "agents" && (f.sec.id === "live" || f.sec.id === "recent")) {
      tools = `<span class="chip live"><span class="st run"></span>Running 18m</span><button class="btn">${icon("pause", "sm")}Pause</button><button class="btn">${icon("arrow-up-right", "sm")}Open ticket</button>`;
      body = sessionView();
    } else if (t.view === "home") {
      tools = `<div class="seg"><button class="on">All</button><button>Agents</button><button>People</button></div>`;
      body = inboxView();
    } else {
      body = `<div class="pad"><h1 class="pg">${esc(f.it.label)}</h1><p class="sub">${esc(f.sec.label)} overview. Not designed in this pass.</p></div>`;
    }
    return `<main class="work"><div class="toolbar">${crumbs}<span class="sp"></span>${tools}</div><div class="vp">${body}</div></main>`;
  }
  const withPeek = (main) => S.peek ? `<div class="peekwrap">${main}${peekPanel(S.peek)}</div>` : main;

  // ---------------- Boards: Linear-style view tabs + filter/display bar ----------------
  const PRI = { urgent: { l: "Urgent", i: "alert-octagon" }, high: { l: "High", i: "signal-high" }, medium: { l: "Medium", i: "signal-medium" }, low: { l: "Low", i: "signal-low" }, none: { l: "No priority", i: "more-horizontal" } };
  const ST_ICON = { backlog: "circle-dashed", todo: "circle-dashed", progress: "circle-dot", review: "git-pull-request", done: "circle-check" };
  const pri = (p) => `<span class="prio prio-${p}" title="${PRI[p].l}">${icon(PRI[p].i, "sm")}</span>`;
  const who = (k) => !k.who ? `<span class="av empty" title="Unassigned">${icon("user", "sm")}</span>` : k.agent ? `<span class="av bot" title="${k.who} (agent)">${k.who[0]}</span>` : `<span class="av" title="${k.who}">${k.who}</span>`;
  const stIcon = (s) => `<span class="sti sti-${s}">${icon(ST_ICON[s], "sm")}</span>`;
  const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  function boardWork(t, f) {
    const bv = t.bview || "board";
    const vt = (v) => `<button class="vtab ${v.id === bv ? "on" : ""}" role="tab" aria-selected="${v.id === bv}" data-bview="${v.id}">${icon(v.icon, "sm")}<span>${v.label}</span></button>`;
    const viewTabs = `<div class="vtabs" role="tablist" aria-label="Board views">${R.boardViews.map(vt).join("")}<span class="vsep"></span>${R.customViews.map(vt).join("")}
      <button class="vtab add" title="Save the current filters as a view">${icon("plus", "sm")}<span>View</span></button></div>`;
    const crumbs = `<div class="crumbs"><span>Boards</span>${icon("chevron-right", "sm")}<b>${esc(f.it.label)}</b><button class="ib star" aria-label="Favorite">${icon("star", "sm")}</button></div>`;
    const chips = { agentwork: [["bot", "Assignee is any agent"]], mine: [["user", "Assignee is me"], ["calendar", "Due within 7 days"]] }[bv] || [];
    const filterbar = `<div class="filterbar">${chips.map(([i, l]) => `<span class="fchip">${icon(i, "sm")}<span>${l}</span><button class="x" aria-label="Remove filter">${icon("x", "sm")}</button></span>`).join("")}
      <button class="btn ghost sm">${icon("filter", "sm")}Filter</button><button class="btn ghost sm">${icon("sliders-horizontal", "sm")}Display</button></div>`;
    const tools = `<button class="btn pri">${icon("plus", "sm")}New ticket</button>`;
    const body = { board: boardBoard, list: boardList, timeline: boardTimeline, backlog: boardBacklog, calendar: boardCalendar, agentwork: boardAgentWork, mine: boardMine }[bv]();
    return `<main class="work board-work"><div class="toolbar">${crumbs}<span class="sp"></span>${tools}</div>
      <div class="viewbar">${viewTabs}<span class="sp"></span>${filterbar}</div><div class="vp">${body}</div></main>`;
  }

  const active = () => R.tickets.filter((k) => k.status !== "backlog");
  const card = (k) => `<article class="card ${k.live ? "is-live" : ""} ${S.peek === k.key ? "sel" : ""}" data-peek="${k.key}" tabindex="0"><div class="c1"><span class="k">${k.key}</span>${who(k)}</div><span class="ti">${esc(k.title)}</span>
    <div class="f">${pri(k.pri)}<span class="chip">${k.tag}</span>${k.live ? `<span class="live"><span class="st run"></span>${k.live}</span>` : k.due ? `<span class="due">${fmtDate(k.due)}</span>` : ""}</div>${k.live ? '<span class="runbar"></span>' : ""}</article>`;

  const boardBoard = () => `<div class="board">${R.statuses.filter((s) => s.id !== "backlog").map((s) => {
      const cs = active().filter((k) => k.status === s.id);
      return `<section><div class="col-h">${stIcon(s.id)}<span>${s.label}</span><span class="n">${cs.length}</span><button class="ib" aria-label="Add ticket">${icon("plus", "sm")}</button></div>${cs.map(card).join("")}</section>`;
    }).join("")}</div>`;

  const listRow = (k) => `<div class="lrow ${k.live ? "is-live" : ""} ${S.peek === k.key ? "sel" : ""}" data-peek="${k.key}" tabindex="0">${pri(k.pri)}<span class="k">${k.key}</span>${stIcon(k.status)}<span class="ti">${esc(k.title)}</span>
      ${k.live ? `<span class="live"><span class="st run"></span>${k.who}, ${k.live}</span>` : ""}<span class="chip">${k.tag}</span><span class="due">${k.due ? fmtDate(k.due) : ""}</span>${who(k)}</div>`;
  const byDue = (a, b) => (a.due || "9999").localeCompare(b.due || "9999");
  const lgroup = (head, cs) => `<div class="lgroup"><div class="lgroup-h">${icon("chevron-down", "sm")}${head}<span class="n">${cs.length}</span><button class="ib" aria-label="Add ticket">${icon("plus", "sm")}</button></div>${[...cs].sort(byDue).map(listRow).join("")}</div>`;
  const boardList = () => `<div class="list"><div class="lhead"><span></span><span>ID</span><span></span><span>Title</span><span>Label</span><span>Due</span><span></span></div>${R.statuses.filter((s) => s.id !== "backlog").map((s) => lgroup(`${stIcon(s.id)}<span>${s.label}</span>`, active().filter((k) => k.status === s.id))).join("")}</div>`;

  const boardBacklog = () => {
    const b = R.tickets.filter((k) => k.status === "backlog");
    return `<div class="list backlog"><div class="bl-note">${icon("archive", "sm")}<span>${b.length} tickets not scheduled. Move one to To do to start it, or let an agent triage the list.</span><span class="sp"></span><button class="btn sm">${icon("bot", "sm")}Triage with agent</button></div>
      ${["urgent", "high", "medium", "low", "none"].map((p) => { const cs = b.filter((k) => k.pri === p); return cs.length ? lgroup(`${pri(p)}<span>${PRI[p].l}</span>`, cs) : ""; }).join("")}</div>`;
  };

  // Timeline: today = Mon Nov 2 2026. One column per day.
  const boardTimeline = () => {
    const start = new Date("2026-10-19T00:00:00"), days = 35, today = 14;
    const dayIdx = (d) => Math.round((new Date(d + "T00:00:00") - start) / 864e5);
    const day = (i) => new Date(start.getTime() + i * 864e5);
    const wk = (d) => d.getDay() === 0 || d.getDay() === 6;
    const rows = active().filter((k) => k.start);
    const head = Array.from({ length: days }, (_, i) => { const d = day(i);
      return `<div class="tl-d ${wk(d) ? "wk" : ""} ${i === today ? "today" : ""}"><small>${"SMTWTFS"[d.getDay()]}</small><span>${d.getDate()}</span></div>`; }).join("")
      + Array.from({ length: days }, (_, i) => day(i).getDate() === 1 ? `<span class="tl-mlabel" style="--i:${i}">${day(i).toLocaleDateString("en-US", { month: "long" })}</span>` : "").join("")
      ;
    const months = Array.from({ length: days }, (_, i) => day(i).getDate() === 1 ? `<div class="tl-month" style="--i:${i}"></div>` : "").join("");
    return `<div class="timeline" style="--days:${days}">
      <div class="tl-side"><div class="tl-sh"><span>${rows.length} tickets with dates</span></div>${rows.map((k) => `<div class="tl-name">${stIcon(k.status)}<span class="k">${k.key}</span><span class="t">${esc(k.title)}</span></div>`).join("")}</div>
      <div class="tl-grid"><div class="tl-head">${head}</div>
        <div class="tl-body" style="--rows:${rows.length}">${Array.from({ length: days }, (_, i) => wk(day(i)) ? `<div class="tl-wk" style="--i:${i}"></div>` : "").join("")}${months}<div class="tl-today" style="--i:${today}"></div>
        ${rows.map((k, r) => { const a = dayIdx(k.start), b = dayIdx(k.due); const a2 = Math.max(a, 0); return `<div class="tl-bar st-${k.status} ${k.live ? "is-live" : ""} ${a < 0 ? "cut" : ""}" style="--r:${r};--a:${a2};--b:${b + 1}">${stIcon(k.status)}<span class="bt">${k.live ? `${k.who}, ${k.live}` : fmtDate(k.start) + " to " + fmtDate(k.due)}</span>${who(k)}</div>`; }).join("")}
        </div></div></div>`;
  };

  const boardCalendar = () => {
    const start = new Date("2026-10-26T00:00:00"), today = "2026-11-02";
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * 864e5));
    return `<div class="cal"><div class="cal-top"><b>November 2026</b><span class="sp"></span><button class="ib" aria-label="Previous month">${icon("chevron-right", "sm flip")}</button><button class="btn sm">Today</button><button class="ib" aria-label="Next month">${icon("chevron-right", "sm")}</button></div>
      <div class="cal-grid">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="cal-dow">${d}</div>`).join("")}
      ${cells.map((d) => { const due = R.tickets.filter((k) => k.due === iso(d)); const out = d.getMonth() !== 10;
        return `<div class="cal-c ${out ? "out" : ""} ${iso(d) === today ? "today" : ""}"><span class="cal-n">${d.getDate()}</span>${due.map((k) => `<div class="cal-ev ${k.live ? "is-live" : ""} ${k.status === "done" ? "done" : ""}" title="${k.key}">${stIcon(k.status)}<span class="t">${esc(k.title)}</span></div>`).join("")}</div>`; }).join("")}</div></div>`;
  };

  const boardAgentWork = () => {
    const agents = [...new Set(R.tickets.filter((k) => k.agent).map((k) => k.who))];
    return `<div class="board">${agents.map((a) => { const cs = R.tickets.filter((k) => k.agent && k.who === a);
      return `<section><div class="col-h"><span class="av bot">${icon("bot")}</span><span>${a}</span><span class="n">${cs.length}</span></div>${cs.map(card).join("")}</section>`; }).join("")}
      <section><div class="col-h"><span class="av bot">${icon("bot")}</span><span>Scout</span><span class="n">0</span></div><div class="empty-col">No tickets assigned. Scout files its own reports.</div></section></div>`;
  };
  const boardMine = () => `<div class="list">${lgroup("<span>Due this week</span>", R.tickets.filter((k) => k.who === "RW"))}</div>`;

  // ---------------- Other viewports ----------------
  const machineView = (it) => { const m = R.machine; return `<div class="pad">
    <h1 class="pg">${esc(it.label)}</h1><p class="sub"><span class="mono">${m.id}</span>, ${m.os}</p>
    <div class="kv"><div><small>Status</small><b><span class="st ok"></span>Online</b></div><div><small>Daemon</small><b class="mono">v${m.version}</b></div><div><small>Active runs</small><b>2 of 6 slots</b></div><div><small>Heartbeat</small><b>4s ago</b></div></div>
    <h2 class="sec">Harnesses</h2><table class="t"><tr><th>Harness</th><th>Version</th><th>Slots in use</th></tr>${m.harnesses.map((h) => `<tr><td>${h.name}</td><td class="mono">${h.version}</td><td>${h.slots}</td></tr>`).join("")}</table>
    <h2 class="sec">Runs on this machine</h2><table class="t"><tr><th>Ticket</th><th>Agent</th><th>Harness</th><th>Duration</th><th>State</th></tr>${m.runs.map((r) => `<tr><td class="mono">${r.key}</td><td>${r.agent}</td><td>${r.harness}</td><td>${r.time}</td><td><span class="st ${r.state}"></span></td></tr>`).join("")}</table></div>`; };

  const agentsGrid = () => `<div class="agent-grid">${D.agents.sections.find((s) => s.id === "bots").items.map((a) => `
    <article class="acard"><div class="top"><span class="ava">${icon("bot")}</span><div class="nmw"><div class="nm">${a.label}</div><div class="md">${a.sub}</div></div><span class="st ${a.status}"></span></div>
    <div class="now">${a.status === "run" ? "Working on NEVR-229 and NEVR-421 on talos-tower" : "Idle. Picks up tickets assigned to it."}</div>
    <div class="stats"><span><b>${a.label === "Builder" ? 182 : a.label === "Reviewer" ? 96 : 41}</b> runs</span><span><b>${a.label === "Scout" ? "100" : "91"}%</b> succeeded</span><span><b>$${a.label === "Builder" ? "41.82" : "12.10"}</b> this month</span></div></article>`).join("")}</div>`;

  const sessionView = () => `<div class="session"><div class="thread">${D.agents.transcript.map((m) => {
      if (m.kind === "tool") return `<div class="msg"><span class="mini bot">${icon("wrench", "sm")}</span><div class="body2"><div class="tool"><div class="th">${icon(m.name === "edit" ? "file-text" : "square-terminal", "sm")}<code>${esc(m.arg)}</code><span class="okk">${icon("circle-check", "sm")}</span></div><pre>${esc(m.out)}</pre></div></div></div>`;
      const w = m.kind === "user" ? m.who : m.kind === "think" ? "Thinking" : "Builder";
      return `<div class="msg ${m.kind}"><span class="mini ${m.kind === "user" ? "" : "bot"}">${m.kind === "user" ? "OR" : icon(m.kind === "think" ? "sparkles" : "bot", "sm")}</span><div class="body2"><div class="meta">${w}</div>${esc(m.text)}</div></div>`;
    }).join("")}
    <div class="composer">${icon("message-square-text", "sm")}<span>Steer this session</span><span class="sp"></span><span class="mono">Enter</span></div></div>
    <aside class="rpanel"><h3>Session</h3><div class="line"><span>Agent</span><b>Builder</b></div><div class="line"><span>Ticket</span><b class="mono">NEVR-229</b></div><div class="line"><span>Machine</span><b>talos-tower</b></div><div class="line"><span>Model</span><b class="mono">glm-5.3</b></div><div class="line"><span>Tokens</span><b>184k</b></div><div class="line"><span>Cost</span><b>$0.62 of $5.00</b></div><h3>Attempts</h3><div class="line"><span>Attempt 2</span><b>running</b></div><div class="line"><span>Attempt 1</span><b>interrupted</b></div></aside></div>`;

  const inboxView = () => `<div class="inbox">${D.home.inbox.map((n) => `<div class="it"><span class="u ${n.unread ? "" : "no"}"></span><span class="mini ${n.agent ? "bot" : ""}">${n.agent ? icon("bot", "sm") : n.who.slice(0, 2)}</span><span class="txt"><span class="who">${esc(n.who)}</span> <span class="what">${esc(n.what)}</span> ${esc(n.ref)}</span><span class="when">${n.when}</span></div>`).join("")}</div>`;


  // ---------------- Agents overview: live strip, spend, sessions table ----------------
  const money = (n) => "$" + n.toFixed(2);
  const sessionsOverview = () => {
    const live = D.sessions.filter((x) => x.state === "run"), sp = D.spend, max = Math.max(...sp.days);
    const stLabel = { run: "Running", ok: "Completed", err: "Failed" };
    return `<div class="pad wide">
      <div class="ov-top">
        <section class="ov-live"><div class="ov-h">${icon("circle-dot", "sm")}<span>Running now</span><span class="n">${live.length}</span></div>
          ${live.map((x) => `<button class="lcard" data-open-session="${x.id}"><div class="l1"><span class="av bot">${x.agent[0]}</span><b>${esc(x.title)}</b><span class="live"><span class="st run"></span>${x.dur}</span></div>
            <div class="l2"><span class="k">${x.ticket}</span><span>${x.machine}</span><span class="mono">${x.model}</span><span>attempt ${x.attempt}</span><span class="sp"></span><span>${money(x.cost)}</span></div><span class="runbar"></span></button>`).join("")}
        </section>
        <section class="ov-spend"><div class="ov-h">${icon("bar-chart-3", "sm")}<span>Spend this month</span></div>
          <div class="sp-big"><b>${money(sp.month)}</b><span>of ${money(sp.cap)} cap</span></div>
          <div class="meter"><span style="width:${(sp.month / sp.cap * 100).toFixed(1)}%"></span></div>
          <div class="spark">${sp.days.map((d, i) => `<span style="height:${Math.max(4, d / max * 100)}%" class="${i === sp.days.length - 1 ? "today" : ""}" title="${money(d)}"></span>`).join("")}</div>
          <div class="sp-foot"><span>Last 14 days</span><span>Today ${money(sp.today)}</span></div>
        </section>
      </div>
      <h2 class="sec">All sessions</h2>
      <table class="t sessions"><tr><th></th><th>Session</th><th>Agent</th><th>Ticket</th><th>Machine</th><th>Started</th><th class="r">Duration</th><th class="r">Tokens</th><th class="r">Cost</th></tr>
        ${D.sessions.map((x) => `<tr data-open-session="${x.id}"><td><span class="st ${x.state}" title="${stLabel[x.state]}"></span></td><td><span class="stitle">${esc(x.title)}</span>${x.error ? `<small class="err-t">${esc(x.error)}, attempt ${x.attempt}</small>` : ""}</td>
          <td><span class="who-c"><span class="av bot">${x.agent[0]}</span>${x.agent}</span></td><td class="k">${x.ticket || "<span class=faint>none</span>"}</td><td>${x.machine}</td><td class="dim">${x.started}</td><td class="r num">${x.dur}</td><td class="r num">${x.tokens}</td><td class="r num">${money(x.cost)}</td></tr>`).join("")}
      </table></div>`;
  };

  // ---------------- Agent profile ----------------
  const agentProfile = (id) => {
    const a = D.agentProfiles[id] || D.agentProfiles["a-builder"];
    const mine = D.sessions.filter((x) => x.agent === a.name);
    const st = D.agents.sections.find((s) => s.id === "bots").items.find((i) => i.id === id)?.status || "idle";
    return `<div class="pad wide"><div class="prof-h"><span class="ava-lg">${a.name[0]}</span><div><h1 class="pg">${a.name}</h1><p class="sub">${esc(a.role)}</p></div>
        <span class="state-pill st-${st}"><span class="st ${st}"></span>${st === "run" ? "Working" : "Idle"}</span></div>
      <div class="kv"><div><small>Runs</small><b>${a.runs}</b></div><div><small>Succeeded</small><b>${a.success}%</b></div><div><small>Spend this month</small><b>${money(a.cost)}</b></div><div><small>Budget</small><b>${a.budget}</b></div></div>
      <div class="two-col"><div>
        <h2 class="sec">Recent sessions</h2>
        ${mine.length ? `<div class="mini-list">${mine.map((x) => `<button class="mrow" data-open-session="${x.id}"><span class="st ${x.state}"></span><span class="t">${esc(x.title)}</span><span class="k">${x.ticket || ""}</span><span class="dim">${x.started}</span></button>`).join("")}</div>` : `<div class="empty-col">No sessions yet.</div>`}
      </div><div>
        <h2 class="sec">Setup</h2>
        <dl class="dl"><dt>Harness</dt><dd>${a.harness}</dd><dt>Model</dt><dd class="mono">${a.model}</dd><dt>Runs on</dt><dd>${a.machines.join(", ")}</dd><dt>Picks up</dt><dd>${esc(a.picks)}</dd><dt>Tools</dt><dd>${a.tools.map((x) => `<span class="chip">${x}</span>`).join(" ")}</dd><dt>Owner</dt><dd><span class="owner"><span class="av">${a.owner}</span>${a.owner === "RW" ? D.me.name : a.owner}</span></dd></dl>
      </div></div></div>`;
  };

  // ---------------- Project ----------------
  const projectView = (id) => {
    const p = D.projects[id] || D.projects["p-v2"], tk = p.tickets, tot = tk.done + tk.review + tk.progress + tk.todo;
    const seg = (n, c) => `<span class="seg-${c}" style="flex:${n}"></span>`;
    return `<div class="pad wide"><h1 class="pg">${p.name}</h1><p class="sub">${esc(p.desc)}</p>
      <div class="kv"><div><small>Lead</small><b>${p.lead}</b></div><div><small>Target</small><b>${p.target}</b></div><div><small>Progress</small><b>${p.progress}%</b></div><div><small>Tickets</small><b>${tot}</b></div></div>
      <div class="stack">${seg(tk.done, "done")}${seg(tk.review, "review")}${seg(tk.progress, "progress")}${seg(tk.todo, "todo")}</div>
      <div class="legend"><span><i class="seg-done"></i>Done ${tk.done}</span><span><i class="seg-review"></i>In review ${tk.review}</span><span><i class="seg-progress"></i>In progress ${tk.progress}</span><span><i class="seg-todo"></i>To do ${tk.todo}</span></div>
      <h2 class="sec">Milestones</h2>
      <div class="mini-list">${p.milestones.map(([n, d, st, pc]) => { const v = pc ?? (st === "done" ? 100 : st === "progress" ? 60 : 0); return `<div class="mrow static ${st === "progress" ? "cur" : ""}">${stIcon(st)}<span class="t">${n}</span><span class="ms-bar ${st}"><span style="width:${v}%"></span></span><span class="dim num" style="width:34px;text-align:right">${v}%</span><span class="dim" style="width:52px;text-align:right">${d}</span></div>`; }).join("")}</div>
      <h2 class="sec">Repositories</h2><div class="mini-list">${p.repos.map((r) => `<div class="mrow static">${icon("git-branch", "sm")}<span class="t mono">${r}</span></div>`).join("")}</div></div>`;
  };

  // ---------------- Repo ----------------
  const repoView = (id) => {
    const r = D.repos[id] || D.repos["r-stellarc"];
    const chk = { pass: ["circle-check", "ok", "Checks pass"], running: ["loader", "run", "Checks running"], blocked: ["circle-x", "err", "Blocked"] };
    return `<div class="pad wide"><h1 class="pg mono">${r.name}</h1><p class="sub">Default branch <span class="mono">${r.branch}</span>, ${r.ahead}</p>
      <h2 class="sec">Pull requests</h2>
      ${r.prs.length ? `<div class="mini-list">${r.prs.map((x) => `<div class="mrow static"><span class="prs prs-${x.state}">${icon("git-pull-request", "sm")}</span><span class="k">#${x.n}</span><span class="t">${esc(x.title)}</span>${x.note ? `<span class="chip">${x.note}</span>` : ""}<span class="chk chk-${chk[x.checks][1]}" title="${chk[x.checks][2]}">${icon(chk[x.checks][0], "sm")}</span><span class="who-c"><span class="av ${x.agent ? "bot" : ""}">${x.by[0]}</span>${x.by}</span></div>`).join("")}</div>` : `<div class="empty-col">No open pull requests.</div>`}
      <h2 class="sec">Recent pushes</h2>
      ${r.pushes.length ? `<div class="mini-list">${r.pushes.map(([w, b, c, t]) => `<div class="mrow static">${icon("git-branch", "sm")}<span class="mono">${b}</span><span class="t dim">${w} pushed ${c}</span><span class="dim">${t}</span></div>`).join("")}</div>` : `<div class="empty-col">No pushes yet.</div>`}</div>`;
  };

  // ---------------- My tickets (Home) ----------------
  const myTickets = () => {
    const mine = R.tickets.filter((k) => k.who === "RW");
    const review = R.tickets.filter((k) => k.status === "review");
    return `<div class="list">${lgroup(`<span>Assigned to me</span>`, mine)}${lgroup(`${icon("git-pull-request", "sm")}<span>Waiting for my review</span>`, review)}</div>`;
  };

  // ---------------- Ticket peek (right side panel) ----------------
  const peekPanel = (key) => {
    const k = R.tickets.find((x) => x.key === key); if (!k) return "";
    const d = D.ticketDetail[key] || { desc: "No description yet.", labels: [k.tag], project: "Stellarc v2", runs: [], activity: [["RW", "created this ticket", "3d"]] };
    const st = R.statuses.find((x) => x.id === k.status).label;
    return `<aside class="peek" aria-label="${key}">
      <div class="pk-h"><span class="k">${key}</span><span class="sp"></span><button class="ib" title="Open in new tab">${icon("arrow-up-right", "sm")}</button><button class="ib" title="Copy link">${icon("copy", "sm")}</button><button class="ib" data-peek-close title="Close (Esc)">${icon("x", "sm")}</button></div>
      <div class="pk-body"><h2 class="pk-t">${esc(k.title)}</h2>
        <dl class="dl pk-props"><dt>Status</dt><dd>${stIcon(k.status)}${st}</dd><dt>Priority</dt><dd>${pri(k.pri)}${PRI[k.pri].l}</dd><dt>Assignee</dt><dd>${who(k)}${k.who || "Unassigned"}${k.agent ? '<span class="faint"> (agent)</span>' : ""}</dd>
          <dt>Labels</dt><dd>${d.labels.map((l) => `<span class="chip">${l}</span>`).join(" ")}</dd><dt>Project</dt><dd>${d.project}</dd><dt>Due</dt><dd>${k.due ? fmtDate(k.due) : "None"}</dd></dl>
        <p class="pk-desc">${esc(d.desc)}</p>
        ${k.live ? `<button class="pk-live" data-open-session="s-${key.split("-")[1]}"><span class="st run"></span><span><b>${k.who} is working on this</b><small>${k.live}. Open the live session.</small></span>${icon("chevron-right", "sm")}<span class="runbar"></span></button>` : ""}
        ${d.runs.length ? `<h3 class="pk-sh">Agent runs</h3><div class="mini-list">${d.runs.filter((r) => !(k.live && r[1] === "running")).map(([a, s2, t, c]) => `<div class="mrow static"><span class="st ${s2 === "running" ? "run" : s2 === "interrupted" ? "warn" : "ok"}"></span><span class="t">${a}, ${s2}</span><span class="dim">${t}</span><span class="num">${c}</span></div>`).join("")}</div>` : ""}
        <h3 class="pk-sh">Activity</h3><div class="act">${d.activity.map(([w, a, t]) => `<div class="act-i"><span class="av ${w === "RW" ? "" : "bot"}">${w[0]}</span><span><b>${w}</b> ${a}</span><span class="dim">${t}</span></div>`).join("")}</div>
      </div>
      <div class="pk-comp">${icon("message-square-text", "sm")}<span>Comment, or @Builder to hand this to an agent</span></div></aside>`;
  };

  // ---------------- Mobile ----------------
  function mobile() {
    const t = tab(), f = findItem(t.view, t.item);
    const list = `<div class="m-list">${sectionsFor(t.view).map((s) => `${s.label ? `<div class="grp-h">${s.label}</div>` : ""}${s.items.map((it) => `<button class="row" data-item="${it.id}">${it.status ? `<span class="st ${it.status}"></span>` : icon(it.icon || s.icon || "circle-dot", "sm")}<span class="t">${esc(it.label)}</span>${icon("chevron-right", "sm")}</button>`).join("")}`).join("")}</div>`;
    const bv = t.bview || "board";
    const body = t.view === "agents" && f.sec.id === "aov" ? `<div class="m-sessions">${D.sessions.map((x) => `<button class="row" data-open-session="${x.id}"><span class="st ${x.state}"></span><span class="t">${esc(x.title)}<small>${x.agent}, ${x.dur}, ${money(x.cost)}</small></span>${icon("chevron-right", "sm")}</button>`).join("")}</div>`
      : t.view === "agents" && f.sec.id !== "bots" ? sessionView().replace(/<aside class="rpanel">[\s\S]*<\/aside>/, "")
      : isBoard(t) ? `<div class="m-vt">${R.boardViews.map((v) => `<button class="${v.id === bv ? "on" : ""}" data-bview="${v.id}">${v.label}</button>`).join("")}</div>${bv === "list" ? boardList() : bv === "backlog" ? boardBacklog() : bv === "calendar" ? boardCalendar() : bv === "timeline" ? boardList() : boardBoard()}`
      : t.view === "home" ? inboxView() : list;
    return `<div class="m"><div class="m-top"><button class="ib" data-drawer aria-label="Menu">${icon("menu")}</button><span class="ttl">${esc(f ? f.it.label : "")}</span><button class="ib" aria-label="Search">${icon("search")}</button><span class="avatar">${D.me.initials}</span></div>
      <div class="m-body">${body}</div>
      <nav class="m-bar">${D.views.map((v) => `<button class="${v.id === t.view ? "on" : ""}" data-view="${v.id}">${icon(v.icon)}${v.label}</button>`).join("")}<button data-drawer>${icon("history")}Recent</button></nav>
      <div class="drawer ${S.drawer ? "open" : ""}" data-drawer-bg><div class="panel">${sidebar()}</div></div></div>`;
  }

  // ---------------- Review controls (not product UI) ----------------
  function review() {
    const g = (label, key, opts) => `<div class="g"><span>${label}</span>${opts.map(([v, l]) => `<button class="${S[key] === v ? "on" : ""}" data-set="${key}:${v}">${l}</button>`).join("")}</div>`;
    return [g("Theme", "theme", [["dark", "Dark"], ["light", "Light"]]), '<span class="div"></span>',
      g("Platform", "platform", [["desktop", "Desktop"], ["web", "Web"], ["mobile", "Mobile"]]), '<span class="div"></span>',
      g("Recent footer", "recent", [["1", "On"], ["0", "Off"]]), '<span class="div"></span>',
      `<button data-addtabs title="Open 8 more tabs to test overflow">Stress tabs</button>`, `<button data-resettabs>Reset tabs</button>`, `<button data-hide>Hide</button>`].join("");
  }

  function render() {
    const app = document.getElementById("app"), stage = document.getElementById("stage");
    app.dataset.theme = S.theme;
    stage.className = S.platform === "mobile" ? "framed phone" : S.frame === "0" ? "bare" : "framed";
    app.innerHTML = S.platform === "mobile" ? mobile() : header() + `<div class="body">${rail()}${sidebar()}${withPeek(work())}</div>`;
    const r = document.getElementById("review"); r.innerHTML = review(); r.classList.toggle("hide", S.review === "0");
    saveState();
    requestAnimationFrame(fitTabs);
  }

  // Tab overflow: tabs shrink to 88px first; past that the track clips and a +N button shows the hidden count.
  function fitTabs() {
    const g = document.querySelector(".tl-grid"); if (g && !g.dataset.scrolled) { g.scrollLeft = 7 * 34; g.dataset.scrolled = "1"; }
    const tr = document.querySelector(".tabs-track"); if (!tr) return;
    const more = document.querySelector(".tabs-more");
    const base = tr.getBoundingClientRect().left - tr.scrollLeft;
    const pos = (el) => { const b = el.getBoundingClientRect(); return { l: b.left - base, r: b.right - base }; };
    const act = tr.querySelector(".tab.on");
    if (act) { const p = pos(act); if (p.r > tr.scrollLeft + tr.clientWidth) tr.scrollLeft = p.r - tr.clientWidth; if (p.l < tr.scrollLeft) tr.scrollLeft = p.l; }
    const hidden = [...tr.children].filter((el) => { const p = pos(el); return p.r > tr.scrollLeft + tr.clientWidth + 1 || p.l < tr.scrollLeft - 1; }).length;
    more.classList.toggle("show", hidden > 0); more.querySelector(".mc").textContent = hidden ? String(hidden) : "";
  }
  window.addEventListener("resize", fitTabs);

  document.addEventListener("click", (e) => {
    const el = (sel) => e.target.closest(sel);
    let x;
    if ((x = el("[data-close]"))) { e.stopPropagation(); const i = +x.dataset.close; if (S.tabs.length > 1) { S.tabs.splice(i, 1); if (S.active > i || S.active === S.tabs.length) S.active--; } return render(); }
    if ((x = el("[data-tab]"))) { S.active = +x.dataset.tab; return render(); }
    if (el("[data-newtab]")) { openTab({ view: "home", item: "inbox" }); return render(); }
    if (el("[data-more]")) { const tr = document.querySelector(".tabs-track"); tr.scrollLeft = tr.scrollLeft + tr.clientWidth >= tr.scrollWidth - 2 ? 0 : tr.scrollWidth; fitTabs(); return; }
    if (el("[data-theme-toggle]")) { S.theme = S.theme === "dark" ? "light" : "dark"; return render(); }
    if ((x = el("[data-view]"))) { S.peek = ""; const v = x.dataset.view; if (tab().view !== v) { tab().view = v; tab().item = firstItem(v); tab().bview = "board"; } S.drawer = 0; return render(); }
    if ((x = el("[data-ref]"))) { const ref = JSON.parse(x.dataset.ref); (e.ctrlKey || e.metaKey) && S.platform === "desktop" ? openTab(ref) : go(ref); S.drawer = 0; return render(); }
    if ((x = el("[data-item]"))) { tab().item = x.dataset.item; tab().bview = "board"; S.drawer = 0; return render(); }
    if ((x = el("[data-bview]"))) { tab().bview = x.dataset.bview; return render(); }
    if (el("[data-peek-close]")) { S.peek = ""; return render(); }
    if ((x = el("[data-peek]"))) { S.peek = S.peek === x.dataset.peek ? "" : x.dataset.peek; return render(); }
    if ((x = el("[data-open-session]"))) { go({ view: "agents", item: x.dataset.openSession }); S.peek = ""; return render(); }
    if (el("[data-drawer]")) { S.drawer = 1; return render(); }
    if (e.target.matches("[data-drawer-bg]")) { S.drawer = 0; return render(); }
    if ((x = el("[data-set]"))) { const [k, v] = x.dataset.set.split(":"); S[k] = v; return render(); }
    if (el("[data-addtabs]")) { [["resources", "board-design"], ["agents", "s-421"], ["resources", "p-v2"], ["agents", "a-builder"], ["resources", "r-stellarc"], ["agents", "s-scout"], ["resources", "m-zephyr"], ["resources", "board-triage"]].forEach(([view, item]) => S.tabs.push({ view, item, bview: "board" })); return render(); }
    if (el("[data-resettabs]")) { S.tabs = structuredClone(defaults.tabs); S.active = 0; return render(); }
    if (el("[data-hide]")) { S.review = "0"; return render(); }
  });
  document.addEventListener("keydown", (e) => {
    if (S.platform !== "desktop") return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === "t") { e.preventDefault(); openTab({ view: "home", item: "inbox" }); render(); }
    if (e.ctrlKey && k === "w") { e.preventDefault(); if (S.tabs.length > 1) { S.tabs.splice(S.active, 1); S.active = Math.max(0, S.active - 1); render(); } }
    if (e.ctrlKey && k === "tab") { e.preventDefault(); S.active = (S.active + (e.shiftKey ? S.tabs.length - 1 : 1)) % S.tabs.length; render(); }
    if (e.ctrlKey && /^[1-9]$/.test(e.key)) { e.preventDefault(); S.active = e.key === "9" ? S.tabs.length - 1 : Math.min(+e.key - 1, S.tabs.length - 1); render(); }
    if (k === "escape" && S.peek) { S.peek = ""; render(); }
    if (e.altKey && k === "h") { S.review = S.review === "0" ? "1" : "0"; render(); }
  });
  window.addEventListener("hashchange", () => { Object.assign(S, loadState()); render(); });
  render();
})();
