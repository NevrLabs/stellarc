# Stellarc audit persistence — R1 diagnosis and owning-layer handoff

## Disposition

**Audit acceptance remains OPEN. Root cause is the Maple collector's retention policy, not a source-proven Stellarc sender bug.** The running collector is configured to discard INFO records without trace context except a narrow set of legacy security sources. Stellarc's bootstrap and authentication records satisfy that discard predicate; traced INFO management denial records do not. Raising severity or fabricating trace context would conceal the policy defect and is not an acceptable fix.

Read-only investigation on 2026-11-08, UTC; started 14:56:45, warehouse readbacks 14:59:18–15:01:13, final PG/Setup Health readbacks 15:03:35–15:03:37. No live export, replay, cursor reset, configuration write, deployment, restart, credential change, commit, push or child agent. No application source was edited. No RED/GREEN sender gate or repository build is claimed: the conditional sender-fix branch was not warranted. The supervisor's active fxbuilder tree and gate lock were untouched.

## Verified path and running provenance

1. `stellarc-gateway.service`, active on talos, runs `/mnt/deepvault/dev/deploy/stellarc-gateway/releases/v84-88d1b0ac9d4b/main.js`; SHA-256 `88d1b0ac9d4ba8cc3e6f25ee300b7a47cd5eb7966a019e711e411713bd4172b7`, matching the v84 receipt. The executable started at 14:50:44 UTC. Application PG is the restricted runtime connection to loopback port 55438, database `stellarc_gateway_candidate`. Credentials were consumed in memory only, never displayed.
2. Its audit endpoint is `http://127.0.0.1:14318`. `sudo -n ss -ltnp 'sport = :14318'` identifies PID 535, the existing `otelcol-maple-agent` process. The agent's `/etc/otelcol-maple-agent/config.yaml:97–102` defines that OTLP receiver. Lines 207–210 route logs through `[memory_limiter, resource_detection, resource/host, batch]` to `otlp_http/maple_apps` — **not** the separate journald noise filter. Exporter lines 171–182 route to `http://192.168.100.30:3474` with persistent queue/retry.
3. Caddy `/opt/maple/Caddyfile:37–38` routes `/v1/*` to `ingest:3474`. Running ingest's `INGEST_FORWARD_OTLP_ENDPOINT` host/port is `otel-collector:4318`. No request was sent to this endpoint during the investigation.
4. Running `maple-otel-collector-1` loads `/etc/otelcol/config.yaml`, read-only mounted from `/opt/maple/otel-collector.yaml`. The host file and `/proc/<container-pid>/root/etc/otelcol/config.yaml` have the same SHA-256 below. File mtime is 2026-11-04 15:22:59 UTC, before container start at 16:10:04 UTC; it was already in place before all observed events. Image tag `maple-otel-collector:bf46e73`, image ID `sha256:2ed058256f2480c7ea8ee9ce9b2efb0d866deda656cdf2a505d4f60cb131f0e6`.
5. Both running Maple API `CLICKHOUSE_URL` and collector `MAPLE_CH_URL` resolve to warehouse `192.168.3.40:8123`. That matches talos `~/deploy/maple/verify/chq-01.sh`. All warehouse queries used that helper, one statement per invocation; no stopped CT130 ClickHouse was used.

Configuration SHA-256:

| Source | SHA-256 |
|---|---|
| Talos agent config | `ea336553bac557e66325965d87f06ef7507e92edfd9cf37840b85e47cde83ec6` |
| Maple collector config, host and container mount | `1abf5febf5c8148b3591b7558bec629f5eb6387166909900ae246ec271d2901a` |
| Caddyfile | `7205debc1bd8f37caf2ba0180315f329a82ff7dffd626008bcec64a926936017` |
| Warehouse query helper | `df7a9a5d642701cbe02e09bb435a36aed8259e8ea51097fed612e3ccb0ba7bab` |

## Exact collector predicate and source behavior

`/opt/maple/otel-collector.yaml:235–249`, `filter/important-logs`, `error_mode: ignore`, contains this first log-record **drop** condition:

