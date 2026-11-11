import assert from "node:assert/strict";
import { connectRemoteMcp } from "./remote-mcp";

// Metadata-only local fixture MCP server. No external endpoints, no secrets.
// Exercises: discovery, header custody, content/response/time bounds,
// cancellation, redirect refusal, URL custody, config validation,
// upstream-error redaction, pagination bounds.
// Every failure asserts an exact reason, never "any exception".
const MARKER = "SECRET-MARKER-7f31c9";
const bounds = {
	messageBytes: 64 * 1024,
	contentItems: 4,
	contentChars: 4096,
	timeoutMillis: 1500,
};
let mode = "ok";
const seen: Array<{
	method: string;
	auth: string | null;
	delegation: boolean;
}> = [];
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	async fetch(request) {
		const url = new URL(request.url);
		if (mode === "redirect-init" && seen.length === 0)
			return new Response(null, {
				status: 302,
				headers: { location: `${url.origin}/evil` },
			});
		const message = (await request.json().catch(() => ({}))) as {
			id?: number;
			method?: string;
			params?: { cursor?: string };
		};
		seen.push({
			method: message.method ?? "?",
			auth: request.headers.get("authorization"),
			delegation: request.headers.has("x-stellarc-delegation"),
		});
		switch (message.method) {
			case "initialize":
				return Response.json({
					jsonrpc: "2.0",
					id: message.id,
					result: {
						protocolVersion: "2025-11-25",
						capabilities: { tools: {} },
						serverInfo: { name: "fixture-remote", version: "0" },
					},
				});
			case "notifications/initialized":
				return new Response(null, { status: 202 });
			case "tools/list": {
				if (mode === "hostile")
					return Response.json(
						{
							jsonrpc: "2.0",
							error: {
								code: -32000,
								message: `upstream failure ${MARKER} host=10.0.0.9 key=AKIAEXAMPLE`,
							},
						},
						{ status: 500 },
					);
				if (mode === "paginate") {
					const cursor = Number(message.params?.cursor ?? 0);
					return Response.json({
						jsonrpc: "2.0",
						id: message.id,
						result: {
							tools: [
								{
									name: `page_${cursor}`,
									description: "p",
									inputSchema: { type: "object" },
								},
							],
							nextCursor: String(cursor + 1),
						},
					});
				}
				if (mode === "oversize")
					return Response.json({
						jsonrpc: "2.0",
						id: message.id,
						result: {
							tools: [
								{
									name: "big",
									description: "x".repeat(256 * 1024),
									inputSchema: { type: "object" },
								},
							],
						},
					});
				return Response.json({
					jsonrpc: "2.0",
					id: message.id,
					result: {
						tools: [
							{
								name: "fixture_meta",
								description: "metadata only",
								inputSchema: { type: "object", additionalProperties: false },
							},
						],
					},
				});
			}
			case "tools/call": {
				if (mode === "hang") await new Promise(() => {});
				if (mode === "toomany")
					return Response.json({
						jsonrpc: "2.0",
						id: message.id,
						result: {
							content: Array.from({ length: bounds.contentItems + 1 }, () => ({
								type: "text",
								text: "x",
							})),
						},
					});
				return Response.json({
					jsonrpc: "2.0",
					id: message.id,
					result: { content: [{ type: "text", text: "fixture-ok" }] },
				});
			}
			default:
				return Response.json({
					jsonrpc: "2.0",
					id: message.id,
					error: { code: -32601, message: "method not found" },
				});
		}
	},
});
console.log("STAGE fixture server", server.port);
const fixtureUrl = `http://127.0.0.1:${server.port}/mcp`;

console.log("STAGE connect");
const remote = await connectRemoteMcp(
	{
		url: fixtureUrl,
		headers: { authorization: "Bearer fixture-remote-credential" },
	},
	bounds,
);
const tools = await remote.listTools();
assert(
	tools.some((tool) => tool.name === "fixture_meta"),
	"fixture tool discovered",
);

console.log("STAGE custody");
assert(
	seen.every((r) => r.auth === "Bearer fixture-remote-credential"),
	"only the server-configured credential header reaches the remote server",
);
assert(
	seen.every((r) => !r.delegation),
	"no gateway caller headers are forwarded",
);

console.log("STAGE call");
const result = await remote.callTool(tools[0], {});
const first = result.content?.[0];
assert(first && "text" in first && first.text === "fixture-ok");

console.log("STAGE describe");
const info = await remote.describe();
assert(info.serverInfo?.name === "fixture-remote");
assert(info.protocolVersion === "2025-11-25");

