import { HttpApiSchema } from "@effect/platform";
import { Schema } from "effect";

// ── errors (wire: Kaneo's HTTPException status codes) ──────────────────────
const err = <T extends string>(tag: T, status: number) =>
	Schema.TaggedError<{ readonly _tag: T; readonly message: string }>()(
		tag,
		{ message: Schema.String },
		HttpApiSchema.annotations({ status }),
	);
export class Unauthorized extends err("Unauthorized", 401) {}
export class Forbidden extends err("Forbidden", 403) {}
export class NotFound extends err("NotFound", 404) {}
export class Conflict extends err("Conflict", 409) {}
export class BadRequest extends err("BadRequest", 400) {}
export type DomainError =
	| Unauthorized
	| Forbidden
	| NotFound
	| Conflict
	| BadRequest;
