import { Cause, Effect, Exit, type Runtime } from "effect";
import type { Sql } from "postgres";
import { NotFound, ValidationError } from "./projects";
import { appendProjectEventEffect, opService } from "./projects-events";

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

export type CreateProjectMilestoneInput = {
	projectId: string;
	name: string;
	description?: string | null;
	targetDate?: string | null;
	rank?: number;
	userId: string;
};

export const createProjectMilestoneEffect = opService(
	"ProjectMilestones.createProjectMilestone",
	createProjectMilestoneImpl,
);

export async function createProjectMilestone(
	sql: Sql,
	input: CreateProjectMilestoneInput,
): Promise<MilestoneRow> {
	const exit = await Effect.runPromiseExit(
		createProjectMilestoneEffect(sql, input),
	);
	if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
	return exit.value;
}

async function createProjectMilestoneImpl(
	runtime: Runtime.Runtime<never>,
	sql: Sql,
	input: CreateProjectMilestoneInput,
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
		await appendProjectEventEffect(
			tx,
			project.organization_id as string,
			input.userId,
			"project:milestone-upserted",
			{
				id,
				projectId: input.projectId,
			},
			runtime,
		);
		const rows = await selectMilestones(tx, input.projectId, "AND m.id = $2", [
			id,
		]);
		return rows[0];
	});
}

export type UpdateProjectMilestoneInput = {
	id: string;
	projectId: string;
	name?: string;
	description?: string | null;
	targetDate?: string | null;
	rank?: number;
	userId: string;
};

export const updateProjectMilestoneEffect = opService(
	"ProjectMilestones.updateProjectMilestone",
	updateProjectMilestoneImpl,
);

export async function updateProjectMilestone(
	sql: Sql,
	input: UpdateProjectMilestoneInput,
): Promise<MilestoneRow> {
	const exit = await Effect.runPromiseExit(
		updateProjectMilestoneEffect(sql, input),
	);
	if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
	return exit.value;
}

async function updateProjectMilestoneImpl(
	runtime: Runtime.Runtime<never>,
	sql: Sql,
	input: UpdateProjectMilestoneInput,
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
		await appendProjectEventEffect(
			tx,
			project.organization_id as string,
			input.userId,
			"project:milestone-upserted",
			{
				id: input.id,
				projectId: input.projectId,
			},
			runtime,
		);
		const rows = await selectMilestones(tx, input.projectId, "AND m.id = $2", [
			input.id,
		]);
		return rows[0];
	});
}

export type DeleteProjectMilestoneInput = {
	id: string;
	projectId: string;
	organizationId?: string;
	userId: string;
};

export const deleteProjectMilestoneEffect = opService(
	"ProjectMilestones.deleteProjectMilestone",
	deleteProjectMilestoneImpl,
);

export async function deleteProjectMilestone(
	sql: Sql,
	input: DeleteProjectMilestoneInput,
): Promise<{ id: string }> {
	const exit = await Effect.runPromiseExit(
		deleteProjectMilestoneEffect(sql, input),
	);
	if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
	return exit.value;
}

async function deleteProjectMilestoneImpl(
	runtime: Runtime.Runtime<never>,
	sql: Sql,
	input: DeleteProjectMilestoneInput,
): Promise<{ id: string }> {
	return sql.begin(async (tx) => {
		const [project] =
			await tx`SELECT organization_id FROM project WHERE id = ${input.projectId}`;
		if (!project) throw new NotFound();
		const rows =
			await tx`DELETE FROM project_milestone WHERE id = ${input.id} AND project_id = ${input.projectId} RETURNING id`;
		if (rows.length === 0) throw new NotFound();
		await appendProjectEventEffect(
			tx,
			project.organization_id as string,
			input.userId,
			"project:milestone-deleted",
			{
				id: input.id,
				projectId: input.projectId,
			},
			runtime,
		);
		return { id: input.id };
	});
}

export type CompleteProjectMilestoneInput = {
	id: string;
	projectId: string;
	userId: string;
	organizationId?: string;
};

export const completeProjectMilestoneEffect = opService(
	"ProjectMilestones.completeProjectMilestone",
	completeProjectMilestoneImpl,
);

export async function completeProjectMilestone(
	sql: Sql,
	input: CompleteProjectMilestoneInput,
): Promise<MilestoneRow> {
	const exit = await Effect.runPromiseExit(
		completeProjectMilestoneEffect(sql, input),
	);
	if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
	return exit.value;
}

async function completeProjectMilestoneImpl(
	runtime: Runtime.Runtime<never>,
	sql: Sql,
	input: CompleteProjectMilestoneInput,
): Promise<MilestoneRow> {
	return sql.begin(async (tx) => {
		const [project] =
			await tx`SELECT organization_id FROM project WHERE id = ${input.projectId}`;
		if (!project) throw new NotFound();
		await tx`UPDATE project_milestone SET completed_at = now(), completed_by = ${input.userId}, updated_at = now()
			WHERE id = ${input.id} AND project_id = ${input.projectId}`;
		await appendProjectEventEffect(
			tx,
			project.organization_id as string,
			input.userId,
			"project:milestone-upserted",
			{
				id: input.id,
				projectId: input.projectId,
			},
			runtime,
		);
		const rows = await selectMilestones(tx, input.projectId, "AND m.id = $2", [
			input.id,
		]);
		return rows[0];
	});
}

export type ReopenProjectMilestoneInput = {
	id: string;
	projectId: string;
	userId?: string;
	organizationId?: string;
};

export const reopenProjectMilestoneEffect = opService(
	"ProjectMilestones.reopenProjectMilestone",
	reopenProjectMilestoneImpl,
);

export async function reopenProjectMilestone(
	sql: Sql,
	input: ReopenProjectMilestoneInput,
): Promise<MilestoneRow> {
	const exit = await Effect.runPromiseExit(
		reopenProjectMilestoneEffect(sql, input),
	);
	if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
	return exit.value;
}

async function reopenProjectMilestoneImpl(
	runtime: Runtime.Runtime<never>,
	sql: Sql,
	input: ReopenProjectMilestoneInput,
): Promise<MilestoneRow> {
	return sql.begin(async (tx) => {
		const [project] =
			await tx`SELECT organization_id FROM project WHERE id = ${input.projectId}`;
		if (!project) throw new NotFound();
		await tx`UPDATE project_milestone SET completed_at = NULL, completed_by = NULL, updated_at = now()
			WHERE id = ${input.id} AND project_id = ${input.projectId}`;
		await appendProjectEventEffect(
			tx,
			project.organization_id,
			input.userId ?? "system",
			"project:milestone-upserted",
			{
				id: input.id,
				projectId: input.projectId,
			},
			runtime,
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
