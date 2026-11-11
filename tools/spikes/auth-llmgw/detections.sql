-- Disposable PG checks, NOT installed Maple alert routing.
-- Deduplicate exported authgw events by event.id before evaluating warehouse rules.
-- Burst denial: >= 5 distinct events in five minutes; unknown identity uses system scope.
SELECT org, count(*) AS denied
FROM event
WHERE plugin_type='authgw:call-denied' AND created_at>now()-interval '5 minutes'
GROUP BY org HAVING count(*)>=5;

-- Delivery lag / gap: evaluate from an independent scheduler, not this exporter.
SELECT e.org, count(*) AS pending, min(e.created_at) AS oldest
FROM event e LEFT JOIN authgw_cursor c USING(org)
WHERE e.seq>coalesce(c.seq,0)
GROUP BY e.org
HAVING min(e.created_at)<now()-interval '5 minutes' OR count(*)>=1000;

-- Every grant transition must have durable audit in the same transaction.
SELECT g.id FROM authgw_grant g
WHERE NOT EXISTS(SELECT 1 FROM event e WHERE e.org=g.org
 AND e.actor=g.actor AND e.plugin_type='authgw:token-issued'
 AND e.payload->>'requestId'=g.id);

-- Full SIEM acceptance also requires independent heartbeat absence detection,
-- durable-audit failure/gap and privileged/config/grant-change rules, and
-- verified notification delivery. Email/Discord destinations and routing need
-- separate approval; no Telegram. This file alone is NOT completed SIEM.
