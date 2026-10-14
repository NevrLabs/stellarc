import { HttpServerResponse } from "effect/http";

/** Driver diagnostics never cross the HTTP boundary. */
export function errorResponse(
	error: unknown,
): HttpServerResponse.HttpServerResponse {
	if (typeof error === "object" && error !== null && "_tag" in error) {
		if (error._tag === "Unauthenticated" || error._tag === "Forbidden")
			return HttpServerResponse.jsonUnsafe(
				{
					_tag: error._tag,
					message:
						error._tag === "Unauthenticated"
							? "Authentication required"
							: "Access denied",
				},
				{
					status: error._tag === "Unauthenticated" ? 401 : 403,
					headers: { "cache-control": "no-store" },
				},
			);
	}
	const wrapped =
		typeof error === "object" &&
		error !== null &&
		"_tag" in error &&
		// v4 renamed Cause.UnknownException → Cause.UnknownError (docs/effect-v4/cause.md)
		["SqlError", "UnknownException", "UnknownError"].includes(
			String(error._tag),
		);
	if (wrapped && "cause" in error) return errorResponse(error.cause);
	const code =
		typeof error === "object" && error !== null && "code" in error
			? String(error.code)
			: "";
	const unavailable =
		/^(08|53|57P)/.test(code) ||
		[
			"CONNECTION_ENDED",
			"CONNECTION_CLOSED",
			"CONNECTION_DESTROYED",
			"CONNECT_TIMEOUT",
			"ECONNREFUSED",
			"ECONNRESET",
			"ENOTFOUND",
			"ETIMEDOUT",
		].includes(code);
	return HttpServerResponse.jsonUnsafe(
		unavailable
			? { _tag: "Unavailable", message: "Service unavailable" }
			: { _tag: "InternalError", message: "Internal server error" },
		{
			status: unavailable ? 503 : 500,
			headers: { "cache-control": "no-store" },
		},
	);
}
