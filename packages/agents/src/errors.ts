import { Data } from "effect";

export class BadRequest extends Data.TaggedError("BadRequest")<{
	readonly message: string;
}> {}
export class Unauthenticated extends Data.TaggedError("Unauthenticated")<{
	readonly message: string;
}> {}
export class Forbidden extends Data.TaggedError("Forbidden")<{
	readonly message: string;
}> {}
export class NotFound extends Data.TaggedError("NotFound")<{
	readonly message: string;
}> {}
export class Conflict extends Data.TaggedError("Conflict")<{
	readonly message: string;
}> {}

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
