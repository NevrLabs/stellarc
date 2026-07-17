#!/usr/bin/env python3
"""Live project-workspace QA against an isolated Hall/Vite pair.

Seeds disposable projects and draft sessions through Hall's installation token,
then drives the real UI through Chromium CDP. The emitted state file can be
verified from a second browser profile and again after a Hall restart.
"""

import argparse
import asyncio
import base64
import glob
import json
import os
import time
import urllib.error
import urllib.request
import http.cookiejar
from pathlib import Path

for site_packages in glob.glob("/tmp/oly-qa/venv/lib/python3.*/site-packages"):
    import sys
    sys.path.insert(0, site_packages)

import websockets

DEFAULT_CDP = "http://127.0.0.1:9668"
DEFAULT_UI = "http://127.0.0.1:5188"
DEFAULT_API = "http://127.0.0.1:8899"
DEFAULT_STATE = "/tmp/oly-qa/project-workspace-state.json"
_next_id = 0


def api_request(api_base, opener, origin, method, path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(
        f"{api_base}{path}",
        data=data,
        method=method,
        headers={
            "Origin": origin,
            **({"Content-Type": "application/json"} if data is not None else {}),
        },
    )
    try:
        with opener.open(request, timeout=15) as response:
            body = response.read()
            return None if not body else json.loads(body)
    except urllib.error.HTTPError as error:
        body = error.read().decode(errors="replace")
        raise RuntimeError(f"{method} {path}: HTTP {error.code}: {body[:300]}") from error


def credentials():
    values = {}
    source = Path.home() / ".config/olympus-dev/admin-credentials"
    for line in source.read_text().splitlines():
        key, value = line.split("=", 1)
        values[key] = value
    return values


def user_client(api_base, ui_base):
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    creds = credentials()
    api_request(api_base, opener, ui_base, "POST", "/api/auth/login", {
        "username": creds["username"],
        "password": creds["password"],
    })
    organizations = api_request(api_base, opener, ui_base, "GET", "/api/organizations")
    return opener, organizations["organizations"][0]["id"]


def seed(api_base, ui_base, opener, organization_id):
    stamp = str(int(time.time()))
    scoped = f"/api/organizations/{organization_id}"
    sessions = [api_request(api_base, opener, ui_base, "POST", f"{scoped}/sessions", {}) for _ in range(3)]
    projects = {
        name: api_request(api_base, opener, ui_base, "POST", f"{scoped}/projects", {"name": f"QA {name} {stamp}"})
        for name in ("A", "B", "Clean")
    }
    for session in sessions[:2]:
        api_request(
            api_base,
            opener,
            ui_base,
            "POST",
            f"{scoped}/sessions/{session['id']}/project",
            {"projectId": projects["A"]["id"]},
        )
    return {
        "organizationId": organization_id,
        "sessions": [session["id"] for session in sessions],
        "projects": {name: project["id"] for name, project in projects.items()},
    }


def ident():
    global _next_id
    _next_id += 1
    return _next_id


async def command(socket, method, params=None):
    request_id = ident()
    message = {"id": request_id, "method": method}
    if params is not None:
        message["params"] = params
    await socket.send(json.dumps(message))
    while True:
        response = json.loads(await socket.recv())
        if response.get("id") == request_id:
            if "error" in response:
                raise RuntimeError(response)
            return response.get("result", {})


async def evaluate(socket, expression):
    result = await command(socket, "Runtime.evaluate", {
        "expression": expression,
        "returnByValue": True,
        "awaitPromise": True,
    })
    value = result["result"]
    if value.get("subtype") == "error":
        raise RuntimeError(value.get("description"))
    return value.get("value")


async def wait_for(socket, expression, description, timeout=15):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        last = await evaluate(socket, expression)
        if last:
            return last
        await asyncio.sleep(0.2)
    raise RuntimeError(f"timed out waiting for {description}; last={last!r}")


async def screenshot(socket, path):
    result = await command(socket, "Page.captureScreenshot", {"format": "png"})
    Path(path).write_bytes(base64.b64decode(result["data"]))


async def connect_page(cdp):
    tabs = json.load(urllib.request.urlopen(f"{cdp}/json/list"))
    page = next(tab for tab in tabs if tab["type"] == "page")
    return websockets.connect(page["webSocketDebuggerUrl"], max_size=50_000_000)


async def login(socket, ui_base):
    creds = credentials()
    await command(socket, "Page.enable")
    await command(socket, "Runtime.enable")
    await command(socket, "Page.navigate", {"url": f"{ui_base}/"})
    await wait_for(socket, "document.readyState === 'complete'", "initial page")
    await asyncio.sleep(1)
    if await evaluate(socket, '!!document.querySelector("input[type=password]")'):
        result = await evaluate(socket, f'''fetch('/api/auth/login', {{
          method: 'POST',
          headers: {{'Content-Type': 'application/json'}},
          body: JSON.stringify({{username:{json.dumps(creds['username'])},password:{json.dumps(creds['password'])}}}),
        }}).then(async response => ({{status: response.status, body: await response.text()}}))''')
        if result["status"] != 200:
            raise RuntimeError(f"login failed: HTTP {result['status']}")
        await command(socket, "Page.reload", {"ignoreCache": True})
    await wait_for(socket, "!!document.querySelector('.app')", "authenticated app")


async def navigate_project(socket, ui_base, project_id):
    await command(socket, "Page.navigate", {"url": f"{ui_base}/sessions/projects/{project_id}"})
    await wait_for(socket, "!!document.querySelector('.sessions-dockview')", f"project {project_id}")


async def project_panel_count(socket):
    return await evaluate(socket, "document.querySelectorAll('.chat-view').length")


async def initial_probe(cdp, ui_base, api_base, opener, state, evidence_dir):
    project_a = state["projects"]["A"]
    project_b = state["projects"]["B"]
    project_clean = state["projects"]["Clean"]
    first, second, _ = state["sessions"]
    scoped = f"/api/organizations/{state['organizationId']}"

    async with await connect_page(cdp) as socket:
        await login(socket, ui_base)
        await navigate_project(socket, ui_base, project_a)
        await wait_for(socket, f"!!document.querySelector('[data-session-id={json.dumps(first)}]')", "first session row")
        await evaluate(socket, f"document.querySelector('[data-session-id={json.dumps(first)}]').click()")
        await wait_for(socket, "document.querySelectorAll('.chat-view').length === 1", "first project pane")
        await evaluate(socket, f'''(() => {{
          const row = document.querySelector('[data-session-id={json.dumps(second)}]');
          row.dispatchEvent(new MouseEvent('contextmenu', {{bubbles:true, clientX:180, clientY:320}}));
        }})()''')
        await wait_for(socket, "[...document.querySelectorAll('[role=menuitem]')].some(item => item.textContent.includes('Open Right'))", "Open Right menu")
        await evaluate(socket, "[...document.querySelectorAll('[role=menuitem]')].find(item => item.textContent.includes('Open Right')).click()")
        await wait_for(socket, "document.querySelectorAll('.chat-view').length === 2", "split project panes")

        geometry = await evaluate(socket, '''(() => ({
          groups: [...document.querySelectorAll('.dv-groupview')].map(group => { const box = group.getBoundingClientRect(); return {x:Math.round(box.x),y:Math.round(box.y),width:Math.round(box.width),height:Math.round(box.height)}; }),
          chats: [...document.querySelectorAll('.chat-view')].map(chat => { const box=chat.getBoundingClientRect(); const parent=chat.parentElement.getBoundingClientRect(); return {height:Math.round(box.height),parentHeight:Math.round(parent.height)}; }),
          tabBars: document.querySelectorAll('.sessions-dockview.multi-group .dv-tabs-and-actions-container').length,
        }))()''')
        if len(geometry["groups"]) != 2 or len(geometry["chats"]) != 2 or geometry["tabBars"] != 2:
            raise RuntimeError(f"split geometry/header failure: {geometry}")
        if any(group["width"] < 100 or group["height"] < 100 for group in geometry["groups"]):
            raise RuntimeError(f"collapsed group: {geometry}")
        if any(chat["height"] < chat["parentHeight"] * 0.95 for chat in geometry["chats"]):
            raise RuntimeError(f"collapsed chat content: {geometry}")

        Path(evidence_dir).mkdir(parents=True, exist_ok=True)
        if await evaluate(socket, "document.documentElement.dataset.theme") != "obsidian":
            await evaluate(socket, "document.querySelector('[aria-label=\"Toggle theme\"]').click()")
            await wait_for(socket, "document.documentElement.dataset.theme === 'obsidian'", "obsidian theme")
        await screenshot(socket, str(Path(evidence_dir) / "project-workspace-obsidian.png"))
        await evaluate(socket, "document.querySelector('[aria-label=\"Toggle theme\"]').click()")
        await wait_for(socket, "document.documentElement.dataset.theme !== 'obsidian'", "light theme")
        await screenshot(socket, str(Path(evidence_dir) / "project-workspace-light.png"))

        await asyncio.sleep(1)
        remote_a = await asyncio.to_thread(api_request, api_base, opener, ui_base, "GET", f"{scoped}/projects/{project_a}")
        if len((remote_a.get("layout") or {}).get("panels", {})) != 2:
            raise RuntimeError("Hall did not persist Project A's two-pane layout")

        await evaluate(socket, f"localStorage.removeItem({json.dumps(f'olympus-project-layout:{project_a}')})")
        await command(socket, "Page.reload", {"ignoreCache": True})
        await wait_for(socket, "document.querySelectorAll('.chat-view').length === 2", "server-only Project A restore")

        await asyncio.to_thread(
            api_request, api_base, opener, ui_base, "POST", f"{scoped}/sessions/{second}/project", {"projectId": project_b}
        )
        await command(socket, "Page.reload", {"ignoreCache": True})
        await wait_for(socket, "document.querySelectorAll('.chat-view').length === 1", "foreign Project B session pruning from A")

        await navigate_project(socket, ui_base, project_b)
        if await project_panel_count(socket) != 0:
            raise RuntimeError("Project B inherited Project A layout")
        await wait_for(socket, f"!!document.querySelector('[data-session-id={json.dumps(second)}]')", "Project B session row")
        await evaluate(socket, f"document.querySelector('[data-session-id={json.dumps(second)}]').click()")
        await wait_for(socket, "document.querySelectorAll('.chat-view').length === 1", "Project B pane")

        cached_a = json.dumps(remote_a["layout"])
        await evaluate(socket, f"localStorage.setItem({json.dumps(f'olympus-project-layout:{project_clean}')}, {json.dumps(cached_a)})")
        await navigate_project(socket, ui_base, project_clean)
        await asyncio.sleep(1)
        if await project_panel_count(socket) != 0:
            raise RuntimeError("authoritative Hall layout:null was overridden by stale browser cache")

        await asyncio.to_thread(
            api_request,
            api_base,
            opener,
            ui_base,
            "PUT",
            f"{scoped}/projects/{project_clean}/layout",
            {"layout": {"panels": {"broken": {"params": {"sessionId": "foreign"}}}, "grid": {}}},
        )
        await command(socket, "Page.reload", {"ignoreCache": True})
        await wait_for(socket, "!!document.querySelector('.sessions-dockview')", "invalid-layout workspace")
        await asyncio.sleep(1)
        if await project_panel_count(socket) != 0:
            raise RuntimeError("invalid/foreign layout did not fail closed")

        await command(socket, "Page.navigate", {"url": f"{ui_base}/sessions/{first}"})
        await wait_for(socket, "document.querySelectorAll('.chat-view').length === 1", "single session route")
        single = await evaluate(socket, "({dock:document.querySelectorAll('.sessions-dockview').length,chats:document.querySelectorAll('.chat-view').length})")
        if single != {"dock": 0, "chats": 1}:
            raise RuntimeError(f"single-session route is not clean: {single}")

    state["geometry"] = geometry
    state["single"] = single
    Path(DEFAULT_STATE).write_text(json.dumps(state, indent=2))
    return state


async def verify_existing(cdp, ui_base, state):
    expected = {state["projects"]["A"]: 1, state["projects"]["B"]: 1, state["projects"]["Clean"]: 0}
    async with await connect_page(cdp) as socket:
        await login(socket, ui_base)
        observed = {}
        for project_id, count in expected.items():
            await navigate_project(socket, ui_base, project_id)
            if count:
                await wait_for(socket, f"document.querySelectorAll('.chat-view').length === {count}", f"{count} panes in {project_id}")
            else:
                await asyncio.sleep(1)
            observed[project_id] = await project_panel_count(socket)
            if observed[project_id] != count:
                raise RuntimeError(f"project restore mismatch: expected {expected}, observed {observed}")
        return observed


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cdp", default=DEFAULT_CDP)
    parser.add_argument("--ui", default=DEFAULT_UI)
    parser.add_argument("--api", default=DEFAULT_API)
    parser.add_argument("--state", default=DEFAULT_STATE)
    parser.add_argument("--evidence-dir", default="/tmp/oly-qa")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if args.verify:
        state = json.loads(Path(args.state).read_text())
        observed = await verify_existing(args.cdp, args.ui, state)
        print(json.dumps({"verified": observed}, sort_keys=True))
        return
    opener, organization_id = user_client(args.api, args.ui)
    state = seed(args.api, args.ui, opener, organization_id)
    result = await initial_probe(args.cdp, args.ui, args.api, opener, state, args.evidence_dir)
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    asyncio.run(main())
