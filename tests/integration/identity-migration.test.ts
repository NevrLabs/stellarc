import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { disposablePostgres } from "../helpers/postgres";

// STL-31 I1–I7: identity migration applies, re-applies, rejects drift, and
// produces the exact §2 catalog (15 tables, 107 imported + structural columns).

const TABLES = [
	"user",
	"account",
	"organization",
	"organization_member",
	"organization_role",
	"team",
	"team_member",
	"invitation",
	"apikey",
	"user_avatar",
	"session",
	"verification",
	"principal",
	"identity_grant",
	"identity_import",
] as const;

type Col = {
	name: string;
	type: string;
	nullable: boolean;
	def: string | null;
};

// snake_case column truth, verbatim from §2 (deltas flagged † in the spec).
const CATALOG: Record<string, Col[]> = {
	user: [
		{ name: "id", type: "text", nullable: false, def: null },
		{ name: "name", type: "text", nullable: false, def: null },
		{ name: "email", type: "text", nullable: false, def: null },
		{ name: "email_verified", type: "boolean", nullable: false, def: "false" },
		{ name: "image", type: "text", nullable: true, def: null },
		{ name: "locale", type: "text", nullable: true, def: null },
		{
			name: "created_at",
			type: "timestamp without time zone",
			nullable: false,
			def: "now()",
		},
		{
			name: "updated_at",
			type: "timestamp without time zone",
			nullable: false,
			def: "now()",
		},
		{ name: "is_anonymous", type: "boolean", nullable: true, def: "false" },
		{ name: "role", type: "text", nullable: true, def: null },
		{ name: "banned", type: "boolean", nullable: true, def: "false" },
		{ name: "ban_reason", type: "text", nullable: true, def: null },
		{
			name: "ban_expires",
			type: "timestamp without time zone",
			nullable: true,
			def: null,
		},
	],
	account: [
		{ name: "id", type: "text", nullable: false, def: null },
		{ name: "account_id", type: "text", nullable: false, def: null },
		{ name: "provider_id", type: "text", nullable: false, def: null },
		{ name: "user_id", type: "text", nullable: false, def: null },
		{ name: "access_token", type: "text", nullable: true, def: null },
		{ name: "refresh_token", type: "text", nullable: true, def: null },
		{ name: "id_token", type: "text", nullable: true, def: null },
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
		{ name: "password", type: "text", nullable: true, def: null },
		{
			name: "created_at",
			type: "timestamp without time zone",
			nullable: false,
			def: "now()",
		},
		{
			name: "updated_at",
			type: "timestamp without time zone",
			nullable: false,
			def: null,
		},
	],
	organization: [
		{ name: "id", type: "text", nullable: false, def: null },
		{ name: "name", type: "text", nullable: false, def: null },
		{ name: "slug", type: "text", nullable: false, def: null },
		{ name: "logo", type: "text", nullable: true, def: null },
		{ name: "metadata", type: "text", nullable: true, def: null },
		{ name: "description", type: "text", nullable: true, def: null },
		{ name: "repos_enabled", type: "boolean", nullable: false, def: "false" },
		{ name: "tables_enabled", type: "boolean", nullable: false, def: "false" },
		{ name: "work_enabled", type: "boolean", nullable: false, def: "false" },
		{
			name: "default_resource_privilege",
			type: "text",
			nullable: false,
			def: "'manage'",
		},
		{ name: "ai_enabled", type: "boolean", nullable: false, def: "false" },
		{
			name: "ai_default_token_limit",
			type: "integer",
			nullable: false,
			def: "1024",
		},
		{
			name: "ai_default_character_limit",
			type: "integer",
			nullable: false,
			def: "4000",
		},
		{ name: "ai_provider_base_url", type: "text", nullable: true, def: null },
		{ name: "ai_provider_model", type: "text", nullable: true, def: null },
		{ name: "ai_provider_api_key", type: "text", nullable: true, def: null },
		{
			name: "created_at",
			type: "timestamp without time zone",
			nullable: false,
			def: null,
		},
	],
	organization_member: [
		{ name: "id", type: "text", nullable: false, def: null },
		{ name: "organization_id", type: "text", nullable: false, def: null },
		{ name: "user_id", type: "text", nullable: false, def: null },
		{ name: "role", type: "text", nullable: false, def: "'member'" },
		{ name: "ai_token_limit", type: "integer", nullable: true, def: null },
		{ name: "ai_character_limit", type: "integer", nullable: true, def: null },
		{
			name: "joined_at",
			type: "timestamp without time zone",
			nullable: false,
			def: null,
		},
	],
	organization_role: [
		{ name: "id", type: "text", nullable: false, def: null },
		{ name: "organization_id", type: "text", nullable: false, def: null },
		{ name: "role", type: "text", nullable: false, def: null },
		{ name: "permission", type: "text", nullable: false, def: null },
		{
			name: "created_at",
			type: "timestamp without time zone",
			nullable: false,
			def: "now()",
		},
		{
			name: "updated_at",
			type: "timestamp without time zone",
			nullable: false,
			def: null,
		},
	],
	team: [
		{ name: "id", type: "text", nullable: false, def: null },
		{ name: "name", type: "text", nullable: false, def: null },
		{ name: "organization_id", type: "text", nullable: false, def: null },
		{ name: "source", type: "text", nullable: false, def: "'kaneo'" },
		{ name: "icon", type: "text", nullable: true, def: null },
		{ name: "parent_team_id", type: "text", nullable: true, def: null },
		{
			name: "created_at",
			type: "timestamp without time zone",
			nullable: false,
			def: null,
		},
		{
			name: "updated_at",
			type: "timestamp without time zone",
			nullable: true,
			def: null,
		},
	],
	team_member: [
		{ name: "id", type: "text", nullable: false, def: null },
		{ name: "team_id", type: "text", nullable: false, def: null },
		{ name: "user_id", type: "text", nullable: false, def: null },
		{
			name: "created_at",
			type: "timestamp without time zone",
			nullable: true,
			def: null,
		},
	],
	invitation: [
		{ name: "id", type: "text", nullable: false, def: null },
		{ name: "organization_id", type: "text", nullable: false, def: null },
		{ name: "email", type: "text", nullable: false, def: null },
		{ name: "role", type: "text", nullable: true, def: null },
		{ name: "team_id", type: "text", nullable: true, def: null },
		{ name: "status", type: "text", nullable: false, def: "'pending'" },
		{
			name: "expires_at",
			type: "timestamp without time zone",
			nullable: false,
			def: null,
		},
		{
			name: "created_at",
			type: "timestamp without time zone",
			nullable: false,
			def: "now()",
		},
		{ name: "inviter_id", type: "text", nullable: false, def: null },
	],
	apikey: [
		{ name: "id", type: "text", nullable: false, def: null },
		{ name: "config_id", type: "text", nullable: false, def: "'default'" },
		{ name: "name", type: "text", nullable: true, def: null },
		{ name: "start", type: "text", nullable: true, def: null },
		{ name: "reference_id", type: "text", nullable: false, def: null },
		{ name: "prefix", type: "text", nullable: true, def: null },
		{ name: "key", type: "text", nullable: false, def: null },
		{ name: "user_id", type: "text", nullable: true, def: null },
		{ name: "refill_interval", type: "integer", nullable: true, def: null },
		{ name: "refill_amount", type: "integer", nullable: true, def: null },
		{
			name: "last_refill_at",
			type: "timestamp without time zone",
			nullable: true,
			def: null,
		},
		{ name: "enabled", type: "boolean", nullable: true, def: "true" },
		{
			name: "rate_limit_enabled",
			type: "boolean",
			nullable: true,
			def: "true",
		},
		{
			name: "rate_limit_time_window",
			type: "integer",
			nullable: true,
			def: "86400000",
		},
		{ name: "rate_limit_max", type: "integer", nullable: true, def: "10" },
		{ name: "request_count", type: "integer", nullable: true, def: "0" },
		{ name: "remaining", type: "integer", nullable: true, def: null },
		{
			name: "last_request",
			type: "timestamp without time zone",
			nullable: true,
			def: null,
		},
		{
			name: "expires_at",
			type: "timestamp without time zone",
			nullable: true,
			def: null,
		},
		{
			name: "created_at",
			type: "timestamp without time zone",
			nullable: false,
			def: null,
		},
		{
			name: "updated_at",
			type: "timestamp without time zone",
			nullable: false,
			def: null,
		},
		{ name: "permissions", type: "text", nullable: true, def: null },
		{ name: "metadata", type: "text", nullable: true, def: null },
	],
	user_avatar: [
		{ name: "id", type: "text", nullable: false, def: null },
		{ name: "user_id", type: "text", nullable: false, def: null },
		{ name: "mime_type", type: "text", nullable: false, def: null },
		{ name: "size", type: "integer", nullable: false, def: null },
		{ name: "data", type: "bytea", nullable: false, def: null },
		{
			name: "created_at",
			type: "timestamp without time zone",
			nullable: false,
			def: "now()",
		},
		{
			name: "updated_at",
			type: "timestamp without time zone",
			nullable: false,
			def: null,
		},
	],
	session: [
		{ name: "id", type: "text", nullable: false, def: null },
		{
			name: "expires_at",
			type: "timestamp without time zone",
			nullable: false,
			def: null,
		},
		{ name: "token", type: "text", nullable: false, def: null },
		{
			name: "created_at",
			type: "timestamp without time zone",
			nullable: false,
			def: "now()",
		},
		{
			name: "updated_at",
			type: "timestamp without time zone",
			nullable: false,
			def: null,
		},
		{ name: "ip_address", type: "text", nullable: true, def: null },
		{ name: "user_agent", type: "text", nullable: true, def: null },
		{ name: "user_id", type: "text", nullable: false, def: null },
		{ name: "active_organization_id", type: "text", nullable: true, def: null },
		{ name: "active_team_id", type: "text", nullable: true, def: null },
		{ name: "impersonated_by", type: "text", nullable: true, def: null },
	],
	verification: [
		{ name: "id", type: "text", nullable: false, def: null },
		{ name: "identifier", type: "text", nullable: false, def: null },
		{ name: "value", type: "text", nullable: false, def: null },
		{
			name: "expires_at",
			type: "timestamp without time zone",
			nullable: false,
			def: null,
		},
		{
			name: "created_at",
			type: "timestamp without time zone",
			nullable: false,
			def: "now()",
		},
		{
			name: "updated_at",
			type: "timestamp without time zone",
			nullable: false,
			def: null,
		},
	],
	principal: [
		{ name: "id", type: "text", nullable: false, def: null },
		{ name: "kind", type: "text", nullable: false, def: null },
		{ name: "user_id", type: "text", nullable: false, def: null },
		{ name: "apikey_id", type: "text", nullable: true, def: null },
	],
	identity_grant: [
		{ name: "org_id", type: "text", nullable: false, def: null },
		{ name: "principal_id", type: "text", nullable: false, def: null },
		{ name: "capability", type: "text", nullable: false, def: null },
	],
	identity_import: [
		{ name: "source_id", type: "text", nullable: false, def: null },
		{ name: "table_name", type: "text", nullable: false, def: null },
		{ name: "source_pk", type: "text", nullable: false, def: null },
		{ name: "digest", type: "text", nullable: false, def: null },
	],
};

