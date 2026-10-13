/**
 * Board + Column handlers, Effect-native. Wire-compatible with Kaneo's
 * `/api/board/*` and `/api/column/*` (contract in ./groups).
 */

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import { KaneoApi } from "./api";
import {
	Access,
	BadRequest,
	Conflict,
	CurrentUser,
	Db,
	NotFound,
	privilegeAllows,
	schema,
	sqlDie,
	transaction,
} from "./kernel";
import { isClosedStatus, VIRTUAL_STATUSES } from "./status";

export const DEFAULT_COLUMNS = [
	{ name: "To Do", slug: "to-do", position: 0, isFinal: false },
	{ name: "In Progress", slug: "in-progress", position: 1, isFinal: false },
	{ name: "In Review", slug: "in-review", position: 2, isFinal: false },
	{ name: "Done", slug: "done", position: 3, isFinal: true },
] as const;

export const toSlug = (name: string) => {
	const slug = name
		.normalize("NFKC")
		.toLowerCase()
		.trim()
		.replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "");
	return /[\p{L}\p{N}]/u.test(slug) ? slug : "";
};

/** Same statistics Kaneo's getBoards computes (#226 rules). */
type TaskLike = {
	archivedAt: Date | null;
	status: string;
	dueDate: Date | null;
	startDate: Date | null;
};
export const boardStatistics = (tasks: readonly TaskLike[]) => {
	const active = tasks.filter((t) => t.archivedAt == null);
	const totalTasks = active.length;
	const completed = active.filter((t) => isClosedStatus(t.status)).length;
	const completionPercentage =
		totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;
	let dueDate: Date | null = null;
	for (const t of active)
		if (!dueDate || (t.dueDate && t.dueDate < dueDate)) dueDate = t.dueDate;
	let startsAt: Date | null = null;
	let endsAt: Date | null = null;
	for (const t of active) {
		const s = t.startDate ?? t.dueDate;
		const e = t.dueDate ?? t.startDate;
		if (s && (!startsAt || s < startsAt)) startsAt = s;
		if (e && (!endsAt || e > endsAt)) endsAt = e;
	}
	return { completionPercentage, totalTasks, dueDate, startsAt, endsAt };
};

