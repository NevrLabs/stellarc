#!/usr/bin/env python3
"""Deterministic fixture case matrix for the stellarc audit retention exception.

Emits cases.json. Every record carries a `fixture.case` attribute so the checker
can identify it after collector processing, plus the exact OTLP shape the
Stellarc audit exporter produces (apps/stellarc-gateway/src/audit.ts):
resource service.name/service.version/deployment.environment.name, scope
stellarc.gateway.audit, severityNumber 9/13, body = event kind string,
attributes event.id/request.id/stellarc.org/stellarc.actor/stellarc.subject.

expect: "R" = must be RETAINED (exported to sink), "D" = must be DROPPED.
b = baseline (deployed predicate), p = proposed predicate.
"""
import json, sys

FIXUUID = "0f1e2d3c-4b5a-6978-8796-a5b6c7d8e9f0"  # fixture-only install id (clearly synthetic, hex)

APPROVED = [
    "principal.bootstrap", "deployment.preflight",
    "auth.login.begin", "auth.login.reject",
    "auth.callback.begin", "auth.callback.accept", "auth.callback.reject",
    "auth.logout.begin", "auth.logout.reject", "auth.logout.complete",
    "auth.session.admit",
    "agent.create", "credential.issue", "credential.revoke",
    "delegation.issue", "delegation.revoke",
    "management.deny",
    "call.admit", "call.completed", "call.failed", "call.cancelled", "call.interrupted",
]

cases = []
def add(cid, eb, ep, service, scope, kind, sev, sevtext, body, trace=None, event_id="auto", note=""):
    cases.append({
        "id": cid, "expect_baseline": eb, "expect_proposed": ep,
        "service": service, "scope": scope, "kind": kind, "severity": sev,
        "severity_text": sevtext, "body": body, "trace": trace,
        "event_id": event_id, "note": note,
    })

# P*: approved-kind untraced INFO audit records -> baseline DROPS them today
# (the five missing R1 event classes are covered: principal.bootstrap,
# auth.login.begin, auth.callback.begin, auth.callback.reject, auth.session.admit),
# proposed RETAINS them. call.deny is WARN and covered by C02.
for i, k in enumerate(APPROVED):
    add(f"P{i+1:02d}", "D", "R", "stellarc-gateway", "stellarc.gateway.audit",
        k, 9, "INFO", k, trace=None, note="approved kind, untraced INFO 9, valid event.id")

# N*: must stay DROPPED under BOTH configs
add("N01", "D", "D", "stellarc-gateway", "stellarc.gateway.audit", "auth.nope.begin", 9, "INFO", "auth.nope.begin", note="kind outside approved set (prefix-like)")
add("N02", "D", "D", "stellarc-gateway", "stellarc.gateway.audit", "auth.login.beginX", 9, "INFO", "auth.login.beginX", note="approved kind + trailing suffix abuse")
add("N03", "D", "D", "stellarc-gateway", "stellarc.gateway.audit", "auth.session.admit", 9, "INFO", "auth.session.admit", event_id=None, note="approved kind but event.id attribute absent")
add("N04", "D", "D", "stellarc-gateway", "stellarc.gateway.audit", "agent.create", 9, "INFO", "agent.create", event_id="garbage", note="malformed event.id (no shape)")
add("N05", "D", "D", "stellarc-gateway", "stellarc.gateway.audit", "credential.issue", 9, "INFO", "credential.issue", event_id=f"{FIXUUID}:system", note="malformed event.id (missing :seq)")
add("N06", "D", "D", "evil-service", "stellarc.gateway.audit", "auth.session.admit", 9, "INFO", "auth.session.admit", note="foreign service.name spoofing stellarc scope+kind")
add("N07", "D", "D", "random-app", "", "info noise", 9, "INFO", "request completed in 12ms", note="ordinary untraced INFO noise (unchanged generic drop)")
add("N08", "D", "R", "stellarc-gateway", "stellarc.gateway.audit", "auth.login.begin", 0, "", "auth.login.begin", note="severity 0 audit record: deployed transform/severity bumps UNSPECIFIED->INFO(9) BEFORE filter, so proposed retains via exception (fixture-verified)")
add("N09", "D", "D", "stellarc-gateway", "stellarc.gateway.audit", "auth.session.admit", 5, "DEBUG", "auth.session.admit", note="severity 5 (DEBUG) spoofed audit shape; exception pins severity 9")
add("N11", "D", "D", "random-app", "", "nilbody", 9, "INFO", None, note="nil body record (OTTL IsMatch(body) short-circuit probe)")
add("N12", "D", "D", "random-app", "", "mapbody", 9, "INFO", {"kv": "v"}, note="non-string (kvlist) body record (OTTL short-circuit probe)")
add("N13", "D", "D", "stellarc-gateway", "", "auth.session.admit", 9, "INFO", "auth.session.admit", note="right service/kind/id but scope absent (scope binding probe)")

# C*: must stay RETAINED under BOTH configs (regression controls)
add("C01", "R", "R", "stellarc-gateway", "stellarc.gateway.audit", "management.deny", 9, "INFO", "management.deny", trace="d676535a1ac76d88df97309b80b87719", note="traced INFO audit (observed R1 class: system:4)")
add("C02", "R", "R", "stellarc-gateway", "stellarc.gateway.audit", "call.deny", 13, "WARN", "call.deny", note="WARN 13 untraced (observed R1 class: system:2,5,6)")
add("C03", "R", "R", "random-app", "", "warn", 13, "WARN", "disk usage warning", note="WARN 13 generic service, untraced")
add("C04", "R", "R", "wazuh-alerts", "", "alert", 9, "INFO", "wazuh alert payload", note="existing wazuh-alerts exception")
add("C05", "R", "R", "zitadel", "", "authz", 9, "INFO", 'msg=activity triggerd=true', note="existing zitadel msg=activity exception")
add("C06", "R", "R", "sshd", "", "login", 9, "INFO", "Accepted password for root from 10.1.2.3 port 22 ssh2", note="existing sshd Accepted exception")
add("C07", "R", "R", "k8s-events", "", "event", 9, "INFO", '{"type":"Warning","reason":"BackOff"}', note="existing k8s-events Warning exception")
add("C08", "D", "D", "random-app", "", "sev0err", 0, "", "upstream timeout while calling api", note="severity 0 error-looking body: transform/severity bumps 0->9 first, so the sev-0 keep-predicate is DEAD in this pipeline and the record is dropped (pre-existing deployed behavior, unchanged by proposal; fixture-verified)")
add("C09", "R", "R", "random-app", "", "error", 17, "ERROR", "connection refused", note="ERROR 17 untraced generic")

# assign event ids where "auto"
seq = 9000
for c in cases:
    if c["event_id"] == "auto":
        c["event_id"] = f"{FIXUUID}:fixture:{seq}"
        seq += 1

json.dump({"install_uuid": FIXUUID, "cases": cases}, open("cases.json", "w"), indent=1)
print(f"cases.json written: {len(cases)} cases")
print("P(approved→retain):", sum(1 for c in cases if c['id'].startswith('P')),
      "N(must-drop):", sum(1 for c in cases if c['id'].startswith('N')),
      "C(must-retain):", sum(1 for c in cases if c['id'].startswith('C')))
