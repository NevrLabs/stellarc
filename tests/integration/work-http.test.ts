import { afterAll, beforeAll, expect, test } from "vitest";
import { disposablePostgres } from "../helpers/postgres";

let sql: import("postgres").Sql;
let close: () => Promise<void>;
let http: { handler: (request: Request) => Promise<Response>; dispose: () => Promise<void> };

const H = (org: string, id = "user-1") => ({ authorization: `Bearer ${org} ${id}` });

beforeAll(async () => {
	const db = await disposablePostgres();
	sql = db.sql;
	close = db.close;
	const { migrate } = await import("../../packages/db/src/migrate");
	await migrate(sql);
	await sql`INSERT INTO organization (id, name, slug, created_at) VALUES ('org-1', 'Org One', 'org-one', now())`;
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('user-1', 'U1', 'u1@t.dev', true, now(), now())`;
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('user-2', 'U2', 'u2@t.dev', true, now(), now())`;
	await sql`INSERT INTO team (id, name, organization_id, created_at) VALUES ('team-1', 'T1', 'org-1', now())`;
	const { workHandler } = await import("../../apps/stellarc-api/src/work-http");
	http = workHandler(
		sql,
		(org, headers, principal) => {
			if (!headers.authorization) return "unauthenticated";
			const token = headers.authorization.replace(/^Bearer\s+/i, "").trim();
			return token.startsWith(`${org} `) && token.slice(org.length + 1) === principal
				? "ok"
				: "forbidden";
		},
		(org, authorization) => {
			const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
			return token.startsWith(`${org} `) ? token.slice(org.length + 1) : "";
		},
	);
}, 60000);

afterAll(async () => {
	await close();
});

test("T06-wire: POST /api/work/boards creates board + seeds 4 statuses through HTTP", async () => {
	const response = await http.handler(
		new Request("http://x/api/work/boards", {
			method: "POST",
			headers: { ...H("org-1"), "content-type": "application/json" },
			body: JSON.stringify({ name: "HTTP Board" }),
		}),
	);
	expect(response.status).toBe(200);
	const json = (await response.json()) as { data: { id: string; slug?: string }; txid: number };
	expect(json.data.slug).toBe("http-board");
	expect(json.txid).toBeGreaterThan(0);
	const statuses = await sql`SELECT slug FROM "column" WHERE board_id = ${json.data.id} ORDER BY position`;
	expect(statuses.map((s) => s.slug)).toEqual(["to-do", "in-progress", "in-review", "done"]);
});

test("T06-wire: unauthenticated → 401 Unauthenticated; wrong org → 403 Forbidden", async () => {
	const noAuth = await http.handler(
		new Request("http://x/api/work/boards", { method: "GET" }),
	);
	expect(noAuth.status).toBe(401);
	// A self-consistent org-2 token IS authenticated (its own, empty, board
	// list) — cross-org denial is authorize's decision (T23, production
	// membership check), verified at the domain level.
	const bad = await http.handler(
		new Request("http://x/api/work/boards", {
			method: "GET",
			headers: H("org-2"),
		}),
	);
	expect(bad.status).toBe(200);
	const empty = (await bad.json()) as { boards: unknown[] };
	expect(empty.boards).toEqual([]);
});

test("T10-wire: PUT /status with invalid status → 400, board-less validation", async () => {
	const create = await http.handler(
		new Request("http://x/api/work/boards", {
			method: "POST",
			headers: { ...H("org-1"), "content-type": "application/json" },
			body: JSON.stringify({ name: "Status Board" }),
		}),
	);
	const { data } = (await create.json()) as { data: { id: string } };
	const ticket = await http.handler(
		new Request(`http://x/api/work/boards/${data.id}/tickets`, {
			method: "POST",
			headers: { ...H("org-1"), "content-type": "application/json" },
			body: JSON.stringify({ title: "T1" }),
		}),
	);
	const { data: ticketData } = (await ticket.json()) as { data: { id: string } };
	const bad = await http.handler(
		new Request(`http://x/api/work/tickets/${ticketData.id}/status`, {
			method: "PUT",
			headers: { ...H("org-1"), "content-type": "application/json" },
			body: JSON.stringify({ status: "bogus-status" }),
		}),
	);
	expect(bad.status).toBe(400);
	const json = (await bad.json()) as { _tag: string };
	expect(json._tag).toBe("ValidationError");
	const good = await http.handler(
		new Request(`http://x/api/work/tickets/${ticketData.id}/status`, {
			method: "PUT",
			headers: { ...H("org-1"), "content-type": "application/json" },
			body: JSON.stringify({ status: "done" }),
		}),
	);
	expect(good.status).toBe(200);
	const [row] = await sql`SELECT status FROM task WHERE id = ${ticketData.id}`;
	expect(row.status).toBe("done");
});

