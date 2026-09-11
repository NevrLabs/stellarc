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

/** Historical chains are instance-local; production has only the v1 identity. */
export class UpcasterRegistry {
	private chains = new Map<
		string,
		Map<number, (payload: unknown) => unknown>
	>();

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

	supports(pluginType: string) {
		return (
			pluginType === "foundation:probe-upserted" ||
			pluginType === "foundation:probe-deleted"
		);
	}

	decode(pluginType: string, version: number, payload: unknown): ProbePayload {
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
			return pluginType === "foundation:probe-upserted"
				? Schema.decodeUnknownSync(Upsert)(current)
				: Schema.decodeUnknownSync(Delete)(current);
		} catch {
			throw new UnsupportedEventSchema();
		}
	}
}
