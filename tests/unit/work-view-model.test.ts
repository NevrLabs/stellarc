import { expect, test } from "vitest";
import { buildBoardWithTasks } from "../../apps/stellarc-ui/src/lib/work-view-model";
import type { WorkRows } from "../../apps/stellarc-ui/src/lib/work-view-model";

// T28 (unit half): the pure mapper from live work collections to the fork
// BoardWithTasks shape the frozen screens consume. Known answers mirror the
// fork's get-tasks.ts grouping (#226 semantics) with the exported KTEST
// dataset reduced to a deterministic fixture.

const board = {
  id: "b1",
  organizationId: "org-1",
  slug: "KTEST",
  icon: "FlaskConical",
  name: "Kaneo Test",
  description: "Isolated test project",
  createdAt: "2026-07-20T00:00:00.000Z",
  isPublic: false,
  archivedAt: null,
  lastTaskNumber: 1406,
  orgPrivilege: null,
  taskStatusOrder: ["to-do", "in-progress", "in-review", "done", "canceled", "duplicate"],
  backlogStatusOrder: ["triage", "planned"],
  subtaskDepthLimit: 4,
  defaultAssigneeId: "user-a",
  defaultAssigneeTeamId: null,
};

const statuses = [
  ["to-do", "To Do", 0, false],
  ["in-progress", "In Progress", 1, false],
  ["in-review", "In Review", 2, false],
  ["done", "Done", 3, true],
].map(([slug, name, position, isFinal]) => ({
  id: slug as string,
  boardId: "b1",
  name: name as string,
  slug: slug as string,
  position: position as number,
  icon: null,
  color: null,
  isFinal: isFinal as boolean,
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
}));

const t = (n: number, over: Record<string, unknown> = {}) => ({
  id: `t${n}`,
  boardId: "b1",
  position: n,
  number: n,
  assigneeId: null,
  teamAssigneeId: null,
  title: `Task ${n}`,
  description: null,
  descriptionHistory: [],
  status: "to-do",
  columnId: "to-do",
  priority: "no-priority",
  milestoneId: null,
  archivedAt: null,
  archivedBy: null,
  deletedAt: null,
  deletedBy: null,
  startDate: null,
  dueDate: null,
  createdAt: "2026-07-21T00:00:00.000Z",
  updatedAt: "2026-07-21T00:00:00.000Z",
  key: `KTEST-${n}`,
  ...over,
});

const rows: WorkRows = {
  board: [board],
  boardKeyAlias: [],
  status: statuses,
  ticket: [
    t(1),
    t(2, { status: "in-progress", columnId: "in-progress" }),
    t(3, { status: "done", columnId: "done" }),
    // #226: archived ticket keeps its real status, hidden from columns.
    t(4, { status: "to-do", archivedAt: "2026-08-01T00:00:00.000Z" }),
    // Backlog virtuals never enter columns.
    t(5, { status: "planned", columnId: null }),
    t(6, { status: "triage", columnId: null }),
    // Deleted tickets are invisible everywhere in the frozen five.
    t(7, { deletedAt: "2026-08-02T00:00:00.000Z" }),
  ],
  label: [
    {
      id: "l1",
      name: "sync",
      color: "#2563eb",
      source: "kaneo",
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:00.000Z",
      taskId: "t1",
      organizationId: null,
    },
  ],
  taskTemplate: [],
  flagType: [],
  taskFlag: [],
};

test("T28-unit: mapper groups tickets into fork columns with #226 archival semantics", () => {
  const result = buildBoardWithTasks(rows, "b1");
  expect(result).toBeDefined();
  expect(result.name).toBe("Kaneo Test");
  expect(result.columns.map((c) => c.id)).toEqual([
    "to-do",
    "in-progress",
    "in-review",
    "done",
  ]);
  const bySlug = Object.fromEntries(
    result.columns.map((c) => [c.id, c.tasks.map((x) => x.id)]),
  );
  expect(bySlug["to-do"]).toEqual(["t1"]); // t4 archived, t7 deleted
  expect(bySlug["in-progress"]).toEqual(["t2"]);
  expect(bySlug["done"]).toEqual(["t3"]);
  expect(result.plannedTasks.map((x) => x.id)).toEqual(["t5"]);
  expect(result.triageTasks?.map((x) => x.id)).toEqual(["t6"]);
  expect(result.archivedTasks.map((x) => x.id)).toEqual(["t4"]);
  // Archived keeps real status; deleted stays out of every bucket.
  expect(result.archivedTasks[0].status).toBe("to-do");
});

test("T28-unit: task rows map to the fork Task type (title, key, dates, labels)", () => {
  const result = buildBoardWithTasks(rows, "b1");
  const task1 = result.columns
    .find((c) => c.id === "to-do")
    ?.tasks.find((x) => x.id === "t1");
  expect(task1).toBeDefined();
  expect(task1?.title).toBe("Task 1");
  expect(task1?.number).toBe(1);
  expect(task1?.status).toBe("to-do");
  expect(task1?.priority).toBe("no-priority");
  expect(task1?.userId).toBeNull();
  expect(task1?.labels).toEqual([
    { id: "l1", name: "sync", color: "#2563eb" },
  ]);
  expect(task1?.createdAt).toBe("2026-07-21T00:00:00.000Z");
});

test("T28-unit: board not in rows returns undefined (no silent fallback)", () => {
  expect(buildBoardWithTasks(rows, "other-board")).toBeUndefined();
});

test("T28-unit: unknown-status ticket never leaks into columns (fail-safe grouping)", () => {
  const orphan = {
    ...rows,
    ticket: [...rows.ticket, t(8, { status: "weird", columnId: null })],
  };
  const result = buildBoardWithTasks(orphan, "b1");
  const allColumnIds = result.columns.flatMap((c) => c.tasks.map((x) => x.id));
  expect(allColumnIds).not.toContain("t8");
});