const normalizeDefault = (d: string | null): string | null =>
	d === null
		? null
		: d.replace(
				/::(?:text|character varying|boolean|integer|bytea)(?:\[\])?/g,
				"",
			);

async function readColumns(sql: Sql, table: string): Promise<Col[]> {
	const rows = await sql<
		{
			column_name: string;
			data_type: string;
			is_nullable: string;
			column_default: string | null;
		}[]
	>`SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ${table}
     ORDER BY ordinal_position`;
	return rows.map((r) => ({
		name: r.column_name,
		type: r.data_type,
		nullable: r.is_nullable === "YES",
		def: normalizeDefault(r.column_default),
	}));
}

type Fk = { table: string; column: string; ref: string; onDelete: string };

async function readForeignKeys(sql: Sql): Promise<Fk[]> {
	const rows = await sql<
		{
			table_name: string;
			column_name: string;
			ref_table: string;
			confdeltype: string;
		}[]
	>`SELECT
     c.conrelid::regclass::text AS table_name,
     a.attname AS column_name,
     c.confrelid::regclass::text AS ref_table,
     c.confdeltype
   FROM pg_constraint c
   JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
   WHERE c.contype = 'f' AND c.conrelid::regclass::text = ANY(${sql.array([
			...TABLES,
		])})`;
	return rows.map((r) => ({
		table: r.table_name.replace(/^"|"$/g, ""),
		column: r.column_name,
		ref: r.ref_table.replace(/^"|"$/g, ""),
		onDelete: r.confdeltype,
	}));
}

