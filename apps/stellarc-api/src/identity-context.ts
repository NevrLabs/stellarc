import type { Sql } from "postgres";

// STL-15 §3 shared request context: resolve the authenticated principal from
// a session cookie or x-api-key, rejecting ambiguous simultaneous
// credentials. Session lookup joins the live session row (cookie cache is
// disabled, so revocation is immediate — §2).

export interface RequestContext {
	readonly principalId: string;
	readonly kind: "human" | "agent";
	readonly userId: string;
	readonly sessionId?: string;
	/** Agent keys only: the parsed permission ceiling (§2 key ceiling). */
	readonly keyCeiling?: Readonly<Record<string, readonly string[]>> | null;
	/** Agent keys only: the apikey row id (own-key filtering, §3). */
	readonly apikeyId?: string;
}

export type AuthResolution =
	| { readonly ok: true; readonly context: RequestContext }
	| { readonly ok: false; readonly reason: "unauthenticated" | "ambiguous" };

export function parseCookie(
	header: string | undefined,
): Record<string, string> {
	const out: Record<string, string> = {};
	if (!header) return out;
	for (const part of header.split(";")) {
		const eq = part.indexOf("=");
		if (eq === -1) continue;
		const key = part.slice(0, eq).trim();
		const value = part.slice(eq + 1).trim();
		if (key) out[key] = value;
	}
	return out;
}

/** Resolve cookie name variants (stellarc_session_token / better-auth.session_token). */
function sessionTokenFrom(cookies: Record<string, string>): string | null {
	const preferred = [
		"stellarc.session_token",
		"better-auth.session_token",
		"session_token",
	];
	for (const name of preferred) {
		if (cookies[name]) return cookies[name];
	}
	for (const [key, value] of Object.entries(cookies)) {
		if (/session/i.test(key) && /token/i.test(key) && value) return value;
	}
	return null;
}

/** Better Auth session cookies carry `<token>.<signature>`; the session row
 * key is the token half only. */
export function sessionTokenValue(raw: string): string {
	const dot = raw.indexOf(".");
	return dot === -1 ? raw : raw.slice(0, dot);
}

export async function resolveRequestContext(
	sql: Sql,
	headers: Record<string, string>,
): Promise<AuthResolution> {
	const apiKey = headers["x-api-key"];
	const cookies = parseCookie(headers.cookie);
	const sessionToken = sessionTokenFrom(cookies);
	if (apiKey && sessionToken) return { ok: false, reason: "ambiguous" };
	if (apiKey) {
		const { authenticateApiKey } = await import(
			"../../../packages/domain/src/identity/auth"
		);
		const result = await authenticateApiKey(sql, apiKey);
		if (!result) return { ok: false, reason: "unauthenticated" };
		return {
			ok: true,
			context: {
				principalId: result.principal.id,
				kind: "agent",
				userId: result.principal.userId,
				keyCeiling: result.keyCeiling,
				apikeyId: result.key.id,
			},
		};
	}
	if (sessionToken) {
		const token = sessionTokenValue(sessionToken);
		const rows = await sql<
			Array<{
				user_id: string;
				expires_at: Date | string;
				banned: boolean | null;
			}>
		>`
			SELECT s.user_id, s.expires_at, u.banned
			FROM session s JOIN "user" u ON u.id = s.user_id
			WHERE s.token = ${token}`;
		const row = rows[0];
		if (!row) return { ok: false, reason: "unauthenticated" };
		const expires =
			row.expires_at instanceof Date
				? row.expires_at.getTime()
				: Date.parse(String(row.expires_at));
		if (expires <= Date.now()) return { ok: false, reason: "unauthenticated" };
		if (row.banned) return { ok: false, reason: "unauthenticated" };
		return {
			ok: true,
			context: {
				principalId: `human:${row.user_id}`,
				kind: "human",
				userId: row.user_id,
				sessionId: undefined,
			},
		};
	}
	return { ok: false, reason: "unauthenticated" };
}
