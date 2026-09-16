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

function mapRow(r: Record<string, unknown>): ProjectRow {
	return {
		id: r.id as string,
		organizationId: r.organization_id as string,
		slug: r.slug as string,
		name: r.name as string,
		icon: (r.icon as string | null) ?? null,
		color: (r.color as string | null) ?? null,
		summary: r.summary as string,
		description: (r.description as string | null) ?? null,
		successCriteria: (r.success_criteria as string | null) ?? null,
		status: r.status as string,
		priority: (r.priority as string | null) ?? null,
		leadUserId: r.lead_user_id as string,
		leadUserName: (r.lead_user_name as string | null) ?? null,
		leadTeamId: (r.lead_team_id as string | null) ?? null,
		leadTeamName: (r.lead_team_name as string | null) ?? null,
		startDate: (r.start_date as string | null) ?? null,
		targetDate: (r.target_date as string | null) ?? null,
		orgPrivilege: (r.org_privilege as string | null) ?? null,
		archivedAt: (r.archived_at as Date | null) ?? null,
		archivedBy: (r.archived_by as string | null) ?? null,
		archivedByName: (r.archived_by_name as string | null) ?? null,
		createdAt: r.created_at as Date,
		updatedAt: r.updated_at as Date,
		createdBy: r.created_by as string,
	};
}

async function selectProjects(
	sql: Sql,
	org: string,
	extra: string,
	values: unknown[] = [],
): Promise<ProjectRow[]> {
	const rows = (await sql.unsafe(
		`SELECT ${PROJECT_COLUMNS}
	FROM project p
	LEFT JOIN "user" u ON u.id = p.lead_user_id
	LEFT JOIN team t ON t.id = p.lead_team_id
	LEFT JOIN "user" au2 ON au2.id = p.archived_by
	WHERE p.organization_id = $1 ${extra}
	ORDER BY p.name`,
		[org, ...values] as never[],
	)) as unknown as Array<Record<string, unknown>>;
	return rows.map(mapRow);
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
		VALUES (${org}, ${counter.seq}, ${type}, ${actor}, ${tx.json(payload as never)}, 1, ${transaction.txid})`;
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

export async function updateProject(
	sql: Sql,
	input: {
		id: string;
		organizationId: string;
		updatedBy: string;
		name: string;
		summary: string;
		status: string;
		priority: string | null;
		icon: string | null;
		color: string | null;
		description: string | null;
		successCriteria: string | null;
		leadUserId: string;
		leadTeamId: string | null;
		startDate: string | null;
		targetDate: string | null;
		orgPrivilege: string | null;
	},
): Promise<ProjectRow> {
	if (!["planned", "started", "completed", "canceled"].includes(input.status))
		throw new ValidationError("Invalid status");
	if (
		input.priority !== null &&
		!["no-priority", "low", "medium", "high", "urgent"].includes(input.priority)
	)
		throw new ValidationError("Invalid priority");
	if (
		input.orgPrivilege !== null &&
		!["none", "view", "edit", "manage"].includes(input.orgPrivilege)
	)
		throw new ValidationError("Invalid orgPrivilege");
	return sql.begin(async (tx) => {
		const [member] = await tx`
			SELECT 1 FROM organization_member
			WHERE organization_id = ${input.organizationId} AND user_id = ${input.leadUserId}`;
		if (!member) throw new InvalidReference("Lead user not in organization");
		if (input.leadTeamId) {
			const [team] = await tx`
				SELECT 1 FROM team WHERE id = ${input.leadTeamId} AND organization_id = ${input.organizationId}`;
			if (!team) throw new InvalidReference("Lead team not in organization");
		}
		const rows0 = await selectProjects(
			tx,
			input.organizationId,
			"AND p.id = $2",
			[input.id],
		);
		if (!rows0[0]) throw new NotFound();
		await tx`UPDATE project SET
			name = ${input.name},
			summary = ${input.summary},
			status = ${input.status},
			priority = ${input.priority},
			icon = ${input.icon},
			color = ${input.color},
			description = ${input.description},
			success_criteria = ${input.successCriteria},
			lead_user_id = ${input.leadUserId},
			lead_team_id = ${input.leadTeamId},
			start_date = ${input.startDate},
			target_date = ${input.targetDate},
			org_privilege = ${input.orgPrivilege},
			updated_at = now()
		WHERE id = ${input.id} AND organization_id = ${input.organizationId}`;
		await appendProjectEvent(
			tx,
			input.organizationId,
			input.updatedBy,
			"project:updated",
			{
				id: input.id,
				organizationId: input.organizationId,
			},
		);
		const rows = await selectProjects(
			tx,
			input.organizationId,
			"AND p.id = $2",
			[input.id],
		);
		return rows[0];
	});
}

export async function archiveProject(
	sql: Sql,
	input: { id: string; organizationId: string; userId: string },
): Promise<ProjectRow> {
	return sql.begin(async (tx) => {
		const rows0 = await selectProjects(
			tx,
			input.organizationId,
			"AND p.id = $2",
			[input.id],
		);
		if (!rows0[0]) throw new NotFound();
		await tx`UPDATE project SET archived_at = now(), archived_by = ${input.userId}, updated_at = now()
			WHERE id = ${input.id} AND organization_id = ${input.organizationId}`;
		await appendProjectEvent(
			tx,
			input.organizationId,
			input.userId,
			"project:archived",
			{
				id: input.id,
				organizationId: input.organizationId,
			},
		);
		const rows = await selectProjects(
			tx,
			input.organizationId,
			"AND p.id = $2",
			[input.id],
		);
		return rows[0];
	});
}

export async function unarchiveProject(
	sql: Sql,
	input: { id: string; organizationId: string; userId: string },
): Promise<ProjectRow> {
	return sql.begin(async (tx) => {
		const rows0 = await selectProjects(
			tx,
			input.organizationId,
			"AND p.id = $2",
			[input.id],
		);
		if (!rows0[0]) throw new NotFound();
		await tx`UPDATE project SET archived_at = NULL, archived_by = NULL, updated_at = now()
			WHERE id = ${input.id} AND organization_id = ${input.organizationId}`;
		await appendProjectEvent(
			tx,
			input.organizationId,
			input.userId,
			"project:unarchived",
			{
				id: input.id,
				organizationId: input.organizationId,
			},
		);
		const rows = await selectProjects(
			tx,
			input.organizationId,
			"AND p.id = $2",
			[input.id],
		);
		return rows[0];
	});
}
