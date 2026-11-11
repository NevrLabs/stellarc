# Stellarc audit persistence — council review R2 (GLM)

Independent challenge of the R1 root-cause evidence and the proposed narrow
retention exception, plus an offline executable fixture with the actual maple
collector binary. Council reviewer owns only this file and
`tools/spikes/auth-llmgw/audit-retention-review/`. No live Maple config change,
restart, telemetry injection, replay, cursor reset, key issuance, DB change or
secret access. No commits/push/subagents/paid inference/provider calls.

## Verdict

**R1's root cause is CONFIRMED and the narrow exception is the correct fix
shape; audit acceptance remains OPEN.** The running collector's
`filter/important-logs` drops untraced sub-WARN logs outside its legacy
security-source exceptions; Stellarc's untraced INFO audit classes satisfy that
drop predicate exactly. The evidence chain independently reproduced:

- `reconcile.py` re-run by this reviewer: sha256
  `bc0f8c1d65b7ae055826c1dbe88fa9be0278809cae152e7601ad7df7ff55adcd` (matches
  the parent's claim), exit 0, 10 acknowledged → 5 stored / 5 missing, missing
  set = exactly the untraced-INFO classes, cursors caught up, one copy each,
  all persisted IDs join one raw span.
- Sender source re-read (`audit.ts`, `store.ts`, `auth.ts`, `main.ts`):
  only `call.deny` is WARN/13; every other kind is INFO/9; auth/bootstrap and
  principal/credential/delegation lifecycle events are emitted without trace
  context by design; `management.deny` and `call.*` carry real traces. A
  receiver OTLP ack advancing the outbox cursor is not persistence. Not a
  sender patch target.

## Findings (≤5, actionable)

1. **Root cause stands; reject any sender-side workaround.** Raising severity
   or fabricating trace context for auth/bootstrap events would mask the
   policy defect (R1 disposition upheld). No change requested in
   `apps/stellarc-gateway` for this issue.

2. **The exception's trust binding is label-based — adequate, with residual
   risk already dominated by existing capability.** `service.name`,
   `instrumentation_scope.name`, `event.id` and kind are client-supplied; an
   ingest-key holder can forge audit-labeled rows into retention. This does
   NOT create a new bypass class: any ingest-key holder can already retain
   arbitrary WARN(13)+ logs, which bypass the filter entirely — the filter is
   not a volume control for authenticated LAN senders. Mitigations in the
   candidate diff: exact approved-kind matching (no wildcard prefixes), the
   installation-UUID `event.id` shape pin `^<uuid>:<org>:<seq>$` (drops
   malformed identities, raises forgery cost), service AND scope AND severity
   AND string-body conjunction. Fixture negatives N01–N06/N09/N13 prove each
   binding drops. Residual: forged-but-well-formed audit rows are
   indistinguishable at the collector; note it in Maple policy docs, and if
   ever needed, bind the exception to the authorized sender at the ingest
   layer (per-source key scoping) rather than widening attributes.

3. **OTTL grammar constraints make hand-written clauses unshippable without
   binary validation — three concrete traps found and fixed by fixture
   iteration:** lowercase `coalesce` rejected (must be `Coalesce`);
   single-backslash regex escapes (`"\."`) fail the string lexer and abort
   collector startup; no `in` operator in filter conditions. Additionally, a
   clause that parses but fails per-record EVALUATION would silently disable
   the whole drop condition (`error_mode: ignore` → condition false → record
   retained); the nil-body and map-body probes (N11/N12) prove the final
   clause shape does not trigger this. **Owner gate: re-run this exact fixture
   against the central collector image binary (`maple-otel-collector:bf46e73`)
   before rollout — my proof used the talos agent binary `0.164.0-fx1`
   (sha256 `b8a190d1…`), the same fork core, not the central image itself.**

4. **Pre-existing defect surfaced by the fixture (do not fix in this diff):
   the severity-0 keep-predicate is dead code in the central logs pipeline.**
   `transform/severity` runs before `filter/important-logs` and rewrites
   unspecified (0) → INFO(9), so the second predicate (`severity_number == 0
   and not IsMatch(body, "(?i)(error|fatal|…)")`) never fires; unknown-severity
   error-looking logs are dropped as generic INFO (fixture case C08). The
   config comment claiming they are kept is wrong in effect. Report to the
   collector owner as a separate policy decision (reorder processors or fix
   the comment); behavior is unchanged by the audit exception.

5. **Complete approved kind set is 22, not the 2 originally reported; the
   candidate diff enumerates them exactly.** Derived from all emission sites
   (`store.ts` audit()/securityEvent/finish, `auth.ts` record(), `main.ts`,
   `candidate-preflight.ts`): `principal.bootstrap`, `deployment.preflight`,
   `auth.login.{begin,reject}`, `auth.callback.{begin,accept,reject}`,
   `auth.logout.{begin,reject,complete}`, `auth.session.admit`,
   `agent.create`, `credential.{issue,revoke}`,
   `delegation.{issue,revoke}`, `management.deny`,
   `call.{admit,completed,failed,cancelled,interrupted}`. `call.deny` (WARN 13)
   needs no exception — severity already retains it (C02); traced
   `management.deny` is retained today (C01) and the exception only adds
   no-trace robustness. New audit kinds require a collector diff — intentional
   (fail closed; audit-check tooling catches misses).

## Fixture result (actual binary, offline, fxbuilder)

43/43 PASS (`fail=0`): baseline retains 8 (all pre-existing exception paths),
proposed retains 31 (22 approved kinds + severity-0-bumped audit record N08 +
8 controls); all spoof/malformed/noise negatives drop; WARN path and legacy
exceptions unchanged. Evidence, commands, hashes:
`tools/spikes/auth-llmgw/audit-retention-review/` (README.md, results.json
sha256 `a9fb7be095005fe726f4abc74c4ac634cdd3c228615ae2e14ab97fa19b2f5a7f`,
config-baseline `d7140698…`, config-proposed `5596653a…`,
patch `71a6ed9f…` (applies zero-fuzz to the captured deployed config, patched
result `dfc1dd5c…`, collector logs `ac7c03e8…`/`86dedfed…`).
Smallest candidate diff: `proposed-filter.patch` — one appended
`and not (…)` conjunction inside the existing first drop condition.

## INFO noise / WARN / trace / replay assessment

- Generic untraced INFO from any other service remains dropped (N07, N11,
  N12); retention widens only for the bounded audit stream (≤1000/org outbox
  capacity guard in `store.ts`), so no meaningful warehouse-volume risk.
- WARN(13)+ untraced from any service remains retained (C03) — unchanged.
- Trace/no-trace: traced INFO retains under both configs (C01); the exception
  deliberately does NOT require or invent trace context; auth trace
  propagation stays an optional separate instrumentation improvement.
- Historical replay of the five missing events is NOT authorized by this
  review and is NOT fixed by the policy change; it needs its own bounded,
  duplicate-accounted, business-effect-free replay approval (R1 §4).

## Remaining gates before audit acceptance can close (owner: collector owner)

1. Extract/re-run fixture against central image `bf46e73` binary (finding 3).
2. Approved rollout of the patch by the collector owner (backup, single
   service recreate, rollback command) — separate permission from this review.
3. Fresh persistence acceptance per R1 §3: generate authorized new
   class-specific audit events, wait a batch window, exact-ID readback with
   copy counts and genuine trace joins, untraced records staying untraced,
   Setup Health deltas compared per check ID.
4. Optional, separately decided: bounded historical replay (finding above).

Until 1–3 land with evidence, Stellarc must not be declared audit-ready.
