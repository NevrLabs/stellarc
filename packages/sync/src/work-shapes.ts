import { Schema } from "effect";
import type { Sql } from "postgres";
import {
	WorkEventPayloadSchemas,
	WORK_SCHEMA_VERSION,
} from "../../domain/src/work-events";
import {
	BoardPublic,
	FlagTypePublic,
	KeyAliasPublic,
	LabelPublic,
	StatusPublic,
	TaskFlagPublic,
	TemplatePublic,
	TicketPublic,
} from "../../contracts/src/work";
import { WorkUpcasterRegistry } from "./work-upcasters";

/** §4: eight explicit work projections. Virtual statuses are client-static
 * taxonomy — never streamed. Deletes stream as deletes. */
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

type Projection = {
	table: string; // streamed relation name
	eventTypes: { upsert: string; delete: string };
	decode: (payload: { id: string; row?: unknown }) => { id: string; row?: unknown };
	where: (org: string) => string;
};

const PROJECTIONS: Record<WorkCollection, Projection> = {
	board: {
		table: "work_board",
		eventTypes: { upsert: "work:board-upserted", delete: "work:board-deleted" },
		decode: (p) => p,
		where: (org) => `b.organization_id = '${org.replaceAll("'", "''")}'`,
	},
	board_key_alias: {
		table: "work_board_key_alias",
		eventTypes: {
			upsert: "work:board-key-upserted",
			delete: "work:board-key-deleted",
		},
		decode: (p) => p,
		where: (org) => `a.organization_id = '${org.replaceAll("'", "''")}'`,
	},
	status: {
		table: "work_status",
		eventTypes: { upsert: "work:status-upserted", delete: "work:status-deleted" },
		decode: (p) => p,
		where: (org) => `b.organization_id = '${org.replaceAll("'", "''")}'`,
	},
	ticket: {
		table: "work_ticket",
		eventTypes: {
			upsert: "work:ticket-upserted",
			delete: "work:ticket-deleted",
		},
		decode: (p) => p,
		where: (org) => `b.organization_id = '${org.replaceAll("'", "''")}'`,
	},
	label: {
		table: "work_label",
		eventTypes: { upsert: "work:label-upserted", delete: "work:label-deleted" },
		decode: (p) => p,
		where: (org) =>
			`(l.organization_id = '${org.replaceAll("'", "''")}' OR l.task_id IN (SELECT t.id FROM task t JOIN "board" b2 ON b2.id = t.board_id WHERE b2.organization_id = '${org.replaceAll("'", "''")}'))`,
	},
	task_template: {
		table: "work_task_template",
		eventTypes: {
			upsert: "work:template-upserted",
			delete: "work:template-deleted",
		},
		decode: (p) => p,
		where: (org) => `tt.organization_id = '${org.replaceAll("'", "''")}'`,
	},
	flag_type: {
		table: "work_flag_type",
		eventTypes: {
			upsert: "work:flag-type-upserted",
			delete: "work:flag-type-deleted",
		},
		decode: (p) => p,
		where: (org) => `b.organization_id = '${org.replaceAll("'", "''")}'`,
	},
	task_flag: {
		table: "work_task_flag",
		eventTypes: {
			upsert: "work:task-flag-upserted",
			delete: "work:task-flag-upserted", // resolve is an upsert; rows are kept
		},
		decode: (p) => p,
		where: (org) =>
			`EXISTS (SELECT 1 FROM task t2 JOIN "board" b2 ON b2.id = t.board_id WHERE t2.id = f.task_id AND b2.organization_id = '${org.replaceAll("'", "''")}')`,
	},
};

// Wire schemas: streamed row shape per collection (camelCase Public rows plus
// the sync envelope columns). Unknown versions fail closed via upcasters.
export const workElectricSchema: Record<string, Record<string, unknown>> = {
	work_board: electricFor(BoardPublic),
	work_board_key_alias: electricFor(KeyAliasPublic),
	work_status: electricFor(StatusPublic),
	work_ticket: electricFor(TicketPublic),
	work_label: electricFor(LabelPublic),
	work_task_template: electricFor(TemplatePublic),
	work_flag_type: electricFor(FlagTypePublic),
	work_task_flag: electricFor(TaskFlagPublic),
};

function electricFor(schema: Schema.Schema.All): Record<string, unknown> {
	void schema;
	return { id: { type: "text", not_null: true, pk_index: 0 } };
}

const upcasters = new WorkUpcasterRegistry();

/** Map event rows to Electric-shaped messages for one collection. */
export async function tailMessages(
	sql: Sql,
	org: string,
	collection: WorkCollection,
	afterSeq: string,
): Promise<Array<{ key: string; value: unknown; headers: Record<string, unknown> }>> {
	const projection = PROJECTIONS[collection];
	const events = await sql`
		SELECT seq::text AS seq, txid::text AS txid, plugin_type, payload, schema_version
		FROM event
		WHERE org = ${org} AND seq > ${afterSeq}
			AND plugin_type IN (${projection.eventTypes.upsert}, ${projection.eventTypes.delete})
		ORDER BY seq LIMIT 100`;
	const messages: Array<{ key: string; value: unknown; headers: Record<string, unknown> }> = [];
	for (const event of events) {
		if (!upcasters.supports(event.plugin_type) || event.schema_version !== WORK_SCHEMA_VERSION)
			throw new Error("Unsupported event schema");
		const payload = upcasters.decode(event.plugin_type, event.schema_version, event.payload);
		const isDelete = event.plugin_type === projection.eventTypes.delete && collection !== "task_flag";
		messages.push({
			key: JSON.stringify([org, payload.id]),
			value: isDelete ? { org, id: payload.id } : { org, ...(payload.row as object), last_seq: event.seq },
			headers: {
				operation: isDelete ? "delete" : "update",
				relation: ["public", projection.table],
				txids: [Number(event.txid)],
			},
		});
	}
	return messages;
}

export type ShapeMessage = {
	key: string;
	value: unknown;
	headers: Record<string, unknown>;
};

export { PROJECTIONS };
export type { Projection };
