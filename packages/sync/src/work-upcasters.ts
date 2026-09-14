import { Schema } from "effect";
import { WorkEventPayloadSchemas } from "../../domain/src/work-events";

/** Work v1 event decoding for the shape tail. Unknown versions/types fail
 * closed (UnsupportedEventSchema) — same contract as the foundation registry. */
export class UnsupportedWorkEventSchema extends Error {
	constructor() {
		super("Unsupported event schema");
	}
}

export class WorkUpcasterRegistry {
	private known = new Map<string, Map<number, (payload: unknown) => unknown>>();

	constructor() {
		for (const [type, schema] of Object.entries(WorkEventPayloadSchemas)) {
			this.known.set(type, new Map([[1, (payload: unknown) => payload]]));
			void schema;
		}
	}

	supports(pluginType: string): boolean {
		return this.known.has(pluginType);
	}

	decode(
		pluginType: string,
		version: number,
		payload: unknown,
	): { id: string; row?: unknown; from?: string; to?: string; boardId?: string } {
		const chain = this.known.get(pluginType);
		if (!chain || version !== 1 || !chain.has(version))
			throw new UnsupportedWorkEventSchema();
		const upcast = chain.get(version);
		if (!upcast) throw new UnsupportedWorkEventSchema();
		const decoded = upcast(payload);
		const schema = WorkEventPayloadSchemas[
			pluginType as keyof typeof WorkEventPayloadSchemas
		];
		try {
			return Schema.decodeUnknownSync(schema as Schema.Schema<unknown, unknown>)(
				decoded,
			) as never;
		} catch {
			throw new UnsupportedWorkEventSchema();
		}
	}
}