```text
severity_number > 0 and severity_number < 13
and IsMatch(trace_id.string, "^0*$")
and resource.attributes["service.name"] != "wazuh-alerts"
and not (resource.attributes["service.name"] == "zitadel" and IsMatch(body, "msg=(activity|\"?auth)"))
and not (IsMatch(resource.attributes["service.name"], "^(sshd|sshd-session|sudo|su|login)$") and IsMatch(body, "^(Accepted|Failed|Invalid user|.*authentication failure|.*COMMAND=|pam_unix\\((sudo|su)[^)]*\\): session opened)"))
and not (resource.attributes["service.name"] == "k8s-events" and IsMatch(body, "\"type\":\"Warning\""))
```

A separate second predicate handles severity zero; it is irrelevant to these records. Line 269 applies the filter after service/severity/context transforms and before batch/export:

```text
logs: {receivers: [otlp], processors: [memory_limiter, transform/service-name, transform/service-namespace, transform/severity, transform/log-trace-context, filter/important-logs, batch], exporters: [maple]}
```

Stellarc source facts:

- `apps/stellarc-gateway/src/audit.ts:18–37`: `call.deny` is WARN/13, everything else INFO/9; body is the event kind; trace ID is included only when genuinely present. Every record carries exact `event.id`; scope is `stellarc.gateway.audit` and service is `stellarc-gateway` (lines 49–68).
- `audit.ts:75–100`: valid OTLP response permits outbox cursor advancement. This establishes acceptance by the immediate receiver, not warehouse persistence. A downstream retention filter can intentionally drop a record without an invalid-OTLP acknowledgment.
- `store.ts:98–113`: bootstrap deliberately stores an empty trace. `store.ts:449–470`: security-event trace defaults empty. `auth.ts:146–153,266–298` calls the supplied audit callback with kind/actor only; `main.ts:59` passes `store.securityEvent` directly. Authentication events therefore have no trace context in the audit outbox even though their outer HTTP request is traced.
- `main.ts:627–633` supplies the actual request trace for `management.deny`; the persisted INFO management event is the counterexample that rules out a blanket INFO drop.
- `packages/telemetry/src/index.ts:128–143` composes ordinary trace/metric/log exporters separately from the durable audit outbox. Its ordinary logger is not a persistence acknowledgment mechanism.

The predicate is sufficient to discard each missing class and exactly predicts the observed ID partition. No per-record collector-drop receipt exists in this investigation; this is running-config plus exact source/warehouse evidence, not a claimed historical packet capture or collector-binary fixture.

## Exact event reconciliation

Installation prefix for **every full event ID** below: `dc867804-f03f-4625-bb9f-f1326cd727cb:`. Suffixes are not new identifiers; concatenate prefix and suffix verbatim. PG timestamps below are UTC, with sub-millisecond precision retained. All records remain in PG.

| Event ID suffix | Kind | PG timestamp (2026-11-08 UTC) | Actual trace ID | Maple log copies |
|---|---|---|---|---:|
| `system:1` | `deployment.preflight` | `13:20:50.952572` | `d676535a1ac76d88df97309b80b87719` | 1 |
| `personal:1` | `principal.bootstrap` | `14:13:16.149521` | empty | 0 |
| `system:2` | `call.deny` | `14:13:48.732566` | `d35d9d7eafe5fb879ba89e74ae48fb4e` | 1 |
| `system:3` | `auth.login.begin` | `14:24:50.811491` | empty | 0 |
| `system:4` | `management.deny` | `14:28:28.483917` | `9ce82c54320e8aedce6a6d5212ddade5` | 1 |
| `system:5` | `call.deny` | `14:28:28.554260` | `919796f5b991ae21a086e4c5f834cbe6` | 1 |
| `system:6` | `call.deny` | `14:28:28.619310` | `2210c54c5d70a699656ed195b96c3209` | 1 |
| `system:7` | `auth.login.begin` | `14:50:29.087285` | empty | 0 |
| `system:8` | `auth.callback.begin` | `14:50:29.387047` | empty | 0 |
| `system:9` | `auth.callback.reject` | `14:50:29.454583` | empty | 0 |

At 15:03:35 UTC: personal `seq=1, delivered=1, gap=false`; system `seq=9, delivered=9, gap=false`. Thus ten PG events are receiver-acknowledged; five are present in Maple, five absent. Exact-ID SQL has **no timestamp, service or tenant restriction** that could accidentally hide these identifiers. The latest missing record preceded the query by minutes, beyond the documented 35-second collector window. No event body/user/tool content was dumped; only controlled audit-kind aggregates and allowlisted identity metadata were inspected.

