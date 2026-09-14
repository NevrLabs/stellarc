import { afterEach, expect, test } from "vitest";
import { migrate } from "../../packages/db/src/migrate";
import { disposablePostgres } from "../helpers/postgres";

const resources: Array<() => Promise<void>> = [];

test("T01a core project tables exist with exact columns and constraints", async () => {
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	const tables = await db.sql`
		SELECT table_name FROM information_schema.tables
		WHERE table_schema = 'public' AND table_name LIKE 'project%'
		ORDER BY table_name
	`;
	expect(tables.map((t) => t.table_name)).toEqual([
		"project",
		"project_milestone",
		"project_slug_alias",
		"project_update",
	]);

	// 21 columns on project, exact set
	const cols = await db.sql`
		SELECT column_name, is_nullable, data_type FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'project' ORDER BY ordinal_position
	`;
	expect(cols).toHaveLength(21);
	expect(cols.map((c) => c.column_name)).toEqual([
		"id",
		"organization_id",
		"slug",
		"name",
		"icon",
		"color",
		"summary",
		"description",
		"success_criteria",
		"status",
		"priority",
		"lead_user_id",
		"lead_team_id",
		"start_date",
		"target_date",
		"org_privilege",
		"archived_at",
		"archived_by",
		"created_at",
		"updated_at",
		"created_by",
	]);

	// constraint catalog: status check, lower-slug unique (canonical + alias namespace),
	// completion-pair check, health check
	const constraints = await db.sql`
		SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
		WHERE connamespace = 'public'::regnamespace AND conname LIKE 'project%'
		ORDER BY conname
	`;
	const byName = Object.fromEntries(constraints.map((c) => [c.conname, c.def]));
	expect(byName["project_status_check"]).toContain("planned");
	expect(byName["project_milestone_completion_pair_check"]).toBeDefined();
	expect(byName["project_update_health_check"]).toContain("on-track");
	const indexes = await db.sql`
		SELECT indexdef FROM pg_indexes
		WHERE schemaname = 'public' AND indexdef ILIKE '%project%'
	`;
	expect(
		indexes.some((i) =>
			i.indexdef.includes("project_organization_slug_lower_unique"),
		),
	).toBe(true);
	expect(
		indexes.some(
			(i) =>
				i.indexdef.includes("project_slug_alias") &&
				i.indexdef.toLowerCase().includes("lower(slug)"),
		),
	).toBe(true);
});

test("T01b blocked satellite tables are absent pending wave-2 (Q1)", async () => {
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	const [row] = await db.sql`
		SELECT count(*)::int AS n FROM information_schema.tables
		WHERE table_schema = 'public'
		AND table_name IN ('project_ticket', 'project_board', 'project_repo', 'project_table_link')
	`;
	expect(row.n).toBe(0);
});

afterEach(async () => {
	for (const close of resources.splice(0).reverse()) await close();
});
