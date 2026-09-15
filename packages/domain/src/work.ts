import type { Sql, TransactionSql } from "postgres";
import {
	applyStatusOrder,
	CLOSED_STATUS_SLUGS,
	STATUS_DEFINITIONS,
	STATUS_SLUGS,
} from "./status-taxonomy";
import { normalizeBoardKey, parseTicketKey } from "./ticket-key";

// --- Error values (tagged; mapped to WorkError at the HTTP boundary) ----------------------
export class WorkValidationError extends Error {
	readonly _tag = "WorkValidationError";
	constructor(readonly detail: string) {
		super(`ValidationError: ${detail}`);
	}
}
export class WorkNotFound extends Error {
	readonly _tag = "WorkNotFound";
	constructor() {
		super("NotFound");
	}
}
export class WorkConflict extends Error {
	readonly _tag = "WorkConflict";
	constructor(
		readonly code:
			| "DuplicateSlug"
			| "KeyAliasInUse"
			| "StatusInUse"
			| "BoardNotEmpty"
			| "NumberDrift",
	) {
		super(`Conflict: ${code}`);
	}
}

// --- Vocabulary ---------------------------------------------------------------------------
export const DEFAULT_TASK_STATUS_ORDER = [
	"to-do",
	"in-progress",
	"in-review",
	"done",
	"canceled",
	"duplicate",
];
export const DEFAULT_BACKLOG_STATUS_ORDER = ["triage", "planned"];
export const DEFAULT_SEED_STATUSES = [
	"to-do",
	"in-progress",
	"in-review",
	"done",
];

export function slugify(name: string): string {
	return name
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function normalizeSlug(value: string): string {
	const slug = value.toLowerCase();
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 64)
		throw new WorkValidationError("slug");
	return slug;
}

// Timestamps are read from a UTC session so `timestamp without time zone`
// serializes deterministically (fixtures and prod both pin UTC).
export function iso(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (value instanceof Date) return value.toISOString();
	return String(value);
}

function mapPgError(error: unknown): never | undefined {
	const code =
		typeof error === "object" && error !== null && "code" in error
			? String((error as { code: unknown }).code)
			: "";
	const constraint =
		typeof error === "object" && error !== null && "constraint_name" in error
			? String((error as { constraint_name: unknown }).constraint_name)
			: "";
	if (code === "23505") {
		if (constraint === "task_board_number_unique")
			throw new WorkConflict("NumberDrift");
		if (constraint === "board_organization_key_lower_unique")
			throw new WorkConflict("DuplicateSlug");
		if (constraint === "board_key_alias_organization_key_lower_unique")
			throw new WorkConflict("KeyAliasInUse");
		throw new WorkConflict("DuplicateSlug");
	}
	return undefined;
}

export type Tx = TransactionSql<Record<string, unknown>>;
/** Untyped dynamic row (postgres.js returns plain objects). */
export type AnyRow = Record<string, unknown>;

function runTx<A>(
	sql: Sql,
	org: string,
	actor: string,
	body: (
		tx: Tx,
		ctx: {
			org: string;
			actor: string;
			txid: number;
			emit: (type: string, payload: unknown) => Promise<void>;
		},
	) => Promise<A>,
) {
	return sql.begin(async (tx) => {
		const [transaction] = await tx`SELECT pg_current_xact_id()::text AS txid`;
		const txid = Number(BigInt(transaction.txid));
		let seq: bigint | null = null;
		const emit = async (type: string, payload: unknown) => {
			await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
			const [counter] =
				await tx`UPDATE org_event_counter SET seq = seq + 1 WHERE org = ${org} RETURNING seq::text AS seq`;
			seq = BigInt(counter.seq);
			await tx`INSERT INTO event(org, seq, plugin_type, actor, payload, schema_version, txid)
				VALUES (${org}, ${seq.toString()}, ${type}, ${actor}, ${tx.json(payload as never)}, 1, ${transaction.txid})`;
		};
		try {
			return await body(tx, { org, actor, txid, emit });
		} catch (error) {
			mapPgError(error);
			throw error;
		}
	});
}

// --- Shared row helpers --------------------------------------------------------------------
async function boardById(tx: Tx, org: string, id: string): Promise<BoardRow> {
	const [row] = await tx<
		BoardRow[]
	>`SELECT * FROM "board" WHERE id = ${id} AND organization_id = ${org}`;
	if (!row) throw new WorkNotFound();
	return row;
}

async function ticketRowById(tx: Tx, org: string, id: string) {
	const [row] = await tx<
		TicketRow[]
	>`SELECT t.*, b.slug AS board_slug, b.organization_id AS org_id
		FROM task t JOIN "board" b ON b.id = t.board_id
		WHERE t.id = ${id} AND b.organization_id = ${org}`;
	if (!row) throw new WorkNotFound();
	return row;
}

/** Serialized claim (fork claim-task-numbers.ts): one UPDATE takes the board
 * row lock; GREATEST(counter, max(number)) self-heals drift. Returns first number. */
export async function claimTicketNumbers(
	tx: Tx,
	boardId: string,
	count: number,
): Promise<number> {
	const [row] = await tx<{ last_task_number: number }[]>`
		UPDATE "board" SET last_task_number = GREATEST(
			last_task_number,
			COALESCE((SELECT MAX(number) FROM task WHERE board_id = "board".id), 0)
		) + ${count}
		WHERE id = ${boardId}
		RETURNING last_task_number`;
	if (!row) throw new WorkNotFound();
	return row.last_task_number - count + 1;
}

export async function validStatusesForBoard(
	tx: Tx,
	boardId: string,
): Promise<string[]> {
	const columns = await tx<{ slug: string }[]>`
		SELECT slug FROM "column" WHERE board_id = ${boardId} ORDER BY position, created_at`;
	return [
		...columns.map((c) => c.slug),
		...STATUS_SLUGS.filter((s) => !columns.some((c) => c.slug === s)),
	];
}

async function resolveColumn(
	tx: Tx,
	boardId: string,
	status: string,
): Promise<string | null> {
	const [column] = await tx<{ id: string }[]>`
		SELECT id FROM "column" WHERE board_id = ${boardId} AND slug = ${status} LIMIT 1`;
	return column?.id ?? null;
}

export function ticketKeyOf(
	boardSlug: string,
	number: number | null,
): string | null {
	if (number === null) return null;
	const parsed = parseTicketKey(`${normalizeBoardKey(boardSlug)}-${number}`);
	return parsed ? `${parsed.boardKey}-${parsed.number}` : null;
}

// --- Public row mappers (§2 snake → §3 camel) ----------------------------------------------
export type BoardRow = {
	id: string;
	organization_id: string;
	slug: string;
	icon: string | null;
	name: string;
	description: string | null;
	created_at: Date | string;
	is_public: boolean | null;
	archived_at: Date | string | null;
	last_task_number: number;
	org_privilege: string | null;
	task_status_order: string[];
	backlog_status_order: string[];
	subtask_depth_limit: number;
	default_assignee_id: string | null;
	default_assignee_team_id: string | null;
};

