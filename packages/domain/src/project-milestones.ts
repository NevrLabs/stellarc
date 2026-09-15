import type { Sql } from "postgres";
import { NotFound, ValidationError } from "./projects";

export type MilestoneRow = {
	id: string;
	projectId: string;
	name: string;
	description: string | null;
	targetDate: string | null;
	rank: number;
	completedAt: Date | null;
	completedBy: { id: string; name: string | null } | null;
	createdAt: Date;
	updatedAt: Date;
};

type RawMilestone = Record<string, unknown>;

function mapMilestone(r: RawMilestone): MilestoneRow {
	return {
		id: r.id as string,
		projectId: r.project_id as string,
		name: r.name as string,
		description: (r.description as string | null) ?? null,
		targetDate: (r.target_date as string | null) ?? null,
		rank: r.rank as number,
		completedAt: (r.completed_at as Date | null) ?? null,
		completedBy:
			r.completed_by_id != null
				? {
						id: r.completed_by_id as string,
						name: (r.completed_by_name as string | null) ?? null,
					}
				: null,
		createdAt: r.created_at as Date,
		updatedAt: r.updated_at as Date,
	};
}

const MILESTONE_COLUMNS = `m.id, m.project_id, m.name, m.description, m.target_date,
m.rank, m.completed_at, m.completed_by AS completed_by_id, u.name AS completed_by_name,
m.created_at, m.updated_at`;

export async function appendEvent(
	tx: Sql,
	org: string,
	actor: string,
	type: string,
	payload: Record<string, unknown>,
): Promise<void> {
	await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
	const [counter] =
		await tx`UPDATE org_event_counter SET seq = seq + 1 WHERE org = ${org} RETURNING seq::text`;
	const [transaction] = await tx`SELECT pg_current_xact_id()::text AS txid`;
	await tx`INSERT INTO event(org, seq, plugin_type, actor, payload, schema_version, txid)
		VALUES (${org}, ${counter.seq}, ${type}, ${actor}, ${tx.json(payload as never)}, 1, ${transaction.txid})`;
}

async function selectMilestones(
	sql: Sql,
	projectId: string,
	extra = "",
	values: unknown[] = [],
): Promise<MilestoneRow[]> {
	const rows = (await sql.unsafe(
		`SELECT ${MILESTONE_COLUMNS}
FROM project_milestone m
LEFT JOIN "user" u ON u.id = m.completed_by
WHERE m.project_id = $1 ${extra}
ORDER BY m.rank, m.created_at`,
		[projectId, ...values] as never[],
	)) as unknown as Array<Record<string, unknown>>;
	return rows.map(mapMilestone);
}

export async function createProjectMilestone(
	sql: Sql,
	input: {
		projectId: string;
		name: string;
		description?: string | null;
		targetDate?: string | null;
		rank?: number;
		userId: string;
	},
): Promise<MilestoneRow> {
	if (
		input.rank !== undefined &&
		(!Number.isInteger(input.rank) || input.rank < 0)
	)
		throw new ValidationError("Invalid rank");
	return sql.begin(async (tx) => {
		const [project] =
			await tx`SELECT organization_id FROM project WHERE id = ${input.projectId}`;
		if (!project) throw new NotFound();
		const id = crypto.randomUUID();
		await tx`INSERT INTO project_milestone (id, project_id, name, description, target_date, rank)
			VALUES (${id}, ${input.projectId}, ${input.name}, ${input.description ?? null}, ${input.targetDate ?? null}, ${input.rank ?? 0})`;
		await appendEvent(
			tx,
			project.organization_id as string,
			input.userId,
			"project:milestone-upserted",
			{
				id,
				projectId: input.projectId,
			},
		);
		const rows = await selectMilestones(tx, input.projectId, "AND m.id = $2", [
			id,
		]);
		return rows[0];
	});
}

