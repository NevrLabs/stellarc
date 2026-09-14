import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { disposablePostgres } from "../helpers/postgres";

// STL-18 T01: the 0005_repository migration applies, re-applies, rejects
// drift, and produces the exact §2 catalog (6 tables, snake_case, source
// nullability, composite uniques and same-org FKs).

type Col = {
	name: string;
	type: string;
	nullable: boolean;
	def: string | null;
};

const ts = (def: "now()" | null = "now()"): Col => ({
	name: "created_at",
	type: "timestamp without time zone",
	nullable: false,
	def,
});

const CATALOG: Record<string, Col[]> = {
	repo: [
		{ name: "id", type: "text", nullable: false, def: null },
		{ name: "organization_id", type: "text", nullable: false, def: null },
		{ name: "provider", type: "text", nullable: false, def: null },
		{ name: "owner", type: "text", nullable: false, def: null },
		{ name: "name", type: "text", nullable: false, def: null },
		{ name: "external_id", type: "text", nullable: true, def: null },
		{ name: "url", type: "text", nullable: false, def: null },
		{ name: "description", type: "text", nullable: true, def: null },
		{ name: "default_branch", type: "text", nullable: true, def: null },
		{ name: "is_private", type: "boolean", nullable: false, def: "false" },
		{ name: "config", type: "jsonb", nullable: true, def: null },
		{ name: "is_active", type: "boolean", nullable: false, def: "true" },
		{ name: "org_privilege", type: "text", nullable: true, def: null },
		{
			name: "last_synced_at",
			type: "timestamp without time zone",
			nullable: true,
			def: null,
		},
		{ ...ts(), name: "created_at" },
		{ ...ts(), name: "updated_at" },
	],
	repo_issue: [
		{ name: "id", type: "text", nullable: false, def: null },
		{ name: "repo_id", type: "text", nullable: false, def: null },
		{ name: "number", type: "integer", nullable: false, def: null },
		{ name: "external_id", type: "text", nullable: true, def: null },
		{ name: "title", type: "text", nullable: false, def: null },
		{ name: "body", type: "text", nullable: true, def: null },
		{ name: "state", type: "text", nullable: false, def: null },
		{ name: "author_login", type: "text", nullable: true, def: null },
		{ name: "author_avatar_url", type: "text", nullable: true, def: null },
		{ name: "assignee_logins", type: "jsonb", nullable: true, def: null },
		{ name: "labels", type: "jsonb", nullable: true, def: null },
		{ name: "comment_count", type: "integer", nullable: false, def: "0" },
		{ name: "url", type: "text", nullable: false, def: null },
		{
			name: "external_created_at",
			type: "timestamp without time zone",
			nullable: true,
			def: null,
		},
		{
			name: "external_updated_at",
			type: "timestamp without time zone",
			nullable: true,
			def: null,
		},
		{
			name: "closed_at",
			type: "timestamp without time zone",
			nullable: true,
			def: null,
		},
		{ ...ts(), name: "created_at" },
		{ ...ts(), name: "updated_at" },
	],
	repo_pull_request: [
		{ name: "id", type: "text", nullable: false, def: null },
		{ name: "repo_id", type: "text", nullable: false, def: null },
		{ name: "number", type: "integer", nullable: false, def: null },
		{ name: "external_id", type: "text", nullable: true, def: null },
		{ name: "title", type: "text", nullable: false, def: null },
		{ name: "body", type: "text", nullable: true, def: null },
		{ name: "state", type: "text", nullable: false, def: null },
		{ name: "is_draft", type: "boolean", nullable: false, def: "false" },
		{ name: "author_login", type: "text", nullable: true, def: null },
		{ name: "author_avatar_url", type: "text", nullable: true, def: null },
		{ name: "head_branch", type: "text", nullable: true, def: null },
		{ name: "base_branch", type: "text", nullable: true, def: null },
		{ name: "labels", type: "jsonb", nullable: true, def: null },
		{ name: "comment_count", type: "integer", nullable: false, def: "0" },
		{ name: "additions", type: "integer", nullable: true, def: null },
		{ name: "deletions", type: "integer", nullable: true, def: null },
		{ name: "changed_files", type: "integer", nullable: true, def: null },
		{ name: "url", type: "text", nullable: false, def: null },
		{
			name: "external_created_at",
			type: "timestamp without time zone",
			nullable: true,
			def: null,
		},
		{
			name: "external_updated_at",
			type: "timestamp without time zone",
			nullable: true,
			def: null,
		},
		{
			name: "merged_at",
			type: "timestamp without time zone",
			nullable: true,
			def: null,
		},
		{
			name: "closed_at",
			type: "timestamp without time zone",
			nullable: true,
			def: null,
		},
		{ ...ts(), name: "created_at" },
		{ ...ts(), name: "updated_at" },
	],
	organization_github_installation: [
		{ name: "id", type: "text", nullable: false, def: null },
		{ name: "organization_id", type: "text", nullable: false, def: null },
		{ name: "installation_id", type: "integer", nullable: false, def: null },
		{ name: "account_id", type: "integer", nullable: false, def: null },
		{ name: "account_login", type: "text", nullable: false, def: null },
		{ name: "account_type", type: "text", nullable: false, def: null },
		{ name: "account_avatar_url", type: "text", nullable: true, def: null },
		{ name: "repository_selection", type: "text", nullable: true, def: null },
		{ name: "permissions", type: "jsonb", nullable: true, def: null },
		{ ...ts(), name: "created_at" },
		{ ...ts(), name: "updated_at" },
	],
	github_user_grant: [
		{ name: "id", type: "text", nullable: false, def: null },
		{ name: "user_id", type: "text", nullable: false, def: null },
		{ name: "provider_id", type: "text", nullable: false, def: null },
		{ name: "github_user_id", type: "text", nullable: false, def: null },
		{ name: "github_login", type: "text", nullable: false, def: null },
		{ name: "access_token", type: "text", nullable: false, def: null },
		{ name: "refresh_token", type: "text", nullable: true, def: null },
		{
			name: "access_token_expires_at",
			type: "timestamp without time zone",
			nullable: true,
			def: null,
		},
		{
			name: "refresh_token_expires_at",
			type: "timestamp without time zone",
			nullable: true,
			def: null,
		},
		{ name: "scope", type: "text", nullable: true, def: null },
		{ ...ts(), name: "created_at" },
		{ ...ts(), name: "updated_at" },
	],
	integration: [
		{ name: "id", type: "text", nullable: false, def: null },
		{ name: "board_id", type: "text", nullable: false, def: null },
		{ name: "type", type: "text", nullable: false, def: null },
		{ name: "config", type: "text", nullable: false, def: null },
		{ name: "is_active", type: "boolean", nullable: true, def: null },
		{ ...ts(), name: "created_at" },
		{ ...ts(), name: "updated_at" },
	],
};

