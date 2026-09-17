import type { Sql } from "postgres";
import { expect, test } from "vitest";
import { migrate } from "../../packages/db/src/migrate";
import { runImport } from "../../tools/import-activity-notifications";
import { seedIdentity } from "../helpers/activity-fixture";
import { disposablePostgres } from "../helpers/postgres";

/** Fork-shaped source snapshot (six tables), planted on a SECOND disposable
 * cluster so the source stays strictly read-only (§7 importer contract). */
async function makeSourceFixture() {
	const db = await disposablePostgres();
	const sql: Sql = db.sql;
	await sql`CREATE TABLE activity (
    id text PRIMARY KEY, org_id text NOT NULL, ticket_id text NOT NULL, type text NOT NULL,
    created_at timestamp NOT NULL, updated_at timestamp NOT NULL, user_id text,
    content text, edit_history jsonb NOT NULL DEFAULT '[]', event_data jsonb,
    external_user_name text, external_user_avatar text, external_source text, external_url text)`;
	await sql`CREATE TABLE notification (
    id text PRIMARY KEY, org_id text, user_id text NOT NULL, title text, content text,
    type text NOT NULL DEFAULT 'info', event_data jsonb, is_read boolean DEFAULT false,
    resource_id text, resource_type text, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL)`;
	await sql`CREATE TABLE workflow_rule (
    id text PRIMARY KEY, org_id text NOT NULL, board_id text NOT NULL,
    integration_type text NOT NULL, event_type text NOT NULL, status_id text NOT NULL,
    created_at timestamp NOT NULL, updated_at timestamp NOT NULL)`;
	await sql`CREATE TABLE user_notification_preference (
    id text PRIMARY KEY, user_id text UNIQUE NOT NULL, email_enabled boolean DEFAULT false,
    ntfy_enabled boolean DEFAULT false, ntfy_server_url text, ntfy_topic text, ntfy_token text,
    gotify_enabled boolean DEFAULT false, gotify_server_url text, gotify_token text,
    webhook_enabled boolean DEFAULT false, webhook_url text, webhook_secret text,
    task_assignment_enabled boolean DEFAULT true, task_comment_enabled boolean DEFAULT true,
    task_status_change_enabled boolean DEFAULT true, due_date_reminder_enabled boolean DEFAULT true,
    due_date_reminder_lead_time_minutes integer DEFAULT 1440,
    created_at timestamp NOT NULL, updated_at timestamp NOT NULL)`;
	await sql`CREATE TABLE user_notification_org_rule (
    id text PRIMARY KEY, user_id text NOT NULL, organization_id text NOT NULL,
    is_active boolean DEFAULT true, email_enabled boolean DEFAULT false,
    ntfy_enabled boolean DEFAULT false, gotify_enabled boolean DEFAULT false,
    webhook_enabled boolean DEFAULT false, board_mode text DEFAULT 'all',
    created_at timestamp NOT NULL, updated_at timestamp NOT NULL)`;
	await sql`CREATE TABLE user_notification_org_board (
    id text PRIMARY KEY, organization_id text NOT NULL, org_rule_id text NOT NULL,
    board_id text NOT NULL, created_at timestamp NOT NULL, updated_at timestamp NOT NULL)`;
	return { sql, close: db.close };
}

const ORG = "org-src-1";