Raw span joins at 15:01:11 UTC returned exactly one span for each of the five persisted IDs:

| Event suffix | Span ID | Span name/kind | Request ID | Route |
|---|---|---|---|---|
| `system:1` | `5082fafcaba5e9e3` | `stellarc.gateway.deployment.preflight` / Internal | span attribute absent | absent |
| `system:2` | `e03e7adc6404dc7f` | `stellarc.gateway.request` / Server | `58ab898a-0e5a-4696-9f02-a85889c3015b` | `/mcp` |
| `system:4` | `bf87144f831a0431` | `stellarc.gateway.request` / Server | `2c8f02a2-497f-4d4b-8a42-6b2ccbc55880` | `/manage/:action` |
| `system:5` | `de7202db9f60568b` | `stellarc.gateway.request` / Server | `c86856e1-3424-46e3-8240-f3036d7e4887` | `/orgs/:org/v1/chat/completions` |
| `system:6` | `f052c01c231a8ac2` | `stellarc.gateway.request` / Server | `7d733b1c-b2cb-4eff-98cb-aeff9678519a` | `/mcp` |

These historical spans report v79/preflight versions; they are not evidence of a new v84 inference or human-login acceptance. No trace ID was inferred for an untraced event.

## Executed read-only queries

Invocation for each ClickHouse block: `ssh talos "bash ~/deploy/maple/verify/chq-01.sh <shell-quoted-single-SQL-statement>"`. Values below are non-secret. Columns verified first from `system.columns` using `SELECT name,type FROM system.columns WHERE database='maple' AND table='logs' ORDER BY position FORMAT JSONEachRow` at 14:59:18 UTC.

Exact log query, 14:59:21 UTC:

```sql
SELECT LogAttributes['event.id'] AS event_id, count() AS copies,
       min(Timestamp) AS first_at, max(Timestamp) AS last_at,
       groupUniqArray(TraceId) AS traces,
       groupUniqArray(SeverityText) AS severities,
       groupUniqArray(ScopeName) AS scopes
FROM maple.logs
WHERE LogAttributes['event.id'] IN (
 'dc867804-f03f-4625-bb9f-f1326cd727cb:personal:1',
 'dc867804-f03f-4625-bb9f-f1326cd727cb:system:1',
 'dc867804-f03f-4625-bb9f-f1326cd727cb:system:2',
 'dc867804-f03f-4625-bb9f-f1326cd727cb:system:3',
 'dc867804-f03f-4625-bb9f-f1326cd727cb:system:4',
 'dc867804-f03f-4625-bb9f-f1326cd727cb:system:5',
 'dc867804-f03f-4625-bb9f-f1326cd727cb:system:6',
 'dc867804-f03f-4625-bb9f-f1326cd727cb:system:7',
 'dc867804-f03f-4625-bb9f-f1326cd727cb:system:8',
 'dc867804-f03f-4625-bb9f-f1326cd727cb:system:9')
GROUP BY event_id ORDER BY event_id FORMAT JSONEachRow
```

Raw span query, 15:01:11 UTC:

```sql
SELECT TraceId,SpanId,ParentSpanId,SpanName,SpanKind,Timestamp,
       SpanAttributes['request.id'] AS request_id,
       SpanAttributes['http.route'] AS route,
       ResourceAttributes['service.version'] AS version
FROM maple.traces
WHERE TraceId IN ('d676535a1ac76d88df97309b80b87719',
 'd35d9d7eafe5fb879ba89e74ae48fb4e','9ce82c54320e8aedce6a6d5212ddade5',
 '919796f5b991ae21a086e4c5f834cbe6','2210c54c5d70a699656ed195b96c3209')
 AND ServiceName='stellarc-gateway'
ORDER BY Timestamp,SpanId FORMAT JSONEachRow
```

Class control query, 15:01:13 UTC:

```sql
SELECT Body AS event_kind,SeverityNumber,
       empty(TraceId) OR match(TraceId,'^0+$') AS no_trace,count() AS copies
FROM maple.logs
WHERE ServiceName='stellarc-gateway' AND ScopeName='stellarc.gateway.audit'
 AND Timestamp >= toDateTime('2026-11-08 13:00:00','UTC')
GROUP BY event_kind,SeverityNumber,no_trace
ORDER BY event_kind FORMAT JSONEachRow
```

