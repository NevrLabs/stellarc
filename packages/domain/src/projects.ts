import { Effect, Runtime } from "effect";
import type { Sql } from "postgres";
import { PROJECT_SLUG_PATTERN } from "../../contracts/src/projects";

/** Fork semantics: name -> slug (lowercase kebab, trim, collapse, max 63). */
export function slugifyProject(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 63);
}

export function normalizeProjectSlug(slug: string): string {
	return slug.trim().toLowerCase();
}

export class DuplicateSlug extends Error {
	constructor() {
		super("Duplicate slug");
	}
}
export class InvalidReference extends Error {
	constructor(message = "Invalid reference") {
		super(message);
	}
}
export class NotFound extends Error {
	constructor() {
		super("Not found");
	}
}
export class ValidationError extends Error {
	constructor(message = "Validation error") {
		super(message);
	}
}

export type ProjectRow = {
	id: string;
	organizationId: string;
	slug: string;
	name: string;
	icon: string | null;
	color: string | null;
	summary: string;
	description: string | null;
	successCriteria: string | null;
	status: string;
	priority: string | null;
	leadUserId: string;
	leadUserName: string | null;
	leadTeamId: string | null;
	leadTeamName: string | null;
	startDate: string | null;
	targetDate: string | null;
	orgPrivilege: string | null;
	archivedAt: Date | null;
	archivedBy: string | null;
	archivedByName: string | null;
	createdAt: Date;
	updatedAt: Date;
	createdBy: string;
};

const PROJECT_COLUMNS = `p.id, p.organization_id, p.slug, p.name, p.icon, p.color, p.summary,
p.description, p.success_criteria, p.status, p.priority,
p.lead_user_id, u.name AS lead_user_name,
p.lead_team_id, t.name AS lead_team_name,
p.start_date, p.target_date, p.org_privilege,
p.archived_at, au2.name AS archived_by_name,
p.archived_by, p.created_at, p.updated_at, p.created_by`;

async function selectProjects(
	sql: Sql,
	org: string,
	extra: string,
	values: unknown[] = [],
): Promise<ProjectRow[]> {
	const rows = await sql.unsafe(
		`SELECT ${PROJECT_COLUMNS}
	FROM project p
	LEFT JOIN "user" u ON u.id = p.lead_user_id
	LEFT JOIN team t ON t.id = p.lead_team_id
	LEFT JOIN "user" au2 ON au2.id = p.archived_by
	WHERE p.organization_id = $1 ${extra}
	ORDER BY p.name`,
		[org, ...values],
	);
	return rows as ProjectRow[];
}

async function appendProjectEvent(
	tx: Sql,
	org: string,
	actor: string,
	type: string,
	payload: Record<string, unknown>,
): Promise<number> {
	await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
	const [counter] =
		await tx`UPDATE org_event_counter SET seq = seq + 1 WHERE org = ${org} RETURNING seq::text`;
	const [transaction] = await tx`SELECT pg_current_xact_id()::text AS txid`;
	const txid = Number(BigInt(transaction.txid));
	await tx`INSERT INTO event(org, seq, plugin_type, actor, payload, schema_version, txid)
		VALUES (${org}, ${counter.seq}, ${type}, ${actor}, ${tx.json(payload)}, 1, ${transaction.txid})`;
	return txid;
}

export async function createProject(
	sql: Sql,
	input: {
		organizationId: string;
		name: string;
		summary: string;
		leadUserId: string;
		leadTeamId?: string | null;
		createdBy: string;
		slug?: string;
		status?: string;
		priority?: string | null;
		icon?: string | null;
		color?: string | null;
		description?: string | null;
		successCriteria?: string | null;
		startDate?: string | null;
		targetDate?: string | null;
	},
): Promise<ProjectRow> {
	const status = input.status ?? "planned";
	if (!["planned", "started", "completed", "canceled"].includes(status))
		throw new ValidationError("Invalid status");
	const slug = normalizeProjectSlug(input.slug ?? slugifyProject(input.name));
	if (slug.length < 2 || slug.length > 63 || !PROJECT_SLUG_PATTERN.test(slug))
		throw new ValidationError("Invalid project slug");
	return sql.begin(async (tx) => {
		// lead user must be same-org member
		const [member] = await tx`
			SELECT 1 FROM organization_member
			WHERE organization_id = ${input.organizationId} AND user_id = ${input.leadUserId}`;
		if (!member) throw new InvalidReference("Lead user not in organization");
		if (input.leadTeamId) {
			const [team] = await tx`
				SELECT 1 FROM team WHERE id = ${input.leadTeamId} AND organization_id = ${input.organizationId}`;
			if (!team) throw new InvalidReference("Lead team not in organization");
		}
		// canonical + alias namespace collision
		const [canonical] = await tx`
			SELECT 1 FROM project
			WHERE organization_id = ${input.organizationId} AND lower(slug) = ${slug}`;
		if (canonical) throw new DuplicateSlug();
		const [alias] = await tx`
			SELECT 1 FROM project_slug_alias
			WHERE organization_id = ${input.organizationId} AND lower(slug) = ${slug}`;
		if (alias) throw new DuplicateSlug();
		const id = crypto.randomUUID();
		await tx`INSERT INTO project (id, organization_id, slug, name, summary, lead_user_id, lead_team_id, status, priority, icon, color, description, success_criteria, start_date, target_date, created_by)
			VALUES (${id}, ${input.organizationId}, ${slug}, ${input.name}, ${input.summary}, ${input.leadUserId}, ${input.leadTeamId ?? null}, ${status}, ${input.priority ?? null}, ${input.icon ?? null}, ${input.color ?? null}, ${input.description ?? null}, ${input.successCriteria ?? null}, ${input.startDate ?? null}, ${input.targetDate ?? null}, ${input.createdBy})`;
		await appendProjectEvent(
			tx,
			input.organizationId,
			input.createdBy,
			"project:created",
			{
				id,
				organizationId: input.organizationId,
			},
		);
		const rows = await selectProjects(
			tx,
			input.organizationId,
			"AND p.id = $2",
			[id],
		);
		return rows[0];
	});
}