async function readIndexes(
	sql: Sql,
): Promise<{ table: string; name: string; def: string }[]> {
	const rows = await sql<
		{ tablename: string; indexname: string; indexdef: string }[]
	>`SELECT tablename, indexname, indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = ANY(${sql.array([...TABLES])})`;
	return rows.map((r) => ({
		table: r.tablename,
		name: r.indexname,
		def: r.indexdef,
	}));
}

async function readUniques(
	sql: Sql,
	table: string,
): Promise<{ name: string; columns: string[] }[]> {
	const rows = await sql<
		{ conname: string; attnames: string[] }[]
	>`SELECT con.conname, array_agg(att.attname ORDER BY ord.ordinality) AS attnames
     FROM pg_constraint con
     JOIN unnest(con.conkey) WITH ORDINALITY AS ord(attnum, ordinality) ON true
     JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ord.attnum
     WHERE con.conrelid = ${table}::regclass AND con.contype = 'u'
     GROUP BY con.conname`;
	return rows.map((r) => ({ name: r.conname, columns: r.attnames }));
}

const resources: Array<() => Promise<void>> = [];
beforeEach(() => expect(resources).toHaveLength(0));
afterEach(async () => {
	while (resources.length > 0) await resources.pop()?.();
});

test("I1 fresh apply creates all 15 identity tables and registers the version", async () => {
	const { migrate } = await import("../../packages/db/src/migrate");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	const rows = await db.sql<
		{ table_name: string }[]
	>`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`;
	const names = new Set(rows.map((r) => r.table_name));
	for (const table of TABLES) expect(names.has(table), table).toBe(true);
	const registered = await db.sql<
		{ version: string }[]
	>`SELECT version FROM stellarc_migration ORDER BY version`;
	expect(registered.map((r) => r.version)).toContain("0002_identity");
});

