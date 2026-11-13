import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { memoryAdapter } from "better-auth/adapters/memory";
import { getMigrations } from "better-auth/db/migration";
import { Pool } from "pg";
import postgres from "postgres";
import { gatewayAuth } from "./auth";

// Actual pinned Better Auth endpoints with a LOCAL SIGNED IDP fixture, not live login.
const origin = "https://gateway.invalid";
const issuer = "https://issuer.invalid";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
	modulusLength: 2048,
});
const jwk = {
	...publicKey.export({ format: "jwk" }),
	kid: "fixture",
	alg: "RS256",
	use: "sig",
};
const now = new Date();
const db = {
	user: [
		{
			id: "human",
			name: "Local operator",
			email: "human@identity.invalid",
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		},
	],
	account: [
		{
			id: "linked",
			userId: "human",
			providerId: "zitadel",
			accountId: "approved-sub",
			createdAt: now,
			updatedAt: now,
		},
	],
	session: [],
	verification: [],
};
let nonce = "";
let variant = "ok";
let exchanges = 0;
const auditKinds: string[] = [];
let auditFails = false;
let acceptanceAuditFails = false;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, options?: RequestInit) => {
	const url = String(input);
	if (url === `${issuer}/keys`) return Response.json({ keys: [jwk] });
	assert.equal(url, `${issuer}/token`);
	exchanges++;
	const optionsBody = (options as { body?: unknown } | undefined)?.body;
	const body = new URLSearchParams(String(optionsBody));
	const verifier = body.get("code_verifier");
	assert.ok(verifier);
	assert.equal(
		createHash("sha256").update(verifier).digest("base64url"),
		nonce,
	);
	const seconds = Math.floor(Date.now() / 1000);
	const claims = {
		iss: issuer,
		sub: "approved-sub",
		aud: "fixture",
		nonce,
		iat: seconds,
		exp: seconds + 60,
		...(variant === "issuer" ? { iss: "https://foreign.invalid" } : {}),
		...(variant === "aud" ? { aud: "foreign" } : {}),
		...(variant === "nonce" ? { nonce: "wrong" } : {}),
		...(variant === "expired" ? { exp: seconds - 1 } : {}),
		...(variant === "azp" ? { aud: ["fixture", "other"], azp: "foreign" } : {}),
		...(variant === "unknown" ? { sub: "unapproved" } : {}),
	};
	const encode = (v: unknown) =>
		Buffer.from(JSON.stringify(v)).toString("base64url");
	const unsigned = `${encode({ alg: variant === "alg" ? "HS256" : "RS256", kid: "fixture" })}.${encode(claims)}`;
	const sig = sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString(
		"base64url",
	);
	return Response.json({
		access_token: "PRIVATE_UPSTREAM_TOKEN",
		id_token: `${unsigned}.${variant === "signature" ? "a".repeat(sig.length) : sig}`,
		token_type: "Bearer",
		expires_in: 60,
	});
}) as typeof fetch;
const owner =
	process.env.AUTH_PG_CHECK === "1"
		? postgres(
				(() => {
					const dsn = process.env.SPIKE_OWNER_DSN;
					if (typeof dsn !== "string" || !dsn)
						throw new Error("SPIKE_OWNER_DSN required");
					return dsn;
				})(),
				{ max: 2, onnotice: () => {} },
			)
		: undefined;
const ownerPool = owner
	? new Pool({ connectionString: process.env.SPIKE_OWNER_DSN, max: 2 })
	: undefined;
let runtimePool: Pool | undefined;
const sessionCount = async () =>
	owner
		? Number((await owner`SELECT count(*)::int AS n FROM session`)[0].n)
		: db.session.length;
