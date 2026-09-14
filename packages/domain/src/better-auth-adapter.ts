import { createAdapterFactory } from "@better-auth/core/db/adapter";
import type { Sql } from "postgres";

// STL-15 §5: postgres.js CustomAdapter over the 0002_identity runtime tables.
// Mirrors the shipped drizzle adapter's where-clause semantics without
// transplanting the fork's untraced DB client (ADR 0007/0010): every query
// goes through the caller's postgres.js handle, so Effect instrumentation
// sees the statements the same way the rest of the domain does.

interface ModelDef {
	table: string;
	fields: Record<string, string>;
}

const MODELS: Record<string, ModelDef> = {
	user: {
		table: '"user"',
		fields: {
			id: "id",
			name: "name",
			email: "email",
			emailVerified: "email_verified",
			image: "image",
			locale: "locale",
			createdAt: "created_at",
			updatedAt: "updated_at",
			isAnonymous: "is_anonymous",
			role: "role",
			banned: "banned",
			banReason: "ban_reason",
			banExpires: "ban_expires",
		},
	},
	account: {
		table: "account",
		fields: {
			id: "id",
			accountId: "account_id",
			providerId: "provider_id",
			userId: "user_id",
			accessToken: "access_token",
			refreshToken: "refresh_token",
			idToken: "id_token",
			accessTokenExpiresAt: "access_token_expires_at",
			refreshTokenExpiresAt: "refresh_token_expires_at",
			scope: "scope",
			password: "password",
			createdAt: "created_at",
			updatedAt: "updated_at",
		},
	},
	session: {
		table: "session",
		fields: {
			id: "id",
			expiresAt: "expires_at",
			token: "token",
			createdAt: "created_at",
			updatedAt: "updated_at",
			ipAddress: "ip_address",
			userAgent: "user_agent",
			userId: "user_id",
			activeOrganizationId: "active_organization_id",
			activeTeamId: "active_team_id",
			impersonatedBy: "impersonated_by",
		},
	},
	verification: {
		table: "verification",
		fields: {
			id: "id",
			identifier: "identifier",
			value: "value",
			expiresAt: "expires_at",
			createdAt: "created_at",
			updatedAt: "updated_at",
		},
	},
};

interface Where {
	field: string;
	operator?: string;
	value: unknown;
	mode?: string;
	conector?: string;
}

const OUTPUT_FIELDS: Record<
	string,
	Record<string, string>
> = Object.fromEntries(
	Object.entries(MODELS).map(([model, def]) => [
		model,
		Object.fromEntries(
			Object.entries(def.fields).map(([modelField, column]) => [
				column,
				modelField,
			]),
		),
	]),
);

/** Adapter outputs are camelCase model rows (the contract Better Auth's
 * factory builds on); inputs are mapped through def.fields. */
function mapRow(
	model: string,
	row: Record<string, unknown> | null | undefined,
) {
	if (!row) return row ?? null;
	const inverse = OUTPUT_FIELDS[model];
	if (!inverse) return row;
	const mapped: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(row)) {
		mapped[inverse[key] ?? key] = value;
	}
	return mapped;
}

function quoteIdent(name: string): string {
	if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("Bad column name");
	return `"${name}"`;
}

function buildWhere(model: ModelDef, where: Where[]): [string, unknown[]] {
	const clauses: string[] = [];
	const params: unknown[] = [];
	for (const w of where) {
		const col = model.fields[w.field];
		if (!col) throw new Error(`Unknown field ${w.field}`);
		const operator = w.operator ?? "eq";
		const push = (sql: string, value: unknown) => {
			params.push(value);
			clauses.push(sql.replace("?", `$${params.length}`));
		};
		if (operator === "eq") push(`${quoteIdent(col)} = ?`, w.value);
		else if (operator === "ne") push(`${quoteIdent(col)} <> ?`, w.value);
		else if (operator === "lt") push(`${quoteIdent(col)} < ?`, w.value);
		else if (operator === "lte") push(`${quoteIdent(col)} <= ?`, w.value);
		else if (operator === "gt") push(`${quoteIdent(col)} > ?`, w.value);
		else if (operator === "gte") push(`${quoteIdent(col)} >= ?`, w.value);
		else if (operator === "in") {
			const values = Array.isArray(w.value) ? w.value : [w.value];
			const list = values
				.map((value) => {
					params.push(value);
					return `$${params.length}`;
				})
				.join(",");
			clauses.push(`${quoteIdent(col)} IN (${list})`);
		} else if (operator === "not_in") {
			const values = Array.isArray(w.value) ? w.value : [w.value];
			const list = values
				.map((value) => {
					params.push(value);
					return `$${params.length}`;
				})
				.join(",");
			clauses.push(`${quoteIdent(col)} NOT IN (${list})`);
		} else if (operator === "contains")
			push(`${quoteIdent(col)} LIKE '%' || ? || '%'`, w.value);
		else if (operator === "starts_with")
			push(`${quoteIdent(col)} LIKE ? || '%'`, w.value);
		else if (operator === "ends_with")
			push(`${quoteIdent(col)} LIKE '%' || ?`, w.value);
		else throw new Error(`Unsupported where operator ${operator}`);
	}
	const joined = clauses.join(" AND ");
	return [joined ? `WHERE ${joined}` : "", params];
}

