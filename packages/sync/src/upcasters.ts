import { Schema } from "effect";

const Upsert = Schema.Struct({
	id: Schema.NonEmptyString,
	value: Schema.String,
});
const Delete = Schema.Struct({ id: Schema.NonEmptyString });
export type ProbePayload = { readonly id: string; readonly value?: string };

export class UnsupportedEventSchema extends Error {
	constructor() {
		super("Unsupported event schema");
	}
}

type Decoder = (payload: unknown) => unknown;

/** Historical chains are instance-local; production has only the v1 identity. */
export class UpcasterRegistry {
	private chains = new Map<
		string,
		Map<number, (payload: unknown) => unknown>
	>();
	// v1-native decoders per plugin type. Foundation probe types are built in;
	// later slices (projects, ...) register theirs via registerType.
	private readonly decoders = new Map<string, Decoder>([
		[
			"foundation:probe-upserted",
			(payload) => Schema.decodeUnknownSync(Upsert)(payload),
		],
		[
			"foundation:probe-deleted",
			(payload) => Schema.decodeUnknownSync(Delete)(payload),
		],
	]);

	register(
		pluginType: string,
		version: number,
		upcast: (payload: unknown) => unknown,
	) {
		if (!this.supports(pluginType) || version !== 0)
			throw new UnsupportedEventSchema();
		const chain = this.chains.get(pluginType) ?? new Map();
		if (chain.has(version)) throw new UnsupportedEventSchema();
		chain.set(version, upcast);
		this.chains.set(pluginType, chain);
	}

	/** Registers a v1-native decoder for a new plugin type. Idempotent per type. */
	registerType(pluginType: string, decode: Decoder) {
		if (this.decoders.has(pluginType)) throw new UnsupportedEventSchema();
		this.decoders.set(pluginType, decode);
	}

	supports(pluginType: string) {
		return this.decoders.has(pluginType);
	}

	decode<T = ProbePayload>(
		pluginType: string,
		version: number,
		payload: unknown,
	): T {
		try {
			if (
				!this.supports(pluginType) ||
				!Number.isInteger(version) ||
				version < 0 ||
				version > 1
			)
				throw new UnsupportedEventSchema();
			let current = payload;
			for (let step = version; step < 1; step++) {
				const upcast = this.chains.get(pluginType)?.get(step);
				if (!upcast) throw new UnsupportedEventSchema();
				current = upcast(current);
			}
			const decoder = this.decoders.get(pluginType);
			if (!decoder) throw new UnsupportedEventSchema();
			return decoder(current) as T;
		} catch {
			throw new UnsupportedEventSchema();
		}
	}
}
