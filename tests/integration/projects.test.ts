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

// --- STL-21 domain service tests (core subset; Q1 satellites deferred) -----------------
import {
	archiveProject,
	createProject,
	DuplicateSlug,
	InvalidReference,
	listProjects,
	renameProjectSlug,
	resolveProject,
	unarchiveProject,
	updateProject,
	ValidationError,
} from "../../packages/domain/src/projects";

async function seedOrg(
	db: Awaited<ReturnType<typeof disposablePostgres>>,
	org: string,
	user: string,
) {
	await db.sql`INSERT INTO "user" (id, name, email) VALUES (${user}, ${user + "-name"}, ${user + "@x.test"}) ON CONFLICT DO NOTHING`;
	await db.sql`INSERT INTO organization (id, name, slug, created_at) VALUES (${org}, ${org + "-name"}, ${org}, now()) ON CONFLICT DO NOTHING`;
	await db.sql`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at) VALUES (${user + "-m"}, ${org}, ${user}, ${"'admin'"}, now()) ON CONFLICT DO NOTHING`;
}

test("T03/T04 create + list: slug normalize, default planned, event atomic, lead validation", async () => {
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	await seedOrg(db, "orgA", "u1");
	const created = await createProject(db.sql, {
		organizationId: "orgA",
		name: "Alpha Project",
		summary: "First project",
		leadUserId: "u1",
		createdBy: "u1",
	});
	expect(created.slug).toBe("alpha-project");
	expect(created.status).toBe("planned");
	const listed = await listProjects(db.sql, "orgA");
	expect(listed).toHaveLength(1);
	expect(listed[0].name).toBe("Alpha Project");

	// duplicate slug (canonical) -> 409
	await expect(
		createProject(db.sql, {
			organizationId: "orgA",
			name: "Alpha Project",
			summary: "dup",
			leadUserId: "u1",
			createdBy: "u1",
		}),
	).rejects.toThrow(DuplicateSlug);

	// cross-org lead -> 409 InvalidReference
	await seedOrg(db, "orgB", "u2");
	await expect(
		createProject(db.sql, {
			organizationId: "orgA",
			name: "Beta",
			summary: "cross-org lead",
			leadUserId: "u2",
			createdBy: "u1",
		}),
	).rejects.toThrow(InvalidReference);

	// alias-namespace collision: rename alpha-project away, then reuse its old slug
	const renamed = await renameProjectSlug(db.sql, {
		id: created.id,
		organizationId: "orgA",
		slug: "alpha-project-2",
		userId: "u1",
	});
	expect(renamed.slug).toBe("alpha-project-2");
	await expect(
		createProject(db.sql, {
			organizationId: "orgA",
			name: "Squatter",
			summary: "aliases the old slug",
			leadUserId: "u1",
			createdBy: "u1",
			slug: "alpha-project",
		}),
	).rejects.toThrow(DuplicateSlug);

	// event rows appended atomically
	const events =
		await db.sql`SELECT plugin_type FROM event WHERE org = ${"orgA"} ORDER BY seq`;
	expect(events.map((e) => e.plugin_type)).toEqual([
		"project:created",
		"project:updated",
		"project:slug-alias-created",
	]);
});

test("T06 rename slug: alias row created, old slug resolves via alias", async () => {
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	await seedOrg(db, "orgA", "u1");
	const created = await createProject(db.sql, {
		organizationId: "orgA",
		name: "Gamma",
		summary: "s",
		leadUserId: "u1",
		createdBy: "u1",
	});
	expect(created.slug).toBe("gamma");
	const renamed = await renameProjectSlug(db.sql, {
		id: created.id,
		organizationId: "orgA",
		slug: "gamma-renamed",
		userId: "u1",
	});
	expect(renamed.slug).toBe("gamma-renamed");
	const resolved = await resolveProject(db.sql, "orgA", "gamma");
	expect(resolved?.id).toBe(created.id);
	expect(resolved?.usedSlugAlias).toBe(true);
	const canonical = await resolveProject(db.sql, "orgA", "GAMMA-RENAMED");
	expect(canonical?.id).toBe(created.id);
	expect(canonical?.usedSlugAlias).toBe(false);
});

test("T05/T07 update properties + archive/unarchive", async () => {
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	await seedOrg(db, "orgA", "u1");
	const created = await createProject(db.sql, {
		organizationId: "orgA",
		name: "Delta",
		summary: "s",
		leadUserId: "u1",
		createdBy: "u1",
	});
	const updated = await updateProject(db.sql, {
		id: created.id,
		organizationId: "orgA",
		updatedBy: "u1",
		name: "Delta v2",
		summary: "s2",
		status: "started",
		priority: "high",
		icon: null,
		color: "#fff",
		description: "d",
		successCriteria: null,
		leadUserId: "u1",
		leadTeamId: null,
		startDate: "2026-01-01",
		targetDate: null,
		orgPrivilege: "edit",
	});
	expect(updated.name).toBe("Delta v2");
	expect(updated.status).toBe("started");
	expect(updated.orgPrivilege).toBe("edit");

	// archived hidden from default list, returned with includeArchived
	const archived = await archiveProject(db.sql, {
		id: created.id,
		organizationId: "orgA",
		userId: "u1",
	});
	expect(archived.archivedAt).toBeTruthy();
	expect(await listProjects(db.sql, "orgA")).toHaveLength(0);
	expect(await listProjects(db.sql, "orgA", true)).toHaveLength(1);

	// orgPrivilege picklist enforced
	await expect(
		updateProject(db.sql, {
			id: created.id,
			organizationId: "orgA",
			updatedBy: "u1",
			name: "x",
			summary: "x",
			status: "planned",
			priority: null,
			icon: null,
			color: null,
			description: null,
			successCriteria: null,
			leadUserId: "u1",
			leadTeamId: null,
			startDate: null,
			targetDate: null,
			orgPrivilege: "supreme",
		}),
	).rejects.toThrow(ValidationError);

	// unarchive clears pair
	const unarchived = await unarchiveProject(db.sql, {
		id: created.id,
		organizationId: "orgA",
		userId: "u1",
	});
	expect(unarchived.archivedAt).toBeNull();
	const events =
		await db.sql`SELECT plugin_type FROM event WHERE org = ${"orgA"} ORDER BY seq`;
	expect(events.map((e) => e.plugin_type)).toEqual([
		"project:created",
		"project:updated",
		"project:archived",
		"project:unarchived",
	]);
});
