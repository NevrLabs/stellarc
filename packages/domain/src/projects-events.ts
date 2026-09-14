import { Schema } from "effect";
import { ProjectEventPayloadSchemas } from "../../contracts/src/projects";
import type { UpcasterRegistry } from "../../sync/src/upcasters";

/** Registers the 14 project event types (schema_version 1) on the sync engine’s
 * upcaster registry. Live events decode through the contract payload schemas;
 * unknown versions fail closed (UnsupportedEventSchema). */
export function registerProjectsUpcasters(registry: UpcasterRegistry): void {
	for (const [type, schema] of Object.entries(ProjectEventPayloadSchemas)) {
		registry.registerType(type, (payload) =>
			Schema.decodeUnknownSync(
				schema as Schema.Schema<unknown, unknown, never>,
			)(payload),
		);
	}
}
