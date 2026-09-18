import { expect, test } from "vitest";
import {
  collectionRowsOf,
  workCollectionConfig,
} from "../../apps/stellarc-ui/src/lib/work-live-bridge";

// T28 (bridge unit): the live-collection bridge selects the eight work
// collections for the active org, derives a stable snapshot per collection,
// and only reports rows once the collection is ready (no half-loaded board).

const fakeCollection = (rows: unknown[], ready: boolean, rev = 1) =>
  ({
    isReady: () => ready,
    toArray: () => rows,
    subscribeChanges: (cb: unknown) => {
      // A subscription handle that never fires; callers only need the shape.
      return { unsubscribe: () => {} };
    },
    get _stateRevision() {
      return rev;
    },
  }) as never;

test("T28-bridge: rows snapshot returns [] before first sync commit", () => {
  const c = workCollectionConfig().board;
  // Rows exist but sync has not committed yet — they must NOT surface.
  const notReady = fakeCollection([{ id: "phantom" }], false);
  expect(collectionRowsOf({ ...c, collection: notReady })).toEqual([]);
});

test("T28-bridge: ready collection exposes rows and a subscribe/revision pair", () => {
  const rows = [{ id: "b1", org: "o1", last_seq: "5" }];
  const handle = {
    ...workCollectionConfig().board,
    collection: fakeCollection(rows, true, 7),
  };
  const snap = collectionRowsOf(handle);
  expect(snap).toBe(rows);
  expect(handle.getRevision(handle.collection)).toBe(7);
  expect(typeof handle.subscribe(handle.collection, () => {})).toBe("object");
});

test("T28-bridge: all eight collections are configured with org-scoped shape URLs", () => {
  const cfg = workCollectionConfig();
  const names = cfg.collections.map((c) => c.table);
  expect(names).toEqual([
    "work_board",
    "work_board_key_alias",
    "work_status",
    "work_ticket",
    "work_label",
    "work_task_template",
    "work_flag_type",
    "work_task_flag",
  ]);
  for (const c of cfg.collections) {
    expect(c.shapeUrl("org-1")).toBe(
      `http://api.test/orgs/org-1/v1/shape`,
    );
  }
});
