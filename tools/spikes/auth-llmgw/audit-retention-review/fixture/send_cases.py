#!/usr/bin/env python3
"""POST the fixture cases to the collector's OTLP/HTTP receiver (one request,
all resource groups), shaped exactly like the Stellarc audit exporter."""
import json, sys, urllib.request

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 43119
spec = json.load(open("cases.json"))
groups = {}  # (service, scope) -> list of records
for c in spec["cases"]:
    attrs = [{"key": "fixture.case", "value": {"stringValue": c["id"]}},
             {"key": "stellarc.org", "value": {"stringValue": "fixture"}}]
    if c["event_id"]:
        attrs.append({"key": "event.id", "value": {"stringValue": c["event_id"]}})
    rec = {
        "timeUnixNano": "1731072000000000000",
        "severityNumber": c["severity"],
        "attributes": attrs,
    }
    if c["body"] is None:
        pass  # N11: nil body -> omit the body field entirely
    elif isinstance(c["body"], str):
        rec["body"] = {"stringValue": c["body"]}
    else:
        rec["body"] = {"kvlistValue": {"values": [{"key": k, "value": {"stringValue": v}} for k, v in c["body"].items()]}}
    if c["severity_text"]:
        rec["severityText"] = c["severity_text"]
    if c["trace"]:
        rec["traceId"] = c["trace"]
    groups.setdefault((c["service"], c["scope"]), []).append(rec)

resource_logs = []
for (service, scope), recs in groups.items():
    rattrs = [{"key": "service.name", "value": {"stringValue": service}},
              {"key": "service.version", "value": {"stringValue": "fixture"}},
              {"key": "deployment.environment.name", "value": {"stringValue": "development"}}]
    sl = {"logRecords": recs}
    if scope:
        sl["scope"] = {"name": scope}
    resource_logs.append({"resource": {"attributes": rattrs}, "scopeLogs": [sl]})

payload = json.dumps({"resourceLogs": resource_logs}).encode()
req = urllib.request.Request(f"http://127.0.0.1:{PORT}/v1/logs", data=payload,
                             headers={"content-type": "application/json"}, method="POST")
with urllib.request.urlopen(req, timeout=10) as r:
    print("POST /v1/logs ->", r.status, r.read()[:80])
