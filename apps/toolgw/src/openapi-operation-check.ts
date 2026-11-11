import assert from "node:assert/strict";
import { z } from "zod";
import {
	createOperationExecutor,
	type OperationDecision,
	type OperationIdentity,
	type OperationPlan,
} from "./openapi-operation";

// Socket fixtures only: no provider, gateway, OAuth or real credential access.
const marker = "fixture-secret-marker-never-release";
let calls = 0;
let credentials = 0;
let last: { url: string; method: string; headers: Headers; body: string };
let reached = () => {};
let mode = "json";
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	async fetch(request): Promise<Response> {
		calls++;
		last = {
			url: request.url,
			method: request.method,
			headers: request.headers,
			body: await request.text(),
		};
		reached();
		if (mode === "hang")
			return new Promise<Response>((resolve) => {
				setTimeout(() => resolve(Response.json({ late: true })), 1000);
			});
		if (mode === "slow-body")
			return new Response(
				new ReadableStream({
					start(c) {
						c.enqueue(new TextEncoder().encode('{"id":"'));
						setTimeout(() => {
							try {
								c.close();
							} catch {}
						}, 1000);
					},
				}),
				{ headers: { "content-type": "application/json" } },
			);
		if (mode === "redirect")
			return new Response(null, {
				status: 302,
				headers: { location: `${server.url}stolen` },
			});
		if (mode === "error")
			return new Response(marker + last.body, {
				status: 403,
				headers: { "set-cookie": marker },
			});
		if (mode === "large")
			return new Response(`"${"x".repeat(4096)}"`, {
				headers: { "content-type": "application/json" },
			});
		if (mode === "chunked-large")
			return new Response(
				new ReadableStream({
					start(c) {
						c.enqueue(new TextEncoder().encode(`"${"x".repeat(4096)}"`));
						c.close();
					},
				}),
				{ headers: { "content-type": "application/json" } },
			);
		if (mode === "echo") return Response.json({ secret: marker });
		if (mode === "escaped-echo")
			return new Response(
				`{"secret":"${[...marker].map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`).join("")}"}`,
			);
		if (mode === "invalid-json") return new Response("not json");
		return Response.json(
			last.method === "POST"
				? { id: "fixture-email-1" }
				: { labels: [{ id: "INBOX", name: "INBOX" }] },
		);
	},
});
const bounds = { requestBytes: 1024, responseBytes: 1024, timeoutMillis: 500 };
const google: OperationPlan = {
	revision: "r1",
	endpoint: server.url.origin,
	fixtureLoopback: true,
	method: "GET",
	pathTemplate: "/gmail/v1/users/{userId}/labels",
	path: { userId: { required: true, maxChars: 100 } },
	query: { fields: { maxChars: 100 }, maxResults: { maxChars: 4 } },
	credential: { handle: "fixture-google", header: "authorization" },
	effectClass: "none",
};
const resend: OperationPlan = {
	revision: "r1",
	endpoint: server.url.origin,
	fixtureLoopback: true,
	method: "POST",
	pathTemplate: "/emails",
	effectClass: "irreversible",
	credential: { handle: "fixture-resend", header: "authorization" },
	body: z.strictObject({
		from: z.string().max(100),
		to: z.array(z.string().max(100)).min(1).max(2),
		subject: z.string().max(100),
		text: z.string().max(2000),
	}),
};
const body = {
	from: "fixture@example.invalid",
	to: ["recipient@example.invalid"],
	subject: "fixture",
	text: "fixture only",
};
let decision: "allow" | "approved" | "deny" | "requiresApproval" = "allow";
let authCalls = 0;
let authHook:
	| ((
			identity: OperationIdentity,
			phase: string,
	  ) => OperationDecision | Promise<OperationDecision>)
	| undefined;
