// STL-21 §5: collection descriptors for the four dependency-free project
// sync collections. Mirrors packages/contracts/src/shape.ts's role for the
// T0 probe collection: the UI keeps a static description of each collection
// (wire table name + electric schema) so a subscriber can open a shape
// without importing server code. Satellite collections (board/repo/table/
// ticket links) stay wave-2-gated with STL-16/18.

export type ProjectCollectionName =
  | "project"
  | "project_slug_alias"
  | "project_milestone"
  | "project_update";

type ColumnSpec = { type: string; not_null?: boolean; pk_index?: number };

export const PROJECT_COLLECTIONS: Record<
  ProjectCollectionName,
  { table: string; schema: Record<string, ColumnSpec> }
> = {
  project: {
    table: "project",
    schema: {
      id: { type: "text", not_null: true, pk_index: 0 },
      organization_id: { type: "text", not_null: true },
      slug: { type: "text", not_null: true },
      name: { type: "text", not_null: true },
      icon: { type: "text" },
      color: { type: "text" },
      summary: { type: "text", not_null: true },
      description: { type: "text" },
      success_criteria: { type: "text" },
      status: { type: "text", not_null: true },
      priority: { type: "text" },
      lead_user_id: { type: "text", not_null: true },
      lead_team_id: { type: "text" },
      start_date: { type: "text" },
      target_date: { type: "text" },
      org_privilege: { type: "text" },
      archived_at: { type: "timestamp" },
      archived_by: { type: "text" },
      created_at: { type: "timestamp", not_null: true },
      updated_at: { type: "timestamp", not_null: true },
      created_by: { type: "text", not_null: true },
    },
  },
  project_slug_alias: {
    table: "project_slug_alias",
    schema: {
      id: { type: "text", not_null: true, pk_index: 0 },
      organization_id: { type: "text", not_null: true },
      project_id: { type: "text", not_null: true },
      slug: { type: "text", not_null: true },
      created_at: { type: "timestamp", not_null: true },
    },
  },
  project_milestone: {
    table: "project_milestone",
    schema: {
      id: { type: "text", not_null: true, pk_index: 0 },
      project_id: { type: "text", not_null: true },
      name: { type: "text", not_null: true },
      description: { type: "text" },
      target_date: { type: "text" },
      rank: { type: "int4", not_null: true },
      completed_at: { type: "timestamp" },
      completed_by: { type: "text" },
      created_at: { type: "timestamp", not_null: true },
      updated_at: { type: "timestamp", not_null: true },
    },
  },
  project_update: {
    table: "project_update",
    schema: {
      id: { type: "text", not_null: true, pk_index: 0 },
      organization_id: { type: "text", not_null: true },
      project_id: { type: "text", not_null: true },
      author_id: { type: "text", not_null: true },
      content: { type: "text", not_null: true },
      health: { type: "text", not_null: true },
      edit_history: { type: "json", not_null: true },
      created_at: { type: "timestamp", not_null: true },
      updated_at: { type: "timestamp", not_null: true },
    },
  },
};

/** Build the /orgs/:org/v1/shape URL for a collection. */
export function projectShapeUrl(
  collection: ProjectCollectionName,
  org: string,
  offset = "-1",
  handle?: string,
): string {
  const params = new URLSearchParams({ table: collection, offset });
  if (handle) params.set("handle", handle);
  return `/orgs/${encodeURIComponent(org)}/v1/shape?${params.toString()}`;
}