export function boardPublic(row: BoardRow) {
	return {
		id: row.id,
		organizationId: row.organization_id,
		slug: row.slug,
		icon: row.icon,
		name: row.name,
		description: row.description,
		createdAt: iso(row.created_at),
		isPublic: row.is_public,
		archivedAt: iso(row.archived_at),
		lastTaskNumber: row.last_task_number,
		orgPrivilege: row.org_privilege,
		taskStatusOrder: row.task_status_order,
		backlogStatusOrder: row.backlog_status_order,
		subtaskDepthLimit: row.subtask_depth_limit,
		defaultAssigneeId: row.default_assignee_id,
		defaultAssigneeTeamId: row.default_assignee_team_id,
	};
}

export type StatusRow = {
	id: string;
	board_id: string;
	name: string;
	slug: string;
	position: number;
	icon: string | null;
	color: string | null;
	is_final: boolean;
	created_at: Date | string;
	updated_at: Date | string;
};

export function statusPublic(row: StatusRow) {
	return {
		id: row.id,
		boardId: row.board_id,
		name: row.name,
		slug: row.slug,
		position: row.position,
		icon: row.icon,
		color: row.color,
		isFinal: row.is_final,
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at),
	};
}

export type TicketRow = {
	id: string;
	board_id: string;
	position: number | null;
	number: number | null;
	assignee_id: string | null;
	team_assignee_id: string | null;
	title: string;
	description: string | null;
	description_history: Array<{
		content: string | null;
		editedAt: string;
		userId: string;
		sealed?: boolean;
	}>;
	status: string;
	column_id: string | null;
	priority: string | null;
	milestone_id: string | null;
	archived_at: Date | string | null;
	archived_by: string | null;
	deleted_at: Date | string | null;
	deleted_by: string | null;
	start_date: Date | string | null;
	due_date: Date | string | null;
	created_at: Date | string;
	updated_at: Date | string;
	board_slug?: string;
};

export function ticketPublic(row: TicketRow) {
	return {
		id: row.id,
		boardId: row.board_id,
		position: row.position,
		number: row.number,
		assigneeId: row.assignee_id,
		teamAssigneeId: row.team_assignee_id,
		title: row.title,
		description: row.description,
		descriptionHistory: row.description_history ?? [],
		status: row.status,
		columnId: row.column_id,
		priority: row.priority,
		milestoneId: row.milestone_id,
		archivedAt: iso(row.archived_at),
		archivedBy: row.archived_by,
		deletedAt: iso(row.deleted_at),
		deletedBy: row.deleted_by,
		startDate: iso(row.start_date),
		dueDate: iso(row.due_date),
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at),
		key: ticketKeyOf(row.board_slug ?? "", row.number),
	};
}

export function keyAliasPublic(row: Record<string, unknown>) {
	return {
		id: row.id as string,
		organizationId: row.organization_id as string,
		boardId: row.board_id as string,
		key: row.key as string,
		createdAt: iso(row.created_at),
	};
}

export function labelPublic(row: Record<string, unknown>) {
	return {
		id: row.id as string,
		name: row.name as string,
		color: row.color as string,
		source: row.source as "kaneo" | "repo",
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at),
		taskId: (row.task_id as string | null) ?? null,
		organizationId: (row.organization_id as string | null) ?? null,
	};
}

export function templatePublic(row: Record<string, unknown>) {
	return {
		id: row.id as string,
		organizationId: row.organization_id as string,
		name: row.name as string,
		data: row.data,
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at),
	};
}

export function flagTypePublic(row: Record<string, unknown>) {
	return {
		id: row.id as string,
		boardId: row.board_id as string,
		name: row.name as string,
		color: (row.color as string | null) ?? null,
		icon: (row.icon as string | null) ?? null,
		position: row.position as number,
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at),
	};
}

export function taskFlagPublic(row: Record<string, unknown>) {
	return {
		id: row.id as string,
		taskId: row.task_id as string,
		flagTypeId: row.flag_type_id as string,
		flaggedBy: (row.flagged_by as string | null) ?? null,
		targetUserId: (row.target_user_id as string | null) ?? null,
		targetTeamId: (row.target_team_id as string | null) ?? null,
		note: (row.note as string | null) ?? null,
		resolveNote: (row.resolve_note as string | null) ?? null,
		resolvedAt: iso(row.resolved_at),
		resolvedBy: (row.resolved_by as string | null) ?? null,
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at),
	};
}

// --- Boards ---------------------------------------------------------------------------------
export async function createBoard(
	sql: Sql,
	org: string,
	actor: string,
	input: {
		id: string;
		name: string;
		slug?: string;
		icon?: string;
		description?: string;
	},
) {
	const slug = normalizeSlug(input.slug ?? slugify(input.name));
	return runTx(sql, org, actor, async (tx, { txid, emit }) => {
		await tx`INSERT INTO "board" (id, organization_id, slug, name, icon, description, created_at)
			VALUES (${input.id}, ${org}, ${slug}, ${input.name}, ${input.icon ?? "Layout"}, ${input.description ?? null}, now())`;
		// Seed the four default statuses positionally, atomically with the board.
		const seeded: StatusRow[] = [];
		for (
			let position = 0;
			position < DEFAULT_SEED_STATUSES.length;
			position++
		) {
			const slugStatus = DEFAULT_SEED_STATUSES[position];
			const definition = STATUS_DEFINITIONS.find((d) => d.slug === slugStatus);
			const row: StatusRow = {
				id: `st-${input.id}-${position}`,
				board_id: input.id,
				name: definition?.name ?? slugStatus,
				slug: slugStatus,
				position,
				icon: null,
				color: null,
				is_final: slugStatus === "done",
				created_at: new Date(),
				updated_at: new Date(),
			};
			await tx`INSERT INTO "column" (id, board_id, name, slug, position, icon, color, is_final, created_at, updated_at)
				VALUES (${row.id}, ${row.board_id}, ${row.name}, ${row.slug}, ${row.position}, ${row.icon}, ${row.color}, ${row.is_final}, now(), now())`;
			seeded.push(row);
		}
		const board = await boardById(tx, org, input.id);
		await emit("work:board-upserted", {
			id: board.id,
			row: boardPublic(board),
		});
		for (const status of seeded)
			await emit("work:status-upserted", {
				id: status.id,
				row: statusPublic(status),
			});
		return { data: boardPublic(board), txid };
	});
}

export async function updateBoard(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
	patch: {
		name?: string;
		icon?: string | null;
		description?: string | null;
		taskStatusOrder?: string[];
		backlogStatusOrder?: string[];
		defaultAssigneeId?: string | null;
		defaultAssigneeTeamId?: string | null;
	},
) {
	return runTx(sql, org, actor, async (tx, { txid, emit }) => {
		const board = await boardById(tx, org, id);
		for (const slug of patch.taskStatusOrder ?? [])
			if (!STATUS_SLUGS.includes(slug))
				throw new WorkValidationError("taskStatusOrder");
		for (const slug of patch.backlogStatusOrder ?? [])
			if (!STATUS_SLUGS.includes(slug))
				throw new WorkValidationError("backlogStatusOrder");
		if (patch.defaultAssigneeId) {
			const [user] =
				await tx`SELECT id FROM "user" WHERE id = ${patch.defaultAssigneeId}`;
			if (!user) throw new WorkValidationError("defaultAssigneeId");
		}
		if (patch.defaultAssigneeTeamId) {
			const [team] =
				await tx`SELECT id FROM team WHERE id = ${patch.defaultAssigneeTeamId}`;
			if (!team) throw new WorkValidationError("defaultAssigneeTeamId");
		}
		await tx`UPDATE "board" SET
			name = ${patch.name ?? board.name},
			icon = ${patch.icon !== undefined ? patch.icon : board.icon},
			description = ${patch.description !== undefined ? patch.description : board.description},
			task_status_order = ${tx.json(patch.taskStatusOrder ?? board.task_status_order)},
			backlog_status_order = ${tx.json(patch.backlogStatusOrder ?? board.backlog_status_order)},
			default_assignee_id = ${patch.defaultAssigneeId !== undefined ? patch.defaultAssigneeId : board.default_assignee_id},
			default_assignee_team_id = ${patch.defaultAssigneeTeamId !== undefined ? patch.defaultAssigneeTeamId : board.default_assignee_team_id}
			WHERE id = ${id}`;
		const updated = await boardById(tx, org, id);
		await emit("work:board-upserted", { id, row: boardPublic(updated) });
		return { data: boardPublic(updated), txid };
	});
}