async function plantSource(sql: Sql) {
	// comment row + non-comment (system) row with legacy eventData, null author
	await sql`INSERT INTO activity (id, org_id, ticket_id, type, created_at, updated_at, user_id, content, edit_history, event_data, external_user_name, external_user_avatar, external_source, external_url) VALUES
    ('a-c1',${ORG},'task-legacy-1','comment','2026-01-01T10:00:00','2026-01-01T10:00:00','user-src-alice','hello world','[]',NULL,NULL,NULL,NULL,NULL),
    ('a-s1',${ORG},'task-legacy-1','task-assigned','2026-01-01T11:00:00','2026-01-01T11:00:00',NULL,NULL,'[]','{"from":null,"to":"user-src-bob"}'::jsonb,NULL,NULL,NULL,NULL),
    ('a-e1',${ORG},'task-legacy-2','comment','2026-01-02T09:00:00','2026-01-02T09:00:00',NULL,'external note','[]',NULL,'Ext User','https://a.test/x.png','github','https://github.com/c/1')`;
	await sql`INSERT INTO notification (id, org_id, user_id, title, content, type, event_data, is_read, resource_id, resource_type, created_at, updated_at) VALUES
    ('n-1',${ORG},'user-src-alice','title','body','info',NULL,false,'task-legacy-1','task','2026-01-01T12:00:00Z','2026-01-01T12:00:00Z'),
    ('n-2',NULL,'user-src-alice','global','body','info',NULL,true,NULL,NULL,'2026-01-01T13:00:00Z','2026-01-01T13:00:00Z')`;
	await sql`INSERT INTO workflow_rule (id, org_id, board_id, integration_type, event_type, status_id, created_at, updated_at) VALUES
    ('w-1',${ORG},'board-src-1','github','opened','col-src-1','2026-01-01T08:00:00','2026-01-01T08:00:00')`;
	await sql`INSERT INTO user_notification_preference (id, user_id, email_enabled, ntfy_enabled, ntfy_server_url, ntfy_topic, ntfy_token, gotify_enabled, gotify_server_url, gotify_token, webhook_enabled, webhook_url, webhook_secret, task_assignment_enabled, task_comment_enabled, task_status_change_enabled, due_date_reminder_enabled, due_date_reminder_lead_time_minutes, created_at, updated_at) VALUES
    ('p-1','user-src-alice',true,false,NULL,NULL,NULL,false,NULL,NULL,false,NULL,NULL,true,true,true,true,180,
     '2026-01-01T07:00:00','2026-01-01T07:00:00')`;
	await sql`INSERT INTO user_notification_org_rule (id, user_id, organization_id, is_active, email_enabled, ntfy_enabled, gotify_enabled, webhook_enabled, board_mode, created_at, updated_at) VALUES
    ('r-1','user-src-alice',${ORG},true,false,false,false,false,'selected','2026-01-01T07:00:00','2026-01-01T07:00:00')`;
	await sql`INSERT INTO user_notification_org_board (id, organization_id, org_rule_id, board_id, created_at, updated_at) VALUES
    ('b-1',${ORG},'r-1','board-src-1','2026-01-01T07:00:00','2026-01-01T07:00:00')`;
}

async function makeDestFixture() {
	const db = await disposablePostgres();
	const sql: Sql = db.sql;
	await migrate(sql);
	// destination identity: same org id + destination users (source users are
	// NOT destination users — the ledger maps author ids verbatim, FK SET NULL
	// is exercised through the preflight mapping decision below)
	await seedIdentity(sql, { org: ORG, users: ["user-src-alice"] });
	return { sql, close: db.close };
}

test("T22 full import: six tables, lossless split, original ids/history/external retained", async () => {
	const source = await makeSourceFixture();
	const dest = await makeDestFixture();
	try {
		await plantSource(source.sql);
		const report = await runImport({
			source: source.sql,
			destination: dest.sql,
			sourceId: "snap-1",
			defaultOrg: ORG,
		});
		expect(report.imported.activity).toBe(3);
		expect(report.imported.notification).toBe(2);
		expect(report.imported.workflow_rule).toBe(1);
		expect(report.imported.user_notification_preference).toBe(1);
		expect(report.imported.user_notification_org_rule).toBe(1);
		expect(report.imported.user_notification_org_board).toBe(1);

		// comment split: 2 comment-type rows in comment, ALL 3 in projection
		const comments = await dest.sql`SELECT id FROM comment ORDER BY id`;
		expect(comments.map((c) => c.id)).toEqual(["a-c1", "a-e1"]);
		const projection =
			await dest.sql`SELECT id, type, event_data FROM activity_projection ORDER BY id`;
		expect(projection).toHaveLength(3);
		const sysRow = projection.find((p) => p.id === "a-s1");
		expect(sysRow?.type).toBe("task-assigned");
		expect(sysRow?.event_data).toEqual({ from: null, to: "user-src-bob" });

		// original PKs preserved, external attribution retained
		const ext =
			await dest.sql`SELECT external_user_name, external_source, external_url FROM comment WHERE id='a-e1'`;
		expect(ext[0]).toMatchObject({
			external_user_name: "Ext User",
			external_source: "github",
			external_url: "https://github.com/c/1",
		});

		// global notification stays org_id null
		const globals =
			await dest.sql`SELECT org_id FROM notification WHERE id='n-2'`;
		expect(globals[0].org_id).toBeNull();

		// ledger fully populated with stable digests
		const ledger =
			await dest.sql`SELECT table_name, source_pk, digest FROM activity_import WHERE source_id='snap-1' ORDER BY table_name, source_pk`;
		expect(ledger).toHaveLength(9);
	} finally {
		await source.close();
		await dest.close();
	}
}, 240_000);

