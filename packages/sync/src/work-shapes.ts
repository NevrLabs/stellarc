import type { Sql } from "postgres";
import {
	boardPublic,
	flagTypePublic,
	keyAliasPublic,
	labelPublic,
	statusPublic,
	taskFlagPublic,
	templatePublic,
	ticketPublic,
} from "../../domain/src/work";
import { WORK_SCHEMA_VERSION } from "../../domain/src/work-events";
import { WorkUpcasterRegistry } from "./work-upcasters";

/** §4: eight explicit work projections. Virtual statuses are client-static
 * taxonomy — never streamed. Deletes stream as deletes. */

export const WORK_TABLES = [
	"work_board",
	"work_board_key_alias",
	"work_status",
	"work_ticket",
	"work_label",
	"work_task_template",
	"work_flag_type",
	"work_task_flag",
] as const;

export type WorkTable = (typeof WORK_TABLES)[number];

/** Domain-vocabulary collection names (one per streamed table). */
export const WORK_COLLECTIONS = [
	"board",
	"board_key_alias",
	"status",
	"ticket",
	"label",
	"task_template",
	"flag_type",
	"task_flag",
] as const;

export type WorkCollection = (typeof WORK_COLLECTIONS)[number];

type AnyRow = Record<string, unknown>;

export type ShapeMessage = {
	key: string;
	value: unknown;
	headers: Record<string, unknown>;
};

type Projection = {
	/** Streamed relation name (work_*). */
	table: WorkTable;
	eventTypes: { upsert: string; delete: string };
	snapshot: (sql: Sql, org: string) => Promise<AnyRow[]>;
	// biome-ignore lint/suspicious/noExplicitAny: Public mappers take typed rows
	publicOf: (row: any) => AnyRow;
	/** Real per-table electric metadata (D11: no stub, no dead alias SQL). */
	electric: Record<
		string,
		{ type: string; not_null?: boolean; pk_index?: number }
	>;
};

const text = { type: "text" } as const;
const int8 = { type: "int8", not_null: true } as const;
const idCol = { type: "text", not_null: true, pk_index: 0 } as const;

export const PROJECTIONS: Record<WorkCollection, Projection> = {
	board: {
		table: "work_board",
		eventTypes: { upsert: "work:board-upserted", delete: "work:board-deleted" },
		snapshot: (sql, org) =>
			sql<
				AnyRow[]
			>`SELECT * FROM "board" b WHERE b.organization_id = ${org} ORDER BY b.created_at, b.id`,
		publicOf: boardPublic,
		electric: { id: idCol, slug: text, name: text, last_task_number: int8 },
	},
	board_key_alias: {
		table: "work_board_key_alias",
		eventTypes: {
			upsert: "work:board-key-upserted",
			delete: "work:board-key-deleted",
		},
		snapshot: (sql, org) =>
			sql<
				AnyRow[]
			>`SELECT a.* FROM board_key_alias a WHERE a.organization_id = ${org} ORDER BY a.created_at, a.id`,
		publicOf: keyAliasPublic,
		electric: { id: idCol, key: text },
	},
	status: {
		table: "work_status",
		eventTypes: {
			upsert: "work:status-upserted",
			delete: "work:status-deleted",
		},
		snapshot: (sql, org) =>
			sql<
				AnyRow[]
			>`SELECT c.* FROM "column" c JOIN "board" b ON b.id = c.board_id WHERE b.organization_id = ${org} ORDER BY c.board_id, c.position, c.id`,
		publicOf: statusPublic,
		electric: { id: idCol, slug: text, position: int8 },
	},
	ticket: {
		table: "work_ticket",
		eventTypes: {
			upsert: "work:ticket-upserted",
			delete: "work:ticket-deleted",
		},
		snapshot: (sql, org) =>
			sql<
				AnyRow[]
			>`SELECT t.*, b.slug AS board_slug FROM task t JOIN "board" b ON b.id = t.board_id WHERE b.organization_id = ${org} ORDER BY t.created_at, t.id`,
		publicOf: ticketPublic,
		electric: { id: idCol, title: text, board_id: text },
	},
	label: {
		table: "work_label",
		eventTypes: { upsert: "work:label-upserted", delete: "work:label-deleted" },
		snapshot: (sql, org) =>
			sql<AnyRow[]>`SELECT l.* FROM label l
				WHERE l.organization_id = ${org}
				OR EXISTS (SELECT 1 FROM task t JOIN "board" b ON b.id = t.board_id
					WHERE t.id = l.task_id AND b.organization_id = ${org})
				ORDER BY l.created_at, l.id`,
		publicOf: labelPublic,
		electric: { id: idCol, name: text },
	},
	task_template: {
		table: "work_task_template",
		eventTypes: {
			upsert: "work:template-upserted",
			delete: "work:template-deleted",
		},
		snapshot: (sql, org) =>
			sql<
				AnyRow[]
			>`SELECT tt.* FROM task_template tt WHERE tt.organization_id = ${org} ORDER BY tt.created_at, tt.id`,
		publicOf: templatePublic,
		electric: { id: idCol, name: text },
	},
	flag_type: {
		table: "work_flag_type",
		eventTypes: {
			upsert: "work:flag-type-upserted",
			delete: "work:flag-type-deleted",
		},
		snapshot: (sql, org) =>
			sql<
				AnyRow[]
			>`SELECT f.* FROM flag_type f JOIN "board" b ON b.id = f.board_id WHERE b.organization_id = ${org} ORDER BY f.created_at, f.id`,
		publicOf: flagTypePublic,
		electric: { id: idCol, name: text },
	},
	task_flag: {
		table: "work_task_flag",
		eventTypes: {
			upsert: "work:task-flag-upserted",
			// resolve is an upsert; rows are never deleted through work events
			delete: "work:task-flag-upserted",
		},
		snapshot: (sql, org) =>
			sql<
				AnyRow[]
			>`SELECT f.* FROM task_flag f JOIN task t ON t.id = f.task_id JOIN "board" b ON b.id = t.board_id WHERE b.organization_id = ${org} ORDER BY f.created_at, f.id`,
		publicOf: taskFlagPublic,
		electric: { id: idCol, task_id: text },
	},
};

