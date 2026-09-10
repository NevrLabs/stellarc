# Local OTel stack (dev host, no Docker)

Tempo 3.0.3 and Grafana 13.2.1 as native binaries under systemd user units.

| Unit | Binary | Ports | Config |
|---|---|---|---|
| `tempo.service` | `~/.local/otel/tempo` | 4318 OTLP/HTTP · 4317 OTLP/gRPC · 3200 query | `~/.local/otel/tempo.yaml` |
| `grafana.service` | `~/.local/otel/grafana/bin/grafana` | 3210 | `~/.local/otel/grafana.ini` + `provisioning/datasources/tempo.yaml` |

Grafana: anonymous Admin (dev only), Tempo datasource `uid=tempo`, default.

Tempo 3.0 notes: `ingester`/`compactor` top-level keys are gone; the single-binary
needs writable `backend_scheduler.local_work_path`, `block_builder.wal.path`,
`live_store.shutdown_marker_dir`, `live_store.wal.path` in YAML (the CLI flag for
the first is mis-registered as `-backend-schedulerbackend-scheduler.local-work-path`
in 3.0.3 — set it in YAML). `usage_report.reporting_enabled: false`.

Point a process at it: `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`.
Verify: `curl -s localhost:3200/api/search?tags=service.name%3Dstellarc-api`.
Explore: `http://localhost:3210/explore` → Tempo → TraceQL `{ resource.service.name = "stellarc-api" }`.