export async function deleteBoard(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
) {
	return runTx(sql, org, actor, async (tx, { txid, emit }) => {
		const board = await boardById(tx, org, id);
		// "Empty" counts tickets only: every board atomically seeds 4 statuses
		// (T04), so requiring zero statuses would make deletion impossible.
		// Statuses and aliases cascade with the board (stricter than fork's
		// unconditional cascade, which discarded tickets).
		const [tasks] =
			await tx`SELECT count(*)::int AS count FROM task WHERE board_id = ${id}`;
		if (tasks.count > 0) throw new WorkConflict("BoardNotEmpty");
		// Empty board: cascade deletes its aliases.
		await tx`DELETE FROM "board" WHERE id = ${id}`;
		await emit("work:board-deleted", { id: board.id });
		return { data: { id: board.id }, txid };
	});
}

export async function archiveBoard(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
	archived: boolean,
) {
	return runTx(sql, org, actor, async (tx, { txid, emit }) => {
		await boardById(tx, org, id);
		await tx`UPDATE "board" SET archived_at = ${archived ? new Date() : null} WHERE id = ${id}`;
		const updated = await boardById(tx, org, id);
		await emit("work:board-upserted", { id, row: boardPublic(updated) });
		return { data: boardPublic(updated), txid };
	});
}

/** Resolve a board by slug OR key alias (old KEY-seq URLs keep resolving). */
export async function resolveBoardRef(
	sql: Sql,
	org: string,
	keyOrSlug: string,
): Promise<BoardRow | null> {
	const lower = keyOrSlug.toLowerCase();
	const [row] = await sql<BoardRow[]>`SELECT * FROM "board"
		WHERE organization_id = ${org} AND (
			lower(slug) = ${lower}
			OR id IN (SELECT board_id FROM board_key_alias WHERE organization_id = ${org} AND lower(key) = ${lower})
		) LIMIT 1`;
	return row ?? null;
}

/** PUT /boards/:id/key — board slug becomes `key`; prior key is written as an
 * alias so old URLs and KEY-seq references keep resolving. */
export async function setBoardKey(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
	key: string,
) {
	const normalized = normalizeBoardKey(key);
	if (!/^[A-Za-z][A-Za-z0-9-]{0,19}$/.test(key))
		throw new WorkValidationError("key");
	return runTx(sql, org, actor, async (tx, { txid, emit }) => {
		const board = await boardById(tx, org, id);
		const lower = normalized.toLowerCase();
		if (lower !== board.slug.toLowerCase()) {
			// Stricter than fork: a key may not collide with any OTHER board's slug
			// or alias in the org (ambiguous resolution).
			const [clashingBoard] =
				await tx`SELECT id FROM "board" WHERE organization_id = ${org} AND id <> ${id} AND lower(slug) = ${lower}`;
			if (clashingBoard) throw new WorkConflict("KeyAliasInUse");
			const [clashingAlias] =
				await tx`SELECT id FROM board_key_alias WHERE organization_id = ${org} AND lower(key) = ${lower}`;
			if (clashingAlias) throw new WorkConflict("KeyAliasInUse");
			const [sameAlias] =
				await tx`SELECT id FROM board_key_alias WHERE organization_id = ${org} AND board_id = ${id} AND lower(key) = ${lower}`;
			if (!sameAlias) {
				const aliasId = `ka-${crypto.randomUUID()}`;
				await tx`INSERT INTO board_key_alias (id, organization_id, board_id, key, created_at)
					VALUES (${aliasId}, ${org}, ${id}, ${board.slug}, now())`;
				const [alias] = await tx<
					AnyRow[]
				>`SELECT * FROM board_key_alias WHERE id = ${aliasId}`;
				await emit("work:board-key-upserted", {
					id: aliasId,
					row: keyAliasPublic(alias),
				});
			}
		}
		await tx`UPDATE "board" SET slug = ${normalized} WHERE id = ${id}`;
		const updated = await boardById(tx, org, id);
		await emit("work:board-upserted", { id, row: boardPublic(updated) });
		return { data: boardPublic(updated), txid };
	});
}

// --- Statuses (column rows; virtuals are client-static) --------------------------------------
export async function listStatuses(sql: Sql, org: string, boardId: string) {
	return sql.begin(async (tx) => {
		const board = await boardById(tx, org, boardId);
		const rows = await tx<
			StatusRow[]
		>`SELECT * FROM "column" WHERE board_id = ${boardId} ORDER BY position, created_at`;
		const ordered = applyStatusOrder(
			rows.map((r) => r.slug),
			board.task_status_order,
		);
		const bySlug = new Map(rows.map((r) => [r.slug, r]));
		const orderedRows = ordered
			.map((slug) => bySlug.get(slug))
			.filter((r): r is StatusRow => Boolean(r));
		// Virtual statuses appended canonically (no rows — markers only).
		const rowSlugs = new Set(rows.map((r) => r.slug));
		const virtuals = STATUS_SLUGS.filter((s) => !rowSlugs.has(s));
		return {
			statuses: [
				...orderedRows.map(statusPublic),
				...virtuals.map((slug) => ({
					id: `virtual:${slug}`,
					boardId,
					name: STATUS_DEFINITIONS.find((d) => d.slug === slug)?.name ?? slug,
					slug,
					position: orderedRows.length + virtuals.indexOf(slug),
					icon: null,
					color: null,
					isFinal: CLOSED_STATUS_SLUGS.includes(slug),
					createdAt: iso(board.created_at) ?? "",
					updatedAt: iso(board.created_at) ?? "",
				})),
			],
		};
	});
}

export async function createStatus(
	sql: Sql,
	org: string,
	actor: string,
	boardId: string,
	input: {
		id: string;
		name: string;
		slug?: string;
		position?: number;
		icon?: string;
		color?: string;
		isFinal?: boolean;
	},
) {
	const slug = normalizeSlug(input.slug ?? slugify(input.name));
	return runTx(sql, org, actor, async (tx, { txid, emit }) => {
		await boardById(tx, org, boardId);
		const [existing] =
			await tx`SELECT id FROM "column" WHERE board_id = ${boardId} AND slug = ${slug}`;
		if (existing) throw new WorkConflict("DuplicateSlug");
		await tx`INSERT INTO "column" (id, board_id, name, slug, position, icon, color, is_final, created_at, updated_at)
			VALUES (${input.id}, ${boardId}, ${input.name}, ${slug}, ${input.position ?? 0}, ${input.icon ?? null}, ${input.color ?? null}, ${input.isFinal ?? false}, now(), now())`;
		const [row] = await tx<
			StatusRow[]
		>`SELECT * FROM "column" WHERE id = ${input.id}`;
		await emit("work:status-upserted", {
			id: input.id,
			row: statusPublic(row),
		});
		return { data: statusPublic(row), txid };
	});
}