export const BoardsLive = HttpApiBuilder.group(KaneoApi, "boards", (h) =>
	Effect.gen(function* () {
		const db = yield* Db;
		const access = yield* Access;

		const findBoard = (id: string, organizationId: string) =>
			db
				.select()
				.from(schema.boardTable)
				.where(
					and(
						eq(schema.boardTable.id, id),
						eq(schema.boardTable.organizationId, organizationId),
					),
				)
				.pipe(Effect.map(([b]) => b));

		return h
			.handle(
				"list",
				Effect.fn("Boards.list")(function* ({ query: urlParams }) {
					const me = yield* CurrentUser;
					yield* access.requireMember(urlParams.organizationId);
					const includeArchived = urlParams.includeArchived === "true";
					const boards = yield* db.query.boardTable.findMany({
						where: includeArchived
							? eq(schema.boardTable.organizationId, urlParams.organizationId)
							: and(
									eq(
										schema.boardTable.organizationId,
										urlParams.organizationId,
									),
									isNull(schema.boardTable.archivedAt),
								),
						orderBy: [
							sql`(${schema.boardTable.archivedAt} is not null)`,
							asc(schema.boardTable.createdAt),
						],
						with: { tasks: true },
					});
					const visible = yield* Effect.filter(
						boards,
						(b) =>
							access
								.boardPrivilege(urlParams.organizationId, b.id)
								.pipe(Effect.map((p) => privilegeAllows(p, "view"))),
						{ concurrency: 8 },
					);
					let scoped = visible;
					if (urlParams.teamId) {
						const ids = visible.map((b) => b.id);
						const grants = ids.length
							? yield* db
									.select({
										resourceId: schema.resourceGrantTable.resourceId,
										teamId: schema.resourceGrantTable.teamId,
										privilege: schema.resourceGrantTable.privilege,
									})
									.from(schema.resourceGrantTable)
									.where(
										and(
											eq(
												schema.resourceGrantTable.organizationId,
												urlParams.organizationId,
											),
											eq(schema.resourceGrantTable.resourceType, "board"),
										),
									)
							: [];
						const granted = new Set(grants.map((g) => g.resourceId));
						scoped = visible.filter(
							(b) =>
								!granted.has(b.id) ||
								grants.some(
									(g) =>
										g.resourceId === b.id &&
										g.teamId === urlParams.teamId &&
										privilegeAllows(g.privilege as never, "view"),
								),
						);
					}
					void me;
					return scoped.map((board) => ({
						...board,
						statistics: boardStatistics(board.tasks),
						archivedTasks: [],
						plannedTasks: [],
						triageTasks: [],
						columns: [],
					}));
				}, sqlDie),
			)
			.handle(
				"create",
				Effect.fn("Boards.create")(function* ({ payload }) {
					yield* access.requireMember(payload.organizationId);
					yield* access.requirePermission(payload.organizationId, {
						board: ["create"],
					});
					const tx = db;
					return yield* transaction(
						Effect.gen(function* () {
							const [created] = yield* tx
								.insert(schema.boardTable)
								.values({
									organizationId: payload.organizationId,
									name: payload.name,
									icon: payload.icon,
									slug: payload.slug,
								})
								.returning();
							for (const col of DEFAULT_COLUMNS)
								yield* tx.insert(schema.columnTable).values({
									boardId: created.id,
									...col,
								});
							return created;
						}),
					);
				}, sqlDie),
			)
			.handle(
				"get",
				Effect.fn("Boards.get")(function* ({ params: path }) {
					const organizationId = yield* access.guardBoard(path.id, "view");
					const board = yield* db.query.boardTable.findFirst({
						where: and(
							eq(schema.boardTable.id, path.id),
							eq(schema.boardTable.organizationId, organizationId),
						),
						with: { tasks: true },
					});
					if (!board)
						return yield* new NotFound({ message: "Board not found" });
					return board;
				}, sqlDie),
			)
			.handle(
				"update",
				Effect.fn("Boards.update")(function* ({ params: path, payload }) {
					const organizationId = yield* access.guardBoard(path.id, "edit");
					yield* access.requirePermission(organizationId, {
						board: ["update"],
					});
					if (!(yield* findBoard(path.id, organizationId)))
						return yield* new NotFound({
							message:
								"Board doesn't exist or doesn't belong to the specified organization",
						});
					const [updated] = yield* db
						.update(schema.boardTable)
						.set({
							name: payload.name,
							icon: payload.icon,
							slug: payload.slug,
							description: payload.description,
							isPublic: payload.isPublic,
							...(payload.subtaskDepthLimit === undefined
								? {}
								: { subtaskDepthLimit: payload.subtaskDepthLimit }),
							...(payload.taskStatusOrder === undefined
								? {}
								: { taskStatusOrder: [...payload.taskStatusOrder] }),
							...(payload.backlogStatusOrder === undefined
								? {}
								: { backlogStatusOrder: [...payload.backlogStatusOrder] }),
							...(payload.defaultAssigneeId === undefined
								? {}
								: { defaultAssigneeId: payload.defaultAssigneeId }),
							...(payload.defaultAssigneeTeamId === undefined
								? {}
								: { defaultAssigneeTeamId: payload.defaultAssigneeTeamId }),
						})
						.where(eq(schema.boardTable.id, path.id))
						.returning();
					return updated;
				}, sqlDie),
			)
			.handle(
				"delete",
				Effect.fn("Boards.delete")(function* ({ params: path }) {
					const organizationId = yield* access.guardBoard(path.id, "edit");
					yield* access.requirePermission(organizationId, {
						board: ["delete"],
					});
					const existing = yield* db.query.boardTable.findFirst({
						where: and(
							eq(schema.boardTable.id, path.id),
							eq(schema.boardTable.organizationId, organizationId),
						),
						with: { tasks: true },
					});
					if (!existing)
						return yield* new NotFound({ message: "Board not found" });
					yield* db
						.delete(schema.boardTable)
						.where(eq(schema.boardTable.id, path.id));
					return existing;
				}, sqlDie),
			)
			.handle(
				"archive",
				Effect.fn("Boards.archive")(function* ({ params: path }) {
					const organizationId = yield* access.guardBoard(path.id, "edit");
					yield* access.requirePermission(organizationId, {
						board: ["update"],
					});
					if (!(yield* findBoard(path.id, organizationId)))
						return yield* new NotFound({
							message:
								"Board doesn't exist or doesn't belong to the specified organization",
						});
					const [row] = yield* db
						.update(schema.boardTable)
						.set({ archivedAt: new Date() })
						.where(eq(schema.boardTable.id, path.id))
						.returning();
					return row;
				}, sqlDie),
			)
			.handle(
				"unarchive",
				Effect.fn("Boards.unarchive")(function* ({ params: path }) {
					const organizationId = yield* access.guardBoard(path.id, "edit");
					yield* access.requirePermission(organizationId, {
						board: ["update"],
					});
					if (!(yield* findBoard(path.id, organizationId)))
						return yield* new NotFound({
							message:
								"Board doesn't exist or doesn't belong to the specified organization",
						});
					const [row] = yield* db
						.update(schema.boardTable)
						.set({ archivedAt: null })
						.where(eq(schema.boardTable.id, path.id))
						.returning();
					return row;
				}, sqlDie),
			);
	}),
);

