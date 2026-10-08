import { PgClient } from "@effect/sql-pg";
import { Effect, Layer } from "effect";
import type { Span } from "effect/Tracer";
import * as Tracer from "effect/Tracer";
import { AppConfig } from "../../../apps/stellarc-api/src/config";

/**
 * Filter at the Effect tracer boundary, before the SDK receives attributes.
 *
 * The v4 SQL driver names statement spans after the database namespace (e.g.
 * `postgres`, span kind `client`) and annotates `db.query.text` with the full
 * statement text. We intercept that attribute as the SQL becomes available,
 * derive `db.operation` / `db.sql.table` from it, rename the span
 * `db.<operation>`, and drop the raw text so it never reaches an exporter.
 */

/** Rewrite a span from its SQL text: operation + table dimensions, no text. */
const sqlTextToSpan = (span: Span, value: string) => {
	const operation =
		/^\s*(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|CREATE|ALTER|DROP)\b/i
			.exec(value)?.[1]
			?.toUpperCase() ?? "OTHER";
	span.attribute("db.system", "postgresql");
	span.attribute("db.operation", operation);
	// Only known foundation tables become telemetry dimensions.
	const table =
		/\b(?:FROM|INTO|UPDATE|TABLE)\s+(?:public\.)?(org_event_counter|sync_probe|stellarc_migration|event)\b/i
			.exec(value)?.[1]
			?.toLowerCase();
	if (table) span.attribute("db.sql.table", table);
	const name = `db.${operation.toLowerCase()}`;
	// Effect-level view (NativeSpan and the OtelSpan wrapper both hold a
	// plain `name` property assigned in their constructors).
	Object.defineProperty(span, "name", {
		value: name,
		writable: false,
		enumerable: true,
		configurable: true,
	});
	// OpenTelemetry view: @effect/opentelemetry spans forward to an otel span
	// whose name was fixed at startSpan; updateName is the public otel API.
	const otelSpan = (
		span as unknown as {
			span?: { updateName?: (name: string) => unknown };
		}
	).span;
	otelSpan?.updateName?.(name);
};

/** Wrap a span so `db.query.text` / `db.statement` are never recorded. */
const redactStatement = (span: Span): Span => {
	const attribute = span.attribute.bind(span);
	span.attribute = (key: string, value: unknown) => {
		if (key === "db.query.text" || key === "db.statement") {
			if (typeof value === "string") sqlTextToSpan(span, value);
			return;
		}
		attribute(key, value);
	};
	return span;
};

const SqlTracing = Layer.unwrap(
	Effect.map(Effect.tracer, (tracer) => {
		const delegate = tracer.context;
		return Layer.succeed(
			Tracer.Tracer,
			Tracer.make({
				...(delegate
					? {
							context: (primitive, fiber) => delegate(primitive, fiber),
						}
					: {}),
				span(options) {
					const span = tracer.span(options);
					// v4 SQL statement spans are client-kind spans named after
					// the db namespace; every other span passes through.
					return options.kind === "client" && options.root !== true
						? redactStatement(span)
						: span;
				},
			}),
		);
	}),
);

/** The Effect PostgreSQL pool is acquired and released by the runtime scope. */
export const SqlLive = Layer.unwrap(
	Effect.gen(function* () {
		const config = yield* AppConfig;
		return PgClient.layer({
			url: config.databaseUrl,
			maxConnections: 8,
			connectTimeout: 5000,
			applicationName: "stellarc",
		}).pipe(Layer.provideMerge(SqlTracing));
	}),
);
