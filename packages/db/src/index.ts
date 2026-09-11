import { PgClient } from "@effect/sql-pg";
import { Effect, Layer, Tracer } from "effect";
import { AppConfig } from "../../../apps/stellarc-api/src/config";

/** Filter at the Effect tracer boundary, before the SDK receives attributes.
 * The pinned SQL driver unconditionally annotates db.query.text.
 */
const SqlTracing = Layer.unwrapEffect(
	Effect.tracerWith((tracer) =>
		Effect.succeed(
			Layer.setTracer(
				Tracer.make({
					context: (run, fiber) => tracer.context(run, fiber),
					span: (name, parent, context, links, startTime, kind, options) => {
						const sqlSpan = name.startsWith("sql.");
						const span = tracer.span(
							sqlSpan ? name.replace(/^sql\./, "db.") : name,
							parent,
							context,
							links,
							startTime,
							kind,
							options,
						);
						if (!sqlSpan) return span;
						span.attribute("db.system", "postgresql");
						const attribute = span.attribute.bind(span);
						span.attribute = (key, value) => {
							if (key === "db.query.text" || key === "db.statement") {
								if (typeof value === "string") {
									const operation =
										/^\s*(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|CREATE|ALTER|DROP)\b/i
											.exec(value)?.[1]
											?.toUpperCase() ?? "OTHER";
									attribute("db.operation", operation);
									// Only known foundation tables become telemetry dimensions.
									const table =
										/\b(?:FROM|INTO|UPDATE|TABLE)\s+(?:public\.)?(org_event_counter|sync_probe|stellarc_migration|event)\b/i
											.exec(value)?.[1]
											?.toLowerCase();
									if (table) attribute("db.sql.table", table);
								}
								return;
							}
							attribute(key, value);
						};
						return span;
					},
				}),
			),
		),
	),
);

/** The Effect PostgreSQL pool is acquired and released by the runtime scope. */
export const SqlLive = Layer.unwrapEffect(
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
