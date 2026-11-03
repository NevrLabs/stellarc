import { Schema } from "effect";

/**
 * Stellarc working-domain row models (NEVR-430, ADR 0014 §Decision 1).
 *
 * One class per table in packages/db/migrations/0008_stellarc_domain.sql,
 * field-for-field and constraint-for-constraint: the property names ARE the
 * column names (these model database rows, not API DTOs — the HttpApi layer
 * maps them to its own camelCase contracts). Timestamps are `Schema.Date`
 * because the postgres driver returns `Date`; calendar dates stay
 * 'yyyy-mm-dd' strings; enums mirror the CHECK constraints exactly.
 *
 * Every table is org-scoped (`org_id` NOT NULL referencing organization(id))
 * and carries `import_source` (NULL for rows born in Stellarc, the Kaneo row
 * id for imported rows — the one-shot import's idempotency key).
 */

/** #rrggbb, per the color CHECK on status and label. */
export const Color = Schema.String.pipe(
	Schema.check(Schema.isPattern(/^#[0-9a-fA-F]{6}$/)),
);

/** Calendar date column ('2026-11-02'); never a timestamp. */
export const CalendarDate = Schema.String.pipe(
	Schema.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
);

/** Ticket priority, per ticket.priority CHECK (docs/design/shell data.js pri). */
export const Priority = Schema.Literals([
	"urgent",
	"high",
	"medium",
	"low",
	"none",
] as const);

/** Directed ticket-to-ticket edge, per ticket_relation.relation CHECK. */
export const Relation = Schema.Literals([
	"blocks",
	"blocked_by",
	"relates_to",
	"duplicates",
] as const);

/** grant.resource_type CHECK — extend with the repo/integration migrations. */
export const GrantResourceType = Schema.Literals(["board", "project"] as const);

/** grant.capability CHECK, the organization.default_resource_privilege family. */
export const GrantCapability = Schema.Literals([
	"view",
	"edit",
	"manage",
] as const);

/** Free-form activity detail (activity.payload jsonb). */
export const ActivityPayload = Schema.Record(Schema.String, Schema.Unknown);

const Timestamp = Schema.Date;
const ImportSource = Schema.NullOr(Schema.String);

export class Board extends Schema.Class<Board>("Board")({
	id: Schema.String,
	org_id: Schema.String,
	name: Schema.NonEmptyString,
	description: Schema.String,
	position: Schema.Number,
	import_source: ImportSource,
	created_by: Schema.String,
	created_at: Timestamp,
	updated_at: Timestamp,
	archived_at: Schema.NullOr(Timestamp),
}) {}

export class Status extends Schema.Class<Status>("Status")({
	id: Schema.String,
	org_id: Schema.String,
	board_id: Schema.String,
	name: Schema.NonEmptyString,
	color: Schema.NullOr(Color),
	position: Schema.Number,
	import_source: ImportSource,
	created_at: Timestamp,
}) {}

export class Ticket extends Schema.Class<Ticket>("Ticket")({
	id: Schema.String,
	org_id: Schema.String,
	board_id: Schema.String,
	status_id: Schema.String,
	key: Schema.NonEmptyString,
	number: Schema.Number,
	title: Schema.NonEmptyString,
	description: Schema.String,
	priority: Priority,
	assignee_principal_id: Schema.NullOr(Schema.String),
	milestone_id: Schema.NullOr(Schema.String),
	start_date: Schema.NullOr(CalendarDate),
	due_date: Schema.NullOr(CalendarDate),
	position: Schema.Number,
	import_source: ImportSource,
	created_by: Schema.String,
	created_at: Timestamp,
	updated_at: Timestamp,
}) {}

export class TicketRelation extends Schema.Class<TicketRelation>(
	"TicketRelation",
)({
	id: Schema.String,
	org_id: Schema.String,
	ticket_id: Schema.String,
	related_ticket_id: Schema.String,
	relation: Relation,
	import_source: ImportSource,
	created_by: Schema.String,
	created_at: Timestamp,
}) {}

export class Label extends Schema.Class<Label>("Label")({
	id: Schema.String,
	org_id: Schema.String,
	name: Schema.NonEmptyString,
	color: Schema.NullOr(Color),
	import_source: ImportSource,
	created_by: Schema.String,
	created_at: Timestamp,
}) {}

export class TicketLabel extends Schema.Class<TicketLabel>("TicketLabel")({
	org_id: Schema.String,
	ticket_id: Schema.String,
	label_id: Schema.String,
	import_source: ImportSource,
	created_at: Timestamp,
}) {}

export class Milestone extends Schema.Class<Milestone>("Milestone")({
	id: Schema.String,
	org_id: Schema.String,
	board_id: Schema.String,
	name: Schema.NonEmptyString,
	description: Schema.String,
	due_date: Schema.NullOr(CalendarDate),
	completed_at: Schema.NullOr(Timestamp),
	import_source: ImportSource,
	created_by: Schema.String,
	created_at: Timestamp,
	updated_at: Timestamp,
}) {}

export class Project extends Schema.Class<Project>("Project")({
	id: Schema.String,
	org_id: Schema.String,
	name: Schema.NonEmptyString,
	description: Schema.String,
	position: Schema.Number,
	import_source: ImportSource,
	created_by: Schema.String,
	created_at: Timestamp,
	updated_at: Timestamp,
	archived_at: Schema.NullOr(Timestamp),
}) {}

export class ProjectBoard extends Schema.Class<ProjectBoard>("ProjectBoard")({
	org_id: Schema.String,
	project_id: Schema.String,
	board_id: Schema.String,
	position: Schema.Number,
	import_source: ImportSource,
	created_at: Timestamp,
}) {}

export class Comment extends Schema.Class<Comment>("Comment")({
	id: Schema.String,
	org_id: Schema.String,
	ticket_id: Schema.String,
	body: Schema.NonEmptyString,
	import_source: ImportSource,
	created_by: Schema.String,
	created_at: Timestamp,
	updated_at: Timestamp,
}) {}

export class Activity extends Schema.Class<Activity>("Activity")({
	id: Schema.String,
	org_id: Schema.String,
	ticket_id: Schema.NullOr(Schema.String),
	type: Schema.NonEmptyString,
	payload: ActivityPayload,
	import_source: ImportSource,
	actor_principal_id: Schema.NullOr(Schema.String),
	created_at: Timestamp,
}) {}

export class Subscriber extends Schema.Class<Subscriber>("Subscriber")({
	org_id: Schema.String,
	ticket_id: Schema.String,
	principal_id: Schema.String,
	import_source: ImportSource,
	created_at: Timestamp,
}) {}

export class Grant extends Schema.Class<Grant>("Grant")({
	org_id: Schema.String,
	principal_id: Schema.String,
	resource_type: GrantResourceType,
	resource_id: Schema.NonEmptyString,
	capability: GrantCapability,
	import_source: ImportSource,
	created_at: Timestamp,
}) {}

/** Every 0008 table, for catalog assertions and the Kaneo import walker. */
export const STELLARC_DOMAIN_TABLES = [
	"board",
	"status",
	"ticket",
	"ticket_relation",
	"label",
	"ticket_label",
	"milestone",
	"project",
	"project_board",
	"comment",
	"activity",
	"subscriber",
	"grant",
] as const;