try {
	const config = {
		origin,
		issuer,
		clientId: "fixture",
		clientSecret: "FIXTURE_SECRET_NOT_REAL",
		secret: "fixture-auth-secret-long-enough-for-security-checks",
		database: ownerPool ?? memoryAdapter(db),
		authorizationEndpoint: `${issuer}/authorize`,
		tokenEndpoint: `${issuer}/token`,
		jwksUri: `${issuer}/keys`,
		audit: async (kind: string) => {
			if (auditFails && kind === "auth.session.admit")
				throw new Error("audit unavailable");
			if (acceptanceAuditFails && kind === "auth.callback.accept")
				throw new Error("acceptance audit unavailable");
			auditKinds.push(kind);
		},
		approved: async (sub: string) =>
			sub === "approved-sub"
				? {
						id: "human",
						name: "Local operator",
						email: "human@identity.invalid",
					}
				: null,
	};
	if (owner && ownerPool) {
		await (
			await getMigrations(gatewayAuth(config).auth.options)
		).runMigrations();
		await owner`INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES ('human','Local operator','human@identity.invalid',true,now(),now())`;
		await owner`INSERT INTO account(id,"userId","accountId","providerId","createdAt","updatedAt") VALUES ('linked','human','approved-sub','zitadel',now(),now())`;
		await owner`CREATE ROLE gateway_runtime LOGIN PASSWORD 'disposable-only'`;
		await owner`GRANT USAGE ON SCHEMA public TO gateway_runtime`;
		await owner`GRANT SELECT,INSERT,UPDATE,DELETE ON "user",account,session,verification TO gateway_runtime`;
		runtimePool = new Pool({
			connectionString: process.env.SPIKE_RUNTIME_DSN,
			max: 2,
		});
		config.database = runtimePool;
	}
	const auth = gatewayAuth(config);
	async function begin() {
		const r = await auth.handler(
			new Request(`${origin}/auth/login`, {
				method: "POST",
				headers: { origin, "content-type": "application/json" },
				body: "{}",
			}),
		);
		assert.equal(r.status, 200);
		const u = new URL((await r.json()).url);
		{
			const beginNonce = u.searchParams.get("nonce");
			if (typeof beginNonce !== "string") throw new Error("nonce missing");
			nonce = beginNonce;
		}
		assert.equal(u.searchParams.get("scope"), "openid");
		assert.equal(u.searchParams.get("code_challenge_method"), "S256");
		assert.equal(nonce, u.searchParams.get("code_challenge"));
		return {
			url: `${origin}/api/auth/callback/zitadel?code=fixture&state=${u.searchParams.get("state")}&iss=${issuer}`,
			cookie: r.headers
				.getSetCookie()
				.map((c) => c.split(";")[0])
				.join("; "),
		};
	}
	const first = await begin();
	const response = await auth.handler(
		new Request(first.url, { headers: { cookie: first.cookie } }),
	);
	assert.equal(response.status, 302);
	console.log("FIXTURE_CALLBACK", response.headers.get("location"));
	assert.ok(
		response.headers.getSetCookie().some((c) => c.includes("session_token")),
	);
	const replay = await auth.handler(
		new Request(first.url, { headers: { cookie: first.cookie } }),
	);
	assert.ok(
		!replay.headers.getSetCookie().some((c) => c.includes("session_token=")),
	);
	console.log("PASS library-code-pkce-nonce-session-and-replay");
	const wrong = await begin();
	const before = exchanges;
	await auth.handler(new Request(wrong.url));
	assert.equal(exchanges, before);
	console.log("PASS library-browser-binding-before-exchange");
	const withoutIssuer = await begin();
	const callback = new URL(withoutIssuer.url);
	callback.searchParams.delete("iss");
	const acceptedWithoutIssuer = await auth.handler(
		new Request(callback, { headers: { cookie: withoutIssuer.cookie } }),
	);
	assert.equal(acceptedWithoutIssuer.status, 302);
	assert.equal(acceptedWithoutIssuer.headers.get("location"), origin);
	assert.ok(
		acceptedWithoutIssuer.headers
			.getSetCookie()
			.some((c) => c.includes("session_token=")),
	);
	await auth.handler(
		new Request(`${origin}/api/auth/sign-out`, {
			method: "POST",
			headers: {
				origin,
				"content-type": "application/json",
				cookie: acceptedWithoutIssuer.headers
					.getSetCookie()
					.map((c) => c.split(";")[0])
					.join("; "),
			},
			body: "{}",
		}),
	);
	for (const values of [["https://foreign.invalid"], [issuer, issuer]]) {
		const login = await begin();
		const target = new URL(login.url);
		target.searchParams.delete("iss");
		for (const value of values) target.searchParams.append("iss", value);
		const beforeInvalidIssuer = exchanges;
		const rejected = await auth.handler(
			new Request(target, { headers: { cookie: login.cookie } }),
		);
		assert.equal(rejected.status, 400);
		assert.equal(exchanges, beforeInvalidIssuer);
	}
	console.log("PASS optional-callback-issuer-validated-when-present");
	for (variant of [
		"issuer",
		"aud",
		"nonce",
		"expired",
		"azp",
		"unknown",
		"alg",
		"signature",
	]) {
		const login = await begin();
		const denied = await auth.handler(
			new Request(login.url, { headers: { cookie: login.cookie } }),
		);
		assert.ok(
			!denied.headers.getSetCookie().some((c) => c.includes("session_token=")),
			variant,
		);
	}
	assert.equal(
		owner
			? Number((await owner`SELECT count(*)::int AS n FROM "user"`)[0].n)
			: db.user.length,
		1,
	);
	const storedAccounts = owner
		? await owner`SELECT to_jsonb(account) AS record FROM account`
		: db.account;
	assert.ok(!JSON.stringify(storedAccounts).includes("PRIVATE_UPSTREAM_TOKEN"));
	console.log(
		"PASS library-signed-identity-negative-vectors-no-provider-token-storage",
	);
	assert.equal(
		(
			await auth.handler(
				new Request(`${origin}/api/auth/sign-up/email`, { method: "POST" }),
			)
		).status,
		404,
	);
	assert.equal(
		(
			await auth.handler(
				new Request(`${origin}/auth/login`, {
					method: "POST",
					headers: { origin: "https://foreign.invalid" },
				}),
			)
		).status,
		403,
	);
	console.log("PASS auth-route-allowlist-and-exact-origin");
	assert.ok(auditKinds.includes("auth.callback.accept"));
	assert.ok(auditKinds.includes("auth.callback.reject"));
	assert.ok(auditKinds.includes("auth.login.begin"));
	variant = "ok";
	const sessionsBefore = await sessionCount();
	const deniedLogin = await begin();
	auditFails = true;
	const noAudit = await auth.handler(
		new Request(deniedLogin.url, { headers: { cookie: deniedLogin.cookie } }),
	);
	assert.equal(noAudit.status, 503);
	assert.equal(await sessionCount(), sessionsBefore);
	assert.ok(
		!noAudit.headers.getSetCookie().some((c) => c.includes("session_token=")),
	);
	console.log("PASS auth-lifecycle-audit-failure-withholds-session");
	auditFails = false;
	const beforeAcceptanceFailure = await sessionCount();
	const acceptanceLogin = await begin();
	acceptanceAuditFails = true;
	const noAcceptanceAudit = await auth.handler(
		new Request(acceptanceLogin.url, {
			headers: { cookie: acceptanceLogin.cookie },
		}),
	);
	assert.equal(noAcceptanceAudit.status, 503);
	assert.equal(
		await sessionCount(),
		beforeAcceptanceFailure,
		"failed acceptance audit must remove the newly created session",
	);
	assert.ok(
		!noAcceptanceAudit.headers
			.getSetCookie()
			.some((c) => c.includes("session_token=")),
	);
	acceptanceAuditFails = false;
	console.log("PASS post-create-acceptance-audit-failure-removes-session");
	const cookie = response.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");
	const adapter = (await auth.auth.$context).adapter;
	const stored = await adapter.findMany<{ id: string }>({ model: "session" });
	const refreshExpiry = new Date(Date.now() + 1800_000);
	for (const session of stored)
		await adapter.update({
			model: "session",
			where: [{ field: "id", value: session.id }],
			update: {
				expiresAt: refreshExpiry,
				updatedAt: new Date(Date.now() - 1800_000),
			},
		});
	const beforeRefresh = await adapter.findMany<{
		id: string;
		expiresAt: Date;
		updatedAt: Date;
	}>({ model: "session" });
	auditFails = true;
	try {
		const get = await auth.handler(
			new Request(`${origin}/api/auth/get-session`, { headers: { cookie } }),
		);
		assert.equal(get.status, 200);
		assert.ok(await auth.session(new Headers({ cookie })));
		const afterRefresh = await adapter.findMany<{
			id: string;
			expiresAt: Date;
			updatedAt: Date;
		}>({ model: "session" });
		const times = (rows: { expiresAt: Date; updatedAt: Date }[]) =>
			rows.map((row) => ({
				expiresAt: row.expiresAt,
				updatedAt: row.updatedAt,
			}));
		assert.deepEqual(
			times(afterRefresh),
			times(beforeRefresh),
			"session reads must not extend unaudited lifetime",
		);
	} finally {
		auditFails = false;
	}
	console.log("PASS fixed-lifetime-session-reads-never-refresh");
	const logout = await auth.handler(
		new Request(`${origin}/api/auth/sign-out`, {
			method: "POST",
			headers: { origin, cookie, "content-type": "application/json" },
			body: "{}",
		}),
	);
	assert.equal(logout.status, 200);
	assert.equal(await sessionCount(), sessionsBefore - 1);
	assert.ok(auditKinds.includes("auth.logout.begin"));
	assert.ok(auditKinds.includes("auth.logout.complete"));
	console.log(
		"PASS authenticated-logout-deletes-session-with-durable-lifecycle-hooks",
	);
	const shutdownLogin = await begin();
	const adapterCreate = adapter.create.bind(adapter);
	let inserted!: () => void;
	let releaseInsert!: () => void;
	const insertionEntered = new Promise<void>((resolve) => {
		inserted = resolve;
	});
	const insertionHeld = new Promise<void>((resolve) => {
		releaseInsert = resolve;
	});
	adapter.create = (async (args: Parameters<typeof adapter.create>[0]) => {
		const result = await adapterCreate(args);
		if (args.model === "session") {
			inserted();
			await insertionHeld;
		}
		return result;
	}) as typeof adapter.create;
	const beforeShutdown = await sessionCount();
	const pendingCallback = auth.handler(
		new Request(shutdownLogin.url, {
			headers: { cookie: shutdownLogin.cookie },
		}),
	);
	await insertionEntered;
	let drained = false;
	let draining: Promise<void> | undefined;
	try {
		assert.equal(
			typeof (auth as unknown as { drain?: unknown }).drain,
			"function",
			"auth must expose underlying-operation drain",
		);
		draining = (auth as unknown as { drain(): Promise<void> })
			.drain()
			.then(() => {
				drained = true;
			});
		await new Promise((resolve) => setTimeout(resolve, 100));
		assert.equal(
			drained,
			false,
			"auth drain must await held insert and compensating deletion",
		);
	} finally {
		releaseInsert();
		const stopped = await pendingCallback;
		assert.equal(stopped.status, 408);
		assert.ok(
			!stopped.headers
				.getSetCookie()
				.some((cookie) => cookie.includes("session_token=")),
		);
		await draining;
		adapter.create = adapterCreate;
	}
	assert.equal(await sessionCount(), beforeShutdown);
	assert.equal(
		(await auth.handler(new Request(`${origin}/api/auth/get-session`))).status,
		503,
	);
	console.log("PASS auth-drain-awaits-insert-and-aborted-session-cleanup");
} finally {
	globalThis.fetch = originalFetch;
	await runtimePool?.end();
	await ownerPool?.end();
	await owner?.end();
}
