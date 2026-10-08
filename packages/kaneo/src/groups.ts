/**
 * Wire contract of the Kaneo-compatible API (`/api/*`), as Effect HttpApi
 * groups. Pure declarations: no handlers, no database.
 */
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";
import { Schema } from "effect";
import { DomainErrors } from "./errors";
import { BACKLOG_STATUS_SLUGS, TASK_STATUS_ORDER_SLUGS } from "./status";

const Json = Schema.Unknown;
const Id = Schema.String;

const statusOrder = (allowed: readonly string[]) =>
	Schema.Array(Schema.String).pipe(
		Schema.check(
			Schema.isMaxLength(64),
			Schema.makeFilter((values: ReadonlyArray<string>) =>
				new Set(values).size === values.length
					? true
					: "Status order cannot contain duplicates",
			),
			Schema.makeFilter((values: ReadonlyArray<string>) =>
				values.every((v) => allowed.includes(v))
					? true
					: "Status order contains an unknown or wrong-surface status",
			),
		),
	);

export class BoardsGroup extends HttpApiGroup.make("boards")
	.add(
		HttpApiEndpoint.get("list", "/api/board", {
			query: Schema.Struct({
				organizationId: Schema.String,
				includeArchived: Schema.optional(Schema.String),
				teamId: Schema.optional(Schema.String),
			}),
			success: Json,
			error: DomainErrors,
		}),
	)
	.add(
		HttpApiEndpoint.post("create", "/api/board", {
			payload: Schema.Struct({
				name: Schema.String,
				organizationId: Schema.String,
				icon: Schema.String,
				slug: Schema.String,
			}),
			success: Json,
			error: DomainErrors,
		}),
	)
	.add(
		HttpApiEndpoint.get("get", "/api/board/:id", {
			params: Schema.Struct({ id: Id }),
			success: Json,
			error: DomainErrors,
		}),
	)
	.add(
		HttpApiEndpoint.put("update", "/api/board/:id", {
			params: Schema.Struct({ id: Id }),
			payload: Schema.Struct({
				name: Schema.String,
				icon: Schema.String,
				slug: Schema.String,
				description: Schema.String,
				isPublic: Schema.Boolean,
				subtaskDepthLimit: Schema.optional(
					Schema.Int.pipe(
						Schema.check(
							Schema.isBetween(
								{ minimum: 1, maximum: 4 },
								{ message: "subtaskDepthLimit must be between 1 and 4" },
							),
						),
					),
				),
				taskStatusOrder: Schema.optional(statusOrder(TASK_STATUS_ORDER_SLUGS)),
				backlogStatusOrder: Schema.optional(statusOrder(BACKLOG_STATUS_SLUGS)),
				defaultAssigneeId: Schema.optional(Schema.NullOr(Schema.String)),
				defaultAssigneeTeamId: Schema.optional(Schema.NullOr(Schema.String)),
			}),
			success: Json,
			error: DomainErrors,
		}),
	)
	.add(
		HttpApiEndpoint.delete("delete", "/api/board/:id", {
			params: Schema.Struct({ id: Id }),
			success: Json,
			error: DomainErrors,
		}),
	)
	.add(
		HttpApiEndpoint.put("archive", "/api/board/:id/archive", {
			params: Schema.Struct({ id: Id }),
			success: Json,
			error: DomainErrors,
		}),
	)
	.add(
		HttpApiEndpoint.put("unarchive", "/api/board/:id/unarchive", {
			params: Schema.Struct({ id: Id }),
			success: Json,
			error: DomainErrors,
		}),
	) {}

export class ColumnsGroup extends HttpApiGroup.make("columns")
	.add(
		HttpApiEndpoint.get("list", "/api/column/:boardId", {
			params: Schema.Struct({ boardId: Id }),
			success: Json,
			error: DomainErrors,
		}),
	)
	.add(
		HttpApiEndpoint.post("create", "/api/column/:boardId", {
			params: Schema.Struct({ boardId: Id }),
			payload: Schema.Struct({
				name: Schema.String,
				icon: Schema.optional(Schema.String),
				color: Schema.optional(Schema.String),
				isFinal: Schema.optional(Schema.Boolean),
			}),
			success: Json,
			error: DomainErrors,
		}),
	)
	.add(
		HttpApiEndpoint.put("reorder", "/api/column/reorder/:boardId", {
			params: Schema.Struct({ boardId: Id }),
			payload: Schema.Struct({
				columns: Schema.Array(
					Schema.Struct({ id: Schema.String, position: Schema.Number }),
				),
			}),
			success: Json,
			error: DomainErrors,
		}),
	)
	.add(
		HttpApiEndpoint.put("update", "/api/column/:id", {
			params: Schema.Struct({ id: Id }),
			payload: Schema.Struct({
				name: Schema.optional(Schema.String),
				icon: Schema.optional(Schema.NullOr(Schema.String)),
				color: Schema.optional(Schema.NullOr(Schema.String)),
				isFinal: Schema.optional(Schema.Boolean),
			}),
			success: Json,
			error: DomainErrors,
		}),
	)
	.add(
		HttpApiEndpoint.delete("delete", "/api/column/:id", {
			params: Schema.Struct({ id: Id }),
			success: Json,
			error: DomainErrors,
		}),
	) {}

export class LabelsGroup extends HttpApiGroup.make("labels")
	.add(
		HttpApiEndpoint.get("byTask", "/api/label/task/:taskId", {
			params: Schema.Struct({ taskId: Id }),
			success: Json,
			error: DomainErrors,
		}),
	)
	.add(
		HttpApiEndpoint.get(
			"byOrganization",
			"/api/label/organization/:organizationId",
			{
				params: Schema.Struct({ organizationId: Id }),
				success: Json,
				error: DomainErrors,
			},
		),
	)
	.add(
		HttpApiEndpoint.post("create", "/api/label", {
			payload: Schema.Struct({
				name: Schema.String,
				color: Schema.String,
				organizationId: Schema.String,
				taskId: Schema.optional(Schema.String),
			}),
			success: Json,
			error: DomainErrors,
		}),
	)
	.add(
		HttpApiEndpoint.get("get", "/api/label/:id", {
			params: Schema.Struct({ id: Id }),
			success: Json,
			error: DomainErrors,
		}),
	)
	.add(
		HttpApiEndpoint.put("assign", "/api/label/:id/task", {
			params: Schema.Struct({ id: Id }),
			payload: Schema.Struct({ taskId: Schema.String }),
			success: Json,
			error: DomainErrors,
		}),
	)
	.add(
		HttpApiEndpoint.delete("unassign", "/api/label/:id/task", {
			params: Schema.Struct({ id: Id }),
			success: Json,
			error: DomainErrors,
		}),
	)
	.add(
		HttpApiEndpoint.put("update", "/api/label/:id", {
			params: Schema.Struct({ id: Id }),
			payload: Schema.Struct({ name: Schema.String, color: Schema.String }),
			success: Json,
			error: DomainErrors,
		}),
	)
	.add(
		HttpApiEndpoint.delete("delete", "/api/label/:id", {
			params: Schema.Struct({ id: Id }),
			success: Json,
			error: DomainErrors,
		}),
	) {}