export async function updateStatus(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
	patch: {
		name?: string;
		icon?: string | null;
		color?: string | null;
		position?: number;
		isFinal?: boolean;
	},
) {
	return runTx(sql, org, actor, async (tx, { txid, emit }) => {
		const [row] = await tx<StatusRow[]>`SELECT c.* FROM "column" c
			JOIN "board" b ON b.id = c.board_id WHERE c.id = ${id} AND b.organization_id = ${org}`;
		if (!row) throw new WorkNotFound();
		await tx`UPDATE "column" SET
			name = ${patch.name ?? row.name},
			icon = ${patch.icon !== undefined ? patch.icon : row.icon},
			color = ${patch.color !== undefined ? patch.color : row.color},
			position = ${patch.position ?? row.position},
			is_final = ${patch.isFinal ?? row.is_final},
			updated_at = now()
			WHERE id = ${id}`; // slug immutable
		const [updated] = await tx<
			StatusRow[]
		>`SELECT * FROM "column" WHERE id = ${id}`;
		await emit("work:status-upserted", { id, row: statusPublic(updated) });
		return { data: statusPublic(updated), txid };
	});
}

export async function deleteStatus(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
) {
	return runTx(sql, org, actor, async (tx, { txid, emit }) => {
		const [row] = await tx<StatusRow[]>`SELECT c.* FROM "column" c
			JOIN "board" b ON b.id = c.board_id WHERE c.id = ${id} AND b.organization_id = ${org}`;
		if (!row) throw new WorkNotFound();
		const [referenced] =
			await tx`SELECT count(*)::int AS count FROM task WHERE board_id = ${row.board_id} AND (column_id = ${id} OR status = ${row.slug})`;
		if (referenced.count > 0) throw new WorkConflict("StatusInUse");
		await tx`DELETE FROM "column" WHERE id = ${id}`;
		await emit("work:status-deleted", { id });
		return { data: { id }, txid };
	});
}

export async function reorderStatuses(
	sql: Sql,
	org: string,
	actor: string,
	boardId: string,
	ids: string[],
) {
	return runTx(sql, org, actor, async (tx, { txid, emit }) => {
		await boardById(tx, org, boardId);
		const rows = await tx<
			StatusRow[]
		>`SELECT * FROM "column" WHERE board_id = ${boardId}`;
		const current = new Set(rows.map((r) => r.id));
		if (ids.length !== current.size || !ids.every((id) => current.has(id)))
			throw new WorkValidationError("ids: complete permutation required");
		for (const [position, id] of ids.entries())
			await tx`UPDATE "column" SET position = ${position}, updated_at = now() WHERE id = ${id} AND board_id = ${boardId}`;
		for (const id of ids) {
			const [row] = await tx<
				StatusRow[]
			>`SELECT * FROM "column" WHERE id = ${id}`;
			await emit("work:status-upserted", { id, row: statusPublic(row) });
		}
		return { data: { ids }, txid };
	});
}

// --- Tickets ---------------------------------------------------------------------------------
export async function getTicket(sql: Sql, org: string, id: string) {
	return sql.begin(async (tx) => {
		const row = await ticketRowById(tx, org, id);
		return { ticket: ticketPublic(row) };
	});
}

export async function listTickets(
	sql: Sql,
	org: string,
	boardId: string,
	query: {
		status?: string;
		assigneeId?: string;
		teamId?: string;
		includeArchived?: boolean;
		includeDeleted?: boolean;
	},
) {
	return sql.begin(async (tx) => {
		await boardById(tx, org, boardId);
		const rows = await tx<TicketRow[]>`
			SELECT t.*, b.slug AS board_slug FROM task t JOIN "board" b ON b.id = t.board_id
			WHERE t.board_id = ${boardId}
				${query.status ? sql`AND t.status = ${query.status}` : sql``}
				${query.assigneeId ? sql`AND t.assignee_id = ${query.assigneeId}` : sql``}
				${query.teamId ? sql`AND t.team_assignee_id = ${query.teamId}` : sql``}
				${query.includeArchived ? sql`` : sql`AND t.archived_at IS NULL`}
				${query.includeDeleted ? sql`` : sql`AND t.deleted_at IS NULL`}
			ORDER BY t.number`;
		return { tickets: rows.map(ticketPublic) };
	});
}

export async function createTicket(
	sql: Sql,
	org: string,
	actor: string,
	boardId: string,
	input: {
		id: string;
		title: string;
		description?: string;
		status?: string;
		priority?: string;
		assigneeId?: string | null;
		teamId?: string | null;
		startDate?: string | null;
		dueDate?: string | null;
		labels?: string[];
		templateId?: string;
	},
) {
	const priorities = ["no-priority", "low", "medium", "high", "urgent"];
	if (input.priority && !priorities.includes(input.priority))
		throw new WorkValidationError("priority");
	if (input.templateId && input.labels)
		throw new WorkValidationError(
			"templateId and labels are mutually exclusive",
		);
	return sql.begin(async (tx) => {
		const board = await boardById(tx, org, boardId);
		const status = input.status ?? "to-do";
		const valid = await validStatusesForBoard(tx, boardId);
		if (!valid.includes(status))
			throw new WorkValidationError(`status ${status}`);
		const columnId = await resolveColumn(tx, boardId, status);
		let assigneeId = input.assigneeId ?? undefined;
		let teamId = input.teamId ?? undefined;
		let title = input.title;
		let description = input.description ?? null;
		let priority = input.priority ?? "low";
		let startDate = input.startDate ?? null;
		let dueDate = input.dueDate ?? null;
		let labelIds = input.labels ?? null;
		if (input.templateId) {
			const [template] = await tx<
				{ data: TemplateDataValue; organization_id: string }[]
			>`
				SELECT data, organization_id FROM task_template WHERE id = ${input.templateId}`;
			if (!template || template.organization_id !== board.organization_id)
				throw new WorkNotFound();
			const data = template.data;
			title = data.title;
			description = data.description ?? description;
			priority = data.priority ?? priority;
			startDate = data.startDate ?? startDate;
			dueDate = data.dueDate ?? dueDate;
			// Offsets shift the base dates (fork task-template-date-offset semantics).
			const shift = (
				base: string | null,
				offset: string | null | undefined,
			) => {
				if (!base || !offset) return base ?? null;
				const parsed = /^([+-]?\d+)([d])$/.exec(offset);
				if (!parsed) return base;
				const days = Number(parsed[1]);
				const date = new Date(`${base}T00:00:00Z`);
				date.setUTCDate(date.getUTCDate() + days);
				return date.toISOString().slice(0, 10);
			};
			startDate = shift(startDate, data.startDateOffset);
			dueDate = shift(dueDate, data.dueDateOffset);
			if (!assigneeId && !teamId) {
				// Board defaults fill when the request omits them.
				assigneeId = board.default_assignee_id ?? undefined;
				teamId = board.default_assignee_team_id ?? undefined;
			}
			labelIds = data.labels ?? null;
		}
		if (assigneeId) {
			const [user] = await tx`SELECT id FROM "user" WHERE id = ${assigneeId}`;
			if (!user) throw new WorkValidationError("assigneeId");
		}
		if (teamId) {
			const [team] = await tx`SELECT id FROM team WHERE id = ${teamId}`;
			if (!team) throw new WorkValidationError("teamId");
		}
		if (labelIds)
			for (const labelId of labelIds) {
				const [label] = await tx`SELECT id FROM label WHERE id = ${labelId}`;
				if (!label) throw new WorkValidationError("labels");
			}
		// Serialized claim inside the same tx (T08/T09).
		const number = await claimTicketNumbers(tx, boardId, 1);
		const [maxPosition] =
			await tx`SELECT COALESCE(MAX(position), 0)::int AS max FROM task WHERE board_id = ${boardId} AND status = ${status}`;
		await tx`INSERT INTO task (id, board_id, position, number, assignee_id, team_assignee_id, title, description, description_history, status, column_id, priority, start_date, due_date, created_at, updated_at)
			VALUES (${input.id}, ${boardId}, ${maxPosition.max + 1}, ${number}, ${assigneeId ?? null}, ${teamId ?? null}, ${title}, ${description}, ${tx.json([])}, ${status}, ${columnId}, ${priority}, ${startDate}, ${dueDate}, now(), now())`;
		if (labelIds)
			for (const labelId of labelIds)
				await tx`UPDATE label SET task_id = ${input.id} WHERE id = ${labelId}`;
		const [row] = await tx<
			TicketRow[]
		>`SELECT t.*, b.slug AS board_slug FROM task t JOIN "board" b ON b.id = t.board_id WHERE t.id = ${input.id}`;
		const txid = await emitInTx(tx, org, actor, "work:ticket-upserted", {
			id: input.id,
			row: ticketPublic(row),
		});
		return { data: ticketPublic(row), txid };
	});
}