test("I2 re-apply is a no-op and records the checksum row", async () => {
	const { migrate } = await import("../../packages/db/src/migrate");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	await migrate(db.sql);
	const rows = await db.sql<
		{ version: string; checksum: string }[]
	>`SELECT version, checksum FROM stellarc_migration WHERE version = '0002_identity'`;
	expect(rows).toHaveLength(1);
	expect(rows[0].checksum).toMatch(/^[0-9a-f]{64}$/);
});

test("I3 checksum drift on 0002 is rejected; 0001 drift still rejected", async () => {
	const { migrate } = await import("../../packages/db/src/migrate");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	await db.sql`UPDATE stellarc_migration SET checksum='invalid' WHERE version='0002_identity'`;
	await expect(migrate(db.sql)).rejects.toThrow("Migration checksum mismatch");
	await db.sql`UPDATE stellarc_migration SET checksum='invalid' WHERE version='0001_foundation'`;
	await expect(migrate(db.sql)).rejects.toThrow("Migration checksum mismatch");
});

test("I4 column catalog matches §2 for all 15 tables", async () => {
	const { migrate } = await import("../../packages/db/src/migrate");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	for (const table of TABLES) {
		const actual = await readColumns(db.sql, table);
		const expected = CATALOG[table];
		expect(
			actual.map((c) => ({
				name: c.name,
				type: c.type,
				nullable: c.nullable,
				def: c.def,
			})),
			table,
		).toEqual(expected);
	}
});

