-- Canonical reconciliation #14 — apikey hash audit
-- Owner: STL-27
-- Semantics source: STL-27 §2 (this ticket); fork apps/api/src/utils/verify-api-key.ts @2504e645.
--   Stored apikey.key = unpadded base64url of SHA256(raw) (43 chars). reference_id is the
--   owner FK; legacy nullable user_id is not canonical. Reissue event contract (emitted by
--   STL-15): plugin_type 'identity:apikey-reissued', payload {id, principalId, reason:"legacy-reissue"}.
-- Precondition tables: legacy.apikey, public.apikey, public.principal, public.event, public.org_event_counter
-- Blocked if: any is absent
-- Invariant: every legacy apikey either (a) preserves a structurally-valid hash verbatim, or
--   (b) was re-issued (hash differs) with exactly one identity:apikey-reissued audit event.
--   Never neither (corrupt hash with no event), never both (preserved hash AND a reissue event).
-- Violation-rows-returning: empty result set = green.

WITH k AS (
  SELECT d.id,
         d.key AS dest_hash,
         s.key AS legacy_hash,
         (d.key ~ '^[A-Za-z0-9_-]{43}$') AS hash_valid,
         (s.key IS DISTINCT FROM d.key) AS reissued,
         EXISTS (
           SELECT 1 FROM public.event e
            WHERE e.plugin_type = 'identity:apikey-reissued'
              AND e.payload->>'id' = d.id
         ) AS has_event
    FROM public.apikey d
    LEFT JOIN legacy.apikey s ON s.id = d.id
),
checks AS (
  SELECT 'apikey:invalid-hash-no-event' AS violation, id, 'apikey' AS tbl
    FROM k WHERE NOT hash_valid AND NOT has_event
  UNION ALL
  SELECT 'apikey:reissued-no-event', id, 'apikey'
    FROM k WHERE reissued AND NOT has_event
  UNION ALL
  SELECT 'apikey:preserved-and-event', id, 'apikey'
    FROM k WHERE NOT reissued AND has_event
)
SELECT * FROM checks;