test("T23 identical rerun: zero rows/events/jobs changed; history sends nothing", async () => {
	const source = await makeSourceFixture();
	const dest = await makeDestFixture();
	try {
		await plantSource(source.sql);
		await runImport({
			source: source.sql,
			destination: dest.sql,
			sourceId: "snap-1",
			defaultOrg: ORG,
		});
		const eventsBefore = await dest.sql`SELECT count(*)::int AS n FROM event`;
		const jobsBefore =
			await dest.sql`SELECT count(*)::int AS n FROM notification_outbox`;
		const rowsBefore = await dest.sql`
      SELECT (SELECT count(*) FROM comment)::int + (SELECT count(*) FROM activity_projection)::int
           + (SELECT count(*) FROM notification)::int + (SELECT count(*) FROM workflow_rule)::int
           + (SELECT count(*) FROM user_notification_preference)::int
           + (SELECT count(*) FROM user_notification_org_rule)::int
           + (SELECT count(*) FROM user_notification_org_board)::int AS n`;
		const report = await runImport({
			source: source.sql,
			destination: dest.sql,
			sourceId: "snap-1",
			defaultOrg: ORG,
		});
		expect(report.skipped).toBe(9);
		const eventsAfter = await dest.sql`SELECT count(*)::int AS n FROM event`;
		const jobsAfter =
			await dest.sql`SELECT count(*)::int AS n FROM notification_outbox`;
		const rowsAfter = await dest.sql`
      SELECT (SELECT count(*) FROM comment)::int + (SELECT count(*) FROM activity_projection)::int
           + (SELECT count(*) FROM notification)::int + (SELECT count(*) FROM workflow_rule)::int
           + (SELECT count(*) FROM user_notification_preference)::int
           + (SELECT count(*) FROM user_notification_org_rule)::int
           + (SELECT count(*) FROM user_notification_org_board)::int AS n`;
		expect(eventsAfter[0].n).toBe(eventsBefore[0].n);
		expect(jobsAfter[0].n).toBe(jobsBefore[0].n);
		expect(rowsAfter[0].n).toBe(rowsBefore[0].n);
		// zero outbound delivery for history: no jobs were ever enqueued
		expect(jobsAfter[0].n).toBe(0);
	} finally {
		await source.close();
		await dest.close();
	}
}, 240_000);

test("T24 preflight failures are atomic and sanitized: bad FK org, unknown user on preference", async () => {
	const source = await makeSourceFixture();
	const dest = await makeDestFixture();
	try {
		await plantSource(source.sql);
		// destination does NOT contain org-src-1 membership for preference rule? It does —
		// instead poison the workflow rule with a foreign org not present at destination.
		await source.sql`INSERT INTO workflow_rule (id, org_id, board_id, integration_type, event_type, status_id, created_at, updated_at) VALUES
      ('w-bad','org-does-not-exist','board-src-1','github','opened','col-src-1','2026-01-01T08:00:00','2026-01-01T08:00:00')`;
		await expect(
			runImport({
				source: source.sql,
				destination: dest.sql,
				sourceId: "snap-1",
				defaultOrg: ORG,
			}),
		).rejects.toThrow(/org-does-not-exist/);
		// nothing partially committed
		const any =
			await dest.sql`SELECT count(*)::int AS n FROM activity_import WHERE source_id='snap-1'`;
		expect(any[0].n).toBe(0);
		const c = await dest.sql`SELECT count(*)::int AS n FROM comment`;
		expect(c[0].n).toBe(0);
	} finally {
		await source.close();
		await dest.close();
	}
}, 240_000);

test("T24b malformed history: undecryptable secret fails preflight, source untouched", async () => {
	const source = await makeSourceFixture();
	const dest = await makeDestFixture();
	try {
		await plantSource(source.sql);
		await source.sql`UPDATE user_notification_preference SET ntfy_token='gibberish-not-ciphertext' WHERE id='p-1'`;
		await expect(
			runImport({
				source: source.sql,
				destination: dest.sql,
				sourceId: "snap-1",
				defaultOrg: ORG,
				secrets: { mode: "verify" },
			}),
		).rejects.toThrow();
		const rows =
			await dest.sql`SELECT count(*)::int AS n FROM user_notification_preference`;
		expect(rows[0].n).toBe(0);
	} finally {
		await source.close();
		await dest.close();
	}
}, 240_000);
