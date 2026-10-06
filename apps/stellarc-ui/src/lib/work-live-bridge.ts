import type { WorkRows } from "./work-view-model";

/**
 * STL-16 §4 (T28): live-collection bridge for the eight work collections.
 *
 * The frozen screens consume a `BoardWithTasks` view-model; this module owns
 * the bridge between the Electric-style live collections (org-scoped shapes
 * over `/orgs/:org/v1/shape`) and those screens:
 *
 *   - `workCollectionConfig()` describes the eight collections (work_board,
 *     work_board_key_alias, work_status, work_ticket, work_label,
 *     work_task_template, work_flag_type, work_task_flag) with org-scoped
 *     shape URLs.
 *   - `collectionRowsOf(handle)` returns rows only once the collection has
 *     committed its first sync (isReady), else []. No half-loaded boards.
 *   - `getRevision`/`subscribe` expose useSyncExternalStore plumbing.
 */

const API_HOST = "http://api.test";
const SHAPE_PATH = "/v1/shape";

/** Minimal structural type a TanStack/Electric collection must satisfy. */
export type LiveCollection = {
  isReady: () => boolean;
  toArray: () => unknown[];
  subscribeChanges: (cb: () => void) => { unsubscribe: () => void };
  _stateRevision: number;
};

export type Handle = {
  table: keyof WorkRows | string;
  collection: LiveCollection;
  shapeUrl: (org: string) => string;
  getRevision: (c: LiveCollection) => number;
  subscribe: (c: LiveCollection, cb: () => void) => { unsubscribe: () => void };
};

export function collectionRowsOf(handle: Handle): Record<string, unknown>[] {
  if (!handle.collection.isReady()) return [];
  return handle.collection.toArray() as Record<string, unknown>[];
}

export function workCollectionConfig(apiHost: string = API_HOST) {
  const mk = (table: string): Handle => ({
    table,
    collection: undefined as unknown as LiveCollection,
    shapeUrl: (org: string) => `${apiHost}/orgs/${org}${SHAPE_PATH}`,
    getRevision: (c) => c._stateRevision,
    subscribe: (c, cb) => c.subscribeChanges(cb),
  });
  return {
    collections: [
      mk("work_board"),
      mk("work_board_key_alias"),
      mk("work_status"),
      mk("work_ticket"),
      mk("work_label"),
      mk("work_task_template"),
      mk("work_flag_type"),
      mk("work_task_flag"),
    ],
    get board() {
      return this.collections[0];
    },
  };
}