const make = (plans: Record<string, OperationPlan> = { google, resend }) =>
	createOperationExecutor(plans, bounds, {
		resolveCredential: async (handle) => {
			credentials++;
			assert.match(handle, /^fixture-/);
			return `Bearer ${marker}`;
		},
		authorize: async (identity, phase) => {
			authCalls++;
			assert(Object.isFrozen(identity));
			if (authHook) return authHook(identity, phase);
			return { kind: decision, binding: identity.binding };
		},
	});
let checked = 0;
async function check(name: string, run: () => Promise<void> | void) {
	await run();
	checked++;
	console.log(`PASS ${name}`);
}
async function error(
	code: string,
	args: unknown,
	operation = "google",
	executor = make(),
) {
	const before = calls;
	const beforeCredentials = credentials;
	const result = await executor.execute(operation, args);
	assert.equal(result.kind, "error");
	if (result.kind === "error") assert.equal(result.code, code);
	assert.equal(calls, before);
	assert.equal(credentials, beforeCredentials);
	assert(!JSON.stringify(result).includes(marker));
}
try {
	await check("Google read + private header custody + encoding", async () => {
		const r = await make().execute("google", {
			path: { userId: "mé +@" },
			query: { fields: "labels(id,name)&x=y" },
		});
		assert.equal(r.kind, "completed", JSON.stringify(r));
		assert.equal(last.method, "GET");
		assert.equal(
			new URL(last.url).pathname,
			"/gmail/v1/users/m%C3%A9%20%2B%40/labels",
		);
		assert.deepEqual(
			[...new URL(last.url).searchParams],
			[["fields", "labels(id,name)&x=y"]],
		);
		assert.equal(last.headers.get("authorization"), `Bearer ${marker}`);
		assert.equal(last.headers.get("x-stellarc-delegation"), null);
		assert(!JSON.stringify(r).includes(marker));
	});
	await check(
		"mutating call cannot use read allow; deferred before credential/network",
		async () => {
			const before = [calls, credentials];
			const r = await make().execute("resend", { body });
			assert.equal(r.kind, "requiresApproval");
			assert.deepEqual([calls, credentials], before);
			assert(!JSON.stringify(r).includes(body.text));
		},
	);
	await check("server-approved Resend dispatch", async () => {
		decision = "approved";
		authCalls = 0;
		const r = await make().execute("resend", { body });
		assert.equal(r.kind, "completed", JSON.stringify(r));
		assert.equal(authCalls, 2);
		assert.equal(last.method, "POST");
		assert.equal(new URL(last.url).pathname, "/emails");
		assert.deepEqual(JSON.parse(last.body), body);
		decision = "allow";
	});
	await check(
		"undeclared effects and POST misclassified none fail closed",
		async () => {
			for (const effectClass of [
				undefined,
				"none",
				"reversible",
				"compensatable",
				"irreversible",
				"future-effect",
			] as const) {
				const executor = make({
					unknown: {
						...resend,
						effectClass: effectClass as OperationPlan["effectClass"],
					},
				});
				const before = [calls, credentials];
				assert.equal(
					(await executor.execute("unknown", { body })).kind,
					"requiresApproval",
				);
				assert.deepEqual([calls, credentials], before);
			}
		},
	);
	await check(
		"deny before credentials; bound decision; current rights at dispatch",
		async () => {
			decision = "deny";
			await error("denied", { path: { userId: "me" } });
			decision = "allow";
			authHook = () => ({ kind: "approved", binding: "wrong" });
			await error("denied", { path: { userId: "me" } });
			authHook = (identity, phase) => ({
				kind: phase === "dispatch" ? "deny" : "approved",
				binding: identity.binding,
			});
			const before = calls;
			assert.equal((await make().execute("resend", { body })).kind, "error");
			assert.equal(calls, before);
			authHook = undefined;
		},
	);
	await check(
		"frozen registry and argument bytes survive await mutation",
		async () => {
			const p = { ...google };
			const ex = make({ google: p });
			p.endpoint = "http://evil.invalid";
			const args = { path: { userId: "me" } };
			authHook = (identity) => {
				args.path.userId = "changed";
				return { kind: "allow", binding: identity.binding };
			};
			assert.equal((await ex.execute("google", args)).kind, "completed");
			assert(new URL(last.url).pathname.includes("/me/"));
			authHook = undefined;
		},
	);
	await check(
		"binding changes with arguments/revision/credential/effect",
		async () => {
			const bindings = new Set<string>();
			authHook = (identity) => {
				bindings.add(identity.binding);
				return { kind: "requiresApproval", binding: identity.binding };
			};
			for (const plan of [
				google,
				{ ...google, revision: "r2" },
				{
					...google,
					credential: {
						handle: "fixture-other",
						header: "authorization" as const,
					},
				},
				{ ...google, effectClass: "irreversible" as const },
			]) {
				await make({ google: plan }).execute("google", {
					path: { userId: "me" },
				});
			}
			await make().execute("google", { path: { userId: "other" } });
			assert.equal(bindings.size, 5);
			authHook = undefined;
		},
	);
	await check(
		"caller cannot set endpoint/headers/approval/aliases/duplicate query",
		async () => {
			for (const args of [
				{ url: server.url.href },
				{ headers: { authorization: marker } },
				{ approved: true },
				{ queryParams: {} },
				{ path: { userId: "me" }, query: { fields: ["a", "b"] } },
				{ path: { userId: "me" }, query: { unknown: "x" } },
				{ path: { userId: "me", extra: "x" } },
			])
				await error("invalid_arguments", args);
			await error("unknown_operation", {}, "constructor");
		},
	);
	await check(
		"path traversal, nested percent encoding, host overrides, controls",
		async () => {
			for (const userId of [
				".",
				"..",
				"../x",
				"%2e%2e",
				"%252f",
				"//evil.invalid",
				"https://evil.invalid",
				"a\\b",
				"x?y",
				"x#y",
				"a\u0000b",
			])
				await error("invalid_arguments", { path: { userId } });
			await error("invalid_arguments", { path: {} });
		},
	);
	await check("schema, body, query, total UTF-8 request bounds", async () => {
		await error(
			"invalid_arguments",
			{ body: { ...body, extra: "x" } },
			"resend",
		);
		await error(
			"invalid_arguments",
			{ body: { ...body, to: "not-array" } },
			"resend",
		);
		await error(
			"request_too_large",
			{ body: { ...body, text: "é".repeat(600) } },
			"resend",
		);
		await error("invalid_arguments", {
			path: { userId: "me" },
			query: { fields: "x".repeat(101) },
		});
		await error("invalid_arguments", { path: { userId: "me" }, body });
	});
	await check(
		"server destination validation incl explicit loopback fixture only",
		async () => {
			for (const endpoint of [
				server.url.origin,
				"http://example.com",
				"https://127.0.0.1",
				"https://[::1]",
				"https://169.254.169.254",
				"https://localhost",
				"https://user:pass@example.com",
				"https://example.com/path",
				"https://example.com?x=1",
				"https://example.com#x",
			])
				assert.throws(
					() =>
						make({ google: { ...google, endpoint, fixtureLoopback: false } }),
					/invalid_config/,
				);
			for (const pathTemplate of [
				"//evil.invalid/x",
				"/a/../b",
				"/%2e%2e/x",
				"/a?x=y",
				"/{missing}",
			])
				assert.throws(
					() => make({ google: { ...google, pathTemplate } }),
					/invalid_config/,
				);
			assert.throws(
				() =>
					createOperationExecutor(
						{ google },
						{ ...bounds, responseBytes: Number.NaN },
						{
							authorize: async (i) => ({ kind: "allow", binding: i.binding }),
							resolveCredential: async () => "x",
						},
					),
				/invalid_config/,
			);
			make({
				google: {
					...google,
					endpoint: "https://gmail.googleapis.com",
					fixtureLoopback: false,
				},
			}); // validation only; never dispatch
		},
	);
	await check(
		"redirect refusal cannot send credential to second path",
		async () => {
			mode = "redirect";
			const before = calls;
			assert.equal(
				(await make().execute("google", { path: { userId: "me" } })).kind,
				"error",
			);
			assert.equal(calls, before + 1);
		},
	);
	await check(
		"response byte ceiling, upstream errors and echo privacy",
		async () => {
			for (const next of [
				"large",
				"chunked-large",
				"error",
				"echo",
				"escaped-echo",
				"invalid-json",
			]) {
				mode = next;
				const r = await make().execute("google", { path: { userId: "me" } });
				assert.equal(r.kind, "error");
				assert(!JSON.stringify(r).includes(marker));
				assert(!JSON.stringify(r).includes("set-cookie"));
			}
		},
	);
	await check("timeout aborts headers and body reads", async () => {
		for (const next of ["hang", "slow-body"]) {
			mode = next;
			const start = performance.now();
			const r = await make().execute("google", { path: { userId: "me" } });
			assert.equal(r.kind === "error" && r.code, "timeout");
			assert(performance.now() - start < 1500);
		}
	});
	await check(
		"in-flight cancellation and already aborted no-dispatch",
		async () => {
			mode = "hang";
			const controller = new AbortController();
			const barrier = new Promise<void>((resolve) => {
				reached = resolve;
			});
			const pending = make().execute(
				"google",
				{ path: { userId: "me" } },
				controller.signal,
			);
			await barrier;
			controller.abort(marker);
			const r = await pending;
			assert.equal(r.kind === "error" && r.code, "cancelled");
			const before = [calls, credentials];
			assert.equal(
				(await make().execute("google", {}, controller.signal)).kind,
				"error",
			);
			assert.deepEqual([calls, credentials], before);
		},
	);
	await check(
		"authorization deadline and thrown secret-marker errors stay private",
		async () => {
			authHook = async () => new Promise<OperationDecision>(() => {});
			await error("timeout", { path: { userId: "me" } });
			authHook = () => {
				throw new Error(marker);
			};
			await error("unavailable", { path: { userId: "me" } });
			authHook = undefined;
		},
	);
	await check(
		"credential failures/cancellation/deadline remain private and cannot dispatch",
		async () => {
			mode = "json";
			const before = calls;
			for (const resolveCredential of [
				async () => {
					throw new Error(marker);
				},
				async () => {
					await new Promise((r) => setTimeout(r, 800));
					return marker;
				},
			]) {
				const ex = createOperationExecutor({ google }, bounds, {
					authorize: async (i) => ({ kind: "allow", binding: i.binding }),
					resolveCredential,
				});
				const result = await ex.execute("google", { path: { userId: "me" } });
				assert.equal(result.kind, "error");
				assert(!JSON.stringify(result).includes(marker));
			}
			await new Promise((r) => setTimeout(r, 400));
			assert.equal(calls, before);
			const controller = new AbortController();
			const ex = createOperationExecutor({ google }, bounds, {
				authorize: async (i) => ({ kind: "allow", binding: i.binding }),
				resolveCredential: async () => {
					controller.abort();
					return marker;
				},
			});
			const result = await ex.execute(
				"google",
				{ path: { userId: "me" } },
				controller.signal,
			);
			assert.equal(result.kind === "error" && result.code, "cancelled");
			assert.equal(calls, before);
		},
	);
	await check(
		"mutating timeout records uncertainty, never retries",
		async () => {
			mode = "hang";
			decision = "approved";
			const before = calls;
			const r = await make().execute("resend", { body });
			assert.equal(r.kind === "error" && r.outcomeUnknown, true);
			assert.equal(calls, before + 1);
		},
	);
	console.log(`OPENAPI CHECK PASSED ${checked} groups`);
} finally {
	await server.stop(true);
}
