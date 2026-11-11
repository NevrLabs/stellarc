# Exact central collector retention proof — R3

**PASS offline; NOT deployment approval or live persistence acceptance.**

Run of record: fxbuilder (`fxcompute-01`, x86_64), 2026-11-08 UTC. Exact loaded central executable SHA-256 `dcda64b76fa64497d571f75da5681ae1a54f35c52edde89a1f8b81df384cc5f6`, extracted read-only with `docker cp` from running `maple-otel-collector-1`. Image ID and loaded executable hash were read before/after. See `provenance.json` and the repository report `docs/spikes/stellarc-audit-central-r3.md`.

The builder's same-tag image is different and was NOT used. The central executable is static amd64, components v0.151.0, not R2's 0.164.0-fx1 agent. Its blank build version is preserved; `components.log` is authoritative component evidence. No libraries needed. Executable retained privately on builder, not added to this directory.

## Reproduce on fxbuilder

Place the exact hash-verified executable at `./central` (0700), then `bash run.sh`. The launcher holds `~/.cache/stellarc-authgw-gate.lock`, creates an unprivileged network namespace, enables only loopback, closes the child lock descriptor, and runs the stdlib Python gate. No external routes exist. No dependency install, database, Maple exporter or production receiver is involved.

Original `cases.json`, both configs and `send_cases.py` are byte-identical R2 copies. `run.py` captures the original sender's actual Request through a mocked transport, then sends the captured payload once to each real fixture collector. The mock only extracts request bytes; it does not provide collector results. The recorded HTTP responses come from the exact running central executable.

## Assertions and receipts

- Exact 43-ID input set, no duplicates: P01–P22; N01–N09,N11–N13; C01–C09.
- Baseline output exactly C01–C07,C09, one copy each (8). Proposed exactly that set plus P01–P22,N08, one copy each (31).
- Each exported record must have exactly one case attribute. Missing, duplicate or unexpected retained IDs fail. WARN/error/fatal runtime diagnostics and OTTL evaluation failures fail, independent of retention counts.
- Additional 13 typed probes (`type-probes.json`): event.id int/bool/array/map/double/bytes/UUID-shaped string-array; audit-scope nil/map/int/bool/array/bytes body. All drop under both configs with no runtime errors.
- Checker selfcheck rejects duplicate records, unknown IDs, unmarked records and a runtime-error diagnostic.
- A deliberately invalid **separate canary**, `config-error-canary.yaml`, evaluates ParseJSON on non-JSON bodies under ignore mode. It validates (0), retains all 43 and reports 10 evaluation warnings (diagnostics can be sampled). `error-canary.exit=1` is the expected rejection; `error-canary-detected.exit=0` proves it was detected. Never deploy this canary.
- `validate-baseline.exit`, `validate-proposed.exit`, `baseline.exit`, `proposed.exit`, `types-baseline.exit`, `types-proposed.exit`, all collector exits, `run.exit`, `launcher.exit` are 0.

See `results.json`, per-run `*-assertions.json`, `.exit`, complete fixture `.log` and `SHA256SUMS`. Debug context logs include only synthetic fixtures. Original R2 artifacts remain unchanged; initial source hashes are in `r2-source-hashes.json`.

## Limits

This is exact central **binary** execution with R2's filter/transform fixture pipeline, not an entire central-image container or live warehouse test. `memory_limiter`, `transform/service-namespace`, `batch`, and real exporter are omitted as in R2. Fixture configs retain their original misleading otlphttp-sink comment; actual configured sink is debug. No production environment/config credentials are copied into fixture outputs.

First iteration's diagnostic checker falsely matched WARN/ERROR text inside debug payloads; corrected to inspect diagnostic fields, then reran all gates. A first canary using Int() produced nil rather than a runtime error and was not credited as an error canary; final ParseJSON canary was executed and detected. Earlier attempt receipts remain in task-private builder subdirectories. These iterations did not change R2 fixtures or proposed policy.

Security identity, source attribution and sustained rate/storage bounds remain separate concerns. UUID-shaped labels are cheap to forge and an outbox cap is not a rate limit. No live changes or historical replay occurred.
