import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import type { Sql } from "postgres";
import {
	type AgentsError,
	BadRequest,
	isAgentsError,
	NotFound,
	statusOf,
} from "../../agents/src/errors";
import { type OperatorAuth, ORG } from "../../agents/src/http";
import { appendEvents, PLUGIN, runTxn } from "../../agents/src/store";

/** App registry (ADR 0015 §6, sequence step 1): what is installed on this
 * plane and which orgs switched it on. Install is plane-wide, activation is
 * per org (charter D8); an activation carries the capabilities the org
 * ratified, never more than the manifest asks for (D3). The agents dispatch
 * and admission paths check activation through the leaf access module.
 *
 * ponytail: operator auth, the org check and the event append (with its
 * collision heal) are borrowed from packages/agents, where the server's only
 * copies live. Move them to a kernel package when a third consumer appears. */

/** The registry's own event namespace: `apps:activated`, `apps:deactivated`. */
const NAMESPACE = "apps";

/** `<area>:<verb>`. `model:call` is never grantable (charter D4), so it cannot
 * be asked for either. The whole `model` area is refused, so a later check
 * that matches by area cannot be sidestepped with a near-miss name. */
const Capability = Schema.String.pipe(
	Schema.check(
		Schema.isPattern(/^(?!model:)[a-z][a-z0-9-]{0,62}:[a-z][a-z0-9-]{0,62}$/),
	),
);
const Capabilities = Schema.Array(Capability).pipe(
	Schema.check(Schema.isMaxLength(64)),
);

export const AppManifest = Schema.Struct({
	/** Also the app's event namespace: its events are `<id>:<type>` (D10). The
	 * namespaces the server itself writes are not available as an id. */
	id: Schema.String.pipe(
		Schema.check(
			Schema.isPattern(/^(?!(apps|foundation|identity)$)[a-z][a-z0-9-]{0,62}$/),
		),
	),
	name: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(64))),
	/** `server`: inside the server process, first-party only. `service`: its
	 * own process, the only place for third-party code (D2). */
	runs: Schema.Literals(["server", "service"]),
	/** What the app asks for. An org ratifies a subset when it activates. */
	capabilities: Capabilities,
});
export type AppManifest = typeof AppManifest.Type;

export const FIRST_PARTY: ReadonlyArray<AppManifest> = [
	{
		id: PLUGIN,
		name: "Agents",
		runs: "server",
		capabilities: ["session:drive"],
	},
	// The Gateway decides its calls against its own store today (ADR 0015 §6,
	// "Exception, Gateway only"), so it asks the server for nothing.
	{ id: "gateway", name: "Gateway", runs: "service", capabilities: [] },
];

/** Write the manifests into the registry. Runs at every boot: unchanged rows
 * are left alone, a changed manifest replaces the stored one. Every manifest
 * is checked before any is written; an invalid one throws, so the server does
 * not start with it.
 *
 * A capability a manifest stops asking for is removed from each org's grant,
 * on that org's log with the actor `plane`. If the manifest asks for it again
 * later, the org has to ratify it again (D3).
 *
 * ponytail: an app missing from the list stays installed. Add a retired
 * marker before the first app is renamed or removed. */
export async function installApps(
	sql: Sql,
	manifests: ReadonlyArray<unknown> = FIRST_PARTY,
) {
	const decoded = manifests.map((raw) =>
		Schema.decodeUnknownSync(AppManifest)(raw),
	);
	for (const manifest of decoded)
		await runTxn(sql, "apps.install", async (tx) => {
			const [written] = await tx`
        INSERT INTO app(id, manifest) VALUES (${manifest.id}, ${tx.json(manifest as never)})
        ON CONFLICT (id) DO UPDATE SET manifest = EXCLUDED.manifest, updated_at = now()
          WHERE app.manifest IS DISTINCT FROM EXCLUDED.manifest
        RETURNING id`;
			if (!written) return;
			const asked = manifest.capabilities as never;
			const narrowed = await tx<{ org: string; capabilities: string[] }[]>`
        UPDATE app_activation v SET capabilities = (
          SELECT coalesce(jsonb_agg(c ORDER BY c COLLATE "C"), '[]'::jsonb)
          FROM jsonb_array_elements_text(v.capabilities) c
          WHERE ${tx.json(asked)}::jsonb ? c)
        WHERE v.app_id = ${manifest.id} AND NOT v.capabilities <@ ${tx.json(asked)}::jsonb
        RETURNING v.org, v.capabilities`;
			for (const row of [...narrowed].sort((a, b) => (a.org < b.org ? -1 : 1)))
				await appendEvents(
					tx,
					row.org,
					"plane",
					[
						{
							type: "activated",
							payload: { appId: manifest.id, capabilities: row.capabilities },
						},
					],
					NAMESPACE,
				);
		});
}

export interface AppView extends AppManifest {
	readonly active: boolean;
	/** Ratified by this org and still asked for by the manifest. */
	readonly granted: ReadonlyArray<string>;
}

export async function listApps(sql: Sql, org: string): Promise<AppView[]> {
	const rows = await sql<{ manifest: AppManifest; granted: string[] | null }[]>`
    SELECT a.manifest, v.capabilities AS granted
    FROM app a LEFT JOIN app_activation v ON v.app_id = a.id AND v.org = ${org}
    ORDER BY a.id`;
	return rows.map((r) => ({
		...r.manifest,
		active: r.granted !== null,
		granted: (r.granted ?? []).filter((c) =>
			r.manifest.capabilities.includes(c),
		),
	}));
}

