import { Schema } from "effect";

// STL-18 §2: twelve repository event types at schema_version 1. Upsert
// payloads are {id,row:<public row>,origin:'live'|'import'}; deletes are
// {id,repoId?}. Secret columns (github_user_grant tokens, integration config)
// never enter payloads — upserts of those rows carry safe metadata only.

export type RepositoryEventKind =
	| "repo"
	| "issue"
	| "pull-request"
	| "installation"
	| "github-grant"
	| "integration";

export const REPOSITORY_EVENT_KINDS: readonly RepositoryEventKind[] = [
	"repo",
	"issue",
	"pull-request",
	"installation",
	"github-grant",
	"integration",
];

export type EventOrigin = "live" | "import";

/** Rows that carry secrets are represented in events by their safe subset. */
export const UpsertPayload = Schema.Struct({
	id: Schema.NonEmptyString,
	row: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
	origin: Schema.Literal("live", "import"),
});
export type UpsertPayload = typeof UpsertPayload.Type;

export const DeletePayload = Schema.Struct({
	id: Schema.NonEmptyString,
	repoId: Schema.optional(Schema.NonEmptyString),
});
export type DeletePayload = typeof DeletePayload.Type;

export class UnsupportedEventSchema extends Error {
	constructor() {
		super("Unsupported event schema");
	}
}

const SECRET_KEYS = new Set(["access_token", "refresh_token", "config_secret"]);

/** Guard reused by services: event rows must never carry raw secrets. */
export function assertNoSecrets(row: Record<string, unknown>) {
	for (const key of Object.keys(row))
		if (SECRET_KEYS.has(key)) throw new UnsupportedEventSchema();
}

export class RepositoryUpcasterRegistry {
	private chains = new Map<
		string,
		Map<number, (payload: unknown) => unknown>
	>();

	constructor() {
		// v1 is the only production identity; no historical chains exist yet.
		for (const kind of REPOSITORY_EVENT_KINDS) {
			this.chains.set(`repository:${kind}-upserted`, new Map([[1, (p) => p]]));
			this.chains.set(`repository:${kind}-deleted`, new Map([[1, (p) => p]]));
		}
	}

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
		return this.chains.has(pluginType);
	}

	decode(
		pluginType: string,
		version: number,
		payload: unknown,
	): UpsertPayload | DeletePayload {
		try {
			if (!this.supports(pluginType) || !Number.isInteger(version))
				throw new UnsupportedEventSchema();
			let current = payload;
			for (let step = version; step < 1; step++) {
				const upcast = this.chains.get(pluginType)?.get(step);
				if (!upcast) throw new UnsupportedEventSchema();
				current = upcast(current);
			}
			if (pluginType.endsWith("-upserted")) {
				const decoded = Schema.decodeUnknownSync(UpsertPayload)(current);
				assertNoSecrets(decoded.row);
				return decoded;
			}
			return Schema.decodeUnknownSync(DeletePayload)(current);
		} catch (error) {
			if (error instanceof UnsupportedEventSchema) throw error;
			throw new UnsupportedEventSchema();
		}
	}
}
