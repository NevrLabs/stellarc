import json, urllib.request, concurrent.futures

PKGS = ["effect","@effect/opentelemetry","@effect/platform-bun","@effect/sql-pg","@effect/sql-drizzle",
"@effect/atom-react","@effect/atom-solid","@effect/atom-vue","@effect/vitest",
"@electric-sql/client","@electric-sql/pglite","@agentclientprotocol/sdk",
"@tanstack/db","@tanstack/react-db","@tanstack/charts","@tanstack/react-charts","@tanstack/react-query",
"@tanstack/trailbase-db-collection","@tanstack/tauri-db-sqlite-persistence",
"@rocicorp/zero","@livestore/livestore","drizzle-orm","better-auth","vitest","ai","shiki",
"tailwindcss","typescript","@modelcontextprotocol/sdk","@a2a-js/sdk","@ag-ui/core","hono","next",
"vite","@biomejs/biome","zod","@sentry/node","react","recharts","cmdk","@dnd-kit/core",
"@atlaskit/pragmatic-drag-and-drop","virtua","@tiptap/core","@blocknote/core","lexical",
"prosemirror-view","motion","lucide-react","streamdown","jazz-tools","effect-email","bun"]

def fetch(p):
    try:
        with urllib.request.urlopen(f"https://registry.npmjs.org/{p.replace('/','%2F')}", timeout=30) as r:
            d = json.load(r)
        tags = d.get("dist-tags", {})
        times = d.get("time", {})
        out = {}
        for k, v in tags.items():
            t = times.get(v, "")
            if k in ("latest","next","beta","alpha","canary","rc","v3","v2") or "dev" in k:
                out[k] = {"v": v, "t": t}
        return p, out
    except Exception as e:
        return p, {"error": str(e)[:80]}

res = {}
with concurrent.futures.ThreadPoolExecutor(12) as ex:
    for p, o in ex.map(fetch, PKGS):
        res[p] = o
json.dump(res, open("npm_sweep_2026-11-04.json","w"), indent=1)
for p in PKGS:
    o = res.get(p, {})
    lat = o.get("latest", {})
    others = {k: v["v"] for k, v in o.items() if k != "latest"}
    print(f"{p}: latest={lat.get('v','?')} ({lat.get('t','?')[:10]}) {' '.join(k+'='+v for k,v in sorted(others.items()))}")
