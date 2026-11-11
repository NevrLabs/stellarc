import { Cause, Effect, Exit, Fiber, Layer, ManagedRuntime } from "effect";
import {
	McpClient,
	McpClientError,
	McpProtocol,
	type McpSchema,
} from "effect/ai";
import { FetchHttpClient } from "effect/http";
import { Denied } from "../../../packages/core-auth/src/store";

// Bounded remote MCP client slice for the stellarc tool gateway.
//
// Custody rules (structural, not runtime filters):
//   - The endpoint and credential headers come ONLY from server-owned config
//     passed to connectRemoteMcp. No caller URL, and no gateway request
//     headers ever reach this module, so the gateway bearer cannot be
//     forwarded upstream.
//   - Transport, protocol and JSON-RPC handling are the installed Effect
//     McpClient (streamable HTTP); this module only adds guards: https-only
//     (loopback http for local fixtures), no URL credentials/query/fragment,
//     no redirects, validated config bounds, message-byte cap, per-operation
//     deadline, caller-abort cancellation, content bounds, aggregate
//     discovery bounds, and sanitized failures (upstream error text, bodies
//     and headers never leave this module).

export type RemoteMcpOptions = {
	/** Server-owned remote endpoint. https required; loopback http allowed. */
	url: string;
	/** Server-owned credential headers for the remote server only. */
	headers?: Record<string, string>;
};
export type RemoteMcpBounds = {
	/** Max JSON-RPC message bytes in either direction (transport enforced). */
	messageBytes: number;
	/** Max content items accepted in one tool result. */
	contentItems: number;
	/** Max total text characters across content items. */
	contentChars: number;
	/** Deadline for each MCP operation, including discovery and calls. */
	timeoutMillis: number;
};

const RESERVED_HEADERS = new Set([
	"host",
	"cookie",
	"content-length",
	"transfer-encoding",
	"mcp-session-id",
	"mcp-protocol-version",
]);
// RFC 9110 token; rejects whitespace, CR/LF, empty and non-ASCII names.
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
// Header values must never carry CR/LF/NUL (request smuggling).
const HEADER_VALUE_FORBIDDEN = /[\r\n\0]/;
// Ceilings for admin-owned bounds: reject nonsense before any I/O.
// messageBytes matches the Effect McpClient default ceiling (16 MiB).
const BOUNDS_CEILINGS: Record<keyof RemoteMcpBounds, number> = {
	messageBytes: 16 * 1024 * 1024,
	contentItems: 1000,
	contentChars: 1_000_000,
	timeoutMillis: 300_000,
};
// ponytail: fixed tight discovery bounds instead of new config knobs;
// raise if a real remote server legitimately lists more than this.
const DISCOVERY_LIMITS = { maxPages: 25, maxItems: 1000 };