type TemplateDataValue = {
	title: string;
	description: string | null;
	priority: string | null;
	startDate: string | null;
	dueDate: string | null;
	status?: string | null;
	labels?: string[];
	startDateOffset?: string | null;
	dueDateOffset?: string | null;
};

/** Event append usable inside a caller-managed transaction (runTx wrapper
 * covers the rest); emits exactly one event per call with a fresh counter seq. */
async function emitInTx(
	tx: Tx,
	org: string,
	actor: string,
	type: string,
	payload: unknown,
) {
	await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
	const [counter] =
		await tx`UPDATE org_event_counter SET seq = seq + 1 WHERE org = ${org} RETURNING seq::text AS seq`;
	const [transaction] = await tx`SELECT pg_current_xact_id()::text AS txid`;
	await tx`INSERT INTO event(org, seq, plugin_type, actor, payload, schema_version, txid)
		VALUES (${org}, ${counter.seq}, ${type}, ${actor}, ${tx.json(payload as never)}, 1, ${transaction.txid})`;
	return Number(BigInt(transaction.txid));
}

export async function updateTicket(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
	patch: {
		title?: string;
		description?: string;
		priority?: string;
		assigneeId?: string | null;
		teamId?: string | null;
		startDate?: string | null;
		dueDate?: string | null;
	},
) {
	const priorities = ["no-priority", "low", "medium", "high", "urgent"];
	if (patch.priority && !priorities.includes(patch.priority))
		throw new WorkValidationError("priority");
	return sql.begin(async (tx) => {
		const row = await ticketRowById(tx, org, id);
		const sealed = [...(row.description_history ?? [])];
		if (
			patch.description !== undefined &&
			patch.description !== row.description
		)
			sealed.push({
				content: row.description,
				editedAt: new Date().toISOString(),
				userId: actor,
				sealed: true,
			});
		await tx`UPDATE task SET
			title = ${patch.title ?? row.title},
			description = ${patch.description !== undefined ? patch.description : row.description},
			priority = ${patch.priority ?? row.priority},
			assignee_id = ${patch.assigneeId !== undefined ? patch.assigneeId : row.assignee_id},
			team_assignee_id = ${patch.teamId !== undefined ? patch.teamId : row.team_assignee_id},
			start_date = ${patch.startDate !== undefined ? patch.startDate : row.start_date},
			due_date = ${patch.dueDate !== undefined ? patch.dueDate : row.due_date},
			description_history = ${tx.json(sealed)},
			updated_at = now()
			WHERE id = ${id}`;
		const [updated] = await tx<
			TicketRow[]
		>`SELECT t.*, b.slug AS board_slug FROM task t JOIN "board" b ON b.id = t.board_id WHERE t.id = ${id}`;
		const txid = await emitInTx(tx, org, actor, "work:ticket-upserted", {
			id,
			row: ticketPublic(updated),
		});
		return { data: ticketPublic(updated), txid };
	});
}

/** PUT /tickets/:id/status — taxonomy∪board validation; emits status-changed. */
export async function setTicketStatus(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
	status: string,
) {
	return sql.begin(async (tx) => {
		const row = await ticketRowById(tx, org, id);
		const valid = await validStatusesForBoard(tx, row.board_id);
		if (!valid.includes(status))
			throw new WorkValidationError(`status ${status}`);
		if (status !== row.status) {
			const columnId = await resolveColumn(tx, row.board_id, status);
			const sealedHistory = [...(row.description_history ?? [])];
			// Closing (done/canceled/duplicate) seals the description history
			// window exactly like the fork's update-task-status.
			if (
				CLOSED_STATUS_SLUGS.includes(status) &&
				!CLOSED_STATUS_SLUGS.includes(row.status)
			)
				sealedHistory.push({
					content: row.description,
					editedAt: new Date().toISOString(),
					userId: actor,
					sealed: true,
				});
			await tx`UPDATE task SET status = ${status}, column_id = ${columnId}, description_history = ${tx.json(sealedHistory)}, updated_at = now() WHERE id = ${id}`;
		}
		const [updated] = await tx<
			TicketRow[]
		>`SELECT t.*, b.slug AS board_slug FROM task t JOIN "board" b ON b.id = t.board_id WHERE t.id = ${id}`;
		const txid = await emitInTx(tx, org, actor, "work:ticket-upserted", {
			id,
			row: ticketPublic(updated),
		});
		await emitInTx(tx, org, actor, "work:ticket-status-changed", {
			id,
			boardId: row.board_id,
			from: row.status,
			to: status,
		});
		return { data: ticketPublic(updated), txid };
	});
}

/** Move board→board: claims destination number, remaps status (first column
 * when omitted), single tx. Fork move-task.ts minus project cross-links. */
