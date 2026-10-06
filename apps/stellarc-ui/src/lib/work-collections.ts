import { createCollection } from "@tanstack/db";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";

/** STL-16 §4: the five frozen views read live collections, not React Query
 * snapshots with a decorative connection. Eight explicit projections
 * (board, board_key_alias, status, ticket, label, task_template, flag_type,
 * task_flag). Virtual statuses are client-static taxonomy — never streamed.
 *
 * Every collection is org+principal scoped: the shape handle carries the
 * bearer header; revocation invalidates handles server-side (T1 mechanism,
 * reused). Handles are created per-org via workCollections(); the module
 * itself holds no singleton state. */

export type WorkRow = {
  org: string;
  id: string;
  last_seq: string;
  [key: string]: unknown;
};

export type WorkCollectionName =
  | "work_board"
  | "work_board_key_alias"
  | "work_status"
  | "work_ticket"
  | "work_label"
  | "work_task_template"
  | "work_flag_type"
  | "work_task_flag";

export const WORK_COLLECTION_NAMES: readonly WorkCollectionName[] = [
  "work_board",
  "work_board_key_alias",
  "work_status",
  "work_ticket",
  "work_label",
  "work_task_template",
  "work_flag_type",
  "work_task_flag",
] as const;

export type WorkCollectionHandle = ReturnType<typeof createWorkCollection>;

function createWorkCollection<T extends WorkRow>(
  name: WorkCollectionName,
  org: string,
  authorization: string,
  baseUrl: string,
  getKey: (row: T) => string,
) {
  return createCollection(
    electricCollectionOptions<T>({
      id: `${name}-${org}`,
      getKey,
      shapeOptions: {
        url: `${baseUrl}/orgs/${encodeURIComponent(org)}/v1/shape`,
        params: { table: name },
        headers: { authorization },
      },
    }),
  );
}

/** One live handle set per org. `baseUrl` is the API origin (no /api suffix —
 * the shape endpoint is versioned at /orgs/:org/v1/shape). */
export function workCollections(
  org: string,
  authorization: string,
  baseUrl: string,
) {
  const board = createWorkCollection<WorkRow & { slug: string; name: string }>(
    "work_board",
    org,
    authorization,
    baseUrl,
    (row) => JSON.stringify([row.org, row.id]),
  );
  const boardKeyAlias = createWorkCollection<WorkRow & { key: string }>(
    "work_board_key_alias",
    org,
    authorization,
    baseUrl,
    (row) => JSON.stringify([row.org, row.id]),
  );
  const status = createWorkCollection<
    WorkRow & { boardId: string; slug: string; position: number }
  >("work_status", org, authorization, baseUrl, (row) =>
    JSON.stringify([row.org, row.id]),
  );
  const ticket = createWorkCollection<
    WorkRow & { boardId: string; title: string; number: number }
  >("work_ticket", org, authorization, baseUrl, (row) =>
    JSON.stringify([row.org, row.id]),
  );
  const label = createWorkCollection<WorkRow & { name: string; color: string }>(
    "work_label",
    org,
    authorization,
    baseUrl,
    (row) => JSON.stringify([row.org, row.id]),
  );
  const taskTemplate = createWorkCollection<WorkRow & { name: string }>(
    "work_task_template",
    org,
    authorization,
    baseUrl,
    (row) => JSON.stringify([row.org, row.id]),
  );
  const flagType = createWorkCollection<
    WorkRow & { boardId: string; name: string }
  >("work_flag_type", org, authorization, baseUrl, (row) =>
    JSON.stringify([row.org, row.id]),
  );
  const taskFlag = createWorkCollection<WorkRow & { taskId: string }>(
    "work_task_flag",
    org,
    authorization,
    baseUrl,
    (row) => JSON.stringify([row.org, row.id]),
  );
  return {
    board,
    boardKeyAlias,
    status,
    ticket,
    label,
    taskTemplate,
    flagType,
    taskFlag,
    async cleanup() {
      await Promise.allSettled([
        board.cleanup(),
        boardKeyAlias.cleanup(),
        status.cleanup(),
        ticket.cleanup(),
        label.cleanup(),
        taskTemplate.cleanup(),
        flagType.cleanup(),
        taskFlag.cleanup(),
      ]);
    },
  };
}