export async function updateProjectMilestone(
	sql: Sql,
	input: {
		id: string;
		projectId: string;
		name?: string;
		description?: string | null;
		targetDate?: string | null;
		rank?: number;
		userId: string;
	},
): Promise<MilestoneRow> {
	return sql.begin(async (tx) => {
		const [project] =
			await tx`SELECT organization_id FROM project WHERE id = ${input.projectId}`;
		if (!project) throw new NotFound();
		await tx`UPDATE project_milestone SET
			name = COALESCE(${input.name ?? null}, name),
			description = COALESCE(${input.description ?? null}, description),
			target_date = COALESCE(${input.targetDate ?? null}, target_date),
			rank = COALESCE(${input.rank ?? null}, rank),
			updated_at = now()
			WHERE id = ${input.id} AND project_id = ${input.projectId}`;
		await appendEvent(
			tx,
			project.organization_id as string,
			input.userId,
			"project:milestone-upserted",
			{
				id: input.id,
				projectId: input.projectId,
			},
		);
		const rows = await selectMilestones(tx, input.projectId, "AND m.id = $2", [
			input.id,
		]);
		return rows[0];
	});
}

export async function deleteProjectMilestone(
	sql: Sql,
	input: {
		id: string;
		projectId: string;
		organizationId?: string;
		userId: string;
	},
): Promise<{ id: string }> {
	return sql.begin(async (tx) => {
		const [project] =
			await tx`SELECT organization_id FROM project WHERE id = ${input.projectId}`;
		if (!project) throw new NotFound();
		const rows =
			await tx`DELETE FROM project_milestone WHERE id = ${input.id} AND project_id = ${input.projectId} RETURNING id`;
		if (rows.length === 0) throw new NotFound();
		await appendEvent(
			tx,
			project.organization_id as string,
			input.userId,
			"project:milestone-deleted",
			{
				id: input.id,
				projectId: input.projectId,
			},
		);
		return { id: input.id };
	});
}

export async function completeProjectMilestone(
	sql: Sql,
	input: {
		id: string;
		projectId: string;
		userId: string;
		organizationId?: string;
	},
): Promise<MilestoneRow> {
	return sql.begin(async (tx) => {
		const [project] =
			await tx`SELECT organization_id FROM project WHERE id = ${input.projectId}`;
		if (!project) throw new NotFound();
		await tx`UPDATE project_milestone SET completed_at = now(), completed_by = ${input.userId}, updated_at = now()
			WHERE id = ${input.id} AND project_id = ${input.projectId}`;
		await appendEvent(
			tx,
			project.organization_id as string,
			input.userId,
			"project:milestone-upserted",
			{
				id: input.id,
				projectId: input.projectId,
			},
		);
		const rows = await selectMilestones(tx, input.projectId, "AND m.id = $2", [
			input.id,
		]);
		return rows[0];
	});
}

export async function reopenProjectMilestone(
	sql: Sql,
	input: {
		id: string;
		projectId: string;
		userId?: string;
		organizationId?: string;
	},
): Promise<MilestoneRow> {
	return sql.begin(async (tx) => {
		const [project] =
			await tx`SELECT organization_id FROM project WHERE id = ${input.projectId}`;
		if (!project) throw new NotFound();
		await tx`UPDATE project_milestone SET completed_at = NULL, completed_by = NULL, updated_at = now()
			WHERE id = ${input.id} AND project_id = ${input.projectId}`;
		await appendEvent(
			tx,
			project.organization_id,
			input.userId ?? "system",
			"project:milestone-upserted",
			{
				id: input.id,
				projectId: input.projectId,
			},
		);
		const rows = await selectMilestones(tx, input.projectId, "AND m.id = $2", [
			input.id,
		]);
		return rows[0];
	});
}

export async function listProjectMilestones(
	sql: Sql,
	projectId: string,
): Promise<MilestoneRow[]> {
	return selectMilestones(sql, projectId);
}