export async function moveTicket(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
	destinationBoardId: string,
	destinationStatus?: string,
	position?: number,
) {
	return sql.begin(async (tx) => {
		const row = await ticketRowById(tx, org, id);
		const [destination] = await tx<
			BoardRow[]
		>`SELECT * FROM "board" WHERE id = ${destinationBoardId} AND organization_id = ${org}`;
		if (!destination) throw new WorkNotFound();
		const columns = await tx<
			{ slug: string }[]
		>`SELECT slug FROM "column" WHERE board_id = ${destinationBoardId} ORDER BY position, created_at`;
		if (columns.length === 0)
			throw new WorkValidationError("destination board has no workflow");
		// Source statuses that are virtual on the destination (e.g. 'done' with
		// no matching column) fall through to the first column (fork semantics).
		const resolvedStatus =
			destinationStatus ??
			columns.find((c) => c.slug === row.status)?.slug ??
			(STATUS_SLUGS.includes(row.status) ? row.status : columns[0].slug);
		if (destinationStatus && !columns.some((c) => c.slug === destinationStatus))
			throw new WorkValidationError("status not valid on destination");
		const number = await claimTicketNumbers(tx, destinationBoardId, 1);
		const nextPosition =
			position ??
			(
				await tx<
					{ max: number }[]
				>`SELECT COALESCE(MAX(position), 0)::int AS max FROM task WHERE board_id = ${destinationBoardId} AND status = ${resolvedStatus}`
			)[0].max + 1;
		const columnId = await resolveColumn(
			tx,
			destinationBoardId,
			resolvedStatus,
		);
		await tx`UPDATE task SET board_id = ${destinationBoardId}, status = ${resolvedStatus}, column_id = ${columnId}, number = ${number}, position = ${nextPosition}, updated_at = now() WHERE id = ${id}`;
		const [updated] = await tx<
			TicketRow[]
		>`SELECT t.*, b.slug AS board_slug FROM task t JOIN "board" b ON b.id = t.board_id WHERE t.id = ${id}`;
		const txid = await emitInTx(tx, org, actor, "work:ticket-upserted", {
			id,
			row: ticketPublic(updated),
		});
		return { data: ticketPublic(updated), txid };
	});
}

export async function reorderTickets(
	sql: Sql,
	org: string,
	actor: string,
	boardId: string,
	updates: Array<{ id: string; position: number; status?: string }>,
) {
	return sql.begin(async (tx) => {
		await boardById(tx, org, boardId);
		const ids = updates.map((u) => u.id);
		if (new Set(ids).size !== ids.length)
			throw new WorkValidationError("duplicate ids");
		const placeholders = ids.map((_, index) => `$${index + 2}`).join(", ");
		const rows = (await tx.unsafe(
			`SELECT id FROM task WHERE board_id = $1 AND id IN (${placeholders})`,
			[boardId, ...ids],
		)) as Array<{ id: string }>;
		if (rows.length !== updates.length)
			throw new WorkValidationError("every task must belong to the board");
		for (const update of updates) {
			const status = update.status;
			if (status !== undefined) {
				const valid = await validStatusesForBoard(tx, boardId);
				if (!valid.includes(status))
					throw new WorkValidationError(`status ${status}`);
			}
			const columnId =
				status === undefined ? null : await resolveColumn(tx, boardId, status);
			if (status !== undefined)
				await tx`UPDATE task SET position = ${update.position}, status = ${status}, column_id = ${columnId}, updated_at = now() WHERE id = ${update.id} AND board_id = ${boardId}`;
			else
				await tx`UPDATE task SET position = ${update.position}, updated_at = now() WHERE id = ${update.id} AND board_id = ${boardId}`;
		}
		let txid = 0;
		for (const id of ids) {
			const [updated] = await tx<
				TicketRow[]
			>`SELECT t.*, b.slug AS board_slug FROM task t JOIN "board" b ON b.id = t.board_id WHERE t.id = ${id}`;
			txid = await emitInTx(tx, org, actor, "work:ticket-upserted", {
				id,
				row: ticketPublic(updated),
			});
		}
		return { data: { ids }, txid };
	});
}

export async function bulkPatchTickets(
	sql: Sql,
	org: string,
	actor: string,
	ids: string[],
	patch: {
		status?: string;
		priority?: string;
		assigneeId?: string | null;
		teamId?: string | null;
	},
) {
	const priorities = ["no-priority", "low", "medium", "high", "urgent"];
	if (patch.priority && !priorities.includes(patch.priority))
		throw new WorkValidationError("priority");
	return sql.begin(async (tx) => {
		const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
		const rows = (await tx.unsafe(
			`SELECT t.*, b.slug AS board_slug, b.organization_id AS org_id FROM task t JOIN "board" b ON b.id = t.board_id WHERE t.id IN (${placeholders})`,
			[...ids],
		)) as TicketRow[];
		if (rows.length !== ids.length) throw new WorkNotFound();
		const boards = new Map<string, string[]>();
		for (const row of rows) {
			if ((row as unknown as { org_id: string }).org_id !== org)
				throw new WorkNotFound();
			if (patch.status !== undefined) {
				if (!boards.has(row.board_id))
					boards.set(
						row.board_id,
						await validStatusesForBoard(tx, row.board_id),
					);
				if (!boards.get(row.board_id)?.includes(patch.status))
					throw new WorkValidationError(`status ${patch.status}`);
			}
		}
		for (const row of rows) {
			let columnId = row.column_id;
			if (patch.status !== undefined)
				columnId = await resolveColumn(tx, row.board_id, patch.status);
			await tx`UPDATE task SET
				status = ${patch.status ?? row.status},
				column_id = ${columnId},
				priority = ${patch.priority ?? row.priority},
				assignee_id = ${patch.assigneeId !== undefined ? patch.assigneeId : row.assignee_id},
				team_assignee_id = ${patch.teamId !== undefined ? patch.teamId : row.team_assignee_id},
				updated_at = now()
				WHERE id = ${row.id}`;
			const [updated] = await tx<
				TicketRow[]
			>`SELECT t.*, b.slug AS board_slug FROM task t JOIN "board" b ON b.id = t.board_id WHERE t.id = ${row.id}`;
			await emitInTx(tx, org, actor, "work:ticket-upserted", {
				id: row.id,
				row: ticketPublic(updated),
			});
		}
		const [transaction] = await tx`SELECT pg_current_xact_id()::text AS txid`;
		return { data: { ids }, txid: Number(BigInt(transaction.txid)) };
	});
}

export async function softDeleteTicket(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
) {
	return sql.begin(async (tx) => {
		await ticketRowById(tx, org, id);
		await tx`UPDATE task SET deleted_at = now(), deleted_by = ${actor} WHERE id = ${id}`;
		const txid = await emitInTx(tx, org, actor, "work:ticket-deleted", { id });
		return { data: { id }, txid };
	});
}

export async function restoreTicket(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
) {
	return sql.begin(async (tx) => {
		await ticketRowById(tx, org, id);
		await tx`UPDATE task SET deleted_at = NULL, deleted_by = NULL WHERE id = ${id}`;
		const [updated] = await tx<
			TicketRow[]
		>`SELECT t.*, b.slug AS board_slug FROM task t JOIN "board" b ON b.id = t.board_id WHERE t.id = ${id}`;
		const txid = await emitInTx(tx, org, actor, "work:ticket-upserted", {
			id,
			row: ticketPublic(updated),
		});
		return { data: ticketPublic(updated), txid };
	});
}

/** Archive/unarchive — orthogonal to status; status is never touched. */
export async function setTicketArchived(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
	archived: boolean,
) {
	return sql.begin(async (tx) => {
		await ticketRowById(tx, org, id);
		await tx`UPDATE task SET archived_at = ${archived ? new Date() : null}, archived_by = ${archived ? actor : null} WHERE id = ${id}`;
		const [updated] = await tx<
			TicketRow[]
		>`SELECT t.*, b.slug AS board_slug FROM task t JOIN "board" b ON b.id = t.board_id WHERE t.id = ${id}`;
		const txid = await emitInTx(tx, org, actor, "work:ticket-upserted", {
			id,
			row: ticketPublic(updated),
		});
		return { data: ticketPublic(updated), txid };
	});
}

