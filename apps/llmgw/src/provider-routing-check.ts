import assert from "node:assert/strict";
import {
	modelCatalog,
	ProviderRoutingError,
	prepareProviderRequest,
	providerResponse,
	validateRoutes,
} from "./provider-routing";

// Synthetic wire fixtures only. No real provider, credentials, prompts or tools.
const routes = validateRoutes([
	{
		alias: "glm",
		provider: "glm",
		model: "glm-5.3",
		protocol: "chat",
		endpoint: "https://api.z.ai/api/coding/paas/v4/chat/completions",
		credential: "glm-key",
		contextLength: 200000,
	},
	{
		alias: "opus",
		provider: "anthropic",
		model: "claude-opus-5-5",
		protocol: "messages",
		endpoint: "https://api.anthropic.com/v1/messages",
		credential: "anthropic-key",
	},
	{
		alias: "gpt",
		provider: "openai",
		model: "gpt-test",
		protocol: "responses",
		endpoint: "https://api.openai.com/v1/responses",
		credential: "openai-key",
	},
]);
let checks = 0;
function rejects(fn: () => unknown, reason: string) {
	assert.throws(
		fn,
		(error: unknown) =>
			error instanceof ProviderRoutingError && error.reason === reason,
	);
	checks++;
}
const chat = {
	model: "glm",
	stream: true,
	messages: [],
	tools: [{ type: "function", function: { name: "fixture" } }],
};
const plan = prepareProviderRequest(
	routes,
	"/v1/chat/completions",
	chat,
	() => "fixture-only-key",
);
assert.equal(plan.body.model, "glm-5.3");
assert.equal(chat.model, "glm");
assert.deepEqual(plan.body.tools, chat.tools);
assert.equal(plan.headers.get("authorization"), "Bearer fixture-only-key");
assert.equal(plan.headers.has("cookie"), false);
const anthropic = prepareProviderRequest(
	routes,
	"/v1/messages",
	{ model: "opus", messages: [], max_tokens: 1 },
	() => "fixture-only-key",
);
assert.equal(anthropic.headers.get("x-api-key"), "fixture-only-key");
assert.equal(anthropic.headers.get("anthropic-version"), "2023-06-01");
assert.equal(anthropic.headers.has("authorization"), false);
assert.equal(modelCatalog(routes).data[0].context_length, 200000);
assert.equal("endpoint" in modelCatalog(routes).data[0], false);
checks++;
rejects(() => validateRoutes([...routes, routes[0]]), "invalid_routes");
for (const endpoint of [
	"http://api.example/v1/chat/completions",
	"https://u:p@api.example/v1/chat/completions",
	"https://api.example/v1/chat/completions?key=x",
	"https://api.example/v1/chat/completions#x",
	"https://api.example/v1/messages",
]) {
	rejects(() => validateRoutes([{ ...routes[0], endpoint }]), "invalid_routes");
}
rejects(
	() => validateRoutes([{ ...routes[0], protocol: ["chat"] }]),
	"invalid_routes",
);
rejects(
	() =>
		validateRoutes([
			...routes,
			{
				...routes[0],
				protocol: "messages",
				endpoint: "https://api.example/v1/messages",
				contextLength: 1,
			},
		]),
	"invalid_routes",
);
rejects(
	() => validateRoutes([{ ...routes[0], apiKey: "fixture" }]),
	"invalid_routes",
);
rejects(
	() => prepareProviderRequest(routes, "/v1/chat/completions", null, () => "x"),
	"invalid_request",
);
rejects(
	() =>
		prepareProviderRequest(
			routes,
			"/v1/chat/completions",
			{ ...chat, model: "gpt" },
			() => "x",
		),
	"model_not_found",
);
rejects(
	() =>
		prepareProviderRequest(routes, "/v1/chat/completions?x=1", chat, () => "x"),
	"unsupported_endpoint",
);
rejects(
	() =>
		prepareProviderRequest(
			routes,
			"/v1/chat/completions",
			{ ...chat, stream: "true" },
			() => "x",
		),
	"invalid_request",
);
rejects(
	() => prepareProviderRequest(routes, "/v1/chat/completions", chat, () => ""),
	"credential_unavailable",
);