test("I5 FK graph matches §2 with exact ON DELETE actions", async () => {
	const { migrate } = await import("../../packages/db/src/migrate");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	const fks = (await readForeignKeys(db.sql))
		.map((f) => ({
			table: f.table,
			column: f.column,
			ref: f.ref,
			onDelete: f.onDelete,
		}))
		.sort((a, b) =>
			`${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`),
		);
	const expected = [
		{ table: "account", column: "user_id", ref: "user", onDelete: "c" },
		{ table: "apikey", column: "reference_id", ref: "user", onDelete: "c" },
		{ table: "apikey", column: "user_id", ref: "user", onDelete: "c" },
		{
			table: "identity_grant",
			column: "org_id",
			ref: "organization",
			onDelete: "a",
		},
		{
			table: "identity_grant",
			column: "principal_id",
			ref: "principal",
			onDelete: "a",
		},
		{ table: "invitation", column: "inviter_id", ref: "user", onDelete: "c" },
		{
			table: "invitation",
			column: "organization_id",
			ref: "organization",
			onDelete: "c",
		},
		{
			table: "organization_member",
			column: "organization_id",
			ref: "organization",
			onDelete: "c",
		},
		{
			table: "organization_member",
			column: "user_id",
			ref: "user",
			onDelete: "c",
		},
		{
			table: "organization_role",
			column: "organization_id",
			ref: "organization",
			onDelete: "c",
		},
		{ table: "principal", column: "apikey_id", ref: "apikey", onDelete: "a" },
		{ table: "principal", column: "user_id", ref: "user", onDelete: "a" },
		{ table: "session", column: "user_id", ref: "user", onDelete: "c" },
		{
			table: "team",
			column: "organization_id",
			ref: "organization",
			onDelete: "c",
		},
		{ table: "team", column: "parent_team_id", ref: "team", onDelete: "n" },
		{ table: "team_member", column: "team_id", ref: "team", onDelete: "c" },
		{ table: "team_member", column: "user_id", ref: "user", onDelete: "c" },
		{ table: "user_avatar", column: "user_id", ref: "user", onDelete: "c" },
	].sort((a, b) =>
		`${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`),
	);
	expect(fks).toEqual(expected);
});

test("I6 uniques and named secondary indexes match §2; deferred composites absent", async () => {
	const { migrate } = await import("../../packages/db/src/migrate");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);

	const uniques = await readUniques(db.sql, "user");
	expect(uniques.some((u) => u.columns.join(",") === "email")).toBe(true);
	expect(
		(await readUniques(db.sql, "organization")).some(
			(u) => u.columns.join(",") === "slug",
		),
	).toBe(true);
	expect(
		(await readUniques(db.sql, "session")).some(
			(u) => u.columns.join(",") === "token",
		),
	).toBe(true);
	const avatarUniques = await readUniques(db.sql, "user_avatar");
	expect(avatarUniques.some((u) => u.columns.join(",") === "user_id")).toBe(
		true,
	);
	const principalUniques = await readUniques(db.sql, "principal");
	expect(
		principalUniques.some((u) => u.columns.join(",") === "apikey_id"),
	).toBe(true);

	const indexes = await readIndexes(db.sql);
	const byName = new Map(indexes.map((i) => [i.name, i]));

	for (const name of [
		"account_userId_idx",
		"organization_slug_lower_unique",
		"organization_member_organizationId_idx",
		"organization_member_userId_idx",
		"organization_role_organizationId_idx",
		"organization_role_role_idx",
		"team_organizationId_idx",
		"teamMember_teamId_idx",
		"teamMember_userId_idx",
		"invitation_organizationId_idx",
		"invitation_email_idx",
		"invitation_inviterId_idx",
		"apikey_configId_idx",
		"apikey_key_idx",
		"apikey_referenceId_idx",
		"apikey_userId_idx",
		"user_avatar_userId_idx",
	])
		expect(byName.has(name), name).toBe(true);

	const lowerSlug = byName.get("organization_slug_lower_unique");
	expect(lowerSlug?.def).toMatch(/lower/);
	expect(lowerSlug?.def).toMatch(/UNIQUE/);

	// principal partial unique index (user_id) WHERE kind='human'
	const principalIndexes = indexes.filter((i) => i.table === "principal");
	expect(
		principalIndexes.some(
			(i) =>
				i.def.includes("UNIQUE") &&
				i.def.includes("user_id") &&
				i.def.includes("WHERE") &&
				i.def.includes("kind"),
		),
	).toBe(true);

	// Deferred composite uniques must NOT exist.
	for (const [table, cols] of [
		["organization_member", "organization_id,user_id"],
		["organization_role", "organization_id,role"],
		["team_member", "team_id,user_id"],
	] as const) {
		const u = await readUniques(db.sql, table);
		expect(
			u.some((x) => x.columns.join(",") === cols),
			`${table} ${cols}`,
		).toBe(false);
	}
});

