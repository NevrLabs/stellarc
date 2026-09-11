import type { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";
import type Task from "@/types/task";

export type Board = Extract<
  InferResponseType<(typeof client)["board"][":id"]["$get"], 200>,
  { id: string }
>;

type TasksApiResponse = InferResponseType<
  (typeof client)["task"]["tasks"][":boardId"]["$get"],
  200
>;

type BoardWithTasksRaw = TasksApiResponse["data"];

export type BoardWithTasks = Omit<
  BoardWithTasksRaw,
  "archivedTasks" | "columns" | "plannedTasks"
> & {
  archivedTasks: Task[];
  columns: Array<
    Omit<BoardWithTasksRaw["columns"][number], "tasks"> & {
      tasks: Task[];
    }
  >;
  plannedTasks: Task[];
};