const loopbackHttp = (url: URL) =>
	url.protocol === "https:" ||
	(url.protocol === "http:" &&
		["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));

function validateBounds(bounds: RemoteMcpBounds): void {
	for (const key of Object.keys(BOUNDS_CEILINGS) as Array<
		keyof RemoteMcpBounds
	>) {
		const value = bounds[key];
		if (
			!Number.isSafeInteger(value) ||
			value <= 0 ||
			value > BOUNDS_CEILINGS[key]
		)
			throw new Denied(400, "remote_bounds_invalid");
	}
}

// Upstream failures never leave this module verbatim: McpClientError
// messages embed remote-controlled body text (JSON-RPC error descriptions,
// tool error content) and header values (www-authenticate). Map to bounded
// Denied reasons; our own Denied errors pass through unchanged.
function toDenied(failure: unknown): Error {
	if (failure instanceof Denied) return failure;
	const reason = McpClientError.isMcpClientError(failure)
		? failure.reason
		: undefined;
	switch (reason?._tag) {
		case "TimeoutError":
			return new Denied(504, "remote_timeout");
		case "HttpError":
			return new Denied(502, "remote_http_status");
		case "LimitError":
			return new Denied(502, "remote_limit");
		default:
			return new Denied(502, "remote_failure");
	}
}

function bindResult(
	result: McpSchema.CallToolResult,
	bounds: RemoteMcpBounds,
): McpSchema.CallToolResult {
	const content = result.content ?? [];
	if (content.length > bounds.contentItems)
		throw new Denied(502, "remote_content_items");
	let chars = 0;
	for (const item of content)
		if (
			typeof item === "object" &&
			"text" in item &&
			typeof item.text === "string"
		)
			chars += item.text.length;
	if (chars > bounds.contentChars)
		throw new Denied(502, "remote_content_chars");
	return result;
}

export async function connectRemoteMcp(
	options: RemoteMcpOptions,
	bounds: RemoteMcpBounds,
) {
	validateBounds(bounds);
	const url = new URL(options.url);
	if (!loopbackHttp(url)) throw new Denied(400, "remote_url_denied");
	// Credentials, query strings and fragments are custody violations:
	// fetch would forward basic-auth from the URL, and query/fragment end up
	// in upstream logs or are silently ignored. MCP endpoints take neither.
	if (url.username || url.password || url.search || url.hash)
		throw new Denied(400, "remote_url_denied");
	for (const [name, value] of Object.entries(options.headers ?? {})) {
		if (
			typeof value !== "string" ||
			!HEADER_NAME.test(name) ||
			HEADER_VALUE_FORBIDDEN.test(value)
		)
			throw new Denied(400, "remote_header_denied");
		const lower = name.toLowerCase();
		// The whole mcp-* family is transport-owned, not just the two the
		// current protocol revision happens to set.
		if (RESERVED_HEADERS.has(lower) || lower.startsWith("mcp-"))
			throw new Denied(400, "remote_header_denied");
	}
	const layer = McpClient.layerHttp({
		name: "stellarc-gateway",
		version: "0.1.0",
		url,
		protocol: McpProtocol.v2025_11_25,
		headers: { ...(options.headers ?? {}) },
		maxMessageBytes: bounds.messageBytes,
		discoveryLimits: DISCOVERY_LIMITS,
		// Bounds initialization and discovery scans; calls add their own.
		timeout: bounds.timeoutMillis,
	}).pipe(
		// fetch follows redirects by default; refuse them outright.
		Layer.provide(
			Layer.succeed(FetchHttpClient.RequestInit, { redirect: "error" }),
		),
		Layer.provide(FetchHttpClient.layer),
	);
	const runtime = ManagedRuntime.make(layer);
	function run<A, E>(
		program: Effect.Effect<A, E, McpClient.McpClient>,
		signal?: AbortSignal,
	): Promise<A> {
		if (signal?.aborted) return Promise.reject(new Denied(499, "cancelled"));
		const fiber = runtime.runFork(program);
		const cancel = () => {
			void runtime.runPromise(Fiber.interrupt(fiber)).catch(() => {});
		};
		if (signal) signal.addEventListener("abort", cancel, { once: true });
		return (
			runtime
				.runPromise(Fiber.await(fiber))
				// The rejection path carries a failed layer build (first call on a
				// dead remote): ManagedRuntime rejects with the raw McpClientError,
				// bypassing the Exit below. Sanitize both paths.
				.then(finish, (failure: unknown) => {
					if (signal?.aborted) throw new Denied(499, "cancelled");
					throw toDenied(failure);
				})
				.finally(() => signal?.removeEventListener("abort", cancel))
		);
		// Abort wins over every other outcome: a caller who aborted never
		// receives success bytes or upstream failure detail.
		function finish(exit: Exit.Exit<A, E | McpClientError.McpClientError>): A {
			if (Exit.isFailure(exit)) {
				if (signal?.aborted) throw new Denied(499, "cancelled");
				throw toDenied(Cause.squash(exit.cause));
			}
			if (signal?.aborted) throw new Denied(499, "cancelled");
			return exit.value;
		}
	}
	return {
		listTools: (signal?: AbortSignal) =>
			run(
				Effect.flatMap(McpClient.McpClient, (c) => c.listTools()),
				signal,
			),
		callTool: (
			tool: McpSchema.Tool,
			args: Record<string, unknown> | undefined,
			signal?: AbortSignal,
		) =>
			run(
				Effect.flatMap(McpClient.McpClient, (c) =>
					c.callTool(
						{ tool, ...(args === undefined ? {} : { arguments: args }) },
						{ timeout: bounds.timeoutMillis },
					),
				).pipe(
					Effect.flatMap((result) =>
						Effect.try({
							try: () => bindResult(result, bounds),
							catch: (error) =>
								error instanceof Error
									? error
									: new Denied(502, "remote_content_bound"),
						}),
					),
				),
				signal,
			),
		describe: () =>
			run(
				Effect.flatMap(McpClient.McpClient, (c) =>
					Effect.succeed({
						protocolVersion: c.protocolVersion,
						serverInfo: c.serverInfo,
					}),
				),
			),
		dispose: () => runtime.dispose(),
	};
}
export type RemoteMcp = Awaited<ReturnType<typeof connectRemoteMcp>>;
