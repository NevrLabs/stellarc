import { Schema } from "effect";

export class BadRequest extends Schema.TaggedError<BadRequest>()(
	"BadRequest",
	{ message: Schema.String },
	{ httpApiStatus: 400 },
) {}
export class Unauthenticated extends Schema.TaggedError<Unauthenticated>()(
	"Unauthenticated",
	{ message: Schema.String },
	{ httpApiStatus: 401 },
) {}
export class Forbidden extends Schema.TaggedError<Forbidden>()(
	"Forbidden",
	{ message: Schema.String },
	{ httpApiStatus: 403 },
) {}
export class NotFound extends Schema.TaggedError<NotFound>()(
	"NotFound",
	{ message: Schema.String },
	{ httpApiStatus: 404 },
) {}
export class Conflict extends Schema.TaggedError<Conflict>()(
	"Conflict",
	{ message: Schema.String },
	{ httpApiStatus: 409 },
) {}

export type AgentsError =
	| BadRequest
	| Unauthenticated
	| Forbidden
	| NotFound
	| Conflict;

const STATUS: Record<AgentsError["_tag"], number> = {
	BadRequest: 400,
	Unauthenticated: 401,
	Forbidden: 403,
	NotFound: 404,
	Conflict: 409,
};

export const isAgentsError = (error: unknown): error is AgentsError =>
	typeof error === "object" &&
	error !== null &&
	"_tag" in error &&
	typeof (error as { _tag: unknown })._tag === "string" &&
	(error as { _tag: string })._tag in STATUS;

export const statusOf = (error: AgentsError) => STATUS[error._tag];