// --- Labels -----------------------------------------------------------------------------------
export async function listLabels(
	sql: Sql,
	_org: string,
	organizationId: string,
) {
	const rows =
		await sql`SELECT * FROM label WHERE organization_id = ${organizationId} AND task_id IS NULL ORDER BY name`;
	return { labels: rows.map((r) => labelPublic(r)) };
}

export async function listTicketLabels(
	sql: Sql,
	org: string,
	ticketId: string,
) {
	return sql.begin(async (tx) => {
		await ticketRowById(tx, org, ticketId);
		const rows = await tx<
			AnyRow[]
		>`SELECT * FROM label WHERE task_id = ${ticketId} ORDER BY name`;
		return { labels: rows.map((r) => labelPublic(r)) };
	});
}

export async function createLabel(
	sql: Sql,
	org: string,
	actor: string,
	input: {
		id: string;
		name: string;
		color: string;
		taskId?: string;
		organizationId?: string;
	},
) {
	if (Boolean(input.taskId) === Boolean(input.organizationId))
		throw new WorkValidationError("exactly one of taskId, organizationId");
	return sql.begin(async (tx) => {
		if (input.taskId) await ticketRowById(tx, org, input.taskId);
		else if (input.organizationId !== org) throw new WorkNotFound();
		await tx`INSERT INTO label (id, name, color, source, created_at, updated_at, task_id, organization_id)
			VALUES (${input.id}, ${input.name}, ${input.color}, 'kaneo', now(), now(), ${input.taskId ?? null}, ${input.organizationId ?? null})`;
		const [row] = await tx<
			AnyRow[]
		>`SELECT * FROM label WHERE id = ${input.id}`;
		const txid = await emitInTx(tx, org, actor, "work:label-upserted", {
			id: input.id,
			row: labelPublic(row),
		});
		return { data: labelPublic(row), txid };
	});
}

export async function updateLabel(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
	patch: { name?: string; color?: string },
) {
	return sql.begin(async (tx) => {
		const [row] = await tx<AnyRow[]>`SELECT l.* FROM label l
			WHERE l.id = ${id}
			AND (l.task_id IS NULL OR EXISTS (SELECT 1 FROM task t JOIN "board" b2 ON b2.id = t.board_id WHERE t.id = l.task_id AND b2.organization_id = ${org}))
			AND (l.organization_id IS NULL OR l.organization_id = ${org})`;
		if (!row) throw new WorkNotFound();
		await tx`UPDATE label SET name = ${patch.name ?? String(row.name)}, color = ${patch.color ?? String(row.color)}, updated_at = now() WHERE id = ${id}`;
		const [updated] = await tx<AnyRow[]>`SELECT * FROM label WHERE id = ${id}`;
		const txid = await emitInTx(tx, org, actor, "work:label-upserted", {
			id,
			row: labelPublic(updated),
		});
		return { data: labelPublic(updated), txid };
	});
}

export async function assignLabelTask(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
	taskId: string | null,
) {
	return sql.begin(async (tx) => {
		const [row] = await tx<AnyRow[]>`SELECT * FROM label WHERE id = ${id}`;
		if (!row) throw new WorkNotFound();
		if (taskId) await ticketRowById(tx, org, taskId);
		const scopeCheck = taskId ?? row.organization_id;
		if (!scopeCheck)
			throw new WorkValidationError("label has no organization scope");
		await tx`UPDATE label SET task_id = ${taskId}, updated_at = now() WHERE id = ${id}`;
		const [updated] = await tx<AnyRow[]>`SELECT * FROM label WHERE id = ${id}`;
		const txid = await emitInTx(tx, org, actor, "work:label-upserted", {
			id,
			row: labelPublic(updated),
		});
		return { data: labelPublic(updated), txid };
	});
}

export async function deleteLabel(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
) {
	return sql.begin(async (tx) => {
		const [row] = await tx<AnyRow[]>`SELECT * FROM label WHERE id = ${id}`;
		if (!row) throw new WorkNotFound();
		await tx`DELETE FROM label WHERE id = ${id}`;
		const txid = await emitInTx(tx, org, actor, "work:label-deleted", { id });
		return { data: { id }, txid };
	});
}

// --- Templates ---------------------------------------------------------------------------------
export function validateTemplateData(
	data: unknown,
): asserts data is TemplateDataValue {
	if (typeof data !== "object" || data === null)
		throw new WorkValidationError("data");
	const d = data as Record<string, unknown>;
	if (typeof d.title !== "string" || d.title.length === 0)
		throw new WorkValidationError("data.title");
	for (const key of [
		"description",
		"priority",
		"startDate",
		"dueDate",
		"status",
		"startDateOffset",
		"dueDateOffset",
	])
		if (d[key] !== undefined && d[key] !== null && typeof d[key] !== "string")
			throw new WorkValidationError(`data.${key}`);
	if (d.priority !== null && d.priority !== undefined) {
		const priorities = ["no-priority", "low", "medium", "high", "urgent"];
		if (!priorities.includes(d.priority as string))
			throw new WorkValidationError("data.priority");
	}
	if (
		d.status &&
		typeof d.status === "string" &&
		!STATUS_SLUGS.includes(d.status)
	)
		throw new WorkValidationError("data.status");
	if (d.labels !== undefined) {
		if (!Array.isArray(d.labels) || d.labels.some((l) => typeof l !== "string"))
			throw new WorkValidationError("data.labels");
	}
}

export async function listTemplates(
	sql: Sql,
	_org: string,
	organizationId: string,
) {
	const rows =
		await sql`SELECT * FROM task_template WHERE organization_id = ${organizationId} ORDER BY name`;
	return { templates: rows.map((r) => templatePublic(r)) };
}

export async function createTemplate(
	sql: Sql,
	org: string,
	actor: string,
	input: { id: string; organizationId: string; name: string; data: unknown },
) {
	if (input.organizationId !== org) throw new WorkNotFound();
	validateTemplateData(input.data);
	return sql.begin(async (tx) => {
		await tx`INSERT INTO task_template (id, organization_id, name, data, created_at, updated_at)
			VALUES (${input.id}, ${org}, ${input.name}, ${tx.json(input.data as never)}, now(), now())`;
		const [row] = await tx<
			AnyRow[]
		>`SELECT * FROM task_template WHERE id = ${input.id}`;
		const txid = await emitInTx(tx, org, actor, "work:template-upserted", {
			id: input.id,
			row: templatePublic(row),
		});
		return { data: templatePublic(row), txid };
	});
}

export async function updateTemplate(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
	patch: { name?: string; data?: unknown },
) {
	if (patch.data) validateTemplateData(patch.data);
	return sql.begin(async (tx) => {
		const [row] = await tx<
			AnyRow[]
		>`SELECT * FROM task_template WHERE id = ${id} AND organization_id = ${org}`;
		if (!row) throw new WorkNotFound();
		await tx`UPDATE task_template SET
			name = ${patch.name ?? String(row.name)},
			data = ${patch.data ? tx.json(patch.data as never) : String(row.data)},
			updated_at = now()
			WHERE id = ${id}`;
		const [updated] = await tx<
			AnyRow[]
		>`SELECT * FROM task_template WHERE id = ${id}`;
		const txid = await emitInTx(tx, org, actor, "work:template-upserted", {
			id,
			row: templatePublic(updated),
		});
		return { data: templatePublic(updated), txid };
	});
}

