#!/usr/bin/env python3
"""Assert retention expectations per config and write results.json.

A case is RETAINED iff its `fixture.case: Str(<id>)` attribute appears in the
debug-exporter (detailed) output — dropped records never reach the exporter.
Also surfaces filter/OTTL error lines so a silently-skipped condition cannot
pass unnoticed.
"""
import json, re, sys

CASE_ATTR = re.compile(r"->\s*fixture\.case:\s*Str\((\w+)\)")

def retained_ids(log_path):
    got = set()
    for l in open(log_path, encoding="utf-8", errors="replace"):
        m = CASE_ATTR.search(l)
        if m:
            got.add(m.group(1))
    return got

spec = json.load(open("cases.json"))
base = retained_ids("collector-baseline.log")
prop = retained_ids("collector-proposed.log")

fail = 0
rows = []
for c in spec["cases"]:
    gb, gp = c["id"] in base, c["id"] in prop
    ok = (gb == (c["expect_baseline"] == "R")) and (gp == (c["expect_proposed"] == "R"))
    fail += 0 if ok else 1
    rows.append(f"{'PASS' if ok else 'FAIL'} {c['id']:4} base={'R' if gb else 'D'}/{c['expect_baseline']} prop={'R' if gp else 'D'}/{c['expect_proposed']}  {c['note']}")

print("\n".join(rows))
print(f"\ncases={len(rows)} fail={fail}")

def errors(path):
    pat = re.compile(r"(?i)(ottl|filter.*error|error.*filter|dropped)")
    return [l.rstrip()[:200] for l in open(path, encoding="utf-8", errors="replace") if pat.search(l)][:30]

results = {
    "cases": len(rows), "fail": fail,
    "retained_baseline": sorted(base), "retained_proposed": sorted(prop),
    "collector_log_hits": {"baseline": errors("collector-baseline.log"),
                           "proposed": errors("collector-proposed.log")},
}
json.dump(results, open("results.json", "w"), indent=1)
print("baseline retained:", len(base), "proposed retained:", len(prop))
for k, v in results["collector_log_hits"].items():
    print(f"-- collector log ({k}) matched lines: {len(v)}")
    for l in v[:8]:
        print("   ", l[:160])
sys.exit(1 if fail else 0)
