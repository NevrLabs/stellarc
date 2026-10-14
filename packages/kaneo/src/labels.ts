/**
 * Label domain, Effect-native. Wire-compatible with Kaneo `/api/label/*`.
 * Side effects (WS/notification events, GitHub/Gitea label sync) go through
 * the DomainEvents port so not-yet-migrated consumers keep working.
 */

import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import { KaneoApi } from "./api";
import {
	Access,
	BadRequest,
	CurrentUser,
	Db,
	DomainEvents,
	detach,
	NotFound,
	schema,
	sqlDie,
	transaction,
} from "./kernel";

export const LabelsLive = HttpApiBuilder.group(KaneoApi, "labels", (h) =>
	Effect.gen(function* () {
		const db = yield* Db;
		const access = yield* Access;
		const ports = yield* DomainEvents;

		const labelOrg = (id: string) =>
			db
				.select({ organizationId: schema.labelTable.organizationId })
				.from(schema.labelTable)
				.where(eq(schema.labelTable.id, id))
				.limit(1)
				.pipe(Effect.map(([l]) => l?.organizationId ?? null));

		const findLabel = (id: string) =>
			db.query.labelTable.findFirst({ where: eq(schema.labelTable.id, id) });

		const taskWithOrg = (taskId: string) =>
			db
				.select({
					id: schema.taskTable.id,
					boardId: schema.taskTable.boardId,
					organizationId: schema.boardTable.organizationId,
				})
				.from(schema.taskTable)
				.innerJoin(
					schema.boardTable,
					eq(schema.taskTable.boardId, schema.boardTable.id),
				)
				.where(eq(schema.taskTable.id, taskId))
				.limit(1)
				.pipe(Effect.map(([t]) => t));

		const emit = (event: string, data: unknown) =>
			Effect.promise(() => ports.publish(event, data)).pipe(
				Effect.withSpan("Kaneo.publish", { attributes: { event } }),
			);
		const sync = (taskId: string, name: string, color: string) =>
			detach("label sync", () => ports.labelSync.upsert(taskId, name, color));
		const unsync = (taskId: string, name: string, alsoGitea: boolean) =>
			detach("label unsync", () =>
				ports.labelSync.remove(taskId, name, alsoGitea),
			);

		return h
			.handle(
				"byTask",
				Effect.fn("Labels.byTask")(function* ({ params: path }) {
					yield* access.guardTask(path.taskId, "view");
					return yield* db.query.labelTable.findMany({
						where: eq(schema.labelTable.taskId, path.taskId),
					});
				}, sqlDie),
			)
			.handle(
				"byOrganization",
				Effect.fn("Labels.byOrganization")(function* ({ params: path }) {
					yield* access.guardOrg(path.organizationId);
					return yield* db
						.select()
						.from(schema.labelTable)
						.where(eq(schema.labelTable.organizationId, path.organizationId));
				}, sqlDie),
			)
			.handle(
				"create",
				Effect.fn("Labels.create")(function* ({ payload }) {
					const me = yield* CurrentUser;
					const organizationId = yield* access.guardOrg(payload.organizationId);
					yield* access.requirePermission(organizationId, {
						label: ["create"],
					});
					const { name, color, taskId } = payload;
					if (taskId) {
						const task = yield* taskWithOrg(taskId);
						if (!task || task.organizationId !== organizationId)
							return yield* new NotFound({ message: "Task not found" });
						const [inserted] = yield* db
							.insert(schema.labelTable)
							.values({
								name,
								color,
								taskId,
								organizationId: task.organizationId,
							})
							.onConflictDoNothing({
								target: [schema.labelTable.taskId, schema.labelTable.name],
							})
							.returning();
						const label =
							inserted ??
							(yield* db.query.labelTable.findFirst({
								where: and(
									eq(schema.labelTable.taskId, taskId),
									eq(schema.labelTable.name, name),
								),
							}));
						if (!label)
							return yield* Effect.die(
								new Error("Failed to create or resolve label"),
							);
						if (inserted) {
							yield* sync(taskId, name, color);
							yield* emit("task.label_created", {
								boardId: task.boardId,
								taskId: task.id,
								userId: me.userId,
								type: "label_created",
							});
						}
						return label;
					}
					const [inserted] = yield* db
						.insert(schema.labelTable)
						.values({ name, color, taskId: null, organizationId })
						.onConflictDoNothing({
							target: [
								schema.labelTable.organizationId,
								schema.labelTable.name,
							],
							where: sql`${schema.labelTable.taskId} is null`,
						})
						.returning();
					const label =
						inserted ??
						(yield* db.query.labelTable.findFirst({
							where: and(
								eq(schema.labelTable.organizationId, organizationId),
								eq(schema.labelTable.name, name),
								isNull(schema.labelTable.taskId),
							),
						}));
					if (!label)
						return yield* Effect.die(
							new Error("Failed to create or resolve label"),
						);
					return label;
				}, sqlDie),
			)
			.handle(
				"get",
				Effect.fn("Labels.get")(function* ({ params: path }) {
					yield* access.guardOrg(yield* labelOrg(path.id));
					// Kaneo returns the row or null (findFirst), never 404, here.
					return (yield* findLabel(path.id)) ?? null;
				}, sqlDie),
			)
			.handle(
				"assign",
				Effect.fn("Labels.assign")(function* ({ params: path, payload }) {
					const me = yield* CurrentUser;
					const organizationId = yield* access.guardOrg(
						yield* labelOrg(path.id),
					);
					yield* access.requirePermission(organizationId, {
						label: ["update"],
					});
					const label = yield* findLabel(path.id);
					if (!label)
						return yield* new NotFound({ message: "Label not found" });
					const task = yield* taskWithOrg(payload.taskId);
					if (!task) return yield* new NotFound({ message: "Task not found" });
					if (
						label.organizationId &&
						label.organizationId !== task.organizationId
					)
						return yield* new BadRequest({
							message: "Label and task must belong to the same organization",
						});
					const [updated] = yield* db
						.update(schema.labelTable)
						.set({ taskId: payload.taskId })
						.where(eq(schema.labelTable.id, path.id))
						.returning();
					yield* sync(payload.taskId, updated.name, updated.color);
					yield* emit("task.label_assigned", {
						label: updated,
						task,
						boardId: task.boardId,
						taskId: task.id,
						userId: me.userId,
						type: "label_assigned",
					});
					return updated;
				}, sqlDie),
			)
			.handle(
				"unassign",
				Effect.fn("Labels.unassign")(function* ({ params: path }) {
					const me = yield* CurrentUser;
					const organizationId = yield* access.guardOrg(
						yield* labelOrg(path.id),
					);
					yield* access.requirePermission(organizationId, {
						label: ["update"],
					});
					const label = yield* findLabel(path.id);
					if (!label)
						return yield* new NotFound({ message: "Label not found" });
					if (!label.taskId)
						return yield* new BadRequest({
							message: "Label is not assigned to a task",
						});
					const task = yield* taskWithOrg(label.taskId);
					if (!task) return yield* new NotFound({ message: "Task not found" });
					const [updated] = yield* db
						.update(schema.labelTable)
						.set({ taskId: null })
						.where(eq(schema.labelTable.id, path.id))
						.returning();
					yield* unsync(label.taskId, label.name, false);
					yield* emit("task.label_unassigned", {
						label: updated,
						task,
						boardId: task.boardId,
						taskId: label.taskId,
						userId: me.userId,
						type: "label_unassigned",
					});
					return updated;
				}, sqlDie),
			)
			.handle(
				"update",
				Effect.fn("Labels.update")(function* ({ params: path, payload }) {
					const organizationId = yield* access.guardOrg(
						yield* labelOrg(path.id),
					);
					yield* access.requirePermission(organizationId, {
						label: ["update"],
					});
					return yield* transaction(
						Effect.gen(function* () {
							const label = yield* findLabel(path.id);
							if (!label)
								return yield* new NotFound({ message: "Label not found" });
							const [updated] = yield* db
								.update(schema.labelTable)
								.set({ name: payload.name, color: payload.color })
								.where(eq(schema.labelTable.id, path.id))
								.returning();
							if (!label.taskId && label.organizationId)
								yield* db
									.update(schema.labelTable)
									.set({ name: payload.name, color: payload.color })
									.where(
										and(
											eq(
												schema.labelTable.organizationId,
												label.organizationId,
											),
											eq(schema.labelTable.name, label.name),
											isNotNull(schema.labelTable.taskId),
										),
									);
							return updated;
						}),
					);
				}, sqlDie),
			)
			.handle(
				"delete",
				Effect.fn("Labels.delete")(function* ({ params: path }) {
					const me = yield* CurrentUser;
					const organizationId = yield* access.guardOrg(
						yield* labelOrg(path.id),
					);
					yield* access.requirePermission(organizationId, {
						label: ["delete"],
					});
					const label = yield* findLabel(path.id);
					if (!label)
						return yield* new NotFound({ message: "Label not found" });
					if (label.taskId) {
						const task = yield* taskWithOrg(label.taskId);
						if (!task)
							return yield* new NotFound({ message: "Task not found" });
						const [deleted] = yield* db
							.delete(schema.labelTable)
							.where(eq(schema.labelTable.id, path.id))
							.returning();
						if (!deleted)
							return yield* new NotFound({ message: "Label not found" });
						if (deleted.taskId)
							yield* unsync(deleted.taskId, deleted.name, false);
						yield* emit("task.label_deleted", {
							label: deleted,
							task,
							boardId: task.boardId,
							taskId: task.id,
							userId: me.userId,
							type: "label_deleted",
						});
						return deleted;
					}
					const [deleted] = yield* db
						.delete(schema.labelTable)
						.where(eq(schema.labelTable.id, path.id))
						.returning();
					if (!deleted)
						return yield* new NotFound({ message: "Label not found" });
					const affected = yield* db
						.select({
							label: schema.labelTable,
							taskId: schema.taskTable.id,
							boardId: schema.boardTable.id,
						})
						.from(schema.labelTable)
						.innerJoin(
							schema.taskTable,
							eq(schema.labelTable.taskId, schema.taskTable.id),
						)
						.innerJoin(
							schema.boardTable,
							eq(schema.taskTable.boardId, schema.boardTable.id),
						)
						.where(
							and(
								sql`${schema.labelTable.organizationId} = ${label.organizationId}`,
								eq(schema.labelTable.name, label.name),
								isNotNull(schema.labelTable.taskId),
							),
						);
					yield* db
						.delete(schema.labelTable)
						.where(
							and(
								sql`${schema.labelTable.organizationId} = ${label.organizationId}`,
								eq(schema.labelTable.name, label.name),
								isNotNull(schema.labelTable.taskId),
							),
						);
					for (const { label: l, taskId, boardId } of affected) {
						if (l.taskId) yield* unsync(l.taskId, l.name, true);
						yield* emit("task.label_deleted", {
							label: l,
							task: { id: taskId, boardId },
							boardId,
							taskId,
							userId: me.userId,
							type: "label_deleted",
						});
					}
					return deleted;
				}, sqlDie),
			);
	}),
);