test("I7 principal CHECK constraints gate kind and the human/apikey oracle", async () => {
	const { migrate } = await import("../../packages/db/src/migrate");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);

	const checks = await db.sql<
		{ conname: string; pg_get_constraintdef: string }[]
	>`SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
     WHERE conrelid = 'principal'::regclass AND contype = 'c'`;
	const defs = checks.map((c) => c.pg_get_constraintdef);
	// kind IN ('human','agent') CHECK: references `kind`, never `apikey_id`.
	expect(
		defs.filter((d) => d.includes("kind") && !d.includes("apikey_id")).length,
	).toBeGreaterThanOrEqual(1);
	// human<->apikey_id null-oracle CHECK: references both `kind` and `apikey_id`.
	expect(
		defs.filter((d) => d.includes("kind") && d.includes("apikey_id")).length,
	).toBeGreaterThanOrEqual(1);

	// Insert-time probes.
	await db.sql`INSERT INTO "user" (id, name, email) VALUES ('u1','n','u1@x.test')`;
	await db.sql`INSERT INTO "user" (id, name, email) VALUES ('u2','n','u2@x.test')`;
	await db.sql`INSERT INTO apikey (id, reference_id, "key", created_at, updated_at) VALUES ('k1','u1','secret', now(), now())`;
	// valid human (apikey_id NULL)
	await db.sql`INSERT INTO principal (id, kind, user_id) VALUES ('p1','human','u1')`;
	// valid agent (apikey_id NOT NULL)
	await db.sql`INSERT INTO principal (id, kind, user_id, apikey_id) VALUES ('p2','agent','u1','k1')`;
	// bad kind
	await expect(
		db.sql`INSERT INTO principal (id, kind, user_id) VALUES ('p3','bot','u1')`,
	).rejects.toMatchObject({ code: "23514" });
	// human with apikey_id
	await expect(
		db.sql`INSERT INTO principal (id, kind, user_id, apikey_id) VALUES ('p4','human','u1','k1')`,
	).rejects.toMatchObject({ code: "23514" });
	// agent without apikey_id
	await expect(
		db.sql`INSERT INTO principal (id, kind, user_id) VALUES ('p5','agent','u1')`,
	).rejects.toMatchObject({ code: "23514" });
});

test("migration checksum is stable over the raw SQL file bytes", async () => {
	const { readFile } = await import("node:fs/promises");
	const { createHash } = await import("node:crypto");
	const path = new URL(
		"../../packages/db/migrations/0002_identity.sql",
		import.meta.url,
	);
	const source = await readFile(path, "utf8");
	const digest = createHash("sha256").update(source).digest("hex");
	const { migrate } = await import("../../packages/db/src/migrate");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	const rows = await db.sql<
		{ checksum: string }[]
	>`SELECT checksum FROM stellarc_migration WHERE version='0002_identity'`;
	expect(rows[0].checksum).toBe(digest);
});