Result: `call.deny/13/no_trace=0/copies=3`, `deployment.preflight/9/0/1`, `management.deny/9/0/1`. These are controlled event-kind aggregates, not a raw-log dump.

PG inspection used `psql -X -w -At`, the running gateway's runtime role, and `PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=5000'`. Both SELECTs executed successfully; no gateway function or mutation was called:

```sql
SELECT json_build_object('id',id,'kind',kind,'at',at,'trace',trace,
 'request',request,'org',org,'seq',seq)::text FROM gw_audit ORDER BY at;
SELECT json_build_object('org',org,'seq',seq::text,
 'delivered',delivered::text,'gap',gap)::text FROM gw_audit_state ORDER BY org;
```

## Executed checks and limitations

- Setup Health: `ssh talos ~/deploy/maple/bin/health.sh` at the beginning and end, both exit 0, complete output retained privately. Same failure-ID set as v81: `LOG-02`, `CFG-NOTIF-01`, `CFG-ATTR-01`, `ING-01`, `LOG-01`, `STAT-02`, `STAT-04`; no new IDs. First/final summaries also match: LOG-02 3 services, CFG-ATTR-01 22 recommendations, ING-01 64 services, LOG-01 7, STAT-02 2, STAT-04 2. CFG-NOTIF-01 remains intentionally OFF. This is not a green health claim or a full historic per-check-detail equivalence claim.
- Local evidence-only check: `python3 /home/rpw/.hermes/cache/scratch/stellarc-audit-closure-r1/reconcile.py`, exit 0. It parses receipts, asserts ten unique expected IDs/five returned IDs, exact missing-set equality with the relevant retention predicate, one copy each, all cursors caught up/no gap, and all five raw trace joins (including exact request identity for four Server spans). This is Python assertion evidence over captured metadata, not a collector-binary test, source regression test or live replay.
- Initial direct agent-config read lacked permission; recovered using permitted `sudo -n cat` (read only). An attempted `/otelcol --version` used a nonexistent executable; the inspected actual entrypoint is `/usr/local/bin/otel-collector-maple`, and its `--version` attempt also returned exit 1. No collector version or binary-fixture success is inferred. The container image ID and loaded-config bytes above are established independently. No package was installed.
- The frozen local base is `2dce6d069db62ebf880ec0cb7c280f3a58a7034c`. Shared worktree remains dirty and other lanes own other changes; this report does not claim integration-tree cleanliness.

## Minimum change and remaining acceptance — owner: Maple collector policy

1. In the collector/deploy-source owner lane, propose a narrow exception to `filter/important-logs` for the vetted audit stream (`service.name=stellarc-gateway`, scope `stellarc.gateway.audit`, nonempty stable `event.id`, validated approved event kinds). Preserve generic INFO noise filtering and existing exceptions. Bind trust to the authorized ingestion/source boundary; attributes alone must not become a general client-controlled retention bypass. Do not exempt all Stellarc logs.
2. Before rollout, test with the actual collector build: untraced INFO bootstrap/login/callback/session/logout and grant lifecycle audit records retained; ordinary untraced INFO dropped; traced INFO and WARN behavior unchanged. Include malformed/missing audit identity, foreign service/scope, and unrelated noise controls. Review the complete store/auth event-kind set rather than allowing only the two originally reported kinds. No collector edit/rollout is authorized or performed here.
3. After separately authorized rollout, wait a batch window, generate authorized new class-specific audit events, read their exact PG IDs, query Maple logs by exact IDs, count copies, and join genuine populated trace IDs to raw spans. Keep untraced records untraced. Re-run Setup Health with expected deltas. OTLP ack and `delivered=seq` cannot replace these checks.
4. The five historical events remain missing in Maple, although retained in PG. No replay or cursor reset occurred. Historical recovery requires separately approved, bounded event-ID replay with duplicate accounting and evidence preservation; it must not re-execute business effects. A policy-only future fix will not backfill these records automatically.
5. Optional real auth trace propagation is a separate instrumentation improvement in `main/auth/store`, outside this lane; bootstrap legitimately has no request span. Neither is a prerequisite to correctly retaining audit records, and neither should be used to work around retention policy.

## Local source hashes (read, not modified)

| File | SHA-256 |
|---|---|
| `apps/stellarc-gateway/src/audit.ts` | `beaa3b12b45ef6826404884ca57151be164faa3d1aedc81132af5be558652271` |
| `apps/stellarc-gateway/src/audit-check.ts` | `af3b82ea80d17885fd8e943d8aed612ebac1e4790dd77d0e9eee331c135b7aa7` |
| `apps/stellarc-gateway/src/auth.ts` | `fe3cdfc10b97701c404db033584974ed6044dc6323ef74fccabb75727973838c` |
| `apps/stellarc-gateway/src/store.ts` | `ee32a71c608028d3c886068dcc63e495473f3fa009054d68d436347df166bea6` |
| `apps/stellarc-gateway/src/main.ts` | `5a0c017f87b3768269babb95616efab4bb14420586aafdba1f8006e33a194794` |
| `packages/telemetry/src/index.ts` | `335f02cec44951f340bc4ffef508895e90aa5e9d0d1d215dd879ee6d688cc677` |
| `docs/spikes/auth-llmgw-receipts/talos-v81-activated.json` | `608434021924df5b80d6dbf64fbe3ef03bdd6e08f1c69e9ac92207cd74b30826` |
| `docs/spikes/auth-llmgw-receipts/oidc-boundary-v84.json` | `10cb42a0f179c0d0c87b3ec4ee7c0fc02b6756749dd258d3834c5a9ca774c0ab` |

## Private evidence index

Private directory on this checkout host: `/home/rpw/.hermes/cache/scratch/stellarc-audit-closure-r1/` (0700; captures 0600). It contains configuration/health captures; **do not publish these raw files**. Their content may include operational configuration. This report contains only allowlisted metadata and relevant non-secret policy expressions. Scratch retention is temporary; supervisor should archive approved sanitized evidence for release acceptance rather than treating scratch as permanent storage.

| Receipt/check | SHA-256 |
|---|---|
| `state.private.txt` (final PG read) | `1ce1760d63a9a80a0899ecc9d0231a657fa6de30e34a16f522e235474ca2c755` |
| `logs-exact.private.txt` | `42978779d3875eb96405f02e95a99e9926e605aacebced8e5fa3e4eba32cf265` |
| `trace-joins.private.txt` | `771af39b80aba28c650dd4cd68a3d79d8997618aa697b981f7117af8287ff399` |
| `persistence-by-class.private.txt` | `3c9a7d75e33f0ef52674057e9c698e41804343f21424e263eb790d4d48378334` |
| `health.private.txt` | `717be082f2252787b3f43d62b3248fd448419e4597ce3812c1219f4e9cd03971` |
| `health-final.private.txt` | `c7af27206e22b3d20b96895b7c101be28e258258ae989a880955fa0901e5487e` |
| `configs2.private.txt` | `7991d833a5688ea4036a4447339c6284f30fb9770d44382f32751d7cffdfa6cb` |
| `path-proof.private.txt` | `88f88fdde58b9025058324a0bb78f7dce34e3bef8ebf592ff27164fd72f15e82` |
| `runtime-proof.private.txt` | `33ed1a502f4c85f56424d60b4605ca8887a643459a358c4131ebffb19750bffa` |
| `ingress-proof.private.txt` | `fa77b47c82f480963aa9567e60b9521468db331cde8ab3b5bd6a30920aed396f` |
| `caddy-proof.private.txt` | `81b9c3619b2ee736f5bc0035b80cdda49fb20bb4538a05d344fe6368bf95c8d4` |
| `queries.json` (exact single-statement query strings) | `a1533ed9af58e545394a19bfee6f7a8a2b6c478cfeb96c3b3fb6966149068daa` |
| `reconcile.py` | `bc0f8c1d65b7ae055826c1dbe88fa9be0278809cae152e7601ad7df7ff55adcd` |
| `reconciliation.json` | `afedcc3e1da36363952f9a35776adee04924b5780de3b9a810d092b35fbc6e9c` |

**Handoff gate:** diagnosis complete; no sender patch. Maple policy correction, collector fixture verification, separately approved historical recovery and exact fresh audit-class persistence acceptance remain open. Replacement must not be declared audit-ready from the current evidence.
