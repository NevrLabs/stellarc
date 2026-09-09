import { HttpServerResponse } from "@effect/platform";

/** Driver diagnostics never cross the HTTP boundary. */
export function errorResponse(error: unknown) {
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
	return HttpServerResponse.unsafeJson(
		unavailable
			? { _tag: "Unavailable", message: "Service unavailable" }
			: { _tag: "InternalError", message: "Internal server error" },
		{
			status: unavailable ? 503 : 500,
			headers: { "cache-control": "no-store" },
		},
	);
}
