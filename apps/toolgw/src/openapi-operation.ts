import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { z } from "zod";

export type EffectClass =
	| "none"
	| "reversible"
	| "compensatable"
	| "irreversible";
type Parameter = { required?: boolean; maxChars: number };
export type OperationPlan = {
	revision: string;
	endpoint: string;
	fixtureLoopback?: boolean;
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	pathTemplate: string;
	path?: Record<string, Parameter>;
	query?: Record<string, Parameter>;
	body?: z.ZodType;
	credential: { handle: string; header: "authorization" | "x-api-key" };
	effectClass?: EffectClass;
};
export type OperationIdentity = Readonly<{
	operation: string;
	revision: string;
	method: OperationPlan["method"];
	effectClass: EffectClass;
	requestDigest: string;
	binding: string;
}>;
export type OperationDecision = {
	kind: "allow" | "approved" | "deny" | "requiresApproval";
	binding: string;
};
type Bounds = {
	requestBytes: number;
	responseBytes: number;
	timeoutMillis: number;
};
type Hooks = {
	/** Server authority only. Bind verified actor/org/delegation in this closure.
	 * Re-evaluate current rights AND durable approval at dispatch; never echo a
	 * caller boolean. The binding covers frozen operation/argument bytes, not
	 * actor authority. This seam does not implement queue claims or atomicity. */
	authorize: (
		identity: OperationIdentity,
		phase: "gate" | "dispatch",
		signal: AbortSignal,
	) => Promise<OperationDecision>;
	/** Private server credential lookup/refresh boundary, NOT implemented auth. */
	resolveCredential: (handle: string, signal: AbortSignal) => Promise<string>;
};
type ErrorCode =
	| "unknown_operation"
	| "invalid_arguments"
	| "request_too_large"
	| "denied"
	| "cancelled"
	| "timeout"
	| "response_too_large"
	| "upstream_failure"
	| "invalid_response"
	| "unavailable";
export type OperationOutcome =
	| { kind: "completed"; status: number; data: unknown }
	| { kind: "requiresApproval"; identity: OperationIdentity }
	| { kind: "error"; code: ErrorCode; outcomeUnknown: boolean };
class OperationError extends Error {
	constructor(readonly code: ErrorCode) {
		super(code);
	}
}
function fail(code: ErrorCode): never {
	throw new OperationError(code);
}
const digest = (text: string) =>
	createHash("sha256").update(text).digest("hex");
const bytes = (text: string) => Buffer.byteLength(text, "utf8");
const plain = (v: unknown): v is Record<string, unknown> =>
	v !== null &&
	typeof v === "object" &&
	(Object.getPrototypeOf(v) === Object.prototype ||
		Object.getPrototypeOf(v) === null);
const own = (v: object, key: string) => Object.hasOwn(v, key);
const hasControls = (text: string) =>
	[...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);

// Accept decoded JSON data only; bound before stringify/schema work and refuse
// getters/toJSON/cycles/prototypes. Network ingress still needs its own byte cap.
function jsonBytes(value: unknown, limit: number): string {
	let nodes = 0;
	let size = 0;
	function visit(v: unknown, depth: number): void {
		if (++nodes > 4096 || depth > 16) fail("invalid_arguments");
		if (typeof v === "string") size += bytes(v);
		else if (
			v === null ||
			typeof v === "boolean" ||
			(typeof v === "number" && Number.isFinite(v))
		)
			size += 8;
		else if (Array.isArray(v) || plain(v)) {
			const descriptors = Object.getOwnPropertyDescriptors(v);
			for (const [key, d] of Object.entries(descriptors)) {
				if (Array.isArray(v) && key === "length") continue;
				if (
					!own(d, "value") ||
					key === "__proto__" ||
					key === "constructor" ||
					key === "prototype" ||
					key === "toJSON"
				)
					fail("invalid_arguments");
				size += bytes(key);
				visit(d.value, depth + 1);
			}
		} else fail("invalid_arguments");
		if (size > limit) fail("request_too_large");
	}
	visit(value, 0);
	const text = JSON.stringify(value);
	if (bytes(text) > limit) fail("request_too_large");
	return text;
}