const encoder = new TextEncoder();
const chunks: Uint8Array[] = [];
let status = 200;
let contentType = "text/event-stream";
let cancelled = false;
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch() {
		let i = 0;
		return new Response(
			new ReadableStream<Uint8Array>({
				pull(controller) {
					if (i < chunks.length) controller.enqueue(chunks[i++]);
					else controller.close();
				},
				cancel() {
					cancelled = true;
				},
			}),
			{
				status,
				headers: {
					"content-type": contentType,
					"retry-after": "7",
					"set-cookie": "must-not-forward=1",
				},
			},
		);
	},
});
async function response(
	protocol: "chat" | "messages" | "responses",
	wire: string,
	split = false,
	authorize: () => Promise<void> = async () => {},
) {
	chunks.splice(
		0,
		chunks.length,
		...(split
			? [...encoder.encode(wire)].map((b) => new Uint8Array([b]))
			: [encoder.encode(wire)]),
	);
	const upstream = await fetch(`http://127.0.0.1:${server.port}`);
	return providerResponse(upstream, protocol, true, {
		signal: new AbortController().signal,
		authorize,
	});
}
async function fails(
	protocol: "chat" | "messages" | "responses",
	wire: string,
) {
	await assert.rejects(
		async () => (await response(protocol, wire)).text(),
		ProviderRoutingError,
	);
	checks++;
}
async function within<T>(work: Promise<T>, label: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			work,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error(`stalled: ${label}`)), 1000);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}
function barrier() {
	let release!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((resolve, fail) => {
		release = resolve;
		reject = fail;
	});
	return { promise, release, reject };
}
async function lifecycleChecks() {
	const failures: string[] = [];
	for (const mode of [
		"terminal",
		"cancel",
		"abort",
		"deadline",
		"pending",
		"reject",
		"late-reject",
		"preaborted",
	] as const) {
		const heldCancel = barrier();
		const cancelStarted = barrier();
		const readStarted = barrier();
		const settled = barrier();
		const abort = new AbortController();
		let cancels = 0;
		let settlements = 0;
		const outcomes: string[] = [];
		const upstream = new Response(
			new ReadableStream<Uint8Array>(
				{
					start(c) {
						if (
							mode === "terminal" ||
							mode === "reject" ||
							mode === "late-reject"
						)
							c.enqueue(encoder.encode("data: [DONE]\n\n"));
					},
					pull() {
						readStarted.release();
					},
					cancel() {
						cancels++;
						cancelStarted.release();
						return mode === "reject"
							? Promise.reject(new Error("fixture cancel rejection"))
							: heldCancel.promise;
					},
				},
				{ highWaterMark: 0 },
			),
			{ headers: { "content-type": "text/event-stream" } },
		);
		if (mode === "preaborted") abort.abort();
		const result = await providerResponse(upstream, "chat", true, {
			signal: abort.signal,
			authorize: async () => {},
			finish: async (outcome) => {
				outcomes.push(outcome);
			},
			abort: () => abort.abort(),
			settled: () => {
				settlements++;
				settled.release();
			},
		});
		let work: Promise<unknown> = Promise.resolve();
		let deadline: ReturnType<typeof setTimeout> | undefined;
		try {
			if (mode === "terminal" || mode === "reject" || mode === "late-reject") {
				work = result.text();
				assert.equal(await within(work, mode), "data: [DONE]\n\n");
			} else if (mode === "cancel") {
				assert.ok(result.body);
				work = result.body.cancel();
				await within(work, mode);
			} else {
				if (mode === "pending") {
					work = result.text();
					// Observe rejection immediately, before triggering cancellation.
					void work.catch(() => {});
					await within(readStarted.promise, "pending read started");
				}
				if (mode === "deadline") deadline = setTimeout(() => abort.abort(), 5);
				else if (mode !== "preaborted") abort.abort();
				await within(settled.promise, mode);
				if (mode === "pending")
					await assert.rejects(
						() => within(work, "pending read rejected"),
						ProviderRoutingError,
					);
			}
			await within(cancelStarted.promise, "cancel initiation");
			await within(settled.promise, "settlement");
			assert.equal(
				upstream.body?.locked,
				false,
				`${mode}: lock released at settlement`,
			);
			assert.equal(cancels, 1, `${mode}: cancel once`);
			assert.equal(settlements, 1, `${mode}: settled once`);
			if (mode === "late-reject") {
				heldCancel.reject(new Error("fixture late cancel rejection"));
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
			assert.deepEqual(outcomes, [
				mode === "terminal" || mode === "reject" || mode === "late-reject"
					? "completed"
					: "cancelled",
			]);
			checks++;
			console.log(`PASS lifecycle-${mode}`);
		} catch (error) {
			failures.push(`${mode}: ${(error as Error).message}`);
			console.error(`RED lifecycle-${mode}: ${(error as Error).message}`);
		} finally {
			clearTimeout(deadline);
			heldCancel.release();
			await within(
				work.catch(() => {}),
				"fixture work drained",
			);
			abort.abort();
		}
	}
	// Native string body: terminal bytes wait for durable finish, then fresh authority.
	for (const mode of ["success", "revocation", "abort", "failure"] as const) {
		const finishing = barrier();
		const release = barrier();
		const abort = new AbortController();
		let durable = false;
		let settlements = 0;
		let finishes = 0;
		const response = await providerResponse(
			new Response("data: [DONE]\n\n", {
				headers: { "content-type": "text/event-stream" },
			}),
			"chat",
			true,
			{
				signal: abort.signal,
				authorize: async () => {
					if (durable && mode === "revocation") throw new Error("revoked");
				},
				finish: async () => {
					finishes++;
					finishing.release();
					await release.promise;
					if (mode === "failure")
						throw new Error("fixture persistence failure");
					durable = true;
				},
				abort: () => abort.abort(),
				settled: () => {
					settlements++;
				},
			},
		);
		let delivered = false;
		const reading = response.text();
		void reading.then(
			() => {
				delivered = true;
			},
			() => {},
		);
		try {
			await within(finishing.promise, "finish entered");
			assert.equal(delivered, false);
			assert.equal(settlements, 0);
			if (mode === "abort") abort.abort();
			release.release();
			if (mode === "success")
				assert.equal(await within(reading, mode), "data: [DONE]\n\n");
			else
				await assert.rejects(() => within(reading, mode), ProviderRoutingError);
			assert.equal(finishes, 1);
			assert.equal(settlements, 1);
			assert.equal(durable, mode !== "failure");
			checks++;
			console.log(`PASS lifecycle-finalizer-${mode}`);
		} catch (error) {
			failures.push(`${mode}: ${(error as Error).message}`);
			console.error(
				`RED lifecycle-finalizer-${mode}: ${(error as Error).message}`,
			);
		} finally {
			release.release();
			await within(
				reading.catch(() => {}),
				"finish fixture drained",
			);
		}
	}
	assert.deepEqual(failures, [], "lifecycle regressions");
}
async function fetchLifecycleChecks() {
	for (const mode of [
		"cancel",
		"abort",
		"deadline",
		"pending",
		"finalizer",
	] as const) {
		const cancelled = barrier();
		const pendingRead = barrier();
		const finishing = barrier();
		const persist = barrier();
		const settled = barrier();
		const abort = new AbortController();
		let durable = false;
		let settlements = 0;
		const outcomes: string[] = [];
		const fixture = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch() {
				return new Response(
					new ReadableStream({
						start(c) {
							c.enqueue(
								encoder.encode(
									mode === "finalizer" ? "data: [DONE]\n\n" : ": ready\n\n",
								),
							);
						},
						cancel() {
							cancelled.release();
						},
					}),
					{ headers: { "content-type": "text/event-stream" } },
				);
			},
		});
		let deadline: ReturnType<typeof setTimeout> | undefined;
		let work: Promise<unknown> = Promise.resolve();
		try {
			const upstream = await fetch(`http://127.0.0.1:${fixture.port}`, {
				signal: abort.signal,
			});
			const body = upstream.body;
			assert.ok(body);
			const getReader = body.getReader.bind(body);
			body.getReader = (() => {
				const reader = getReader();
				const read = reader.read.bind(reader);
				let reads = 0;
				reader.read = () => {
					const work = read();
					if (++reads === 2) pendingRead.release();
					return work;
				};
				return reader;
			}) as typeof body.getReader;
			const result = await providerResponse(upstream, "chat", true, {
				signal: abort.signal,
				authorize: async () => {
					if (durable) throw new Error("revoked during persistence");
				},
				finish: async (outcome) => {
					outcomes.push(outcome);
					finishing.release();
					if (mode === "finalizer") await persist.promise;
					durable = true;
				},
				abort: () => abort.abort(),
				settled: () => {
					settlements++;
					settled.release();
				},
			});
			if (mode === "finalizer" || mode === "pending") {
				work = result.text();
				void work.catch(() => {});
				if (mode === "pending")
					await within(pendingRead.promise, "HTTP pending read entered");
			}
			if (mode === "finalizer") {
				await within(finishing.promise, "HTTP finalizer entered");
				await within(
					cancelled.promise,
					"HTTP I/O cancelled before persistence",
				);
				assert.equal(settlements, 0);
				persist.release();
			} else if (mode === "cancel") {
				assert.ok(result.body);
				work = result.body.cancel();
			} else if (mode === "deadline")
				deadline = setTimeout(() => abort.abort(), 5);
			else abort.abort();
			await within(settled.promise, `HTTP ${mode} settlement`);
			await within(cancelled.promise, `HTTP ${mode} upstream cancellation`);
			if (mode === "pending" || mode === "finalizer")
				await assert.rejects(
					() => within(work, `HTTP ${mode} delivery`),
					ProviderRoutingError,
				);
			else await within(work, `HTTP ${mode} cancellation`);
			assert.equal(upstream.body?.locked, false);
			assert.equal(settlements, 1);
			assert.deepEqual(outcomes, [
				mode === "finalizer" ? "completed" : "cancelled",
			]);
			checks++;
			console.log(`PASS fetch-lifecycle-${mode}`);
		} finally {
			clearTimeout(deadline);
			persist.release();
			abort.abort();
			await within(
				work.catch(() => {}),
				"HTTP fixture drained",
			);
			await fixture.stop(true);
		}
	}
}
try {
	await lifecycleChecks();
	await fetchLifecycleChecks();
	// Identical complete oversized event must fail regardless of transport segmentation.
	for (const multiline of [false, true]) {
		const data = JSON.stringify({ text: "x".repeat(70000) });
		const wire = `${multiline ? `data: ${data.slice(0, 1)}\ndata: ${data.slice(1)}` : `data: ${data}`}\n\ndata: [DONE]\n\n`;
		for (const width of [wire.length, 10000]) {
			let offset = 0;
			const upstream = new Response(
				new ReadableStream({
					pull(c) {
						if (offset === wire.length) return c.close();
						c.enqueue(encoder.encode(wire.slice(offset, offset + width)));
						offset = Math.min(offset + width, wire.length);
					},
				}),
				{ headers: { "content-type": "text/event-stream" } },
			);
			const result = await providerResponse(upstream, "chat", true, {
				signal: new AbortController().signal,
				authorize: async () => {},
			});
			await assert.rejects(
				result.text(),
				(e: unknown) =>
					e instanceof ProviderRoutingError &&
					e.reason === "provider_frame_limit",
				`70k complete event multiline=${multiline} width=${width}`,
			);
			checks++;
		}
	}
	console.log("PASS seam-70k-complete-event-chunk-independent");
	let finalized = false;
	const finalResult = await providerResponse(
		new Response("data: [DONE]\n\n", {
			headers: { "content-type": "text/event-stream" },
		}),
		"chat",
		true,
		{
			signal: new AbortController().signal,
			authorize: async () => {
				if (finalized) throw new Error("revoked after finish");
			},
			finish: async () => {
				finalized = true;
			},
		},
	);
	await assert.rejects(
		finalResult.text(),
		ProviderRoutingError,
		"finish then reauthorize before terminal delivery",
	);
	assert.equal(finalized, true);
	checks++;
	const wire =
		'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"x\\":1}"}}]}}],"usage":{"prompt_tokens":3}}\r\n\r\ndata: [DONE]\r\n\r\n';
	const result = await response("chat", wire, true);
	const text = await result.text();
	assert.match(text, /tool_calls/);
	assert.match(text, /prompt_tokens/);
	assert.match(text, /\[DONE\]/);
	assert.equal(result.headers.has("set-cookie"), false);
	checks++;
	for (const [protocol, wire, terminal] of [
		[
			"messages",
			'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"☃"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n',
			"message_stop",
		],
		[
			"responses",
			'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"☃"}\n\nevent: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":4}}}\n\n',
			"response.completed",
		],
	] as const) {
		const text = await (await response(protocol, wire, true)).text();
		assert.match(text, /☃/);
		assert.ok(text.includes(`event: ${terminal}`));
		assert.equal(text.includes("[DONE]"), false);
		checks++;
	}
	await fails("chat", 'data: {"choices":[]}\n\n');
	await fails(
		"chat",
		'data: [DONE]\n\ndata: {"error":{"message":"fixture-secret"}}\n\n',
	);
	await fails(
		"chat",
		'data: {"error":{"message":"fixture-secret"}}\n\ndata: [DONE]\n\n',
	);
	await fails("chat", "data: not-json\n\n");
	await fails("messages", 'event: error\ndata: {"type":"error"}\n\n');
	await fails(
		"messages",
		'data: {"type":"content_block_delta\\ndata: injected"}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n',
	);
	await fails(
		"responses",
		'event: response.failed\ndata: {"type":"response.failed"}\n\n',
	);
	await fails(
		"responses",
		'event: response.incomplete\ndata: {"type":"response.incomplete"}\n\n',
	);
	await fails(
		"messages",
		'event: message_stop\ndata: {"type":"content_block_delta"}\n\n',
	);
	await fails("chat", `data: {"text":"${"x".repeat(65537)}"}\n\n`);
	// Synthetic post-read authorization failure must withhold its bytes.
	let reads = 0;
	const revoked = await response(
		"chat",
		'data: {"choices":[]}\n\ndata: [DONE]\n\n',
		false,
		async () => {
			if (++reads === 2) throw new Error("revoked");
		},
	);
	await assert.rejects(() => revoked.text());
	checks++;
	chunks.splice(
		0,
		chunks.length,
		...Array.from({ length: 257 }, () =>
			encoder.encode(`: ${"x".repeat(65520)}\n\n`),
		),
	);
	const oversized = await providerResponse(
		await fetch(`http://127.0.0.1:${server.port}`),
		"chat",
		true,
		{ signal: new AbortController().signal, authorize: async () => {} },
	);
	await assert.rejects(() => oversized.text(), ProviderRoutingError);
	checks++;
	status = 429;
	contentType = "application/json";
	await assert.rejects(
		() => response("chat", '{"error":{"message":"fixture-secret"}}'),
		(e: unknown) =>
			e instanceof ProviderRoutingError &&
			e.status === 429 &&
			e.retryAfter === "7" &&
			!e.message.includes("fixture-secret"),
	);
	checks++;
	status = 200;
	contentType = "text/html";
	await assert.rejects(
		() => response("chat", "<html>fixture</html>"),
		ProviderRoutingError,
	);
	checks++;
	contentType = "application/json";
	chunks.splice(
		0,
		chunks.length,
		encoder.encode(
			'{"object":"chat.completion","choices":[],"usage":{"prompt_tokens":2}}',
		),
	);
	for (const protocol of ["chat", "messages", "responses"] as const) {
		for (const payload of [
			{},
			{ status: "queued" },
			{ status: "in_progress" },
		]) {
			await assert.rejects(
				providerResponse(
					new Response(JSON.stringify(payload), {
						headers: { "content-type": "application/json" },
					}),
					protocol,
					false,
					{ signal: new AbortController().signal, authorize: async () => {} },
				),
				(e: unknown) =>
					e instanceof ProviderRoutingError &&
					e.reason === "provider_json_disabled",
			);
			checks++;
		}
	}
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(() =>
		providerResponse(
			new Response("{}", { headers: { "content-type": "application/json" } }),
			"chat",
			false,
			{ signal: controller.signal, authorize: async () => {} },
		),
	);
	checks++;
	// In-memory held read makes cancellation deterministic (socket buffering is not a barrier).
	let started!: () => void;
	const pending = new Promise<void>((resolve) => {
		started = resolve;
	});
	const abort = new AbortController();
	const held = new Response(
		new ReadableStream<Uint8Array>({
			pull() {
				started();
			},
			cancel() {
				cancelled = true;
			},
		}),
		{ headers: { "content-type": "text/event-stream" } },
	);
	const heldResult = await providerResponse(held, "chat", true, {
		signal: abort.signal,
		authorize: async () => {},
	});
	const reading = heldResult.text();
	await pending;
	abort.abort();
	await assert.rejects(() => reading);
	assert.equal(cancelled, true);
	checks++;
	console.log(
		`PASS provider-routing: ${checks} contract checks; fixture HTTP only; no inference`,
	);
} finally {
	await server.stop(true);
}
