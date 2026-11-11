import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { oidc } from "./oidc";

// LOCAL SIGNED IDENTITY FIXTURE. This never authenticates a real Zitadel user.
const issuer = "https://issuer.invalid";
const callback = "http://127.0.0.1:18790/oidc/callback";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
	modulusLength: 2048,
});
const key = {
	...publicKey.export({ format: "jwk" }),
	kid: "fixture",
	alg: "RS256",
	use: "sig",
};
const originalFetch = globalThis.fetch;
let nonce = "";
let variant = "ok";
let exchanges = 0;
const checks: string[] = [];
const pass = (name: string) => {
	checks.push(name);
	console.log(`PASS ${name}`);
};
globalThis.fetch = (async (
	input: string | URL | Request,
	options?: RequestInit,
) => {
	const url = String(input);
	if (url === `${issuer}/.well-known/openid-configuration`)
		return Response.json({
			issuer,
			authorization_endpoint: `${issuer}/authorize`,
			token_endpoint: `${issuer}/token`,
			jwks_uri: `${issuer}/keys`,
		});
	if (url === `${issuer}/keys`) return Response.json({ keys: [key] });
	assert.equal(url, `${issuer}/token`);
	exchanges++;
	const optionsBody = (options as { body?: unknown } | undefined)?.body;
	if (!(optionsBody instanceof URLSearchParams))
		throw new Error("token exchange body missing");
	const form = optionsBody;
	assert.equal(form.get("redirect_uri"), callback);
	assert.equal(form.get("client_id"), "fixture");
	const verifier = form.get("code_verifier");
	if (typeof verifier !== "string") throw new Error("code_verifier missing");
	assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
	const now = Math.floor(Date.now() / 1000);
	const claims = {
		iss: issuer,
		sub: "known",
		aud: ["fixture"],
		nonce,
		iat: now,
		exp: now + 60,
		...(variant === "unknown" ? { sub: "unknown" } : {}),
		...(variant === "expired" ? { exp: now - 1 } : {}),
		...(variant === "nonce" ? { nonce: "wrong" } : {}),
		...(variant === "issuer" ? { iss: "https://foreign.invalid" } : {}),
		...(variant === "audience" ? { aud: ["foreign"] } : {}),
		...(variant === "multi" ? { aud: ["fixture", "other"] } : {}),
		...(variant === "multi-valid"
			? { aud: ["fixture", "other"], azp: "fixture" }
			: {}),
		...(variant === "azp" ? { azp: "foreign" } : {}),
	};
	const encode = (v: unknown) =>
		Buffer.from(JSON.stringify(v)).toString("base64url");
	const unsigned = `${encode({ alg: variant === "alg" ? "HS256" : "RS256", kid: "fixture" })}.${encode(claims)}`;
	const signature = sign(
		"RSA-SHA256",
		Buffer.from(unsigned),
		privateKey,
	).toString("base64url");
	return Response.json({
		id_token: `${unsigned}.${variant === "signature" ? "a".repeat(signature.length) : signature}`,
	});
}) as typeof fetch;
try {
	for (const bad of [
		"http://localhost:18790/oidc/callback",
		"http://127.0.0.1:18791/oidc/callback",
		`${callback}?x=y`,
		"http://evil.invalid/callback",
	])
		assert.throws(() =>
			oidc({ issuer, clientId: "fixture", callback: bad, members: [] }),
		);
	assert.throws(() =>
		oidc({
			issuer: "http://issuer.invalid",
			clientId: "fixture",
			callback,
			members: [],
		}),
	);
	pass("literal-loopback-only-issuer-tls");
	const login = oidc({
		issuer,
		clientId: "fixture",
		callback,
		members: [{ subject: "known", org: "alpha", actor: "human" }],
	});
	async function transaction() {
		const begin = await login.begin();
		const url = new URL(begin.url);
		const beginNonce = url.searchParams.get("nonce");
		if (typeof beginNonce !== "string") throw new Error("nonce missing");
		nonce = beginNonce;
		assert.equal(url.searchParams.get("scope"), "openid");
		assert.equal(url.searchParams.get("code_challenge_method"), "S256");
		assert.match(begin.cookie, /HttpOnly; SameSite=Lax/);
		assert.ok(!begin.cookie.includes("Secure"));
		return new Request(
			`${callback}?code=fixture&state=${url.searchParams.get("state")}`,
			{ headers: { cookie: begin.cookie.split(";")[0] } },
		);
	}
	const first = await transaction();
	assert.deepEqual(await login.complete(first), {
		org: "alpha",
		actor: "human",
	});
	await assert.rejects(login.complete(first));
	pass("browser-bound-single-use-pkce");
	const mismatch = await transaction();
	const before = exchanges;
	await assert.rejects(
		login.complete(
			new Request(mismatch.url, {
				headers: { cookie: "authgw-loopback-login=wrong" },
			}),
		),
	);
	await assert.rejects(login.complete(mismatch));
	assert.equal(exchanges, before);
	pass("browser-mismatch-consumes-before-exchange");
	for (variant of [
		"unknown",
		"expired",
		"nonce",
		"issuer",
		"audience",
		"multi",
		"azp",
		"alg",
		"signature",
	])
		await assert.rejects(login.complete(await transaction()), Error, variant);
	pass("signed-identity-negative-vectors");
	variant = "multi-valid";
	assert.deepEqual(await login.complete(await transaction()), {
		org: "alpha",
		actor: "human",
	});
	pass("multi-audience-requires-matching-azp");
	const https = oidc({
		issuer,
		clientId: "fixture",
		callback: "https://fixture.invalid/callback",
		members: [],
	});
	assert.match(
		(await https.begin()).cookie,
		/^__Host-authgw-login=.*; Secure; HttpOnly;/,
	);
	pass("https-cookie-protection-unchanged");
	console.log(
		JSON.stringify({
			provider: "LOCAL SIGNED IDENTITY FIXTURE",
			realOidc: false,
			checks,
		}),
	);
} finally {
	globalThis.fetch = originalFetch;
}
