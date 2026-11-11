import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import { Refusal } from "./gateway";

// Isolated auth-code proof, not a replacement for the existing auth plugin.
// No refresh tokens, automatic account linking or upstream authorization claims.
export function oidc(config: {
	issuer: string;
	clientId: string;
	clientSecret?: string;
	callback: string;
	members: ReadonlyArray<{ subject: string; org: string; actor: string }>;
}) {
	const issuer = new URL(config.issuer);
	const callback = new URL(config.callback);
	// Approved native proof only: never generalize this to arbitrary HTTP callbacks.
	const loopback = config.callback === "http://127.0.0.1:18790/oidc/callback";
	if (
		issuer.protocol !== "https:" ||
		issuer.username ||
		issuer.password ||
		issuer.search ||
		issuer.hash ||
		(callback.protocol !== "https:" && !loopback) ||
		callback.username ||
		callback.password ||
		callback.search ||
		callback.hash
	)
		throw new Error("HTTPS required except literal approved native callback");
	const cookieName = loopback ? "authgw-loopback-login" : "__Host-authgw-login";
	const pending = new Map<
		string,
		{ browser: string; verifier: string; nonce: string; expires: number }
	>();
	let metadata:
		| {
				authorization_endpoint: string;
				token_endpoint: string;
				jwks_uri: string;
		  }
		| undefined;
	const random = () => randomBytes(32).toString("base64url");
	const hash = (s: string) =>
		createHash("sha256").update(s).digest("base64url");
	const trusted = (s: string) => {
		const u = new URL(s);
		if (
			u.origin !== issuer.origin ||
			u.protocol !== "https:" ||
			u.username ||
			u.password ||
			u.hash
		)
			throw new Refusal(503, "untrusted_oidc_endpoint");
		return u.toString();
	};
	async function discovery() {
		if (metadata) return metadata;
		const response = await fetch(
			`${config.issuer}/.well-known/openid-configuration`,
			{ redirect: "error", signal: AbortSignal.timeout(5000) },
		);
		if (!response.ok) throw new Refusal(503, "oidc_discovery_failed");
		const d = await response.json();
		if (d.issuer !== config.issuer) throw new Refusal(503, "issuer_mismatch");
		metadata = {
			authorization_endpoint: trusted(d.authorization_endpoint),
			token_endpoint: trusted(d.token_endpoint),
			jwks_uri: trusted(d.jwks_uri),
		};
		return metadata;
	}
	async function begin() {
		for (const [key, value] of pending)
			if (value.expires <= Date.now()) pending.delete(key);
		if (pending.size >= 32) throw new Refusal(429, "login_capacity");
		const d = await discovery();
		const state = random();
		const browser = random();
		const verifier = random();
		const nonce = random();
		pending.set(state, {
			browser: hash(browser),
			verifier,
			nonce,
			expires: Date.now() + 120000,
		});
		const url = new URL(d.authorization_endpoint);
		url.search = new URLSearchParams({
			response_type: "code",
			client_id: config.clientId,
			redirect_uri: config.callback,
			scope: "openid",
			state,
			nonce,
			code_challenge: hash(verifier),
			code_challenge_method: "S256",
		}).toString();
		return {
			url: url.toString(),
			cookie: `${cookieName}=${browser}; ${loopback ? "" : "Secure; "}HttpOnly; SameSite=Lax; Path=/; Max-Age=120`,
		};
	}
	async function complete(request: Request) {
		const url = new URL(request.url);
		if (url.origin + url.pathname !== callback.origin + callback.pathname)
			throw new Refusal(400, "callback_mismatch");
		if (["state", "code"].some((k) => url.searchParams.getAll(k).length !== 1))
			throw new Refusal(400, "invalid_callback");
		if (url.searchParams.has("error")) throw new Refusal(401, "oidc_denied");
		const state = url.searchParams.get("state");
		if (typeof state !== "string") throw new Denied(400, "state_required");
		const transaction = pending.get(state);
		// Single-use, including failed callbacks; no browser mismatch replay opportunity.
		pending.delete(state);
		const cookies = (request.headers.get("cookie") ?? "")
			.split(";")
			.map((s) => s.trim())
			.filter((s) => s.startsWith(`${cookieName}=`));
		const cookie =
			cookies.length === 1
				? cookies[0].slice(cookieName.length + 1)
				: undefined;
		if (
			!transaction ||
			transaction.expires <= Date.now() ||
			!cookie ||
			hash(cookie) !== transaction.browser
		)
			throw new Refusal(401, "login_transaction_invalid");
		if (
			url.searchParams.has("iss") &&
			url.searchParams.get("iss") !== config.issuer
		)
			throw new Refusal(401, "issuer_mismatch");
		const d = await discovery();
		const response = await fetch(d.token_endpoint, {
			method: "POST",
			redirect: "error",
			signal: AbortSignal.timeout(5000),
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "authorization_code",
				client_id: config.clientId,
				redirect_uri: config.callback,
				code: url.searchParams.get("code") ?? "",
				code_verifier: transaction.verifier,
				...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
			}),
		});
		if (!response.ok) throw new Refusal(401, "code_exchange_failed");
		const tokens = await response.json();
		const identity = await validate(
			tokens.id_token,
			transaction.nonce,
			d.jwks_uri,
		);
		const member = config.members.find((m) => m.subject === identity.sub);
		if (!member) throw new Refusal(403, "no_local_membership");
		// Upstream token, email, roles, orgs and refresh tokens never escape this module.
		return { org: member.org, actor: member.actor };
	}
	async function validate(token: unknown, nonce: string, jwksUri: string) {
		if (typeof token !== "string" || token.length > 16384)
			throw new Refusal(401, "invalid_id_token");
		const parts = token.split(".");
		if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p)))
			throw new Refusal(401, "invalid_id_token");
		const [header, claims] = (() => {
			try {
				return parts
					.slice(0, 2)
					.map((part) => JSON.parse(Buffer.from(part, "base64url").toString()));
			} catch {
				throw new Refusal(401, "invalid_id_token");
			}
		})();
		if (
			!header ||
			typeof header !== "object" ||
			!claims ||
			typeof claims !== "object"
		)
			throw new Refusal(401, "invalid_id_token");
		if (header.alg !== "RS256" || typeof header.kid !== "string" || header.crit)
			throw new Refusal(401, "unsupported_signature");
		const response = await fetch(trusted(jwksUri), {
			redirect: "error",
			signal: AbortSignal.timeout(5000),
		});
		if (!response.ok) throw new Refusal(503, "jwks_unavailable");
		const jwks = await response.json();
		const keys = Array.isArray(jwks.keys)
			? jwks.keys.filter(
					(k: Record<string, unknown>) =>
						k.kid === header.kid &&
						k.kty === "RSA" &&
						(!k.alg || k.alg === "RS256") &&
						(!k.use || k.use === "sig"),
				)
			: [];
		if (
			keys.length !== 1 ||
			!verify(
				"RSA-SHA256",
				Buffer.from(parts.slice(0, 2).join(".")),
				createPublicKey({ key: keys[0], format: "jwk" }),
				Buffer.from(parts[2], "base64url"),
			)
		)
			throw new Refusal(401, "invalid_signature");
		const now = Math.floor(Date.now() / 1000);
		const aud = typeof claims.aud === "string" ? [claims.aud] : claims.aud;
		if (
			claims.iss !== config.issuer ||
			!Array.isArray(aud) ||
			!aud.every((a) => typeof a === "string") ||
			!aud.includes(config.clientId) ||
			(aud.length > 1 && claims.azp !== config.clientId) ||
			(claims.azp !== undefined && claims.azp !== config.clientId) ||
			typeof claims.sub !== "string" ||
			!claims.sub ||
			claims.sub.length > 255 ||
			claims.nonce !== nonce ||
			!Number.isInteger(claims.exp) ||
			claims.exp <= now ||
			!Number.isInteger(claims.iat) ||
			claims.iat > now + 30 ||
			claims.exp <= claims.iat ||
			(claims.nbf !== undefined &&
				(!Number.isInteger(claims.nbf) || claims.nbf > now + 30))
		)
			throw new Refusal(401, "invalid_claims");
		return { sub: claims.sub as string };
	}
	return { begin, complete };
}