/** Wire schemas: streamed row shape per collection. */
export const workElectricSchema: Record<
	string,
	Record<string, unknown>
> = Object.fromEntries(
	Object.values(PROJECTIONS).map((projection) => [
		projection.table,
		projection.electric,
	]),
);

const upcasters = new WorkUpcasterRegistry();

/** Map event rows to Electric-shaped messages for one collection. */
export async function tailMessages(
	sql: Sql,
	org: string,
	collection: WorkCollection,
	afterSeq: string,
): Promise<ShapeMessage[]> {
	const projection = PROJECTIONS[collection];
	const events = await sql`
		SELECT seq::text AS seq, txid::text AS txid, plugin_type, payload, schema_version
		FROM event
		WHERE org = ${org} AND seq > ${afterSeq}
			AND plugin_type IN (${projection.eventTypes.upsert}, ${projection.eventTypes.delete})
		ORDER BY seq LIMIT 100`;
	const messages: ShapeMessage[] = [];
	for (const event of events) {
		if (
			!upcasters.supports(event.plugin_type) ||
			event.schema_version !== WORK_SCHEMA_VERSION
		)
			throw new Error("Unsupported event schema");
		const payload = upcasters.decode(
			event.plugin_type,
			event.schema_version,
			event.payload,
		);
		const isDelete =
			event.plugin_type === projection.eventTypes.delete &&
			collection !== "task_flag";
		messages.push({
			key: JSON.stringify([org, payload.id]),
			value: isDelete
				? { org, id: payload.id }
				: { org, ...(payload.row as object), last_seq: event.seq },
			headers: {
				operation: isDelete ? "delete" : "update",
				relation: ["public", projection.table],
				txids: [Number(event.txid)],
			},
		});
	}
	return messages;
}

/** Snapshot rows for a collection: Public-mapped, org-scoped (§4). */
export async function snapshotMessages(
	sql: Sql,
	org: string,
	collection: WorkCollection,
): Promise<ShapeMessage[]> {
	const projection = PROJECTIONS[collection];
	const rows = await projection.snapshot(sql, org);
	return rows.map((row) => ({
		key: JSON.stringify([org, String(row.id)]),
		value: { org, ...projection.publicOf(row), last_seq: "0" },
		headers: {
			operation: "insert",
			relation: ["public", projection.table],
		},
	}));
}
