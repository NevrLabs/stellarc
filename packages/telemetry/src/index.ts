import { NodeSdk } from "@effect/opentelemetry";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
	BatchLogRecordProcessor,
	InMemoryLogRecordExporter,
	SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import {
	AggregationTemporality,
	InMemoryMetricExporter,
	PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
	BatchSpanProcessor,
	InMemorySpanExporter,
	SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { Layer } from "effect";

const bootGeneration = crypto.randomUUID();
const resource = (serviceName: string) => ({
	serviceName,
	serviceVersion: process.env.SERVICE_VERSION ?? "unknown",
	attributes: {
		"deployment.environment":
			process.env.DEPLOYMENT_ENVIRONMENT ?? "development",
		"stellarc.boot_generation": bootGeneration,
	},
});
export const TelemetryLive = (serviceName: string) => {
	const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
	if (!endpoint) return Layer.empty;
	const base = endpoint.replace(/\/$/, "");
	return NodeSdk.layer(() => ({
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
	}));
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
	const layer = NodeSdk.layer(() => ({
		resource: resource("stellarc-test"),
		spanProcessor: new SimpleSpanProcessor(spans),
		logRecordProcessor: logProcessor,
		metricReader: reader,
	}));
	return { layer, spans, logs, metrics, reader, logProcessor };
};
