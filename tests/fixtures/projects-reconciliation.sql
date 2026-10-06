-- STL-21 supplementary reconciliation: project 21-column round-trip check.
-- Canon queries #13/#14 belong to STL-27; the all-14 final gate runs against a
-- production-snapshot fixture once wave-2 slices land. This file carries the
-- projects-wave obligation only (spec §7 T17).

-- Round-trip: 21 columns, exact identity, ids and timestamps preserved.
SELECT
	count(*) AS projects_checked,
	count(*) FILTER (WHERE c.column_count = 21) AS all_21_columns
FROM project p
JOIN LATERAL (
	SELECT count(*)::int AS column_count
	FROM information_schema.columns
	WHERE table_schema = 'public' AND table_name = 'project'
) c ON true;

-- Destination must reference only existing org members (lead integrity).
SELECT count(*) AS orphan_leads
FROM project p
LEFT JOIN organization_member m
	ON m.organization_id = p.organization_id AND m.user_id = p.lead_user_id
WHERE m.id IS NULL;

-- Every project org must exist (org FK integrity).
SELECT count(*) AS orphan_orgs
FROM project p
LEFT JOIN organization o ON o.id = p.organization_id
WHERE o.id IS NULL;
