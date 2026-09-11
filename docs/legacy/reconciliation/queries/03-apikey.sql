-- Canonical reconciliation #3 — apikey fidelity
-- Owner: STL-15
-- Semantics source: STL-15 §2 (hash verbatim, enabled/rate-limit state preserved); wave plan T1
-- Precondition tables: legacy.apikey, public.apikey
-- Blocked if: either is absent
-- Violation-rows-returning: empty result set = green.

WITH checks AS (
  SELECT 'apikey:missing-in-dest' AS violation, s.id, 'apikey' AS tbl
    FROM legacy.apikey s LEFT JOIN public.apikey d ON d.id = s.id WHERE d.id IS NULL
  UNION ALL
  SELECT 'apikey:missing-in-src', d.id, 'apikey'
    FROM public.apikey d LEFT JOIN legacy.apikey s ON s.id = d.id WHERE s.id IS NULL
  UNION ALL
  SELECT 'apikey:value-mismatch', s.id, 'apikey'
    FROM legacy.apikey s JOIN public.apikey d ON d.id = s.id
   WHERE s.config_id IS DISTINCT FROM d.config_id
      OR s.name IS DISTINCT FROM d.name
      OR s.start IS DISTINCT FROM d.start
      OR s.reference_id IS DISTINCT FROM d.reference_id
      OR s.prefix IS DISTINCT FROM d.prefix
      OR s.key IS DISTINCT FROM d.key
      OR s.user_id IS DISTINCT FROM d.user_id
      OR s.refill_interval IS DISTINCT FROM d.refill_interval
      OR s.refill_amount IS DISTINCT FROM d.refill_amount
      OR s.enabled IS DISTINCT FROM d.enabled
      OR s.rate_limit_enabled IS DISTINCT FROM d.rate_limit_enabled
      OR s.rate_limit_time_window IS DISTINCT FROM d.rate_limit_time_window
      OR s.rate_limit_max IS DISTINCT FROM d.rate_limit_max
      OR s.request_count IS DISTINCT FROM d.request_count
      OR s.remaining IS DISTINCT FROM d.remaining
      OR s.expires_at IS DISTINCT FROM d.expires_at
      OR s.permissions IS DISTINCT FROM d.permissions
      OR s.metadata IS DISTINCT FROM d.metadata
)
SELECT * FROM checks;