export async function listProjects(
	sql: Sql,
	org: string,
	includeArchived = false,
): Promise<ProjectRow[]> {
	return selectProjects(
		sql,
		org,
		includeArchived ? "" : "AND p.archived_at IS NULL",
	);
}

export async function getProject(
	sql: Sql,
	org: string,
	id: string,
): Promise<ProjectRow | null> {
	const rows = await selectProjects(sql, org, "AND p.id = $2", [id]);
	return rows[0] ?? null;
}

export async function resolveProject(
	sql: Sql,
	org: string,
	slug: string,
): Promise<(ProjectRow & { usedSlugAlias: boolean }) | null> {
	const normalized = normalizeProjectSlug(slug);
	const canonical = await selectProjects(sql, org, "AND lower(p.slug) = $2", [
		normalized,
	]);
	if (canonical[0]) return { ...canonical[0], usedSlugAlias: false };
	const aliases = await sql`
		SELECT project_id FROM project_slug_alias
		WHERE organization_id = ${org} AND lower(slug) = ${normalized}`;
	if (aliases[0]) {
		const rows = await selectProjects(sql, org, "AND p.id = $2", [
			aliases[0].project_id,
		]);
		if (rows[0]) return { ...rows[0], usedSlugAlias: true };
	}
	return null;
}

export async function renameProjectSlug(
	sql: Sql,
	input: { id: string; organizationId: string; slug: string; userId: string },
): Promise<ProjectRow> {
	const slug = normalizeProjectSlug(input.slug);
	if (slug.length < 2 || slug.length > 63 || !PROJECT_SLUG_PATTERN.test(slug))
		throw new ValidationError("Invalid project slug");
	return sql.begin(async (tx) => {
		const current = (
			await selectProjects(tx, input.organizationId, "AND p.id = $2", [
				input.id,
			])
		)[0];
		if (!current) throw new NotFound();
		if (current.slug.toLowerCase() === slug) return current;
		// collision across canonical ∪ alias namespace (excluding own old slug)
		const [canonical] = await tx`
			SELECT 1 FROM project
			WHERE organization_id = ${input.organizationId} AND lower(slug) = ${slug} AND id <> ${input.id}`;
		if (canonical) throw new DuplicateSlug();
		const [alias] = await tx`
			SELECT 1 FROM project_slug_alias
			WHERE organization_id = ${input.organizationId} AND lower(slug) = ${slug}
			AND project_id <> ${input.id}`;
		if (alias) throw new DuplicateSlug();
		await tx`INSERT INTO project_slug_alias (id, organization_id, project_id, slug)
			VALUES (${crypto.randomUUID()}, ${input.organizationId}, ${input.id}, ${current.slug})`;
		await tx`UPDATE project SET slug = ${slug}, updated_at = now() WHERE id = ${input.id}`;
		await appendProjectEvent(
			tx,
			input.organizationId,
			input.userId,
			"project:updated",
			{
				id: input.id,
				organizationId: input.organizationId,
			},
		);
		await appendProjectEvent(
			tx,
			input.organizationId,
			input.userId,
			"project:slug-alias-created",
			{
				id: crypto.randomUUID(),
				projectId: input.id,
				organizationId: input.organizationId,
				slug: current.slug,
			},
		);
		const rows2 = await selectProjects(
			tx,
			input.organizationId,
			"AND p.id = $2",
			[input.id],
		);
		return rows2[0];
	});
}
