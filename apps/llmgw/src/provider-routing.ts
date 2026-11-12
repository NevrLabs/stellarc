import { boundedSse } from "./bounded-sse";

export type ProviderProtocol = "chat" | "messages" | "responses";
export type ProviderRoute = Readonly<{
	alias: string;
	provider: string;
	model: string;
	protocol: ProviderProtocol;
	endpoint: string;
	credential: string;
	contextLength?: number;
}>;
export class ProviderRoutingError extends Error {
	constructor(
		readonly status: number,
		readonly reason: string,
		readonly retryAfter?: string,
	) {
		super(reason);
	}
}
const paths = {
	chat: "/v1/chat/completions",
	messages: "/v1/messages",
	responses: "/v1/responses",
} as const;
const object = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === "object" && !Array.isArray(v);
const identifier = (v: unknown): v is string =>
	typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._/:[\]-]{0,199}$/.test(v);
const fail = (status: number, reason: string): never => {
	throw new ProviderRoutingError(status, reason);
};

// Config is server-owned, never taken from a request. Credential values live elsewhere.
export function validateRoutes(value: unknown): readonly ProviderRoute[] {
	if (!Array.isArray(value) || !value.length || value.length > 64)
		return fail(503, "invalid_routes");
	const seen = new Set<string>();
	return Object.freeze(
		value.map((v): ProviderRoute => {
			if (
				!object(v) ||
				Object.keys(v).some(
					(k) =>
						![
							"alias",
							"provider",
							"model",
							"protocol",
							"endpoint",
							"credential",
							"contextLength",
						].includes(k),
				) ||
				![v.alias, v.provider, v.model, v.credential].every(identifier) ||
				typeof v.protocol !== "string" ||
				!Object.hasOwn(paths, v.protocol) ||
				typeof v.endpoint !== "string" ||
				(v.contextLength !== undefined &&
					(!Number.isSafeInteger(v.contextLength) ||
						Number(v.contextLength) <= 0))
			)
				return fail(503, "invalid_routes");
			let endpoint: URL;
			try {
				endpoint = new URL(v.endpoint);
			} catch {
				return fail(503, "invalid_routes");
			}
			const protocol = v.protocol as ProviderProtocol;
			const suffix = paths[protocol].slice(3);
			const key = `${protocol}:${v.alias}`;
			if (
				value.some(
					(other) =>
						object(other) &&
						other !== v &&
						other.alias === v.alias &&
						(other.provider !== v.provider ||
							other.contextLength !== v.contextLength),
				) ||
				seen.has(key) ||
				endpoint.protocol !== "https:" ||
				endpoint.username ||
				endpoint.password ||
				endpoint.search ||
				endpoint.hash ||
				!endpoint.pathname.endsWith(suffix)
			)
				return fail(503, "invalid_routes");
			seen.add(key);
			return Object.freeze({ ...v }) as ProviderRoute;
		}),
	);
}

export function modelCatalog(routes: readonly ProviderRoute[]) {
	// Same alias may expose several native protocols, with consistent catalog metadata.
	const seen = new Set<string>();
	return {
		object: "list",
		data: routes
			.filter((r) => !seen.has(r.alias) && !!seen.add(r.alias))
			.map((r) => ({
				id: r.alias,
				object: "model",
				owned_by: r.provider,
				...(r.contextLength === undefined
					? {}
					: { context_length: r.contextLength }),
			})),
	};
}

export function prepareProviderRequest(
	routes: readonly ProviderRoute[],
	path: string,
	payload: unknown,
	credential: (handle: string) => string | undefined,
) {
	const protocol = (Object.keys(paths) as ProviderProtocol[]).find(
		(p) => paths[p] === path,
	);
	if (!protocol) return fail(404, "unsupported_endpoint");
	if (
		!object(payload) ||
		typeof payload.model !== "string" ||
		(payload.stream !== undefined && typeof payload.stream !== "boolean")
	)
		return fail(400, "invalid_request");
	const route = routes.find(
		(r) => r.protocol === protocol && r.alias === payload.model,
	);
	if (!route) return fail(404, "model_not_found");
	if (
		(protocol === "responses"
			? payload.input === undefined
			: !Array.isArray(payload.messages)) ||
		(protocol === "messages" &&
			(!Number.isSafeInteger(payload.max_tokens) ||
				Number(payload.max_tokens) < 1))
	)
		return fail(400, "invalid_request");
	const secret = credential(route.credential);
	if (!secret || /[\r\n]/.test(secret))
		return fail(503, "credential_unavailable");
	const headers = new Headers({
		"content-type": "application/json",
		accept: payload.stream === true ? "text/event-stream" : "application/json",
	});
	if (protocol === "messages") {
		headers.set("x-api-key", secret);
		headers.set("anthropic-version", "2023-06-01");
	} else headers.set("authorization", `Bearer ${secret}`);
	// No client headers, URL, auth or implicit fallback. Unknown provider body fields survive.
	const body: Record<string, unknown> = { ...payload, model: route.model };
	return {
		endpoint: route.endpoint,
		protocol,
		headers,
		body,
		redirect: "error" as const,
	};
}

