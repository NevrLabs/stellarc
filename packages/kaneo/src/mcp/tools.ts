/**
 * Effect-v4 port of the kaneo MCP tool surface (kaneo-legacy src/mcp/tools.ts).
 *
 * Every tool handler is an Effect participating in tracing/telemetry like the
 * rest of the v4 tree (spans named `mcp.tool.<name>`), decodes its input with
 * the shared Effect Schema (single source of truth; the JSON Schema advertised
 * over MCP is derived from the same declaration), and proxies to the kaneo HTTP
 * API over loopback with the CALLER's token — same as the legacy tools.
 *
 * Per-caller identity: unlike the legacy per-session McpServer closures, the
 * effect/ai server is shared across sessions, so handlers resolve the caller
 * per request from `HttpServerRequest` headers via the same BetterAuth/API-key
 * principal resolver the native handlers use.
 */

import { Context, Effect, Schema } from "effect";
import { McpSchema } from "effect/ai";
import { HttpServerRequest } from "effect/http";
import * as S from "./schemas";

/* ---------- caller context ---------- */

export interface McpPrincipal {
	readonly userId: string;
	readonly token: string;
}

/** Resolve the caller of an MCP request from its headers (host-side auth). */
export type PrincipalResolver = (
	headers: Headers,
) => Promise<McpPrincipal | null>;

/** Per-request principal, provided by the gate middleware in http.ts. */
export class McpRequestPrincipal extends Context.Service<
	McpRequestPrincipal,
	McpPrincipal | undefined
>()("stellarc/mcp/McpRequestPrincipal", {
	make: Effect.succeed(undefined),
}) {}

/* ---------- API client (loopback, caller's token) ---------- */

export class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
	message: Schema.String,
}) {}

const fetchJson = Effect.fn("mcp.api.fetch")(function* (
	resolver: PrincipalResolver,
	path: string,
	init?: RequestInit,
) {
	const request = yield* HttpServerRequest.HttpServerRequest;
	const principal = yield* Effect.flatMap(
		Effect.tryPromise({
			try: () => resolver(new Headers(request.headers)),
			catch: () =>
				new ApiError({
					message: "Unauthorized: no valid token for this MCP request.",
				}),
		}),
		(p) =>
			p === null
				? Effect.fail(
						new ApiError({
							message: "Unauthorized: no valid token for this MCP request.",
						}),
					)
				: Effect.succeed(p),
	);
	const headers = new Headers(init?.headers);
	headers.set("Authorization", `Bearer ${principal.token}`);
	if (init?.body != null && !headers.has("Content-Type"))
		headers.set("Content-Type", "application/json");
	const url = `${apiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
	const response = yield* Effect.tryPromise({
		try: () =>
			fetch(url, { ...init, headers, signal: AbortSignal.timeout(10_000) }),
		catch: (cause) =>
			new ApiError({
				message: `${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
			}),
	});
	const text = yield* Effect.tryPromise({
		try: () => response.text(),
		catch: () => new ApiError({ message: `${path}: unreadable response body` }),
	});
	let body: unknown = null;
	if (text) {
		try {
			body = JSON.parse(text);
		} catch {
			body = text;
		}
	}
	if (!response.ok) {
		const detail =
			typeof body === "object" && body !== null && "message" in body
				? (body as { message: string }).message
				: typeof body === "string" && body.length > 0
					? body.slice(0, 500)
					: `HTTP ${response.status}`;
		return yield* new ApiError({ message: `${path}: ${detail}` });
	}
	return body;
});

let baseUrl = "";
export const setApiBaseUrl = (url: string) => {
	baseUrl = url.replace(/\/api\/?$/, "");
};
const apiBaseUrl = () => baseUrl;

/* ---------- result helpers (SDK parity) ---------- */

const textResult = (data: unknown, isError = false) =>
	new McpSchema.CallToolResult({
		content: [
			{
				type: "text",
				text:
					typeof data === "string"
						? data
						: (JSON.stringify(data, null, 2) ?? ""),
			},
		] as never,
		...(isError ? { isError: true } : {}),
	});

const errorResult = (message: string) => textResult({ error: message }, true);