export const ColumnsLive = HttpApiBuilder.group(KaneoApi, "columns", (h) =>
	Effect.gen(function* () {
		const db = yield* Db;
		const access = yield* Access;

		const guardColumn = (id: string, required: "view" | "edit") =>
			Effect.gen(function* () {
				const [col] = yield* db
					.select({ boardId: schema.columnTable.boardId })
					.from(schema.columnTable)
					.where(eq(schema.columnTable.id, id))
					.limit(1);
				if (!col)
					return yield* new BadRequest({
						message: "Organization ID could not be determined",
					});
				return yield* access.guardBoard(col.boardId, required);
			});

		const listColumns = (boardId: string) =>
			db
				.select()
				.from(schema.columnTable)
				.where(eq(schema.columnTable.boardId, boardId))
				.orderBy(asc(schema.columnTable.position));

		return h
			.handle(
				"list",
				Effect.fn("Columns.list")(function* ({ params: path }) {
					yield* access.guardBoard(path.boardId, "view");
					return yield* listColumns(path.boardId);
				}, sqlDie),
			)
			.handle(
				"create",
				Effect.fn("Columns.create")(function* ({ params: path, payload }) {
					const organizationId = yield* access.guardBoard(path.boardId, "edit");
					yield* access.requirePermission(organizationId, {
						board: ["update"],
					});
					const slug = toSlug(payload.name);
					if (!slug)
						return yield* new BadRequest({
							message:
								"Column name must contain at least one alphanumeric character",
						});
					if ((VIRTUAL_STATUSES as readonly string[]).includes(slug))
						return yield* new Conflict({
							message: `Column slug "${slug}" is reserved for virtual task statuses`,
						});
					const existing = yield* db
						.select({ id: schema.columnTable.id })
						.from(schema.columnTable)
						.where(
							and(
								eq(schema.columnTable.boardId, path.boardId),
								eq(schema.columnTable.slug, slug),
							),
						);
					if (existing.length)
						return yield* new Conflict({
							message: `Column with slug "${slug}" already exists in this board`,
						});
					const [max] = yield* db
						.select({
							maxPosition: sql<number>`COALESCE(MAX(${schema.columnTable.position}), -1)`,
						})
						.from(schema.columnTable)
						.where(eq(schema.columnTable.boardId, path.boardId));
					const [created] = yield* db
						.insert(schema.columnTable)
						.values({
							boardId: path.boardId,
							name: payload.name,
							slug,
							position: Number(max?.maxPosition ?? -1) + 1,
							icon: payload.icon || null,
							color: payload.color || null,
							isFinal: payload.isFinal ?? false,
						})
						.returning();
					return created;
				}, sqlDie),
			)
			.handle(
				"reorder",
				Effect.fn("Columns.reorder")(function* ({ params: path, payload }) {
					const organizationId = yield* access.guardBoard(path.boardId, "edit");
					yield* access.requirePermission(organizationId, {
						board: ["update"],
					});
					const tx = db;
					return yield* transaction(
						Effect.gen(function* () {
							for (const col of payload.columns) {
								const [u] = yield* tx
									.update(schema.columnTable)
									.set({ position: col.position })
									.where(
										and(
											eq(schema.columnTable.id, col.id),
											eq(schema.columnTable.boardId, path.boardId),
										),
									)
									.returning({ id: schema.columnTable.id });
								if (!u)
									return yield* new BadRequest({
										message: `Column ${col.id} does not belong to this board`,
									});
							}
							return yield* tx
								.select()
								.from(schema.columnTable)
								.where(eq(schema.columnTable.boardId, path.boardId))
								.orderBy(asc(schema.columnTable.position));
						}),
					);
				}, sqlDie),
			)
			.handle(
				"update",
				Effect.fn("Columns.update")(function* ({ params: path, payload }) {
					const organizationId = yield* guardColumn(path.id, "edit");
					yield* access.requirePermission(organizationId, {
						board: ["update"],
					});
					const [existing] = yield* db
						.select()
						.from(schema.columnTable)
						.where(eq(schema.columnTable.id, path.id));
					if (!existing)
						return yield* new NotFound({ message: "Column not found" });
					const [updated] = yield* db
						.update(schema.columnTable)
						.set({
							...(payload.name !== undefined && { name: payload.name }),
							...(payload.icon !== undefined && { icon: payload.icon }),
							...(payload.color !== undefined && { color: payload.color }),
							...(payload.isFinal !== undefined && {
								isFinal: payload.isFinal,
							}),
						})
						.where(eq(schema.columnTable.id, path.id))
						.returning();
					return updated;
				}, sqlDie),
			)
			.handle(
				"delete",
				Effect.fn("Columns.delete")(function* ({ params: path }) {
					const organizationId = yield* guardColumn(path.id, "edit");
					yield* access.requirePermission(organizationId, {
						board: ["update"],
					});
					const [existing] = yield* db
						.select()
						.from(schema.columnTable)
						.where(eq(schema.columnTable.id, path.id));
					if (!existing)
						return yield* new NotFound({ message: "Column not found" });
					const [count] = yield* db
						.select({ count: sql<number>`count(*)` })
						.from(schema.taskTable)
						.where(eq(schema.taskTable.columnId, path.id));
					if (count && Number(count.count) > 0)
						return yield* new Conflict({
							message:
								"Cannot delete column that contains tasks. Move or delete tasks first.",
						});
					yield* db
						.delete(schema.columnTable)
						.where(eq(schema.columnTable.id, path.id));
					return existing;
				}, sqlDie),
			);
	}),
);
