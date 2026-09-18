import { useEffect, useMemo, useState } from "react";
import { workCollections } from "./work-collections";
import {
  buildBoardWithTasks,
  toTask,
  type WorkBoardRow,
  type WorkRows,
  type WorkTicketRow,
} from "./work-view-model";

/**
 * STL-16 §4/§6 (D1): the live-collection store powering the five frozen
 * screens. REST lists are bootstrap/compat only — these views read live
 * collections through the shape engine, not React Query snapshots with a
 * decorative connection.
 *
 * One handle-set per org lives in a module-level registry (not React state:
 * collections own browser resources and survive route changes). Screens
 * subscribe and re-derive the fork BoardWithTasks view-model from raw rows on
 * every revision bump.
 *
 * Auth: the shape endpoint is versioned at /orgs/:org/v1/shape and the bearer
 * grammar "Bearer <org> <principal>" is exactly what work-http's session()
 * parses; the UI passes the signed-in user's id as the principal.
 */

type Listener = () => void;

/** The eight collection keys of a workCollections() handle set. */
export const COLLECTION_KEYS = [
  "board",
  "boardKeyAlias",
  "status",
  "ticket",
  "label",
  "taskTemplate",
  "flagType",
  "taskFlag",
] as const;

type CollectionKey = (typeof COLLECTION_KEYS)[number];

/** Structural subset of the TanStack Collection surface the store relies on. */
export type LiveCollectionLike = {
  isReady: () => boolean;
  toArray: () => unknown[];
  preload: () => Promise<unknown>;
  subscribeChanges: (cb: () => void) => { unsubscribe: () => void };
};

type HandleSet = Record<CollectionKey, LiveCollectionLike>;

type OrgEntry = {
  handles: HandleSet;
  revision: number;
  listeners: Set<Listener>;
};

const registry = new Map<string, OrgEntry>();

function workBaseUrl(): string {
  if (typeof window === "undefined") return "";
  // Same-origin: dev/preview proxy /api and /orgs to the API origin; the
  // built bundle is served behind the same reverse proxy in production.
  return window.location.origin;
}

/** Create the handle set (seam: tests inject stub collections). */
function defaultHandles(org: string, authorization: string): HandleSet {
  return workCollections(
    org,
    authorization,
    workBaseUrl(),
  ) as unknown as HandleSet;
}

export function ensureOrgEntry(
  org: string,
  authorization: string,
  handlesOf: (org: string, authorization: string) => HandleSet = defaultHandles,
): OrgEntry {
  let entry = registry.get(org);
  if (!entry) {
    const handles = handlesOf(org, authorization);
    const listeners = new Set<Listener>();
    const created: OrgEntry = { handles, revision: 0, listeners };
    entry = created;
    registry.set(org, entry);
    for (const key of COLLECTION_KEYS) {
      created.handles[key].subscribeChanges(() => {
        created.revision += 1;
        for (const listener of created.listeners) listener();
      });
    }
    void Promise.all(
      COLLECTION_KEYS.map((key) =>
        Promise.resolve(created.handles[key].preload()).catch(() => undefined),
      ),
    );
  }
  return entry;
}

/**
 * Rows of all eight collections — undefined until EVERY collection's first
 * sync has committed (isReady). No half-loaded boards ever reach a screen.
 */
export function rowsOfEntry(entry: OrgEntry): WorkRows | undefined {
  const ready = COLLECTION_KEYS.every((key) => entry.handles[key].isReady());
  if (!ready) return undefined;
  const rows = {} as Record<CollectionKey, Record<string, unknown>[]>;
  for (const key of COLLECTION_KEYS) {
    rows[key] = entry.handles[key].toArray() as Record<string, unknown>[];
  }
  return rows as unknown as WorkRows;
}

/** React hook: raw rows of all eight collections for the org. */
export function useWorkRows(
  org: string,
  principal?: string | null,
): { rows: WorkRows | undefined } {
  const authorization = principal ? `Bearer ${org} ${principal}` : "";
  const entry = ensureOrgEntry(org, authorization);
  const [revision, setRevision] = useState(entry.revision);
  useEffect(() => {
    const flush = () => setRevision(entry.revision);
    entry.listeners.add(flush);
    flush();
    return () => {
      entry.listeners.delete(flush);
    };
  }, [entry]);
  void revision;
  return { rows: rowsOfEntry(entry) };
}

/**
 * React hook: live fork BoardWithTasks for one board, or undefined until the
 * collections commit. Powers the Kanban, list and backlog views (T28/T30/T32).
 */
export function useBoardWithTasksLive(
  org: string,
  boardId: string,
  principal?: string | null,
) {
  const { rows } = useWorkRows(org, principal);
  const board = useMemo(
    () => (rows && boardId ? buildBoardWithTasks(rows, boardId) : undefined),
    [rows, boardId],
  );
  return { board, isReady: board !== undefined };
}

/** Group live label rows by taskId — the toTask argument shape. */
function labelsByTaskOf(labelRows: WorkRows["label"]) {
  const map = new Map<
    string,
    Array<{ id: string; name: string; color: string }>
  >();
  for (const label of labelRows) {
    if (!label.taskId) continue;
    const list = map.get(label.taskId) ?? [];
    list.push({ id: label.id, name: label.name, color: label.color });
    map.set(label.taskId, list);
  }
  return map;
}

/**
 * React hook: one live ticket as the fork Task shape, plus its board row.
 * Powers the ticket detail sheet and page (T31).
 */
export function useWorkTicketLive(
  org: string,
  ticketId: string,
  principal?: string | null,
) {
  const { rows } = useWorkRows(org, principal);
  return useMemo(() => {
    if (!rows || !ticketId) return { task: undefined, board: undefined };
    const ticket = rows.ticket.find((t) => t.id === ticketId);
    const board = ticket
      ? rows.board.find((b) => b.id === ticket.boardId)
      : undefined;
    if (!ticket || !board) return { task: undefined, board: undefined };
    return {
      task: toTask(ticket as WorkTicketRow, labelsByTaskOf(rows.label)),
      board: board as WorkBoardRow,
    };
  }, [rows, ticketId]);
}

/**
 * React hook: the live org-wide board list ordered by createdAt (fork
 * sidebar order), mapped to the fork BoardWithTasks shape. Powers the
 * sidebar and slug resolution (T29).
 */
export function useWorkBoardListLive(org: string, principal?: string | null) {
  const { rows } = useWorkRows(org, principal);
  const boards = useMemo(() => {
    if (!rows) return undefined;
    return [...rows.board]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((row) => buildBoardWithTasks(rows, row.id))
      .filter((b): b is NonNullable<typeof b> => b !== undefined);
  }, [rows]);
  return { boards, isReady: boards !== undefined };
}
