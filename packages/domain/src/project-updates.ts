import { Cause, Effect, Exit, type Runtime } from "effect";
import type { Sql } from "postgres";
import { NotFound, ValidationError } from "./projects";
import { appendProjectEventEffect, opService } from "./projects-events";

const HEALTHS = ["on-track", "at-risk", "off-track"];

export type EditEntryRow = {
	content: string;
	editedAt: string;
	userId: string;
};
export type UpdateRow = {
	id: string;
	organizationId: string;
	projectId: string;
	authorId: string;
	authorName: string | null;
	content: string;
	health: string;
	editHistory: EditEntryRow[];
	createdAt: Date;
	updatedAt: Date;
};

function mapUpdate(r: Record<string, unknown>): UpdateRow {
	return {
		id: r.id as string,
		organizationId: r.organization_id as string,
		projectId: r.project_id as string,
		authorId: r.author_id as string,
		authorName: (r.author_name as string | null) ?? null,
		content: r.content as string,
		health: r.health as string,
		editHistory:
			typeof r.edit_history === "string"
				? (JSON.parse(r.edit_history) as EditEntryRow[])
				: ((r.edit_history as EditEntryRow[]) ?? []),
		createdAt: r.created_at as Date,
		updatedAt: r.updated_at as Date,
	};
}

const UPDATE_COLUMNS = `u.id, u.organization_id, u.project_id, u.author_id,
a.name AS author_name, u.content, u.health, u.edit_history, u.created_at, u.updated_at`;

async function selectUpdates(
	sql: Sql,
	projectId: string,
	extra = "",
	values: unknown[] = [],
): Promise<UpdateRow[]> {
	const rows = (await sql.unsafe(
		`SELECT ${UPDATE_COLUMNS}
FROM project_update u
LEFT JOIN "user" a ON a.id = u.author_id
WHERE u.project_id = $1 ${extra}
ORDER BY u.created_at DESC`,
		[projectId, ...values] as never[],
	)) as unknown as Array<Record<string, unknown>>;
	return rows.map(mapUpdate);
}

export type CreateProjectUpdateInput = {
	organizationId?: string;
	projectId: string;
	authorId: string;
	content: string;
	health: string;
};

export const createProjectUpdateEffect = opService(
	"ProjectUpdates.createProjectUpdate",
	createProjectUpdateImpl,
);

export async function createProjectUpdate(
	sql: Sql,
	input: CreateProjectUpdateInput,
): Promise<UpdateRow> {
	const exit = await Effect.runPromiseExit(
		createProjectUpdateEffect(sql, input),
	);
	if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
	return exit.value;
}

async function createProjectUpdateImpl(
	runtime: Runtime.Runtime<never>,
	sql: Sql,
	input: CreateProjectUpdateInput,
): Promise<UpdateRow> {
	if (!HEALTHS.includes(input.health))
		throw new ValidationError("Invalid health");
	return sql.begin(async (tx) => {
		const [project] =
			await tx`SELECT organization_id FROM project WHERE id = ${input.projectId}`;
		if (!project) throw new NotFound();
		const id = crypto.randomUUID();
		await tx`INSERT INTO project_update (id, organization_id, project_id, author_id, content, health)
			VALUES (${id}, ${project.organization_id}, ${input.projectId}, ${input.authorId}, ${input.content}, ${input.health})`;
		await appendProjectEventEffect(
			tx,
			project.organization_id as string,
			input.authorId,
			"project:update-upserted",
			{
				id,
				projectId: input.projectId,
			},
			runtime,
		);
		const rows = await selectUpdates(tx, input.projectId, "AND u.id = $2", [
			id,
		]);
		return rows[0];
	});
}

export type UpdateProjectUpdateInput = {
	id: string;
	organizationId?: string;
	projectId: string;
	userId: string;
	content?: string;
	health?: string;
};

export const updateProjectUpdateEffect = opService(
	"ProjectUpdates.updateProjectUpdate",
	updateProjectUpdateImpl,
);

export async function updateProjectUpdate(
	sql: Sql,
	input: UpdateProjectUpdateInput,
): Promise<UpdateRow> {
	const exit = await Effect.runPromiseExit(
		updateProjectUpdateEffect(sql, input),
	);
	if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
	return exit.value;
}

async function updateProjectUpdateImpl(
	runtime: Runtime.Runtime<never>,
	sql: Sql,
	input: UpdateProjectUpdateInput,
): Promise<UpdateRow> {
	if (input.health !== undefined && !HEALTHS.includes(input.health))
		throw new ValidationError("Invalid health");
	return sql.begin(async (tx) => {
		const [project] =
			await tx`SELECT organization_id FROM project WHERE id = ${input.projectId}`;
		if (!project) throw new NotFound();
		const [existing] = await tx`
			SELECT content, edit_history FROM project_update
			WHERE id = ${input.id} AND project_id = ${input.projectId}`;
		if (!existing) throw new NotFound();
		const priorRaw = existing.edit_history;
		const prior =
			typeof priorRaw === "string"
				? (JSON.parse(priorRaw) as EditEntryRow[])
				: ((priorRaw as EditEntryRow[]) ?? []);
		const history = [
			...prior,
			{
				content: existing.content as string,
				editedAt: new Date().toISOString(),
				userId: input.userId,
			},
		];
		await tx`UPDATE project_update SET
			content = COALESCE(${input.content ?? null}, content),
			health = COALESCE(${input.health ?? null}, health),
			edit_history = ${JSON.stringify(history)}::jsonb,
			updated_at = now()
			WHERE id = ${input.id}`;
		await appendProjectEventEffect(
			tx,
			project.organization_id as string,
			input.userId,
			"project:update-upserted",
			{
				id: input.id,
				projectId: input.projectId,
			},
			runtime,
		);
		const rows = await selectUpdates(tx, input.projectId, "AND u.id = $2", [
			input.id,
		]);
		return rows[0];
	});
}

export type DeleteProjectUpdateInput = {
	id: string;
	organizationId?: string;
	projectId: string;
	userId: string;
};

export const deleteProjectUpdateEffect = opService(
	"ProjectUpdates.deleteProjectUpdate",
	deleteProjectUpdateImpl,
);

export async function deleteProjectUpdate(
	sql: Sql,
	input: DeleteProjectUpdateInput,
): Promise<{ id: string }> {
	const exit = await Effect.runPromiseExit(
		deleteProjectUpdateEffect(sql, input),
	);
	if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
	return exit.value;
}

async function deleteProjectUpdateImpl(
	runtime: Runtime.Runtime<never>,
	sql: Sql,
	input: DeleteProjectUpdateInput,
): Promise<{ id: string }> {
	return sql.begin(async (tx) => {
		const [project] =
			await tx`SELECT organization_id FROM project WHERE id = ${input.projectId}`;
		if (!project) throw new NotFound();
		const rows = await tx`DELETE FROM project_update
			WHERE id = ${input.id} AND project_id = ${input.projectId}
			RETURNING id`;
		if (rows.length === 0) throw new NotFound();
		await appendProjectEventEffect(
			tx,
			project.organization_id as string,
			input.userId,
			"project:update-deleted",
			{
				id: input.id,
				projectId: input.projectId,
			},
			runtime,
		);
		return { id: input.id };
	});
}

export async function listProjectUpdates(
	sql: Sql,
	projectId: string,
): Promise<UpdateRow[]> {
	return selectUpdates(sql, projectId);
}
