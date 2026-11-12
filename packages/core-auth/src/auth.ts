import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { betterAuth } from "better-auth";
import { validateAuthorizationCode } from "better-auth/oauth2";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { createRemoteJWKSet, customFetch, jwtVerify } from "jose";

type Approved = { id: string; name: string; email: string };
export function gatewayAuth(config: {
	origin: string;
	issuer: string;
	clientId: string;
	clientSecret: string;
	secret: string;
	database: NonNullable<Parameters<typeof betterAuth>[0]>["database"];
	authorizationEndpoint: string;
	tokenEndpoint: string;
	jwksUri: string;
	approved: (subject: string) => Promise<Approved | null>;
	audit: (kind: string, actor?: string) => Promise<void>;
}) {
	const origin = new URL(config.origin);
	const issuer = new URL(config.issuer);
	if (
		origin.protocol !== "https:" ||
		issuer.protocol !== "https:" ||
		origin.origin !== config.origin ||
		issuer.username ||
		issuer.password
	)
		throw new Error("Pinned HTTPS origin/issuer required");
	for (const endpoint of [
		config.authorizationEndpoint,
		config.tokenEndpoint,
		config.jwksUri,
	]) {
		const u = new URL(endpoint);
		if (
			u.origin !== issuer.origin ||
			u.protocol !== "https:" ||
			u.username ||
			u.password ||
			u.hash
		)
			throw new Error("Untrusted OIDC endpoint");
	}
	const keys = createRemoteJWKSet(new URL(config.jwksUri), {
		[customFetch]: async (url, init) =>
			fetch(url, {
				...init,
				redirect: "error",
				signal: AbortSignal.timeout(5000),
			}),
	});
	const challenge = (verifier: string) =>
		createHash("sha256").update(verifier).digest("base64url");
	// genericOAuth 1.6.25 decodes ID tokens without verification by default.
	// Its public getToken seam supplies the browser-bound PKCE verifier. Bind the
	// OIDC nonce to S256(verifier), validate before BA receives any identity, and
	// return no provider tokens for BA to persist. Never import legacy auth.
	const provider = genericOAuth({
		config: [
			{
				providerId: "zitadel",
				clientId: config.clientId,
				clientSecret: config.clientSecret,
				authorizationUrl: config.authorizationEndpoint,
				tokenUrl: config.tokenEndpoint,
				// better-auth 1.7 dropped issuer/requireIssuerValidation from
				// GenericOAuthConfig; identity is validated locally below via
				// validateAuthorizationCode + the S256-bound nonce instead.
				scopes: ["openid"],
				pkce: true,
				authentication: "basic",
				disableSignUp: true,
				disableImplicitSignUp: true,
				async getToken(data) {
					if (!data.codeVerifier) throw new Error("Missing PKCE");
					const tokens = await validateAuthorizationCode({
						code: data.code,
						codeVerifier: data.codeVerifier,
						redirectURI: data.redirectURI,
						options: {
							clientId: config.clientId,
							clientSecret: config.clientSecret,
						},
						tokenEndpoint: config.tokenEndpoint,
						authentication: "basic",
					});
					if (!tokens.idToken) throw new Error("Missing identity");
					const { payload } = await jwtVerify(tokens.idToken, keys, {
						issuer: config.issuer,
						audience: config.clientId,
						algorithms: ["RS256"],
						requiredClaims: ["iss", "sub", "aud", "exp", "iat", "nonce"],
						maxTokenAge: "5 minutes",
						clockTolerance: 0,
					});
					if (
						payload.nonce !== challenge(data.codeVerifier) ||
						typeof payload.sub !== "string" ||
						!payload.sub ||
						payload.sub.length > 255 ||
						(Array.isArray(payload.aud) &&
							payload.aud.length > 1 &&
							payload.azp !== config.clientId) ||
						(payload.azp !== undefined && payload.azp !== config.clientId)
					)
						throw new Error("Identity claims rejected");
					const approved = await config.approved(payload.sub);
					if (!approved) throw new Error("No local membership");
					return { raw: { verifiedSubject: payload.sub, approved } };
				},
				async getUserInfo(tokens) {
					const subject = tokens.raw?.verifiedSubject;
					if (typeof subject !== "string") return null;
					// Re-resolve current local binding; never trust provider email/roles/orgs.
					const approved = await config.approved(subject);
					return approved
						? {
								id: subject,
								name: approved.name,
								email: approved.email,
								emailVerified: true,
							}
						: null;
				},
			},
		],
	});
	const operation = new AsyncLocalStorage<{
		failed: boolean;
		signal: AbortSignal;
		actor?: string;
		sessionId?: string;
	}>();
	async function discardSession() {
		const current = operation.getStore();
		if (!current?.sessionId) return;
		const { adapter } = await auth.$context;
		const where = [{ field: "id", value: current.sessionId }];
		await adapter.delete({ model: "session", where });
		if (await adapter.findOne({ model: "session", where }))
			throw new Error("Session cleanup failed");
		current.sessionId = undefined;
	}
	async function record(kind: string, actor?: string) {
		try {
			await config.audit(kind, actor);
		} catch (error) {
			const current = operation.getStore();
			if (current) current.failed = true;
			throw error;
		}
	}
	const auth = betterAuth({
		baseURL: config.origin,
		basePath: "/api/auth",
		secret: config.secret,
		database: config.database,
		emailAndPassword: { enabled: false },
		account: {
			accountLinking: { enabled: false },
			storeStateStrategy: "database",
			skipStateCookieCheck: false,
			storeAccountCookie: false,
		},
		session: {
			expiresIn: 3600,
			disableSessionRefresh: true,
			cookieCache: { enabled: false },
		},
		trustedOrigins: [config.origin],
		advanced: {
			useSecureCookies: true,
			cookiePrefix: "stellarc-gateway",
			disableCSRFCheck: false,
			disableOriginCheck: false,
		},
		databaseHooks: {
			session: {
				create: {
					before: async (session) => {
						const current = operation.getStore();
						if (!current || current.signal.aborted)
							throw new Error("Login request ended");
						current.actor = session.userId;
						await record("auth.session.admit", session.userId);
						if (current.signal.aborted) throw new Error("Login request ended");
						return { data: session };
					},
					after: async (session) => {
						const current = operation.getStore();
						if (!current) throw new Error("Missing login operation");
						current.sessionId = session.id;
						if (current.signal.aborted) await discardSession();
					},
				},
			},
		},
		logger: { disabled: true },
		telemetry: { enabled: false },
		plugins: [provider],
	});
	async function handler(request: Request) {
		const url = new URL(request.url);
		if (url.origin !== config.origin)
			return new Response("wrong origin", { status: 400 });
		if (url.pathname === "/auth/login") {
			if (
				request.method !== "POST" ||
				request.headers.get("origin") !== config.origin ||
				request.headers.get("sec-fetch-site") === "cross-site"
			)
				return new Response("denied", { status: 403 });
			const response = await auth.handler(
				new Request(`${config.origin}/api/auth/sign-in/oauth2`, {
					method: "POST",
					headers: {
						origin: config.origin,
						"content-type": "application/json",
						cookie: request.headers.get("cookie") ?? "",
					},
					body: JSON.stringify({
						providerId: "zitadel",
						callbackURL: config.origin,
						disableRedirect: true,
					}),
				}),
			);
			if (!response.ok)
				return new Response("login unavailable", { status: 503 });
			const result = await response.json();
			const target = new URL(result.url);
			const nonce = target.searchParams.get("code_challenge");
			if (!nonce || target.origin !== issuer.origin)
				return new Response("login unavailable", { status: 503 });
			target.searchParams.set("nonce", nonce);
			const headers = new Headers({
				"content-type": "application/json",
				"cache-control": "no-store",
			});
			for (const cookie of response.headers.getSetCookie())
				headers.append("set-cookie", cookie);
			return new Response(JSON.stringify({ url: target.toString() }), {
				headers,
			});
		}
		const allowed =
			(request.method === "GET" &&
				(url.pathname === "/api/auth/get-session" ||
					url.pathname === "/api/auth/oauth2/callback/zitadel")) ||
			(request.method === "POST" &&
				url.pathname === "/api/auth/sign-out" &&
				request.headers.get("origin") === config.origin);
		if (!allowed) return new Response("not found", { status: 404 });
		if (
			url.pathname.endsWith("/callback/zitadel") &&
			(["code", "state"].some((k) => url.searchParams.getAll(k).length !== 1) ||
				url.searchParams.getAll("iss").length > 1 ||
				(url.searchParams.has("iss") &&
					url.searchParams.get("iss") !== config.issuer))
		)
			return new Response("invalid callback", { status: 400 });
		return auth.handler(request);
	}
	async function audited(request: Request) {
		return operation.run(
			{ failed: false, signal: request.signal },
			async (): Promise<Response> => {
				const store = operation.getStore();
				if (!store) throw new Error("audit operation store missing");
				const path = new URL(request.url).pathname;
				const kind =
					path === "/auth/login"
						? "auth.login"
						: path.endsWith("/callback/zitadel")
							? "auth.callback"
							: path.endsWith("/sign-out")
								? "auth.logout"
								: undefined;
				try {
					if (kind) await record(`${kind}.begin`);
					const response = await handler(request);
					if (store.failed) {
						await discardSession();
						return new Response("audit unavailable", { status: 503 });
					}
					const accepted = response.headers
						.getSetCookie()
						.some(
							(c) => c.includes("session_token=") && !c.includes("Max-Age=0"),
						);
					if (kind === "auth.callback")
						await record(
							accepted ? "auth.callback.accept" : "auth.callback.reject",
							store.actor,
						);
					else if (kind && response.status >= 400)
						await record(`${kind}.reject`);
					else if (kind === "auth.logout") await record("auth.logout.complete");
					if (request.signal.aborted) {
						await discardSession();
						return new Response("request ended", { status: 408 });
					}
					return response;
				} catch {
					await discardSession();
					return new Response("authentication or audit unavailable", {
						status: 503,
					});
				}
			},
		);
	}
	const pending = new Set<Promise<unknown>>();
	const controllers = new Set<AbortController>();
	let stopping = false;
	function track<A>(run: () => Promise<A>): Promise<A> {
		const promise = Promise.resolve().then(run);
		pending.add(promise);
		void promise.then(
			() => pending.delete(promise),
			() => pending.delete(promise),
		);
		return promise;
	}
	return {
		handler(request: Request) {
			if (stopping)
				return Promise.resolve(new Response("stopping", { status: 503 }));
			const controller = new AbortController();
			const abort = () => controller.abort();
			controllers.add(controller);
			request.signal.addEventListener("abort", abort, { once: true });
			if (request.signal.aborted) abort();
			return track(async () => {
				try {
					return await audited(
						new Request(request, { signal: controller.signal }),
					);
				} finally {
					request.signal.removeEventListener("abort", abort);
					controllers.delete(controller);
				}
			});
		},
		session: (headers: Headers) =>
			stopping
				? Promise.resolve(null)
				: track(() => auth.api.getSession({ headers })),
		async drain() {
			stopping = true;
			for (const controller of controllers) controller.abort();
			await Promise.allSettled([...pending]);
		},
		auth,
	};
}