/** Wrap a handler body: data → text result, ApiError → isError result. */
const run = <A, R extends HttpServerRequest.HttpServerRequest>(
	body: Effect.Effect<A, ApiError, R>,
): Effect.Effect<McpSchema.CallToolResult, never, R> =>
	body.pipe(
		Effect.map((data) => textResult(data)),
		Effect.catch((e: ApiError) => Effect.succeed(errorResult(e.message))),
	);

/* ---------- tool registry ---------- */

export interface McpToolSpec {
	readonly name: string;
	readonly description: string;
	/** JSON Schema derived from the tool's Effect Schema (single source of truth). */
	readonly jsonSchema: Schema.JsonObject;
	readonly handler: (
		args: unknown,
	) => Effect.Effect<
		McpSchema.CallToolResult,
		never,
		HttpServerRequest.HttpServerRequest
	>;
}

const tool = <A, I, RD>(
	name: string,
	description: string,
	schema: Schema.Codec<A, I, RD, unknown>,
	handler: (
		args: A,
	) => Effect.Effect<unknown, ApiError, HttpServerRequest.HttpServerRequest>,
): McpToolSpec => ({
	name,
	description,
	jsonSchema: jsonSchemaOf(schema),
	handler: (payload) =>
		Effect.gen(function* () {
			const decoded = yield* Effect.result(
				Schema.decodeUnknownEffect(schema)(payload),
			);
			if (decoded._tag === "Failure") {
				// SDK parity: the reference transport wraps zod failures into an
				// isError tool result (HTTP 200) whose text starts
				// "MCP error -32602: Input validation error: Invalid arguments
				// for tool <name>:" — not a JSON-RPC protocol error. Captured
				// in the scratch trial; see the PR body diff table.
				return textResult(
					`MCP error -32602: Input validation error: Invalid arguments for tool ${name}: ${decoded.failure.message}`,
					true,
				);
			}
			return yield* run(handler(decoded.success));
		}) as Effect.Effect<
			McpSchema.CallToolResult,
			never,
			HttpServerRequest.HttpServerRequest
		>,
});

/** MCP requires an object-root JSON Schema; derive it from the Effect Schema
 * exactly as effect/ai's own registerToolkit does (top-level $ref inlined). */