console.log("STAGE content bound");
mode = "toomany";
await assert.rejects(
	() => remote.callTool(tools[0], {}),
	(error: Error) => error.message === "remote_content_items",
);

console.log("STAGE response bound");
mode = "oversize";
await assert.rejects(
	() => remote.listTools(),
	(error: Error) => error.message === "remote_limit",
);

console.log("STAGE deadline");
mode = "hang";
await assert.rejects(
	() => remote.callTool(tools[0], {}),
	(error: Error) => error.message === "remote_timeout",
);
mode = "ok";

console.log("STAGE cancellation");
mode = "hang";
const controller = new AbortController();
setTimeout(() => controller.abort(), 120);
const started = Date.now();
await assert.rejects(
	() => remote.callTool(tools[0], {}, controller.signal),
	(error: Error) => error.message === "cancelled",
);
assert(Date.now() - started < 1000, "abort interrupts the in-flight call");
mode = "ok";

console.log("STAGE pre-aborted signal");
{
	const before = seen.length;
	const dead = new AbortController();
	dead.abort();
	await assert.rejects(
		() => remote.callTool(tools[0], {}, dead.signal),
		(error: Error) => error.message === "cancelled",
	);
	assert(seen.length === before, "no request leaves for an aborted call");
}

console.log("STAGE url custody");
await assert.rejects(
	() =>
		connectRemoteMcp({ url: "http://192.0.2.10/mcp" }, bounds).then((r) =>
			r.dispose(),
		),
	/error: remote_url_denied|remote_url_denied/,
);

console.log("STAGE url credentials/query/fragment");
for (const url of [
	`http://user:secret@127.0.0.1:${server.port}/mcp`,
	`${fixtureUrl}?token=secret`,
	`${fixtureUrl}#fragment`,
])
	await assert.rejects(
		() => connectRemoteMcp({ url }, bounds).then((r) => r.dispose()),
		(error: Error) => error.message === "remote_url_denied",
	);

console.log("STAGE header validation");
const badHeaders: Array<Record<string, string>> = [
	{ "mcp-custom": "x" },
	{ "bad name": "x" },
	{ "x-inject": "a\r\nb" },
	{ "": "x" },
	{ "mcp-session-id ": "1" },
];
for (const headers of badHeaders)
	await assert.rejects(
		() =>
			connectRemoteMcp({ url: fixtureUrl, headers }, bounds).then((r) =>
				r.dispose(),
			),
		(error: Error) => error.message === "remote_header_denied",
	);

console.log("STAGE bounds validation");
for (const bad of [
	{ ...bounds, messageBytes: 0 },
	{ ...bounds, messageBytes: Number.NaN },
	{ ...bounds, messageBytes: 1.5 },
	{ ...bounds, messageBytes: 2 ** 53 },
	{ ...bounds, contentItems: -1 },
	{ ...bounds, contentItems: Number.POSITIVE_INFINITY },
	{ ...bounds, contentChars: 0 },
	{ ...bounds, timeoutMillis: 0 },
	{ ...bounds, timeoutMillis: Number.NaN },
])
	await assert.rejects(
		() => connectRemoteMcp({ url: fixtureUrl }, bad).then((r) => r.dispose()),
		(error: Error) => error.message === "remote_bounds_invalid",
	);
{
	const ceiling = await connectRemoteMcp(
		{ url: fixtureUrl },
		{ ...bounds, messageBytes: 16 * 1024 * 1024 },
	);
	await ceiling.dispose();
}

console.log("STAGE redirect refusal");
mode = "redirect-init";
seen.length = 0;
const redirected = await connectRemoteMcp(
	{
		url: fixtureUrl,
		headers: { authorization: "Bearer fixture-remote-credential" },
	},
	bounds,
);
await assert.rejects(
	() => redirected.listTools(),
	(error: Error) => error.message === "remote_failure",
);
await redirected.dispose();
mode = "ok";

console.log("STAGE hostile error redaction");
mode = "hostile";
{
	const hostile = await remote.listTools().then(
		() => null,
		(error: unknown) => error,
	);
	assert(hostile instanceof Error, "hostile response must fail");
	assert(
		hostile.message === "remote_http_status",
		`exact sanitized failure, got: ${hostile.message}`,
	);
	assert(
		!`${hostile.message}\n${hostile.stack ?? ""}`.includes(MARKER),
		"upstream body content must not leak through the failure",
	);
}
mode = "ok";

console.log("STAGE pagination bound");
mode = "paginate";
await assert.rejects(
	() => remote.listTools(),
	(error: Error) => error.message === "remote_limit",
);
mode = "ok";

await remote.dispose();
server.stop(true);
console.log("REMOTE-MCP CHECK PASSED");
