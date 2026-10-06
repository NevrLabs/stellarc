/**
 * Wire contract of the Kaneo-compatible API (`/api/*`), as Effect HttpApi
 * groups. Pure declarations: no handlers, no database.
 */
import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";
import {
	BadRequest,
	Conflict,
	Forbidden,
	NotFound,
	Unauthorized,
} from "./errors";
import { BACKLOG_STATUS_SLUGS, TASK_STATUS_ORDER_SLUGS } from "./status";

const Json = Schema.Unknown;
const Id = Schema.String;

const statusOrder = (allowed: readonly string[]) =>
	Schema.Array(Schema.String).pipe(
		Schema.maxItems(64),
		Schema.filter((values) =>
			new Set(values).size === values.length
				? true
				: "Status order cannot contain duplicates",
		),
		Schema.filter((values) =>
			values.every((v) => allowed.includes(v))
				? true
				: "Status order contains an unknown or wrong-surface status",
		),
	);

export class BoardsGroup extends HttpApiGroup.make("boards")
	.add(
		HttpApiEndpoint.get("list", "/api/board")
			.setUrlParams(
				Schema.Struct({
					organizationId: Schema.String,
					includeArchived: Schema.optional(Schema.String),
					teamId: Schema.optional(Schema.String),
				}),
			)
			.addSuccess(Json),
	)
	.add(
		HttpApiEndpoint.post("create", "/api/board")
			.setPayload(
				Schema.Struct({
					name: Schema.String,
					organizationId: Schema.String,
					icon: Schema.String,
					slug: Schema.String,
				}),
			)
			.addSuccess(Json),
	)
	.add(
		HttpApiEndpoint.get("get", "/api/board/:id")
			.setPath(Schema.Struct({ id: Id }))
			.addSuccess(Json),
	)
	.add(
		HttpApiEndpoint.put("update", "/api/board/:id")
			.setPath(Schema.Struct({ id: Id }))
			.setPayload(
				Schema.Struct({
					name: Schema.String,
					icon: Schema.String,
					slug: Schema.String,
					description: Schema.String,
					isPublic: Schema.Boolean,
					subtaskDepthLimit: Schema.optional(
						Schema.Int.pipe(
							Schema.between(1, 4, {
								message: () => "subtaskDepthLimit must be between 1 and 4",
							}),
						),
					),
					taskStatusOrder: Schema.optional(
						statusOrder(TASK_STATUS_ORDER_SLUGS),
					),
					backlogStatusOrder: Schema.optional(
						statusOrder(BACKLOG_STATUS_SLUGS),
					),
					defaultAssigneeId: Schema.optional(Schema.NullOr(Schema.String)),
					defaultAssigneeTeamId: Schema.optional(Schema.NullOr(Schema.String)),
				}),
			)
			.addSuccess(Json),
	)
	.add(
		HttpApiEndpoint.del("delete", "/api/board/:id")
			.setPath(Schema.Struct({ id: Id }))
			.addSuccess(Json),
	)
	.add(
		HttpApiEndpoint.put("archive", "/api/board/:id/archive")
			.setPath(Schema.Struct({ id: Id }))
			.addSuccess(Json),
	)
	.add(
		HttpApiEndpoint.put("unarchive", "/api/board/:id/unarchive")
			.setPath(Schema.Struct({ id: Id }))
			.addSuccess(Json),
	)
	.addError(Unauthorized)
	.addError(Forbidden)
	.addError(NotFound)
	.addError(Conflict)
	.addError(BadRequest) {}

export class ColumnsGroup extends HttpApiGroup.make("columns")
	.add(
		HttpApiEndpoint.get("list", "/api/column/:boardId")
			.setPath(Schema.Struct({ boardId: Id }))
			.addSuccess(Json),
	)
	.add(
		HttpApiEndpoint.post("create", "/api/column/:boardId")
			.setPath(Schema.Struct({ boardId: Id }))
			.setPayload(
				Schema.Struct({
					name: Schema.String,
					icon: Schema.optional(Schema.String),
					color: Schema.optional(Schema.String),
					isFinal: Schema.optional(Schema.Boolean),
				}),
			)
			.addSuccess(Json),
	)
	.add(
		HttpApiEndpoint.put("reorder", "/api/column/reorder/:boardId")
			.setPath(Schema.Struct({ boardId: Id }))
			.setPayload(
				Schema.Struct({
					columns: Schema.Array(
						Schema.Struct({ id: Schema.String, position: Schema.Number }),
					),
				}),
			)
			.addSuccess(Json),
	)
	.add(
		HttpApiEndpoint.put("update", "/api/column/:id")
			.setPath(Schema.Struct({ id: Id }))
			.setPayload(
				Schema.Struct({
					name: Schema.optional(Schema.String),
					icon: Schema.optional(Schema.NullOr(Schema.String)),
					color: Schema.optional(Schema.NullOr(Schema.String)),
					isFinal: Schema.optional(Schema.Boolean),
				}),
			)
			.addSuccess(Json),
	)
	.add(
		HttpApiEndpoint.del("delete", "/api/column/:id")
			.setPath(Schema.Struct({ id: Id }))
			.addSuccess(Json),
	)
	.addError(Unauthorized)
	.addError(Forbidden)
	.addError(NotFound)
	.addError(Conflict)
	.addError(BadRequest) {}

export class LabelsGroup extends HttpApiGroup.make("labels")
	.add(
		HttpApiEndpoint.get("byTask", "/api/label/task/:taskId")
			.setPath(Schema.Struct({ taskId: Id }))
			.addSuccess(Json),
	)
	.add(
		HttpApiEndpoint.get(
			"byOrganization",
			"/api/label/organization/:organizationId",
		)
			.setPath(Schema.Struct({ organizationId: Id }))
			.addSuccess(Json),
	)
	.add(
		HttpApiEndpoint.post("create", "/api/label")
			.setPayload(
				Schema.Struct({
					name: Schema.String,
					color: Schema.String,
					organizationId: Schema.String,
					taskId: Schema.optional(Schema.String),
				}),
			)
			.addSuccess(Json),
	)
	.add(
		HttpApiEndpoint.get("get", "/api/label/:id")
			.setPath(Schema.Struct({ id: Id }))
			.addSuccess(Json),
	)
	.add(
		HttpApiEndpoint.put("assign", "/api/label/:id/task")
			.setPath(Schema.Struct({ id: Id }))
			.setPayload(Schema.Struct({ taskId: Schema.String }))
			.addSuccess(Json),
	)
	.add(
		HttpApiEndpoint.del("unassign", "/api/label/:id/task")
			.setPath(Schema.Struct({ id: Id }))
			.addSuccess(Json),
	)
	.add(
		HttpApiEndpoint.put("update", "/api/label/:id")
			.setPath(Schema.Struct({ id: Id }))
			.setPayload(Schema.Struct({ name: Schema.String, color: Schema.String }))
			.addSuccess(Json),
	)
	.add(
		HttpApiEndpoint.del("delete", "/api/label/:id")
			.setPath(Schema.Struct({ id: Id }))
			.addSuccess(Json),
	)
	.addError(Unauthorized)
	.addError(Forbidden)
	.addError(NotFound)
	.addError(Conflict)
	.addError(BadRequest) {}