/** Switch an app on for an org, or change what the org ratified. Repeating
 * the same call changes nothing and logs nothing. */
export function activateApp(
	sql: Sql,
	org: string,
	actor: string,
	appId: string,
	capabilities: ReadonlyArray<string>,
) {
	const granted = [...new Set(capabilities)].sort();
	return runTxn(sql, "apps.activate", async (tx) => {
		const [app] = await tx<{ manifest: AppManifest }[]>`
      SELECT manifest FROM app WHERE id = ${appId} FOR SHARE`;
		if (!app) throw new NotFound({ message: "No such app" });
		const extra = granted.filter((c) => !app.manifest.capabilities.includes(c));
		if (extra.length > 0)
			throw new BadRequest({
				message: `The app does not ask for: ${extra.join(", ")}`.slice(0, 500),
			});
		const [changed] = await tx`
      INSERT INTO app_activation(org, app_id, capabilities, activated_by)
      VALUES (${org}, ${appId}, ${tx.json(granted as never)}, ${actor})
      ON CONFLICT (org, app_id) DO UPDATE
        SET capabilities = EXCLUDED.capabilities, activated_by = EXCLUDED.activated_by, activated_at = now()
        WHERE app_activation.capabilities IS DISTINCT FROM EXCLUDED.capabilities
      RETURNING 1`;
		if (changed)
			await appendEvents(
				tx,
				org,
				actor,
				[{ type: "activated", payload: { appId, capabilities: granted } }],
				NAMESPACE,
			);
		return { active: true, granted };
	});
}

export function deactivateApp(
	sql: Sql,
	org: string,
	actor: string,
	appId: string,
) {
	return runTxn(sql, "apps.deactivate", async (tx) => {
		const [app] = await tx`SELECT 1 FROM app WHERE id = ${appId}`;
		if (!app) throw new NotFound({ message: "No such app" });
		const [gone] = await tx`
      DELETE FROM app_activation WHERE org = ${org} AND app_id = ${appId} RETURNING 1`;
		if (gone)
			await appendEvents(
				tx,
				org,
				actor,
				[{ type: "deactivated", payload: { appId } }],
				NAMESPACE,
			);
		return { active: false, granted: [] as string[] };
	});
}

const Activate = Schema.Struct({ capabilities: Capabilities });

const json = (status: number, body: unknown) =>
	Response.json(body, { status, headers: { "cache-control": "no-store" } });

const run = <A>(f: () => Promise<A>): Effect.Effect<A, AgentsError | Error> =>
	Effect.tryPromise({
		try: f,
		catch: (cause) =>
			isAgentsError(cause)
				? cause
				: cause instanceof Error
					? cause
					: new Error(String(cause)),
	});

/** Operator surface: `GET /orgs/:org/v1/apps`,
 * `POST /orgs/:org/v1/apps/:id/activate` with `{capabilities}`, and
 * `POST /orgs/:org/v1/apps/:id/deactivate`. */
export function appsHttp(
	sql: Sql,
	options: {
		operatorAuth: OperatorAuth;
		telemetry?: Layer.Layer<never>;
		/** Share with every other build of `telemetry` (one MeterProvider). */
		memoMap?: Layer.MemoMap;
	},
) {
	const runtime = ManagedRuntime.make(options.telemetry ?? Layer.empty, {
		memoMap: options.memoMap,
	});
	const route = (
		request: Request,
	): Effect.Effect<Response, AgentsError | Error> => {
		const [, org = "", , , id, action, extra] = new URL(request.url).pathname
			.split("/")
			.filter(Boolean);
		const m = request.method;
		return Effect.gen(function* () {
			if (!ORG.test(org))
				return yield* Effect.fail(new BadRequest({ message: "Invalid org" }));
			const actor = yield* options.operatorAuth(
				org,
				request.headers.get("authorization") ?? undefined,
			);
			yield* Effect.annotateCurrentSpan({ "stellarc.org": org });
			if (!id && m === "GET")
				return json(200, { apps: yield* run(() => listApps(sql, org)) });
			if (id && action === "activate" && !extra && m === "POST") {
				const raw = yield* Effect.tryPromise({
					try: () => request.json(),
					catch: () => new BadRequest({ message: "Invalid JSON body" }),
				});
				const body = yield* Schema.decodeUnknownEffect(Activate)(
					raw ?? {},
				).pipe(
					Effect.mapError(
						(e) => new BadRequest({ message: e.message.slice(0, 500) }),
					),
				);
				return json(
					200,
					yield* run(() => activateApp(sql, org, actor, id, body.capabilities)),
				);
			}
			if (id && action === "deactivate" && !extra && m === "POST")
				return json(200, yield* run(() => deactivateApp(sql, org, actor, id)));
			return yield* Effect.fail(new NotFound({ message: "No such route" }));
		});
	};
	return {
		matches: (request: Request) =>
			/^\/orgs\/[^/]+\/v1\/apps(\/|$)/.test(new URL(request.url).pathname),
		handler: (request: Request) =>
			runtime.runPromise(
				route(request).pipe(
					Effect.catch((error: AgentsError | Error) =>
						Effect.succeed(
							isAgentsError(error)
								? json(statusOf(error), {
										_tag: error._tag,
										message: error.message,
									})
								: json(500, {
										_tag: "InternalError",
										message: "Internal server error",
									}),
						),
					),
					Effect.withSpan("stellarc.apps.request", {
						attributes: { "http.request.method": request.method },
					}),
				),
			),
		dispose: () => runtime.dispose(),
	};
}
