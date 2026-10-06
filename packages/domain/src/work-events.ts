import { Schema } from "effect";
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

// pluginId `work`, schema_version 1 throughout (§2). Payloads carry exactly the
// fields below — no description bodies, notes, or titles beyond the row itself.
export const WORK_SCHEMA_VERSION = 1;

const Id = Schema.String;

export const BoardUpserted = Schema.Struct({ id: Id, row: BoardPublic });
export const BoardDeleted = Schema.Struct({ id: Id });
export const BoardKeyUpserted = Schema.Struct({ id: Id, row: KeyAliasPublic });
export const BoardKeyDeleted = Schema.Struct({ id: Id });
export const StatusUpserted = Schema.Struct({ id: Id, row: StatusPublic });
export const StatusDeleted = Schema.Struct({ id: Id });
export const TicketUpserted = Schema.Struct({ id: Id, row: TicketPublic });
export const TicketDeleted = Schema.Struct({ id: Id });
export const TicketStatusChanged = Schema.Struct({
	id: Id,
	boardId: Id,
	from: Schema.String,
	to: Schema.String,
});
export const LabelUpserted = Schema.Struct({ id: Id, row: LabelPublic });
export const LabelDeleted = Schema.Struct({ id: Id });
export const TemplateUpserted = Schema.Struct({ id: Id, row: TemplatePublic });
export const TemplateDeleted = Schema.Struct({ id: Id });
export const FlagTypeUpserted = Schema.Struct({ id: Id, row: FlagTypePublic });
export const FlagTypeDeleted = Schema.Struct({ id: Id });
export const TaskFlagUpserted = Schema.Struct({ id: Id, row: TaskFlagPublic });

export const WorkEventPayloadSchemas = {
	"work:board-upserted": BoardUpserted,
	"work:board-deleted": BoardDeleted,
	"work:board-key-upserted": BoardKeyUpserted,
	"work:board-key-deleted": BoardKeyDeleted,
	"work:status-upserted": StatusUpserted,
	"work:status-deleted": StatusDeleted,
	"work:ticket-upserted": TicketUpserted,
	"work:ticket-deleted": TicketDeleted,
	"work:ticket-status-changed": TicketStatusChanged,
	"work:label-upserted": LabelUpserted,
	"work:label-deleted": LabelDeleted,
	"work:template-upserted": TemplateUpserted,
	"work:template-deleted": TemplateDeleted,
	"work:flag-type-upserted": FlagTypeUpserted,
	"work:flag-type-deleted": FlagTypeDeleted,
	"work:task-flag-upserted": TaskFlagUpserted,
} as const;

export type WorkEventType = keyof typeof WorkEventPayloadSchemas;