function parameters(input: Record<string, Parameter> | undefined) {
	const result: Record<string, Readonly<Parameter>> = Object.create(null);
	for (const [name, rule] of Object.entries(input ?? {})) {
		if (
			!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) ||
			["constructor", "prototype"].includes(name) ||
			!Number.isInteger(rule.maxChars) ||
			rule.maxChars < 1 ||
			rule.maxChars > 8192
		)
			throw new Error("invalid_config");
		result[name] = Object.freeze({
			required: rule.required === true,
			maxChars: rule.maxChars,
		});
	}
	return Object.freeze(result);
}

export function createOperationExecutor(
	registry: Record<string, OperationPlan>,
	bounds: Bounds,
	hooks: Hooks,
) {
	const limits = Object.freeze({ ...bounds });
	if (
		!Number.isInteger(limits.requestBytes) ||
		limits.requestBytes < 1 ||
		limits.requestBytes > 1048576 ||
		!Number.isInteger(limits.responseBytes) ||
		limits.responseBytes < 1 ||
		limits.responseBytes > 4194304 ||
		!Number.isInteger(limits.timeoutMillis) ||
		limits.timeoutMillis < 1 ||
		limits.timeoutMillis > 60000
	)
		throw new Error("invalid_config");
	// Capture server callbacks too: later mutation of the supplied object cannot
	// substitute caller authority or credential providers during an await.
	const { authorize, resolveCredential } = hooks;
	const plans = new Map<string, ReturnType<typeof compile>>();
	function compile(id: string, p: OperationPlan) {
		try {
			if (
				!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(id) ||
				!/^[A-Za-z0-9_.-]{1,128}$/.test(p.revision)
			)
				throw new Error();
			const url = new URL(p.endpoint);
			if (
				url.username ||
				url.password ||
				url.pathname !== "/" ||
				url.search ||
				url.hash ||
				p.endpoint !== url.origin
			)
				throw new Error();
			if (p.fixtureLoopback === true) {
				if (
					url.protocol !== "http:" ||
					!["127.0.0.1", "[::1]"].includes(url.hostname)
				)
					throw new Error();
			} else {
				// Production registry pins public DNS names, not arbitrary IPs. DNS
				// rebinding/private resolution needs deployment egress enforcement.
				if (
					url.protocol !== "https:" ||
					isIP(url.hostname) ||
					url.hostname.includes(":") ||
					!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(
						url.hostname,
					) ||
					/(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(
						url.hostname,
					)
				)
					throw new Error();
			}
			if (
				!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(p.method) ||
				(p.method === "GET" && p.body)
			)
				throw new Error();
			if (
				!/^\/(?:[A-Za-z0-9_.~!$&'()+,;=:@/-]|\{[A-Za-z][A-Za-z0-9_]*\})*$/.test(
					p.pathTemplate,
				) ||
				p.pathTemplate.includes("//") ||
				p.pathTemplate.split("/").some((s) => s === "." || s === "..")
			)
				throw new Error();
			const path = parameters(p.path);
			const query = parameters(p.query);
			const names = [...p.pathTemplate.matchAll(/\{([^{}]+)\}/g)].map(
				(m) => m[1],
			);
			if (
				names.some((n) => !own(path, n)) ||
				Object.keys(path).some((n) => !names.includes(n))
			)
				throw new Error();
			if (
				!p.credential ||
				!["authorization", "x-api-key"].includes(p.credential.header) ||
				!/^[A-Za-z0-9_.:-]{1,256}$/.test(p.credential.handle)
			)
				throw new Error();
			const effectClass: EffectClass = [
				"none",
				"reversible",
				"compensatable",
				"irreversible",
			].includes(p.effectClass ?? "")
				? (p.effectClass as EffectClass)
				: "irreversible";
			const config = Object.freeze({
				operation: id,
				revision: p.revision,
				endpoint: url.origin,
				method: p.method,
				pathTemplate: p.pathTemplate,
				path,
				query,
				credential: Object.freeze({ ...p.credential }),
				effectClass,
				fixtureLoopback: p.fixtureLoopback === true,
				limits,
			});
			return Object.freeze({
				...config,
				body: p.body,
				configDigest: digest(JSON.stringify(config)),
				requiresApproval: p.method !== "GET" || effectClass !== "none",
			});
		} catch {
			throw new Error("invalid_config");
		}
	}
	for (const [id, plan] of Object.entries(registry))
		plans.set(id, compile(id, plan));

	async function execute(
		operation: string,
		input: unknown,
		callerSignal?: AbortSignal,
	): Promise<OperationOutcome> {
		const controller = new AbortController();
		let timedOut = false;
		let dispatchedMutation = false;
		const cancel = () => controller.abort();
		callerSignal?.addEventListener("abort", cancel, { once: true });
		if (callerSignal?.aborted) cancel();
		const timer = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, limits.timeoutMillis);
		const signal = controller.signal;
		const checkAbort = () => {
			if (signal.aborted) fail(timedOut ? "timeout" : "cancelled");
		};
		// Callbacks must cooperate with signal for their own resource cleanup.
		// A losing callback can settle later, but cannot reach this dispatch path.
		async function bounded<T>(work: () => Promise<T>): Promise<T> {
			checkAbort();
			let listener = () => {};
			try {
				return await Promise.race([
					work(),
					new Promise<never>((_, reject) => {
						listener = () =>
							reject(new OperationError(timedOut ? "timeout" : "cancelled"));
						signal.addEventListener("abort", listener, { once: true });
						if (signal.aborted) listener();
					}),
				]);
			} finally {
				signal.removeEventListener("abort", listener);
			}
		}
		try {
			checkAbort();
			const found = plans.get(operation);
			if (!found) fail("unknown_operation");
			const p = found;
			const decoded: unknown = JSON.parse(
				jsonBytes(input, limits.requestBytes),
			);
			if (
				!plain(decoded) ||
				Object.keys(decoded).some((k) => !["path", "query", "body"].includes(k))
			)
				fail("invalid_arguments");
			const args = decoded;
			function values(key: "path" | "query", rules: typeof p.path) {
				const v = own(args, key) ? args[key] : {};
				if (!plain(v) || Object.keys(v).some((k) => !own(rules, k)))
					fail("invalid_arguments");
				const entries: [string, string][] = [];
				for (const [name, rule] of Object.entries(rules)) {
					if (!own(v, name)) {
						if (key === "path" || rule.required) fail("invalid_arguments");
						continue;
					}
					const value = v[name];
					if (!["string", "number", "boolean"].includes(typeof value))
						fail("invalid_arguments");
					const text = String(value);
					if (text.length > rule.maxChars || hasControls(text))
						fail("invalid_arguments");
					if (
						key === "path" &&
						(!text || text === "." || text === ".." || /[%/\\?#:]/.test(text))
					)
						fail("invalid_arguments");
					entries.push([name, text]);
				}
				return entries;
			}
			let path = p.pathTemplate;
			for (const [name, value] of values("path", p.path))
				path = path.replaceAll(
					`{${name}}`,
					encodeURIComponent(value).replace(
						/[!'()*]/g,
						(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
					),
				);
			const url = new URL(p.endpoint + path);
			if (url.origin !== p.endpoint || url.pathname !== path)
				fail("invalid_arguments");
			for (const [name, value] of values("query", p.query))
				url.searchParams.set(name, value);
			let body: string | undefined;
			if (p.body) {
				const parsed = p.body.safeParse(args.body);
				if (!parsed.success) fail("invalid_arguments");
				body = jsonBytes(parsed.data, limits.requestBytes);
			} else if (own(args, "body")) fail("invalid_arguments");
			if (bytes(url.href) + bytes(body ?? "") > limits.requestBytes)
				fail("request_too_large");
			const requestDigest = digest(JSON.stringify([url.href, body ?? null]));
			const identity: OperationIdentity = Object.freeze({
				operation,
				revision: p.revision,
				method: p.method,
				effectClass: p.effectClass,
				requestDigest,
				binding: digest(JSON.stringify([p.configDigest, requestDigest])),
			});
			async function gate(
				phase: "gate" | "dispatch",
			): Promise<OperationOutcome | undefined> {
				const d = await bounded(() => authorize(identity, phase, signal));
				checkAbort();
				if (
					!d ||
					d.binding !== identity.binding ||
					!["allow", "approved", "deny", "requiresApproval"].includes(d.kind) ||
					d.kind === "deny"
				)
					fail("denied");
				if (
					d.kind === "requiresApproval" ||
					(p.requiresApproval && d.kind !== "approved")
				)
					return { kind: "requiresApproval", identity };
			}
			const stopped = await gate("gate");
			if (stopped) return stopped;
			const credential = await bounded(() =>
				resolveCredential(p.credential.handle, signal),
			);
			checkAbort();
			if (
				typeof credential !== "string" ||
				!credential.trim() ||
				bytes(credential) > 8192 ||
				/[^\x20-\x7e]/.test(credential)
			)
				fail("unavailable");
			const headers = new Headers({
				accept: "application/json",
				[p.credential.header]: credential,
			});
			if (body !== undefined) headers.set("content-type", "application/json");
			if (
				bytes(url.href) +
					bytes(body ?? "") +
					[...headers].reduce((n, [k, v]) => n + bytes(k) + bytes(v) + 4, 0) >
				limits.requestBytes
			)
				fail("request_too_large");
			const denied = await gate("dispatch");
			if (denied) return denied;
			checkAbort();
			dispatchedMutation = p.requiresApproval;
			const response = await fetch(url, {
				method: p.method,
				headers,
				body,
				signal,
				redirect: "error",
				credentials: "omit",
				referrerPolicy: "no-referrer",
			});
			try {
				if (!response.ok) fail("upstream_failure");
				const declared = response.headers.get("content-length");
				if (
					declared !== null &&
					(!/^\d+$/.test(declared) || Number(declared) > limits.responseBytes)
				)
					fail("response_too_large");
				const reader = response.body?.getReader();
				const chunks: Uint8Array[] = [];
				let total = 0;
				if (reader) {
					try {
						while (true) {
							const part = await bounded(() => reader.read());
							checkAbort();
							if (part.done) break;
							total += part.value.byteLength;
							if (total > limits.responseBytes) fail("response_too_large");
							chunks.push(part.value);
						}
					} finally {
						await reader.cancel().catch(() => {});
						reader.releaseLock();
					}
				}
				const text = new TextDecoder("utf-8", { fatal: true }).decode(
					Buffer.concat(chunks),
				);
				let data: unknown;
				try {
					data = text ? JSON.parse(text) : null;
				} catch {
					fail("invalid_response");
				}
				// Refuse reflected custody secrets, including JSON-escaped echoes.
				const rendered = JSON.stringify(data);
				const token = credential.replace(/^Bearer\s+/i, "");
				if (
					[credential, token].some(
						(s) =>
							rendered.includes(s) ||
							rendered.includes(JSON.stringify(s).slice(1, -1)),
					)
				)
					fail("invalid_response");
				checkAbort();
				return { kind: "completed", status: response.status, data };
			} finally {
				await response.body?.cancel().catch(() => {});
			}
		} catch (error) {
			// Never surface causes, URLs, upstream bodies/headers, schema errors,
			// callback errors or request data. No automatic retry after dispatch.
			return {
				kind: "error",
				code: signal.aborted
					? timedOut
						? "timeout"
						: "cancelled"
					: error instanceof OperationError
						? error.code
						: "unavailable",
				outcomeUnknown: dispatchedMutation,
			};
		} finally {
			clearTimeout(timer);
			callerSignal?.removeEventListener("abort", cancel);
		}
	}
	return Object.freeze({ execute });
}
