# Audit retention review (council R2) — offline fixture + narrow retention exception

Owned by the GLM council reviewer (R2). No live Maple configuration was modified,
no telemetry injected, no replay/cursor reset, no keys issued, no DB change.
The only collector binary used is a **read-only copy** of the talos agent binary
(`scp talos:/usr/local/bin/otelcol-maple-agent`, sha256
`b8a190d137f6ded897b307b1561b089f35da0c9fa71128a264d20da982392418`,
`otelcol-maple-agent version 0.164.0-fx1`), executed offline on fxbuilder via
`fxrun`, serialized under `~/.cache/stellarc-authgw-gate.lock`.

## Contents

| File | Role | SHA-256 |
|---|---|---|
| `proposed-filter.patch` | Smallest candidate diff to `/opt/maple/otel-collector.yaml` (proposal only, NOT applied; full-file unified diff, applies with zero fuzz to the captured deployed config; patched result sha256 `dfc1dd5c…`) | `71a6ed9f4eb31fb884529c50ca5e46570f1a966a768324b54179147cd16dfb78` |
| `proposed-filter-block.yaml` | Full proposed `filter/important-logs` block for review | `29a44bd8359427db41561205852d5471704697a02c76987d4aa7d944b414cc1a` |
| `fixture/config-baseline.yaml` | Deployed predicate + preceding log transforms, VERBATIM splice of the captured config (config sha `1abf5feb…` per R1); local receiver + debug exporter | `d71406989134db997e1243aa4913dae11422ac4a54230f10b9c703fd3e863f0a` |
| `fixture/config-proposed.yaml` | Same + the appended exception clause | `5596653aed7266f1e5cabd3b929e8cd566780ca682219c0789f611f5241ce74d` |
| `fixture/gen_cases.py` | Deterministic 43-case matrix (22 approved-kind positives, 12 spoof/malformed/noise negatives, 9 unchanged-retention controls) | see file |
| `fixture/cases.json` | Generated case set actually run | `4da041254de73b30e091fcfcc6d021a84da7f2c17a451e2d1d46fc1f88f1d794` |
| `fixture/send_cases.py` | Posts cases as one OTLP/HTTP JSON request, exact Stellarc exporter shape | see file |
| `fixture/check.py` | Asserts per-case retention; surfaces filter/OTTL error lines | see file |
| `fixture/run.sh` | Orchestrates validate + baseline run + proposed run + verdict | see file |
| `fixture/results.json` | Verdict: **43/43 PASS, fail=0** (baseline retains 8, proposed retains 31) | `a9fb7be095005fe726f4abc74c4ac634cdd3c228615ae2e14ab97fa19b2f5a7f` |
| `fixture/collector-baseline.log` | Debug-exporter output, baseline (8 records) | `ac7c03e881de9379b5a541870b80c5608fb1e7a2b4884505fe2e98c7b6619363` |
| `fixture/collector-proposed.log` | Debug-exporter output, proposed (31 records) | `86dedfedce4866d3b7d8ea303155601b2f033c706d2be8a04ba287e1fc0bd177` |

Omitted from the production pipeline in the fixture config (documented, none
affect the filter decision): `memory_limiter`, `transform/service-namespace`,
`batch`; receiver/exporter are local fixtures.

## Reproduce

```bash
cd tools/spikes/auth-llmgw/audit-retention-review/fixture
# binary is fetched read-only: scp talos:/usr/local/bin/otelcol-maple-agent .
flock ~/.cache/stellarc-authgw-gate.lock fxrun --pull results.json \
  --pull collector-baseline.log --pull collector-proposed.log -- 'bash run.sh'
```

Run of record: 2026-11-08 ~22:40 WIB on fxbuilder (fxrun workspace
`fixture-1e17ae3cbcae3062`); `bash run.sh` exit 0, `cases=43 fail=0`,
`baseline retained: 8 proposed retained: 31`.

## What the fixture proves (actual binary, offline)

- Baseline config reproduces the R1 partition: all 22 approved-kind untraced
  INFO audit records DROP (including the five missing classes
  `principal.bootstrap`, `auth.login.begin`, `auth.callback.begin`,
  `auth.callback.reject`, `auth.session.admit`); traced INFO / WARN 13 / ERROR /
  wazuh / zitadel / sshd / k8s-events records RETAIN.
- Proposed config retains exactly the audit stream: 22 approved kinds + N08;
  every negative still drops: unknown kind, kind-prefix/suffix abuse, absent /
  malformed / shape-invalid `event.id`, foreign `service.name`, absent scope,
  severity-5 spoof, generic INFO noise, nil-body and map-body records (OTTL
  runtime-error / short-circuit probes — no retention blowout).
- WARN (13) path untouched; existing legacy exceptions byte-identical behavior.

## Binary-validated OTTL constraints (0.164.0-fx1)

- Converter names are PascalCase: `Coalesce` (lowercase `coalesce` rejected).
- String literals need doubled backslashes (`"\\.")`; a literal `"\."` is an
  invalid escape → whole config fails to parse (collector exits at start).
- No `in` membership operator in filter conditions.

## What this does NOT prove

- The central collector image `maple-otel-collector:bf46e73` was not extracted
  (no Docker on production hosts). The agent binary is the same maple fork
  core; the owner must re-run this fixture against the actual central image
  binary before rollout.
- Nothing about live persistence: post-rollout acceptance per R1 §3 (fresh
  class-specific events, exact-ID readback, trace joins, Setup Health deltas)
  remains the owner's gate. Historical 5 events stay missing until separately
  authorized bounded replay (R1 §4).
