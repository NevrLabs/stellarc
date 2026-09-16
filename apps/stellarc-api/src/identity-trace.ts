import {
	type Context,
	context as otelContext,
	propagation,
	type Span,
	trace,
} from "@opentelemetry/api";
import type { Runtime } from "effect";

// STL-15 rework c12 (review c9 defect 3, ADR 0010): shared span helper for
// the identity surface. The HTTP wrapper opens one server span per request
// (http.route/method + stellarc.org/principal.kind after resolution) in the
// inbound trace (traceparent-extracted parent), and service functions open
// named Identity.* spans as children. Attribute payloads are allowlisted
// identifiers only — never SQL text or secrets.

export type IdentityRuntime = Runtime.Runtime<never>;

export interface SpanHandle {
	end(): void;
	setAttribute(key: string, value: string | number | boolean): void;
	recordError(error: unknown): void;
	/** Run an async body inside this span's context so nested service spans
	 * parent to it (and to the inbound trace when traceparent was present). */
	with<T>(body: () => Promise<T>): Promise<T>;
}

export interface TracerLike {
	startSpan(name: string, options?: { traceparent?: string }): SpanHandle;
}

function wrapSpan(span: Span): SpanHandle {
	return {
		end() {
			span.end();
		},
		setAttribute(key, value) {
			span.setAttribute(key, value);
		},
		recordError(error) {
			span.recordException(
				error instanceof Error ? error : new Error(String(error)),
			);
			span.setStatus({ code: 2, message: String(error) });
		},
		with<T>(body: () => Promise<T>): Promise<T> {
			return otelContext.with(trace.setSpan(otelContext.active(), span), body);
		},
	};
}

const noopSpan: SpanHandle = {
	end() {},
	setAttribute() {},
	recordError() {},
	with<T>(body: () => Promise<T>) {
		return body();
	},
};

export const noopTracer: TracerLike = {
	startSpan(): SpanHandle {
		return noopSpan;
	},
};

const headerGetter = {
	get(carrier: Record<string, string>, key: string): string | undefined {
		return carrier[key];
	},
	keys(carrier: Record<string, string>): string[] {
		return Object.keys(carrier);
	},
};

/** Resolve a tracer against the OTel global registry — the same registry the
 * TelemetryTest/TelemetryLive SDK layers register into, so spans export to
 * the active exporter (in-memory in tests, OTLP in production). The optional
 * traceparent extracts the inbound remote parent context so the server span
 * joins the caller's trace. The runtime argument keeps the ManagedRuntime
 * alive for callers that own one; tracing itself is registry-based. */
export function identityTracer(_runtime?: IdentityRuntime): TracerLike {
	const tracer = trace.getTracer("stellarc-identity");
	return {
		startSpan(name, options) {
			let parent: Context = otelContext.active();
			if (options?.traceparent) {
				parent = propagation.extract(
					parent,
					{ traceparent: options.traceparent },
					headerGetter,
				);
			}
			return wrapSpan(tracer.startSpan(name, undefined, parent));
		},
	};
}
