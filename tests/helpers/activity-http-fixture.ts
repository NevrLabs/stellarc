import { Effect, Layer, ManagedRuntime } from "effect";
import type { Sql } from "postgres";
import { migrate } from "../../packages/db/src/migrate";
import type { Actor } from "../../packages/domain/src/activity";
import { makeNotificationSecrets } from "../../packages/domain/src/notification-secrets";
import { TelemetryTest } from "../../packages/telemetry/src/index";
import { seedIdentity } from "./activity-fixture";
import { disposablePostgres } from "./postgres";

/**
 * §3 HTTP fixture (T27): disposable PG + migrated schema + the REAL composed
 * web handler (foundation group + STL-17 group) served over Bun. `handlers:
 * false` boots the pre-slice surface (foundation only) for the negative
 * control. The bearer token doubles as the principal ("Bearer <org> <id>").
 */
export async function makeActivityHttpFixture(
	opts: { handlers?: boolean } = {},
) {
	const withHandlers = opts.handlers !== false;
	const db = await disposablePostgres();
	await migrate(db.sql);
	const sql: Sql = db.sql;
	const org = "org-http-1";
	const boardId = "board-http-1";
	const ticketId = "task-http-1";
	const aliceId = "user-alice";
	const bobId = "user-bob";
	await seedIdentity(sql, {
		org,
		users: [aliceId, bobId, "user-carol", "user-zed"],
	});

	const auth = (userId: string) => `Bearer ${org} ${userId}`;

	// Actor→permission matrix owned by the fixture (STL-16 owns the real one).
	const tickets = {
		resolve: async (_org: string, id: string, actor: Actor) => {
			if (_org !== org || id !== ticketId) return null;
			if (actor.userId === "user-zed") return null; // not a viewer → 404
			return {
				ticketId: id,
				boardId,
				assigneeUserId: bobId,
				canUpdate: actor.userId === aliceId || actor.userId === bobId,
				canView: true,
			};
		},
	};
	const parseMentions = (content: string): string[] => {
		const ids: string[] = [];
		const re = /<kaneo-mention[^>]*\bid="([^"]+)"/gi;
		for (let m = re.exec(content); m !== null; m = re.exec(content))
			if (m[1]) ids.push(m[1]);
		return ids;
	};
	const resolveRecipients = async (args: {
		tx: Sql;
		scope: { assigneeUserId: string | null };
		actor: Actor;
		mentions: string[];
	}) => {
		const candidates = new Set<string>([
			...(args.scope.assigneeUserId ? [args.scope.assigneeUserId] : []),
			...args.mentions,
		]);
		candidates.delete(args.actor.userId);
		const members =
			await args.tx`SELECT user_id FROM organization_member WHERE organization_id=${org}`;
		const memberSet = new Set(members.map((m) => m.user_id as string));
		return [...candidates].filter((c) => memberSet.has(c));
	};
	const outbox = {
		enqueueInTx: async (
			tx: Sql,
			orgArg: string,
			eventSeq: bigint,
			traceparent: string | null,
		) => {
			await tx`INSERT INTO notification_outbox (id,org_id,event_seq,consumer,traceparent)
        VALUES (${crypto.randomUUID()},${orgArg},${eventSeq.toString()},'inbox-v1',${traceparent})`;
		},
	};
	const boards = new Set([boardId]);
	const workflowDeps = {
		canUpdateBoard: async (_o: string, _b: string, actor: string) =>
			actor === aliceId || actor === bobId,
		statusInBoard: async (_o: string, _b: string, statusId: string) =>
			statusId === "status-1" || statusId === "status-2",
		canViewBoard: async (_o: string, _b: string, actor: string) =>
			actor !== "user-zed",
	};
	const preferenceDeps = {
		secrets: makeNotificationSecrets("test-secret-key"),
		emailAddress: null,
		isMember: async (userId: string, orgId: string) =>
			orgId === org && userId !== "user-zed",
		boardInOrg: async (_orgId: string, ids: string[]) =>
			ids.filter((id) => boards.has(id)).length,
	};

	const telemetry = TelemetryTest();
	const memoMap = await Effect.runPromise(Layer.makeMemoMap);
	const runtime = ManagedRuntime.make(telemetry.layer, memoMap);

	let server: ReturnType<typeof Bun.serve>;
	if (withHandlers) {
		const { composeStellarcHandler } = await import(
			"../../apps/stellarc-api/src/activity-notification-http"
		);
		const handler = await composeStellarcHandler({
			sql,
			engine: undefined,
			authorize: (o: string, headers: Record<string, string>) => {
				const raw = headers.authorization ?? "";
				if (!raw) return "unauthenticated";
				const token = raw.replace(/^Bearer\s+/i, "").trim();
				return token === o || token.startsWith(`${o} `) ? "ok" : "forbidden";
			},
			healthQuery: undefined,
			telemetry: telemetry.layer,
			memoMap,
			principalFrom: (o: string, authorization?: string) => {
				const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
				return token.startsWith(`${o} `) ? token.slice(o.length + 1) : "";
			},
			selfAuth: (authorization?: string) => {
				const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
				const sp = token.indexOf(" ");
				return sp > 0 ? token.slice(sp + 1) : "";
			},
			activity: {
				tickets,
				parseMentions,
				resolveRecipients,
				outbox,
				preferenceDeps,
				workflowDeps,
			},
		});
		server = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			fetch: (request) => handler.handler(request),
		});
	} else {
		const { foundationHandler } = await import(
			"../../apps/stellarc-api/src/http"
		);
		const handler = foundationHandler(
			sql,
			// ShapeEngine is unused on the probed paths; the foundation group still
			// requires a live instance for /orgs/:org/v1/shape construction.
			undefined as never,
			() => "forbidden",
			undefined,
			telemetry.layer,
			memoMap,
			(o: string, authorization?: string) => {
				const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
				return token.startsWith(`${o} `) ? token.slice(o.length + 1) : "";
			},
		);
		server = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			fetch: (request) => handler.handler(request),
		});
	}

	return {
		sql,
		org,
		org2: "org-http-2",
		boardId,
		ticketId,
		aliceId,
		bobId,
		aliceAuth: auth(aliceId),
		bobAuth: auth(bobId),
		carolAuth: auth("user-carol"),
		zedAuth: auth("user-zed"),
		async json(
			method: string,
			path: string,
			body?: unknown,
			authorization?: string,
		): Promise<Response> {
			const headers: Record<string, string> = {};
			if (authorization) headers.authorization = authorization;
			if (body !== undefined) headers["content-type"] = "application/json";
			return fetch(`${server.url.origin}${path}`, {
				method,
				headers,
				body: body === undefined ? undefined : JSON.stringify(body),
			});
		},
		async plantNotification(args: {
			userId: string;
			orgId: string | null;
			isRead?: boolean;
		}): Promise<string> {
			const id = crypto.randomUUID();
			await sql`INSERT INTO notification (id, org_id, user_id, title, content, type, is_read, resource_id, resource_type, created_at, updated_at)
        VALUES (${id}, ${args.orgId}, ${args.userId}, 't', 'c', 'task_comment', ${args.isRead ?? false}, ${ticketId}, 'task', now(), now())`;
			return id;
		},
		async jobCount(): Promise<number> {
			const rows =
				await sql`SELECT count(*)::int AS n FROM notification_outbox`;
			return (rows[0] as { n: number }).n;
		},
		spans: () =>
			telemetry.spans.getFinishedSpans().map((s) => ({
				name: s.name,
				attributes: s.attributes,
			})),
		async close() {
			server.stop(true);
			await runtime.dispose();
			await db.close();
		},
	};
}

export type ActivityHttpFixture = Awaited<
	ReturnType<typeof makeActivityHttpFixture>
>;
// buildActivityHttpDeps alias kept for API stability with the helper contract.
export const buildActivityHttpDeps = makeActivityHttpFixture;
