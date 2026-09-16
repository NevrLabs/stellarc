import bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { admin as adminPlugin } from "better-auth/plugins";
import type { Sql } from "postgres";
import { postgresJsAdapter } from "./better-auth-adapter";

// STL-15 §3: first-party Better Auth Layer on the 0002 runtime tables.
// Password semantics mirror the pinned fork: bcrypt hash/verify with imported
// hashes preserved verbatim (never re-hashed). Plugins are limited to the
// enabled, specified routes — no wildcard mount of undocumented paths.

export interface BetterAuthDeps {
	/** Optional tracer for adapter spans (Identity.authAdapter.*). */
	tracer?: import("./identity/tracer-type").TracerLike;
	/** Secret for session token signing. Never logged. */
	secret: string;
	/** Base URL the API is served from (origin only, no path). */
	baseURL: string;
}

export function makeAuth(sql: Sql, deps: BetterAuthDeps) {
	return betterAuth({
		secret: deps.secret,
		baseURL: deps.baseURL,
		basePath: "/api/auth",
		database: postgresJsAdapter(sql, deps.tracer),
		emailAndPassword: {
			enabled: true,
			autoSignIn: false,
			minPasswordLength: 8,
			maxPasswordLength: 128,
			password: {
				hash: async (password: string) => bcrypt.hash(password, 10),
				verify: async ({
					hash,
					password,
				}: {
					hash: string;
					password: string;
				}) => bcrypt.compare(password, hash),
			},
		},
		session: {
			// Store sessions in our runtime table; cookie cache disabled so
			// revocation never waits for cache expiry (§2).
			cookieCache: {
				enabled: false,
			},
			storeSessionInDatabase: true,
		},
		advanced: {
			cookiePrefix: "stellarc",
		},
		user: {
			modelName: "user",
		},
		// Instance-level admin/ban enforcement (§2: user.role admin is
		// instance-level). Mirrors the fork's adminPlugin configuration; the
		// plugin also gates banned users out of sessions (T03).
		plugins: [adminPlugin({ defaultRole: "user", adminRoles: ["admin"] })],
	});
}