const jsonSchemaOf = (schema: Schema.Top): Schema.JsonObject => {
	const document = Schema.toJsonSchemaDocument(schema as never, {
		onExcessProperty: "ignore",
	});
	const defs = (document.definitions ?? {}) as Record<string, unknown>;
	const root = document.schema as Schema.JsonObject & { $ref?: string };
	if (root.$ref !== undefined) {
		const target = defs[root.$ref.replace(/^#\/\$defs\//, "")];
		if (target !== undefined)
			return { ...(target as Schema.JsonObject) } as Schema.JsonObject;
	}
	// No-argument tools derive `not:{type:"null"}`-style roots; MCP requires an
	// object schema, so canonicalise to the empty object.
	if (root.type !== "object")
		return { type: "object", properties: {} } as Schema.JsonObject;
	return Object.keys(defs).length === 0
		? root
		: ({ ...root, $defs: defs } as Schema.JsonObject);
};

export interface McpGuards {
	readonly guardTask: (
		taskId: string,
		permissions: Record<string, string[]>,
	) => Effect.Effect<void, ApiError>;
	readonly guardBoard: (
		boardId: string,
		permissions: Record<string, string[]>,
	) => Effect.Effect<void, ApiError>;
}

/** Registry of every MCP tool the port serves (name order = tools.ts order). */
export const mcpTools = (
	resolver: PrincipalResolver,
	guards: McpGuards,
): ReadonlyArray<McpToolSpec> => [
	tool("whoami", "Return the current Kaneo session and user.", S.Whoami, () =>
		fetchJson(resolver, "/api/auth/get-session", { method: "GET" }),
	),
	tool(
		"list_organizations",
		"List organizations the authenticated principal (user session or agent key) can access. Agent keys see only the organization they are scoped to.",
		S.ListOrganizations,
		() => fetchJson(resolver, "/api/organization", { method: "GET" }),
	),
	tool(
		"list_boards",
		"List boards in a organization.",
		S.ListBoards,
		(args) => {
			const qs = new URLSearchParams({ organizationId: args.organizationId });
			if (args.includeArchived === true) qs.set("includeArchived", "true");
			return fetchJson(resolver, `/api/board?${qs.toString()}`, {
				method: "GET",
			});
		},
	),
	tool("get_board", "Get a single board by ID.", S.GetBoard, (args) =>
		fetchJson(resolver, `/api/board/${encodeURIComponent(args.id)}`),
	),
	tool(
		"create_board",
		"Create a board in a organization.",
		S.CreateBoard,
		(args) =>
			fetchJson(resolver, "/api/board", {
				method: "POST",
				body: JSON.stringify({
					name: args.name,
					organizationId: args.organizationId,
					icon: args.icon,
					slug: args.slug,
				}),
			}),
	),
	tool(
		"update_board",
		"Update board metadata (PATCH-style: only provided fields are changed).",
		S.UpdateBoard,
		(args) => {
			const { id, ...patch } = args;
			return Effect.gen(function* () {
				const existing = (yield* fetchJson(
					resolver,
					`/api/board/${encodeURIComponent(id)}`,
					{ method: "GET" },
				)) as Record<string, unknown>;
				const name =
					patch.name ??
					(typeof existing.name === "string" ? existing.name : "");
				if (!name)
					return yield* new ApiError({
						message: "Cannot update board: missing name.",
					});
				const icon =
					patch.icon !== undefined
						? patch.icon
						: typeof existing.icon === "string"
							? existing.icon
							: "Layout";
				const slug =
					patch.slug ??
					(typeof existing.slug === "string" ? existing.slug : "");
				if (!slug)
					return yield* new ApiError({
						message: "Cannot update board: missing slug.",
					});
				const description =
					patch.description !== undefined
						? patch.description
						: typeof existing.description === "string"
							? existing.description
							: "";
				const isPublic =
					patch.isPublic !== undefined
						? patch.isPublic
						: typeof existing.isPublic === "boolean"
							? existing.isPublic
							: false;
				return yield* fetchJson(
					resolver,
					`/api/board/${encodeURIComponent(id)}`,
					{
						method: "PUT",
						body: JSON.stringify({ name, icon, slug, description, isPublic }),
					},
				);
			});
		},
	),
	tool(
		"list_tasks",
		"List tasks for a board (optionally filtered/sorted).",
		S.ListTasks,
		(args) => {
			const { boardId, ...rest } = args;
			const qs = new URLSearchParams();
			for (const [k, v] of Object.entries(rest)) {
				if (v !== undefined && v !== null) qs.set(k, String(v));
			}
			const q = qs.toString();
			return fetchJson(
				resolver,
				`/api/task/tasks/${encodeURIComponent(boardId)}${q ? `?${q}` : ""}`,
				{ method: "GET" },
			);
		},
	),
	tool("get_task", "Get a task by ID.", S.GetTask, (args) =>
		Effect.gen(function* () {
			yield* guards.guardTask(args.taskId, { task: ["read"] });
			return yield* fetchJson(
				resolver,
				`/api/task/${encodeURIComponent(args.taskId)}`,
				{
					method: "GET",
				},
			);
		}),
	),
	tool("create_task", "Create a task in a board.", S.CreateTask, (args) => {
		const body: Record<string, string | undefined> = {
			title: args.title,
			description: args.description,
			priority: args.priority,
			status: args.status,
		};
		if (args.startDate !== undefined) body.startDate = args.startDate;
		if (args.dueDate !== undefined) body.dueDate = args.dueDate;
		if (args.userId !== undefined) body.userId = args.userId;
		return Effect.gen(function* () {
			yield* guards.guardBoard(args.boardId, { task: ["create"] });
			if (args.userId !== undefined) {
				yield* guards.guardBoard(args.boardId, { task: ["assign"] });
			}
			return yield* fetchJson(
				resolver,
				`/api/task/${encodeURIComponent(args.boardId)}`,
				{
					method: "POST",
					body: JSON.stringify(body),
				},
			);
		});
	}),
	tool(
		"assign_task",
		"Assign a task to a user (or unassign by omitting userId). Requires task:assign in the task's organization.",
		S.AssignTask,
		(args) =>
			Effect.gen(function* () {
				yield* guards.guardTask(args.taskId, { task: ["assign"] });
				return yield* fetchJson(
					resolver,
					`/api/task/assignee/${encodeURIComponent(args.taskId)}`,
					{
						method: "PUT",
						body: JSON.stringify({
							userId: args.userId === undefined ? null : args.userId,
							teamId: null,
						}),
					},
				);
			}),
	),
	tool(
		"update_task",
		"Update a task (fetches current task, merges fields, then full update).",
		S.UpdateTask,
		(args) => {
			const { taskId, ...patch } = args;
			return Effect.gen(function* () {
				yield* guards.guardTask(taskId, { task: ["update"] });
				if (patch.userId !== undefined) {
					yield* guards.guardTask(taskId, { task: ["assign"] });
				}
				const existing = (yield* fetchJson(
					resolver,
					`/api/task/${encodeURIComponent(taskId)}`,
					{ method: "GET" },
				)) as Record<string, unknown>;
				const body = buildFullTaskUpdateBody(existing, patch);
				return yield* fetchJson(
					resolver,
					`/api/task/${encodeURIComponent(taskId)}`,
					{
						method: "PUT",
						body: JSON.stringify(body),
					},
				);
			});
		},
	),
	tool(
		"move_task",
		"Move a task to another board (and optional column status).",
		S.MoveTask,
		(args) =>
			fetchJson(resolver, `/api/task/move/${encodeURIComponent(args.taskId)}`, {
				method: "PUT",
				body: JSON.stringify({
					destinationBoardId: args.destinationBoardId,
					...(args.destinationStatus !== undefined
						? { destinationStatus: args.destinationStatus }
						: {}),
				}),
			}),
	),
	tool(
		"update_task_status",
		"Update only the status (column) of a task.",
		S.UpdateTaskStatus,
		(args) =>
			fetchJson(
				resolver,
				`/api/task/status/${encodeURIComponent(args.taskId)}`,
				{
					method: "PUT",
					body: JSON.stringify({ status: args.status }),
				},
			),
	),
	tool(
		"list_task_comments",
		"List comments on a task.",
		S.ListTaskComments,
		(args) =>
			fetchJson(resolver, `/api/comment/${encodeURIComponent(args.taskId)}`, {
				method: "GET",
			}),
	),
	tool(
		"create_task_comment",
		"Add a comment to a task.",
		S.CreateTaskComment,
		(args) =>
			fetchJson(resolver, `/api/comment/${encodeURIComponent(args.taskId)}`, {
				method: "POST",
				body: JSON.stringify({ content: args.content }),
			}),
	),
	tool(
		"update_task_comment",
		"Update one of your comments on a task.",
		S.UpdateTaskComment,
		(args) =>
			fetchJson(
				resolver,
				`/api/comment/${encodeURIComponent(args.commentId)}`,
				{
					method: "PUT",
					body: JSON.stringify({ content: args.content }),
				},
			),
	),
	tool(
		"delete_task_comment",
		"Delete one of your comments from a task.",
		S.DeleteTaskComment,
		(args) =>
			fetchJson(
				resolver,
				`/api/comment/${encodeURIComponent(args.commentId)}`,
				{
					method: "DELETE",
				},
			),
	),
	tool(
		"list_organization_labels",
		"List labels defined in a organization.",
		S.ListOrganizationLabels,
		(args) =>
			fetchJson(
				resolver,
				`/api/label/organization/${encodeURIComponent(args.organizationId)}`,
				{ method: "GET" },
			),
	),
	tool(
		"create_label",
		"Create a label in a organization (optionally attach to a task).",
		S.CreateLabel,
		(args) =>
			fetchJson(resolver, "/api/label", {
				method: "POST",
				body: JSON.stringify({
					name: args.name,
					color: args.color,
					organizationId: args.organizationId,
					...(args.taskId !== undefined ? { taskId: args.taskId } : {}),
				}),
			}),
	),
	tool(
		"attach_label_to_task",
		"Attach an existing label to a task.",
		S.AttachLabelToTask,
		(args) =>
			fetchJson(
				resolver,
				`/api/label/${encodeURIComponent(args.labelId)}/task`,
				{
					method: "PUT",
					body: JSON.stringify({ taskId: args.taskId }),
				},
			),
	),
	tool(
		"detach_label_from_task",
		"Detach a label from its current task.",
		S.DetachLabelFromTask,
		(args) =>
			fetchJson(
				resolver,
				`/api/label/${encodeURIComponent(args.labelId)}/task`,
				{
					method: "DELETE",
				},
			),
	),
	tool(
		"create_task_relation",
		"Create a relation between two tasks. relationType: 'subtask' (sourceTaskId is the parent, targetTaskId the child), 'blocks' (sourceTaskId blocks targetTaskId), or 'related' (bidirectional).",
		S.CreateTaskRelation,
		(args) =>
			fetchJson(resolver, "/api/task-relation", {
				method: "POST",
				body: JSON.stringify({
					sourceTaskId: args.sourceTaskId,
					targetTaskId: args.targetTaskId,
					relationType: args.relationType,
				}),
			}),
	),
	tool(
		"get_task_relations",
		"List all relations (subtask/blocks/related) involving a task.",
		S.GetTaskRelations,
		(args) =>
			fetchJson(
				resolver,
				`/api/task-relation/${encodeURIComponent(args.taskId)}`,
				{
					method: "GET",
				},
			),
	),
	tool(
		"delete_task_relation",
		"Delete a task relation by its relation ID.",
		S.DeleteTaskRelation,
		(args) =>
			fetchJson(resolver, `/api/task-relation/${encodeURIComponent(args.id)}`, {
				method: "DELETE",
			}),
	),
	tool(
		"delete_label",
		"Delete a label by ID. Only task-associated labels can be deleted; organization-level labels (taskId null) are rejected by the API.",
		S.DeleteLabel,
		(args) =>
			Effect.gen(function* () {
				const label = (yield* fetchJson(
					resolver,
					`/api/label/${encodeURIComponent(args.id)}`,
					{ method: "GET" },
				)) as { taskId?: string | null };
				if (!label?.taskId) {
					return yield* new ApiError({
						message:
							"Label is not associated with a task and cannot be deleted (organization-level labels are not deletable via this endpoint).",
					});
				}
				return yield* fetchJson(
					resolver,
					`/api/label/${encodeURIComponent(args.id)}`,
					{
						method: "DELETE",
					},
				);
			}),
	),
	tool(
		"list_board_columns",
		"List a board's columns. The `slug` of a column is the exact value the `status` argument of create_task, update_task, update_task_status and move_task expects — call this before writing a status rather than guessing. Also returns `isFinal`, which marks columns that count as complete.",
		S.ListBoardColumns,
		(args) =>
			fetchJson(resolver, `/api/column/${encodeURIComponent(args.boardId)}`, {
				method: "GET",
			}),
	),
	tool(
		"search",
		"Search across tasks, boards, comments, activities, repositories, GitHub issues and pull requests in one call. Use this to resolve a name or keyword to an ID before acting, instead of listing boards and scanning them. `organizationId` is required — get one from list_organizations first.",
		S.Search,
		(args) => {
			const params = new URLSearchParams({
				q: args.q,
				organizationId: args.organizationId,
			});
			if (args.type) params.set("type", args.type);
			if (args.boardId) params.set("boardId", args.boardId);
			if (args.limit !== undefined) params.set("limit", String(args.limit));
			return fetchJson(resolver, `/api/search?${params.toString()}`, {
				method: "GET",
			});
		},
	),
	tool(
		"list_organization_members",
		"List members of an organization with their user IDs. Use this to resolve a person's name or email to the `userId` that create_task and update_task expect for assignment.",
		S.ListOrganizationMembers,
		(args) =>
			fetchJson(
				resolver,
				`/api/auth/organization/list-members?organizationId=${encodeURIComponent(args.organizationId)}`,
				{ method: "GET" },
			),
	),
	tool(
		"list_repos",
		"List repositories connected to an organization.",
		S.ListRepos,
		(args) =>
			fetchJson(
				resolver,
				`/api/repo?organizationId=${encodeURIComponent(args.organizationId)}`,
				{ method: "GET" },
			),
	),
	tool(
		"list_repo_pull_requests",
		"List pull requests for a connected repository, optionally filtered by state.",
		S.ListRepoPullRequests,
		(args) => {
			const params = new URLSearchParams();
			if (args.state) params.set("state", args.state);
			const query = params.size > 0 ? `?${params.toString()}` : "";
			return fetchJson(
				resolver,
				`/api/repo/${encodeURIComponent(args.repoId)}/pull-requests${query}`,
				{ method: "GET" },
			);
		},
	),
	tool(
		"list_repo_issues",
		"List GitHub issues for a connected repository, optionally filtered by state.",
		S.ListRepoIssues,
		(args) => {
			const params = new URLSearchParams();
			if (args.state) params.set("state", args.state);
			const query = params.size > 0 ? `?${params.toString()}` : "";
			return fetchJson(
				resolver,
				`/api/repo/${encodeURIComponent(args.repoId)}/issues${query}`,
				{ method: "GET" },
			);
		},
	),
	tool(
		"get_repo_pull_request_files",
		"Get the changed files and patches for a pull request — the diff an agent needs to review code rather than only read metadata.",
		S.GetRepoPullRequestFiles,
		(args) =>
			fetchJson(
				resolver,
				`/api/repo/${encodeURIComponent(args.repoId)}/pull-requests/${args.number}/files`,
				{ method: "GET" },
			),
	),
];

/* ---------- task update merge (legacy buildFullTaskUpdateBody) ---------- */

const PRIORITIES = ["no-priority", "low", "medium", "high", "urgent"] as const;

const isTaskPriority = (v: string): v is (typeof PRIORITIES)[number] =>
	(PRIORITIES as readonly string[]).includes(v);

function formatOptionalIso(value: unknown): string | undefined {
	if (value === null || value === undefined) return undefined;
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "string") return value;
	return undefined;
}

export function buildFullTaskUpdateBody(
	existing: Record<string, unknown>,
	patch: Record<string, unknown>,
): Record<string, string | number | undefined> {
	const positionRaw = patch.position ?? existing.position;
	const position =
		typeof positionRaw === "number"
			? positionRaw
			: typeof positionRaw === "string"
				? Number(positionRaw)
				: Number.NaN;
	if (!Number.isFinite(position))
		throw new Error(
			"Cannot update task: missing numeric `position` on existing task.",
		);

	const title =
		(patch.title as string) ??
		(typeof existing.title === "string" ? existing.title : undefined);
	if (!title) throw new Error("Cannot update task: missing title.");

	const description =
		patch.description !== undefined
			? patch.description === null
				? ""
				: String(patch.description)
			: existing.description == null
				? ""
				: String(existing.description);

	const status =
		(patch.status as string) ??
		(typeof existing.status === "string" ? existing.status : undefined);
	if (!status) throw new Error("Cannot update task: missing status.");

	const priorityRaw =
		(patch.priority as string) ??
		(typeof existing.priority === "string" ? existing.priority : undefined);
	if (!priorityRaw || !isTaskPriority(priorityRaw))
		throw new Error("Cannot update task: invalid or missing priority.");

	const boardId =
		(patch.boardId as string) ??
		(typeof existing.boardId === "string" ? existing.boardId : undefined);
	if (!boardId) throw new Error("Cannot update task: missing boardId.");

	const userId =
		patch.userId !== undefined
			? patch.userId === null
				? ""
				: (patch.userId as string)
			: typeof existing.userId === "string"
				? existing.userId
				: undefined;

	const startDate = formatOptionalIso(
		patch.startDate !== undefined ? patch.startDate : existing.startDate,
	);
	const dueDate = formatOptionalIso(
		patch.dueDate !== undefined ? patch.dueDate : existing.dueDate,
	);

	const body: Record<string, string | number | undefined> = {
		title,
		description,
		status,
		priority: priorityRaw,
		boardId,
		position,
	};
	if (startDate !== undefined) body.startDate = startDate;
	if (dueDate !== undefined) body.dueDate = dueDate;
	if (userId !== undefined) body.userId = userId;
	return body;
}