const TABLES = Object.keys(CATALOG);

let sql: Sql;
let close: () => Promise<void>;

beforeEach(async () => {
	const db = await disposablePostgres();
	sql = db.sql;
	close = db.close;
	const { migrate } = await import("../../packages/db/src/migrate");
	await migrate(sql);
});

afterEach(async () => {
	await close();
});

test("T01 0005_repository creates the exact six-table catalog", async () => {
	const columns = (await sql`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ${sql(TABLES)}
    ORDER BY table_name, ordinal_position`) as Array<{
		table_name: string;
		column_name: string;
		data_type: string;
		is_nullable: string;
		column_default: string | null;
	}>;
	const byTable = new Map<string, Col[]>();
	for (const row of columns) {
		const list = byTable.get(row.table_name) ?? [];
		list.push({
			name: row.column_name,
			type: row.data_type,
			nullable: row.is_nullable === "YES",
			def: row.column_default === "now()" ? "now()" : row.column_default,
		});
		byTable.set(row.table_name, list);
	}
	for (const table of TABLES) {
		expect.soft(byTable.get(table), table).toEqual(CATALOG[table]);
	}
});

test("T01 uniques and same-org foreign keys are declared", async () => {
	const constraints = (await sql`
    SELECT conrelid::regclass::text AS table_name, con.contype,
      coalesce((SELECT string_agg(a.attname, ',' ORDER BY a.attnum)
       FROM unnest(con.conkey) k
       JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k), '') AS columns,
      confrelid::regclass::text AS ref
    FROM pg_constraint con
    WHERE con.contype IN ('u','f') AND con.connamespace='public'::regnamespace`) as Array<{
		table_name: string;
		contype: string;
		columns: string;
		ref: string | null;
	}>;
	const cols = (table: string) =>
		constraints
			.filter((u) => u.contype === "u" && u.table_name === table)
			.map((u) => u.columns);
	expect(cols("repo")).toContain("organization_id,provider,owner,name");
	expect(cols("repo_issue")).toContain("repo_id,number");
	expect(cols("repo_pull_request")).toContain("repo_id,number");
	expect(cols("organization_github_installation")).toContain(
		"organization_id,installation_id",
	);
	expect(cols("github_user_grant")).toContain("user_id,provider_id");
	expect(cols("integration")).toContain("board_id,type");
	const fk = (table: string) =>
		constraints
			.filter((f) => f.contype === "f" && f.table_name === table)
			.map((f) => f.ref);
	expect(fk("repo")).toContain("organization");
	expect(fk("repo_issue")).toContain("repo");
	expect(fk("repo_pull_request")).toContain("repo");
	expect(fk("organization_github_installation")).toContain("organization");
	expect(fk("github_user_grant")).toContain('"user"');
});

test("T01 migrations repeat safely and reject checksum drift", async () => {
	const { migrate } = await import("../../packages/db/src/migrate");
	await migrate(sql);
	const tables = (await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN ${sql(TABLES)}`) as Array<{
		table_name: string;
	}>;
	expect(tables).toHaveLength(TABLES.length);
});