export const postgresJsAdapter = (sql: Sql) =>
	createAdapterFactory(
		// The factory's transaction generic cannot express postgres.js's
		// UnwrapPromiseArray chaining; the runtime contract is exercised by
		// the integration suite, so this boundary cast is contained here.
		createAdapterFactoryArgs(sql) as never,
	);

function createAdapterFactoryArgs(sql: Sql) {
	return {
		config: {
			adapterId: "postgres-js",
			adapterName: "postgres.js (stellarc 0002 identity)",
			usePlural: false,
			supportsUUIDs: true,
			supportsJSON: true,
			supportsArrays: true,
			transaction: (cb: (trx: unknown) => Promise<unknown>) =>
				sql.begin(
					(tx) =>
						cb(
							createAdapterFactory({
								config: {
									adapterId: "postgres-js",
									adapterName: "postgres.js (stellarc 0002 identity)",
									usePlural: false,
								},
								adapter: makeAdapter(tx),
							})({} as never),
						) as never,
				) as never,
		},
		adapter: makeAdapter(sql),
	};
}

/* eslint-disable-next-line */
// biome-ignore lint/suspicious/noExplicitAny: better-auth adapter record shape is intentionally structural
function makeAdapter(sql: Sql): () => any {
	return () => ({
		options: {},
		async create({
			model,
			data,
		}: {
			model: string;
			data: Record<string, unknown>;
		}) {
			const def = MODELS[model];
			if (!def) throw new Error(`Unknown model ${model}`);
			const cols = Object.keys(data)
				.map((key) => def.fields[key])
				.filter((value): value is string => typeof value === "string");
			const entries = Object.entries(data).filter(([key]) =>
				Boolean(def.fields[key]),
			);
			const placeholders = entries.map((_, i) => `$${i + 1}`).join(",");
			const rows = (await sql.unsafe(
				`INSERT INTO ${def.table} (${cols.map(quoteIdent).join(",")}) VALUES (${placeholders}) RETURNING *`,
				entries.map(([, value]) => value) as never[],
			)) as Array<Record<string, unknown>>;
			return mapRow(model, rows[0]);
		},
		async findOne({ model, where }: { model: string; where: Where[] }) {
			const def = MODELS[model];
			if (!def) throw new Error(`Unknown model ${model}`);
			const [clause, params] = buildWhere(def, where);
			const rows = (await sql.unsafe(
				`SELECT * FROM ${def.table} ${clause} LIMIT 1`,
				params as never[],
			)) as Array<Record<string, unknown>>;
			return mapRow(model, rows[0] ?? null);
		},
		async findMany({
			model,
			where,
			limit,
			offset,
			sortBy,
		}: {
			model: string;
			where?: Where[];
			limit: number;
			offset?: number;
			sortBy?: { field: string; direction: "asc" | "desc" };
		}) {
			const def = MODELS[model];
			if (!def) throw new Error(`Unknown model ${model}`);
			const [clause, params] = buildWhere(def, where ?? []);
			const order = sortBy
				? ` ORDER BY ${quoteIdent(def.fields[sortBy.field] ?? sortBy.field)} ${sortBy.direction === "desc" ? "DESC" : "ASC"}`
				: "";
			const rows = (await sql.unsafe(
				`SELECT * FROM ${def.table} ${clause}${order} LIMIT ${Number(limit)} OFFSET ${Number(offset ?? 0)}`,
				params as never[],
			)) as Array<Record<string, unknown>>;
			return rows.map((row) => mapRow(model, row));
		},
		async update({
			model,
			where,
			update,
		}: {
			model: string;
			where: Where[];
			update: Record<string, unknown>;
		}) {
			const def = MODELS[model];
			if (!def) throw new Error(`Unknown model ${model}`);
			const [clause, whereParams] = buildWhere(def, where);
			const sets = Object.entries(update).filter(([key]) =>
				Boolean(def.fields[key]),
			);
			if (sets.length === 0) return null;
			const params: unknown[] = [];
			const setSql = sets
				.map(([key, value]) => {
					params.push(value);
					return `${quoteIdent(def.fields[key])} = $${params.length}`;
				})
				.join(",");
			const rows = (await sql.unsafe(
				`UPDATE ${def.table} SET ${setSql} ${clause} RETURNING *`,
				[...params, ...whereParams] as never[],
			)) as Array<Record<string, unknown>>;
			return mapRow(model, rows[0] ?? null);
		},
		async updateMany({
			model,
			where,
			update,
		}: {
			model: string;
			where: Where[];
			update: Record<string, unknown>;
		}) {
			const def = MODELS[model];
			if (!def) throw new Error(`Unknown model ${model}`);
			const [clause, whereParams] = buildWhere(def, where);
			const sets = Object.entries(update).filter(([key]) =>
				Boolean(def.fields[key]),
			);
			const params: unknown[] = [];
			const setSql = sets
				.map(([key, value]) => {
					params.push(value);
					return `${quoteIdent(def.fields[key])} = $${params.length}`;
				})
				.join(",");
			if (!setSql) return 0;
			const rows = (await sql.unsafe(
				`UPDATE ${def.table} SET ${setSql} ${clause} RETURNING id`,
				[...params, ...whereParams] as never[],
			)) as unknown[];
			return rows.length;
		},
		async delete({ model, where }: { model: string; where: Where[] }) {
			const def = MODELS[model];
			if (!def) throw new Error(`Unknown model ${model}`);
			const [clause, params] = buildWhere(def, where);
			await sql.unsafe(`DELETE FROM ${def.table} ${clause}`, params as never[]);
		},
		async deleteMany({ model, where }: { model: string; where: Where[] }) {
			const def = MODELS[model];
			if (!def) throw new Error(`Unknown model ${model}`);
			const [clause, params] = buildWhere(def, where);
			const rows = (await sql.unsafe(
				`DELETE FROM ${def.table} ${clause} RETURNING id`,
				params as never[],
			)) as unknown[];
			return rows.length;
		},
		async count({ model, where }: { model: string; where?: Where[] }) {
			const def = MODELS[model];
			if (!def) throw new Error(`Unknown model ${model}`);
			const [clause, params] = buildWhere(def, where ?? []);
			const rows = (await sql.unsafe(
				`SELECT count(*)::int AS n FROM ${def.table} ${clause}`,
				params as never[],
			)) as Array<{ n: number }>;
			return Number(rows[0]?.n ?? 0);
		},
		async incrementOne({
			model,
			where,
			increment,
			set,
		}: {
			model: string;
			where: Where[];
			increment: Record<string, number>;
			set?: Record<string, unknown>;
		}) {
			const def = MODELS[model];
			if (!def) throw new Error(`Unknown model ${model}`);
			const [clause, whereParams] = buildWhere(def, where);
			const params: unknown[] = [];
			const parts: string[] = [];
			for (const [key, delta] of Object.entries(increment)) {
				const col = def.fields[key];
				if (!col) throw new Error(`Unknown field ${key}`);
				params.push(delta);
				parts.push(
					`${quoteIdent(col)} = ${quoteIdent(col)} + $${params.length}`,
				);
			}
			for (const [key, value] of Object.entries(set ?? {})) {
				const col = def.fields[key];
				if (!col) throw new Error(`Unknown field ${key}`);
				params.push(value);
				parts.push(`${quoteIdent(col)} = $${params.length}`);
			}
			if (parts.length === 0) return null;
			const rows = (await sql.unsafe(
				`UPDATE ${def.table} SET ${parts.join(",")} ${clause} RETURNING *`,
				[...params, ...whereParams] as never[],
			)) as Array<Record<string, unknown>>;
			return mapRow(model, rows[0] ?? null);
		},
		async consumeOne({ model, where }: { model: string; where: Where[] }) {
			const def = MODELS[model];
			if (!def) throw new Error(`Unknown model ${model}`);
			const [clause, params] = buildWhere(def, where);
			// postgres has no DELETE ... LIMIT: select the single PK via a
			// CTE so at most one row is ever consumed (native atomic consume).
			const rows = (await sql.unsafe(
				`WITH victim AS (SELECT ${quoteIdent("id")} AS vid FROM ${def.table} ${clause} LIMIT 1)
				 DELETE FROM ${def.table} WHERE ${quoteIdent("id")} IN (SELECT vid FROM victim) RETURNING *`,
				params as never[],
			)) as Array<Record<string, unknown>>;
			return mapRow(model, rows[0] ?? null);
		},
	});
}