export async function deleteTemplate(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
) {
	return sql.begin(async (tx) => {
		const [row] = await tx<
			AnyRow[]
		>`SELECT * FROM task_template WHERE id = ${id} AND organization_id = ${org}`;
		if (!row) throw new WorkNotFound();
		await tx`DELETE FROM task_template WHERE id = ${id}`;
		const txid = await emitInTx(tx, org, actor, "work:template-deleted", {
			id,
		});
		return { data: { id }, txid };
	});
}

// --- Flag types + task flags ---------------------------------------------------------------------
export async function listFlagTypes(sql: Sql, org: string, boardId: string) {
	return sql.begin(async (tx) => {
		await boardById(tx, org, boardId);
		const rows = await tx<
			AnyRow[]
		>`SELECT * FROM flag_type WHERE board_id = ${boardId} ORDER BY position, created_at`;
		return { flagTypes: rows.map((r) => flagTypePublic(r)) };
	});
}

export async function createFlagType(
	sql: Sql,
	org: string,
	actor: string,
	input: {
		id: string;
		boardId: string;
		name: string;
		color?: string;
		icon?: string;
		position?: number;
	},
) {
	return runTx(sql, org, actor, async (tx, { txid, emit }) => {
		await boardById(tx, org, input.boardId);
		await tx`INSERT INTO flag_type (id, board_id, name, color, icon, position, created_at, updated_at)
			VALUES (${input.id}, ${input.boardId}, ${input.name}, ${input.color ?? null}, ${input.icon ?? null}, ${input.position ?? 0}, now(), now())`;
		const [row] = await tx<
			AnyRow[]
		>`SELECT * FROM flag_type WHERE id = ${input.id}`;
		await emit("work:flag-type-upserted", {
			id: input.id,
			row: flagTypePublic(row),
		});
		return { data: flagTypePublic(row), txid };
	});
}

export async function updateFlagType(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
	patch: {
		name?: string;
		color?: string | null;
		icon?: string | null;
		position?: number;
	},
) {
	return runTx(sql, org, actor, async (tx, { txid, emit }) => {
		const [row] = await tx<
			AnyRow[]
		>`SELECT f.* FROM flag_type f JOIN "board" b ON b.id = f.board_id WHERE f.id = ${id} AND b.organization_id = ${org}`;
		if (!row) throw new WorkNotFound();
		await tx`UPDATE flag_type SET
			name = ${patch.name ?? row.name},
			color = ${patch.color !== undefined ? patch.color : row.color},
			icon = ${patch.icon !== undefined ? patch.icon : row.icon},
			position = ${patch.position ?? row.position},
			updated_at = now()
			WHERE id = ${id}`;
		const [updated] = await tx<
			AnyRow[]
		>`SELECT * FROM flag_type WHERE id = ${id}`;
		await emit("work:flag-type-upserted", { id, row: flagTypePublic(updated) });
		return { data: flagTypePublic(updated), txid };
	});
}

export async function deleteFlagType(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
) {
	return runTx(sql, org, actor, async (tx, { txid, emit }) => {
		const [row] = await tx<
			AnyRow[]
		>`SELECT f.* FROM flag_type f JOIN "board" b ON b.id = f.board_id WHERE f.id = ${id} AND b.organization_id = ${org}`;
		if (!row) throw new WorkNotFound();
		const [referenced] =
			await tx`SELECT count(*)::int AS count FROM task_flag WHERE flag_type_id = ${id}`;
		if (referenced.count > 0) throw new WorkConflict("StatusInUse");
		await tx`DELETE FROM flag_type WHERE id = ${id}`;
		await emit("work:flag-type-deleted", { id });
		return { data: { id }, txid };
	});
}

export async function listTicketFlags(sql: Sql, org: string, ticketId: string) {
	return sql.begin(async (tx) => {
		await ticketRowById(tx, org, ticketId);
		const rows = await tx<
			AnyRow[]
		>`SELECT * FROM task_flag WHERE task_id = ${ticketId} ORDER BY created_at`;
		return { flags: rows.map((r) => taskFlagPublic(r)) };
	});
}

export async function createTicketFlag(
	sql: Sql,
	org: string,
	actor: string,
	ticketId: string,
	input: {
		id: string;
		flagTypeId: string;
		targetUserId?: string;
		targetTeamId?: string;
		note?: string;
	},
) {
	if (Boolean(input.targetUserId) === Boolean(input.targetTeamId))
		throw new WorkValidationError("exactly one of targetUserId, targetTeamId");
	return sql.begin(async (tx) => {
		const ticket = await ticketRowById(tx, org, ticketId);
		const [flagType] = await tx<
			AnyRow[]
		>`SELECT f.* FROM flag_type f JOIN "board" b ON b.id = f.board_id WHERE f.id = ${input.flagTypeId} AND b.id = ${ticket.board_id}`;
		if (!flagType) throw new WorkValidationError("flagTypeId");
		if (input.targetUserId) {
			const [user] =
				await tx`SELECT id FROM "user" WHERE id = ${input.targetUserId}`;
			if (!user) throw new WorkValidationError("targetUserId");
		}
		if (input.targetTeamId) {
			const [team] =
				await tx`SELECT id FROM team WHERE id = ${input.targetTeamId}`;
			if (!team) throw new WorkValidationError("targetTeamId");
		}
		await tx`INSERT INTO task_flag (id, task_id, flag_type_id, flagged_by, target_user_id, target_team_id, note, created_at, updated_at)
			VALUES (${input.id}, ${ticketId}, ${input.flagTypeId}, ${actor}, ${input.targetUserId ?? null}, ${input.targetTeamId ?? null}, ${input.note ?? null}, now(), now())`;
		const [row] = await tx<
			AnyRow[]
		>`SELECT * FROM task_flag WHERE id = ${input.id}`;
		const txid = await emitInTx(tx, org, actor, "work:task-flag-upserted", {
			id: input.id,
			row: taskFlagPublic(row),
		});
		return { data: taskFlagPublic(row), txid };
	});
}

export async function resolveTicketFlag(
	sql: Sql,
	org: string,
	actor: string,
	id: string,
	note: string,
) {
	if (!note || note.trim().length === 0)
		throw new WorkValidationError("note nonempty required");
	return sql.begin(async (tx) => {
		const [row] = await tx<AnyRow[]>`SELECT f.* FROM task_flag f
			JOIN task t ON t.id = f.task_id JOIN "board" b ON b.id = t.board_id
			WHERE f.id = ${id} AND b.organization_id = ${org}`;
		if (!row) throw new WorkNotFound();
		if (row.resolved_at) throw new WorkValidationError("already resolved");
		await tx`UPDATE task_flag SET resolve_note = ${note}, resolved_at = now(), resolved_by = ${actor}, updated_at = now() WHERE id = ${id}`;
		const [updated] = await tx<
			AnyRow[]
		>`SELECT * FROM task_flag WHERE id = ${id}`;
		const txid = await emitInTx(tx, org, actor, "work:task-flag-upserted", {
			id,
			row: taskFlagPublic(updated),
		});
		return { data: taskFlagPublic(updated), txid };
	});
}
