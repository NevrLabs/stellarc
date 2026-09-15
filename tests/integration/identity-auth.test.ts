import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { makeAuthHandler } from "../../apps/stellarc-api/src/auth-http";
import { runMigration } from "../../packages/db/src/migrate";
import { makeAuth } from "../../packages/domain/src/better-auth";
import { disposablePostgres } from "../helpers/postgres";

// STL-15 §7 T02/T03: bcrypt-imported password signs in through the REAL
// Better Auth handler; cookie loads session; wrong password/expired session/
// banned user fail without leaking account existence.

let sql: Sql;
let authHandler: (request: Request) => Promise<Response>;
const resources: Array<() => Promise<void>> = [];

beforeEach(async () => {
	const db = await disposablePostgres();
	sql = db.sql;
	resources.push(db.close);
	await runMigration(sql);
	const auth = makeAuth(sql, {
		secret: "test-secret-do-not-use-in-production-0123456789",
		baseURL: "http://127.0.0.1:4173",
	});
	authHandler = makeAuthHandler(auth);
});

afterEach(async () => {
	while (resources.length > 0) await resources.pop()?.();
});

async function seedUser(
	id: string,
	email: string,
	password: string,
	extra: { banned?: boolean } = {},
) {
	const bcrypt = await import("bcryptjs");
	const hash = await bcrypt.hash(password, 10);
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, banned)
		VALUES (${id}, 'Test User', ${email}, true, '2026-01-01 00:00:00', '2026-01-01 00:00:00', ${extra.banned ?? false})`;
	await sql`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
		VALUES (${`acc-${id}`}, ${`acc-${id}`}, 'credential', ${id}, ${hash}, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
}

async function signIn(email: string, password: string) {
	return authHandler(
		new Request("http://127.0.0.1:4173/api/auth/sign-in/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email, password }),
		}),
	);
}

test("T02 bcrypt-imported password signs in via real handler and cookie loads session", async () => {
	await seedUser("u-auth-1", "auth@t02.test", "correct-horse-battery");
	const response = await signIn("auth@t02.test", "correct-horse-battery");
	expect(response.status).toBe(200);
	const setCookie = response.headers.get("set-cookie") ?? "";
	expect(setCookie).toContain("stellarc.session_token");
	const body = (await response.json()) as {
		token: string;
		user: { id: string; email: string };
	};
	expect(body.user.id).toBe("u-auth-1");
	expect(body.token).toBeTruthy();

	// The cookie loads the session through get-session.
	const cookiePair = setCookie.split(";")[0];
	const session = await authHandler(
		new Request("http://127.0.0.1:4173/api/auth/get-session", {
			headers: { cookie: cookiePair },
		}),
	);
	expect(session.status).toBe(200);
	const sessionBody = (await session.json()) as {
		session: { userId: string };
		user: { id: string };
	} | null;
	expect(sessionBody?.session.userId).toBe("u-auth-1");
	expect(sessionBody?.user.id).toBe("u-auth-1");
});

test("T02 initial 404 (no handler) is gone; unsupported auth path still fails closed", async () => {
	const response = await authHandler(
		new Request("http://127.0.0.1:4173/api/auth/unknown-thing"),
	);
	expect(response.status).toBe(404);
	expect(await response.json()).toMatchObject({ _tag: "NotFound" });
});

test("T03 wrong password fails without leaking account existence", async () => {
	await seedUser("u-auth-2", "wrongpw@t03.test", "super-secret-9");
	const wrong = await signIn("wrongpw@t03.test", "not-the-password");
	expect(wrong.status).toBe(401);
	const missing = await signIn("ghost@t03.test", "whatever-password");
	// Same status for missing account and wrong password (no user oracle).
	expect(missing.status).toBe(401);
});

test("T03 banned user is denied (403, fork semantics: valid credentials, forbidden account)", async () => {
	await seedUser("u-auth-3", "banned@t03.test", "banned-user-pw-1", {
		banned: true,
	});
	const response = await signIn("banned@t03.test", "banned-user-pw-1");
	// Better Auth's admin plugin (mirrored from the pinned fork) denies banned
	// accounts with 403 — credentials verified, account forbidden. The
	// credential-failure path above stays 401 for both wrong password and
	// missing account, so those two never leak existence.
	expect(response.status).toBe(403);
});

test("T03 expired session fails", async () => {
	await seedUser("u-auth-4", "expired@t03.test", "expired-user-pw-1");
	const response = await signIn("expired@t03.test", "expired-user-pw-1");
	const setCookie = response.headers.get("set-cookie") ?? "";
	const body = (await response.json()) as { token: string };
	// Backdate the session row beyond expiry directly in storage.
	await sql`UPDATE session SET expires_at = '2020-01-01 00:00:00' WHERE token = ${body.token}`;
	const session = await authHandler(
		new Request("http://127.0.0.1:4173/api/auth/get-session", {
			headers: { cookie: setCookie.split(";")[0] },
		}),
	);
	const sessionBody = await session.json();
	expect(sessionBody).toBeNull();
});

test("T02 sign-out invalidates the session cookie's token", async () => {
	await seedUser("u-auth-5", "out@t02.test", "signout-password-1");
	const response = await signIn("out@t02.test", "signout-password-1");
	const setCookie = response.headers.get("set-cookie") ?? "";
	const cookiePair = setCookie.split(";")[0];
	const signOut = await authHandler(
		new Request("http://127.0.0.1:4173/api/auth/sign-out", {
			method: "POST",
			headers: { cookie: cookiePair, "content-type": "application/json" },
			body: JSON.stringify({}),
		}),
	);
	expect(signOut.status).toBe(200);
	const after = await authHandler(
		new Request("http://127.0.0.1:4173/api/auth/get-session", {
			headers: { cookie: cookiePair },
		}),
	);
	expect(await after.json()).toBeNull();
});
