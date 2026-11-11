import { AsyncLocalStorage } from "node:async_hooks";
import { Context, Effect, Layer } from "effect";
import { McpProtocol, McpSchema, McpServer } from "effect/ai";
import { HttpRouter } from "effect/http";
import { Denied } from "../../../packages/core-auth/src/store";

type Invocation = {
	authorize: () => Promise<{ runId?: string }>;
	finish: (
		id: string,
		outcome: "completed" | "failed" | "cancelled",
	) => Promise<void>;
	signal: AbortSignal;
	requestId: string;
	actor: string;
	subject: string;
	org: string;
};
export function mcpGateway(
	origin: string,
	telemetry: Layer.Layer<never>,
	memoMap: Layer.MemoMap,
) {
	const current = new AsyncLocalStorage<Invocation>();
	const registrations = Layer.effectDiscard(
		Effect.gen(function* () {
			const server = yield* McpServer.McpServer;
			const services = yield* Effect.context<never>();
			yield* server.addTool({
				tool: new McpSchema.Tool({
					name: "stellarc_status",
					description:
						"Read this gateway's metadata and authenticated identity. No prompts, secrets or host commands.",
					inputSchema: {
						type: "object",
						properties: {},
						additionalProperties: false,
					},
				}),
				annotations: Context.empty(),
				services,
				handle: (payload: unknown) =>
					Effect.tryPromise({
						try: async () => {
							const request = current.getStore();
							if (!request) throw new Denied(401, "missing_identity");
							if (
								!payload ||
								typeof payload !== "object" ||
								Array.isArray(payload) ||
								Object.keys(payload).length
							)
								throw new Denied(400, "invalid_arguments");
							const admitted = await request.authorize();
							if (!admitted.runId) throw new Error("Missing admitted run");
							if (request.signal.aborted) {
								await request.finish(admitted.runId, "cancelled");
								throw new Denied(499, "cancelled");
							}
							await request.finish(admitted.runId, "completed");
							if (request.signal.aborted) throw new Denied(499, "cancelled");
							return {
								content: [
									{
										type: "text" as const,
										text: JSON.stringify({
											service: "stellarc-gateway",
											provider: "LOCAL FIXTURE ONLY",
											actor: request.actor,
											subject: request.subject,
											org: request.org,
											requestId: request.requestId,
											runId: admitted.runId,
										}),
									},
								],
							};
						},
						catch: () =>
							new McpSchema.InternalError({
								message: "Tool denied or unavailable",
							}),
					}).pipe(Effect.withSpan("stellarc.mcp.stellarc_status")),
			});
		}),
	);
	const sessions = new Map<string, { binding: string; expires: number }>();
	const layer = McpServer.layerHttp({
		name: "stellarc-gateway",
		version: "0.1.0",
		path: "/mcp",
		protocols: [McpProtocol.v2025_11_25, McpProtocol.v2026_07_28],
		allowedOrigins: [origin],
		allowSessionTermination: true,
		allowSubscriptions: false,
		registrations,
	}).pipe(Layer.provideMerge(HttpRouter.layer), Layer.provideMerge(telemetry));
	const handler = HttpRouter.toWebHandler(layer, { memoMap });
	return {
		async handler(request: Request, invocation: Invocation) {
			const binding = JSON.stringify([
				invocation.actor,
				invocation.subject,
				invocation.org,
				request.headers.get("x-stellarc-delegation") ?? "",
			]);
			const session = request.headers.get("mcp-session-id");
			for (const [id, s] of sessions)
				if (s.expires <= Date.now()) sessions.delete(id);
			if (session && sessions.get(session)?.binding !== binding)
				return new Response("session not found", { status: 404 });
			if (!session && sessions.size >= 1000)
				return new Response("session capacity", { status: 429 });
			const response = await current.run(invocation, () =>
				handler.handler(request),
			);
			const created = response.headers.get("mcp-session-id");
			if (created)
				sessions.set(created, { binding, expires: Date.now() + 3600000 });
			if (session && request.method === "DELETE") sessions.delete(session);
			return response;
		},
		dispose: handler.dispose,
	};
}
