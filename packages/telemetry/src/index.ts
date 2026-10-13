// Submodule imports only: the package barrel re-exports NodeSdk/WebSdk,
// which statically import @opentelemetry/sdk-trace-node/-web — optional
// peers the pinned lockfile does not install — and would make this module
// unimportable.
import * as OtelLogger from "@effect/opentelemetry/OtelLogger";
import * as OtelMetrics from "@effect/opentelemetry/OtelMetrics";
import * as OtelTracer from "@effect/opentelemetry/OtelTracer";
import * as Resource from "@effect/opentelemetry/Resource";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import type { LogRecordProcessor } from "@opentelemetry/sdk-logs";
import {
	BatchLogRecordProcessor,
	InMemoryLogRecordExporter,
	SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import type { MetricReader } from "@opentelemetry/sdk-metrics";
import {
	AggregationTemporality,
	InMemoryMetricExporter,
	PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import type { SpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
	BasicTracerProvider,
	BatchSpanProcessor,
	InMemorySpanExporter,
	SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { Effect, Layer } from "effect";

/** Attribute map type of the otel Resource the SDK layers consume. */
type ResourceAttributes = Parameters<
	typeof Resource.configToAttributes
>[0]["attributes"];

const bootGeneration = crypto.randomUUID();
const resource = (
	serviceName: string,
): Parameters<typeof Resource.configToAttributes>[0] => ({
	serviceName,
	serviceVersion: process.env.SERVICE_VERSION ?? "unknown",
	attributes: {
		"deployment.environment":
			process.env.DEPLOYMENT_ENVIRONMENT ?? "development",
		"stellarc.boot_generation": bootGeneration,
	} as ResourceAttributes,
});

/**
 * NodeSdk-equivalent composition, rebuilt from @effect/opentelemetry parts.
 *
 * NodeSdk.layer itself cannot be imported under the pinned lockfile: it
 * statically imports @opentelemetry/sdk-trace-node, which the lockfile does
 * not install (optional peer). Every other building block it composes —
 * Resource, OtelTracer, OtelMetrics, OtelLogger — imports fine, and
 * NodeTracerProvider is a thin subclass of BasicTracerProvider (which
 * sdk-trace-base ships), so the composition below reproduces NodeSdk.layer
 * exactly: same layers, same wiring, same flush/shutdown semantics.
 */
const sdkLayer = (config: {
	resource: Parameters<typeof Resource.configToAttributes>[0];
	spanProcessor?: SpanProcessor | ReadonlyArray<SpanProcessor>;
	metricReader?: MetricReader | ReadonlyArray<MetricReader>;
	metricTemporality?: OtelMetrics.TemporalityPreference;
	logRecordProcessor?: LogRecordProcessor | ReadonlyArray<LogRecordProcessor>;
	loggerMergeWithExisting?: boolean;
}) => {
	const asArray = <T>(value: T | ReadonlyArray<T> | undefined) =>
		value === undefined ? [] : Array.isArray(value) ? [...value] : [value];
	const ResourceLayer = Resource.layerFromEnv(
		Resource.configToAttributes(config.resource),
	);
	// NodeTracerProvider's only additions over BasicTracerProvider are
	// Node-specific plugins; none are configured here.
	const TracerLayer = Layer.provide(
		OtelTracer.layer,
		Layer.effect(
			OtelTracer.OtelTracerProvider,
			Effect.gen(function* () {
				const otelResource = yield* Resource.Resource;
				return yield* Effect.acquireRelease(
					Effect.sync(
						() =>
							new BasicTracerProvider({
								resource: otelResource,
								spanProcessors: asArray(
									config.spanProcessor,
								) as SpanProcessor[],
							}),
					),
					(provider) =>
						Effect.promise(() =>
							provider.forceFlush().finally(() => provider.shutdown()),
						).pipe(Effect.ignore),
				);
			}),
		),
	);
	const spanProcessors = asArray(config.spanProcessor);
	const metricReaders = asArray(config.metricReader);
	const logProcessors = asArray(config.logRecordProcessor);
	const MetricsLayer =
		metricReaders.length > 0
			? OtelMetrics.layer(() => metricReaders as never, {
					temporality: config.metricTemporality,
				})
			: Layer.empty;
	const LoggerLayer =
		logProcessors.length > 0
			? Layer.provide(
					OtelLogger.layer({
						mergeWithExisting: config.loggerMergeWithExisting,
					}),
					OtelLogger.layerLoggerProvider(
						logProcessors as [LogRecordProcessor, ...LogRecordProcessor[]],
					),
				)
			: Layer.empty;
	return Layer.mergeAll(
		spanProcessors.length > 0 ? TracerLayer : Layer.empty,
		MetricsLayer,
		LoggerLayer,
	).pipe(Layer.provideMerge(ResourceLayer));
};

export const TelemetryLive = (serviceName: string) => {
	const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
	if (!endpoint) return Layer.empty;
	const base = endpoint.replace(/\/$/, "");
	return sdkLayer({
		resource: resource(serviceName),
		spanProcessor: new BatchSpanProcessor(
			new OTLPTraceExporter({ url: `${base}/v1/traces` }),
		),
		metricReader: new PeriodicExportingMetricReader({
			exporter: new OTLPMetricExporter({ url: `${base}/v1/metrics` }),
		}),
		logRecordProcessor: new BatchLogRecordProcessor(
			new OTLPLogExporter({ url: `${base}/v1/logs` }),
		),
	});
};
export const TelemetryTest = () => {
	const spans = new InMemorySpanExporter();
	const logs = new InMemoryLogRecordExporter();
	const metrics = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
	const reader = new PeriodicExportingMetricReader({
		exporter: metrics,
		exportIntervalMillis: 60000,
	});
	const logProcessor = new SimpleLogRecordProcessor(logs);
	const layer = sdkLayer({
		resource: resource("stellarc-test"),
		spanProcessor: new SimpleSpanProcessor(spans),
		logRecordProcessor: logProcessor,
		metricReader: reader,
	});
	return { layer, spans, logs, metrics, reader, logProcessor };
};