export async function providerResponse(
	upstream: Response,
	protocol: ProviderProtocol,
	stream: boolean,
	control: {
		signal: AbortSignal;
		authorize: () => Promise<void>;
		finish?: (outcome: "completed" | "cancelled" | "failed") => Promise<void>;
		/** Must abort `signal`: cleanup assumes a parked read resumes into an abort check. */
		abort?: () => void;
		settled?: () => void;
	},
): Promise<Response> {
	// JSON stays deliberately disabled until native complete envelopes are accepted.
	if (!stream) {
		void upstream.body?.cancel().catch(() => {});
		return fail(503, "provider_json_disabled");
	}
	const stop = () => {
		void upstream.body?.cancel().catch(() => {});
	};
	if (!upstream.ok) {
		stop();
		const retry = upstream.headers.get("retry-after") ?? "";
		throw new ProviderRoutingError(
			upstream.status === 429 ? 429 : 502,
			"upstream_failure",
			/^\d{1,6}$/.test(retry) ? retry : undefined,
		);
	}
	const contentType = upstream.headers
		.get("content-type")
		?.split(";")[0]
		.trim()
		.toLowerCase();
	if (
		!upstream.body ||
		contentType !== (stream ? "text/event-stream" : "application/json")
	) {
		stop();
		return fail(502, "upstream_content_type");
	}
	const reader = upstream.body.getReader();
	let bytes = 0;
	let finishing: Promise<void> | undefined;
	let cleaning: Promise<void> | undefined;
	let reading: Promise<ReadableStreamReadResult<Uint8Array>> | undefined;
	let notified = false;
	const finish = (outcome: "completed" | "cancelled" | "failed") =>
		(finishing ??= control.finish?.(outcome) ?? Promise.resolve());
	const cleanup = () =>
		(cleaning ??= (async () => {
			// cancel closes the reader immediately, but a source's cancel hook may
			// never settle. Join pending reads before releasing the lock; bound the
			// hook's grace period and observe rejection even after that bound.
			const cancellation = reader.cancel().catch(() => {});
			await reader.closed.catch(() => {});
			await reading?.catch(() => {});
			let timer: ReturnType<typeof setTimeout> | undefined;
			try {
				await Promise.race([
					cancellation,
					new Promise<void>((resolve) => {
						timer = setTimeout(resolve, 100);
					}),
				]);
			} finally {
				clearTimeout(timer);
				reader.releaseLock();
			}
		})());
	const notify = () => {
		if (notified) return;
		notified = true;
		control.signal.removeEventListener("abort", interrupted);
		control.settled?.();
	};
	const settle = async (completion: Promise<void>) => {
		// Observe persistence failure while bounded reader cleanup is in flight.
		void completion.catch(() => {});
		await cleanup();
		try {
			await completion;
		} finally {
			notify();
		}
	};
	const interrupted = () => {
		void settle(finish("cancelled")).catch(() => {});
	};
	control.signal.addEventListener("abort", interrupted, { once: true });
	if (control.signal.aborted) interrupted();
	async function read() {
		control.signal.throwIfAborted();
		await control.authorize();
		control.signal.throwIfAborted();
		reading = reader.read();
		const next = await reading;
		reading = undefined;
		await control.authorize();
		control.signal.throwIfAborted();
		bytes += next.value?.byteLength ?? 0;
		if (bytes > 16 * 1024 * 1024) return fail(502, "upstream_body_limit");
		return next;
	}
	const headers = {
		"content-type": stream
			? "text/event-stream; charset=utf-8"
			: "application/json",
		"cache-control": "no-store",
	};

	let terminal = false;
	let rendered = "";
	const decoder = new TextDecoder("utf-8", { fatal: true });
	const encoder = new TextEncoder();
	const parser = boundedSse(
		(event) => {
			if (event._tag !== "Event") return;
			if (terminal) return fail(502, "provider_after_terminal");
			if (event.event === "error") return fail(502, "provider_error");
			if (protocol === "chat" && event.data === "[DONE]") {
				terminal = true;
				rendered += "data: [DONE]\n\n";
				return;
			}
			let value: unknown;
			try {
				value = JSON.parse(event.data);
			} catch {
				return fail(502, "provider_invalid_json");
			}
			if (
				!object(value) ||
				"error" in value ||
				value.type === "error" ||
				["response.failed", "response.incomplete", "response.error"].includes(
					String(value.type),
				)
			)
				return fail(502, "provider_error");
			if (
				protocol !== "chat" &&
				(typeof value.type !== "string" ||
					!/^[a-z][a-z0-9_.]{0,127}$/.test(value.type) ||
					(event.event &&
						event.event !== "message" &&
						event.event !== value.type))
			)
				return fail(502, "provider_event_mismatch");
			if (protocol === "messages" && value.type === "message_stop")
				terminal = true;
			if (protocol === "responses" && value.type === "response.completed") {
				if (!object(value.response) || value.response.status !== "completed")
					return fail(502, "provider_error");
				terminal = true;
			}
			rendered += `${protocol === "chat" ? "" : `event: ${value.type}\n`}data: ${JSON.stringify(value)}\n\n`;
		},
		() => fail(502, "provider_frame_limit"),
	);
	return new Response(
		new ReadableStream<Uint8Array>(
			{
				async pull(controller) {
					try {
						rendered = "";
						while (!rendered && !terminal) {
							const next = await read();
							if (next.done) return fail(502, "provider_incomplete");
							parser.feed(decoder.decode(next.value, { stream: true }));
						}
						control.signal.throwIfAborted();
						if (terminal) {
							await cleanup();
							await finish("completed");
						}
						await control.authorize();
						control.signal.throwIfAborted();
						if (rendered) controller.enqueue(encoder.encode(rendered));
						if (terminal) {
							controller.close();
							notify();
						}
					} catch (error) {
						// Stop I/O before waiting for durable settlement.
						const outcome = control.signal.aborted ? "cancelled" : "failed";
						const completion = finish(outcome);
						control.abort?.();
						await settle(completion).catch(() => {});
						controller.error(
							error instanceof ProviderRoutingError
								? error
								: new ProviderRoutingError(502, "provider_stream_failure"),
						);
					}
				},
				async cancel() {
					const completion = finish("cancelled");
					control.abort?.();
					await settle(completion);
				},
			},
			{ highWaterMark: 0 },
		),
		{ headers },
	);
}