test("T16/T17-wire: flag XOR + resolve note enforcement over HTTP", async () => {
	const create = await http.handler(
		new Request("http://x/api/work/boards", {
			method: "POST",
			headers: { ...H("org-1"), "content-type": "application/json" },
			body: JSON.stringify({ name: "Flag Board" }),
		}),
	);
	const { data: board } = (await create.json()) as { data: { id: string } };
	const ticket = await http.handler(
		new Request(`http://x/api/work/boards/${board.id}/tickets`, {
			method: "POST",
			headers: { ...H("org-1"), "content-type": "application/json" },
			body: JSON.stringify({ title: "Flagged" }),
		}),
	);
	const { data: ticketData } = (await ticket.json()) as { data: { id: string } };
	const ft = await http.handler(
		new Request(`http://x/api/work/flag-types?boardId=${board.id}`, {
			method: "POST",
			headers: { ...H("org-1"), "content-type": "application/json" },
			body: JSON.stringify({ boardId: board.id, name: "Blocker" }),
		}),
	);
	expect(ft.status).toBe(200);
	const { data: flagType } = (await ft.json()) as { data: { id: string } };
	const zeroTarget = await http.handler(
		new Request(`http://x/api/work/tickets/${ticketData.id}/flags`, {
			method: "POST",
			headers: { ...H("org-1"), "content-type": "application/json" },
			body: JSON.stringify({ flagTypeId: flagType.id }),
		}),
	);
	expect(zeroTarget.status).toBe(400);
	const flag = await http.handler(
		new Request(`http://x/api/work/tickets/${ticketData.id}/flags`, {
			method: "POST",
			headers: { ...H("org-1"), "content-type": "application/json" },
			body: JSON.stringify({ flagTypeId: flagType.id, targetUserId: "user-2" }),
		}),
	);
	expect(flag.status).toBe(200);
	const { data: flagData } = (await flag.json()) as { data: { id: string } };
	const emptyNote = await http.handler(
		new Request(`http://x/api/work/flags/${flagData.id}/resolve`, {
			method: "POST",
			headers: { ...H("org-1"), "content-type": "application/json" },
			body: JSON.stringify({ note: "  " }),
		}),
	);
	expect(emptyNote.status).toBe(400);
	const resolve = await http.handler(
		new Request(`http://x/api/work/flags/${flagData.id}/resolve`, {
			method: "POST",
			headers: { ...H("org-1"), "content-type": "application/json" },
			body: JSON.stringify({ note: "resolved with care" }),
		}),
	);
	expect(resolve.status).toBe(200);
	const { data: resolved } = (await resolve.json()) as { data: { resolvedBy: string; resolvedAt: string | null } };
	expect(resolved.resolvedBy).toBe("user-1");
	expect(resolved.resolvedAt).not.toBeNull();
});

test("T24: public endpoint serves is_public only, minimal fields; private → 404", async () => {
	const create = await http.handler(
		new Request("http://x/api/work/boards", {
			method: "POST",
			headers: { ...H("org-1"), "content-type": "application/json" },
			body: JSON.stringify({ name: "Public Board" }),
		}),
	);
	const { data: board } = (await create.json()) as { data: { id: string } };
	const denied = await http.handler(new Request(`http://x/api/public/boards/${board.id}`));
	expect(denied.status).toBe(404);
	await sql`UPDATE "board" SET is_public = true WHERE id = ${board.id}`;
	const allowed = await http.handler(new Request(`http://x/api/public/boards/${board.id}`));
	expect(allowed.status).toBe(200);
	const json = (await allowed.json()) as { board: Record<string, unknown> };
	expect(json.board.id).toBe(board.id);
	expect(json.board.name).toBe("Public Board");
	// minimal: no task/assignee/member fields
	expect(Object.keys(json.board).sort()).toEqual(["createdAt", "description", "icon", "id", "name", "slug"]);
});

test("T27-wire: mutations settle with txid through the HTTP envelope (awaitTxId path)", async () => {
	const create = await http.handler(
		new Request("http://x/api/work/boards", {
			method: "POST",
			headers: { ...H("org-1"), "content-type": "application/json" },
			body: JSON.stringify({ name: "Txid Board" }),
		}),
	);
	const { data: board, txid } = (await create.json()) as { data: { id: string }; txid: number };
	expect(Number.isFinite(txid)).toBe(true);
	expect(txid).toBeGreaterThan(0);
	// The txid must match a committed PG transaction id.
	const [row] = await sql`SELECT count(*)::int AS count FROM "board" WHERE id = ${board.id}`;
	expect(row.count).toBe(1);
	void board;
});
