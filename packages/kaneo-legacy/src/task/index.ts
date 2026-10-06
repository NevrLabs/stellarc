import { and, asc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import {
  assetTable,
  boardTable,
  organizationTable,
  taskTable,
} from "../database/schema";
import { getTaskRepoItemLinks } from "../repo/controllers/repo-task-links";
import { taskSchema } from "../schemas";
import {
  assertTaskImageKeyMatchesContext,
  createTaskImageUploadUrl,
  isImageContentType,
  validateTaskAssetUploadInput,
} from "../storage/s3";
import { normalizeApiServerUrl } from "../utils/openapi-spec";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";
import bulkUpdateTasks from "./controllers/bulk-update-tasks";
import createTask from "./controllers/create-task";
import deleteTask from "./controllers/delete-task";
import exportTasks from "./controllers/export-tasks";
import getMyTasks from "./controllers/get-my-tasks";
import getTask from "./controllers/get-task";
import getTasks from "./controllers/get-tasks";
import getTrashedTasks from "./controllers/get-trashed-tasks";
import importTasks from "./controllers/import-tasks";
import moveTask from "./controllers/move-task";
import permanentlyDeleteTask from "./controllers/permanently-delete-task";
import reorderTasks from "./controllers/reorder-tasks";
import restoreTask from "./controllers/restore-task";
import setTaskArchived from "./controllers/set-task-archived";
import setTaskFollowing, {
  isFollowingTask,
} from "./controllers/set-task-following";
import updateTask from "./controllers/update-task";
import updateTaskAssignee from "./controllers/update-task-assignee";
import updateTaskDescription from "./controllers/update-task-description";
import updateTaskDueDate from "./controllers/update-task-due-date";
import updateTaskPriority from "./controllers/update-task-priority";
import updateTaskStatus from "./controllers/update-task-status";
import updateTaskTitle from "./controllers/update-task-title";
import { VALID_PRIORITIES } from "./validate-task-fields";

const task = new Hono<{
  Variables: {
    userId: string;
  };
}>()
  .get(
    "/parent-candidates/:organizationId",
    validator("param", v.object({ organizationId: v.string() })),
    organizationAccess.fromParam("organizationId"),
    async (c) => {
      const { organizationId } = c.req.valid("param");
      return c.json(
        await db
          .select({
            id: taskTable.id,
            title: taskTable.title,
            number: taskTable.number,
            boardId: boardTable.id,
            boardName: boardTable.name,
            boardSlug: boardTable.slug,
          })
          .from(taskTable)
          .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
          .where(
            and(
              eq(boardTable.organizationId, organizationId),
              isNull(taskTable.deletedAt),
            ),
          )
          .orderBy(asc(boardTable.name), asc(taskTable.number)),
      );
    },
  )
  .get(
    "/my-tasks",
    describeRoute({
      operationId: "getMyTasks",
      tags: ["Tasks"],
      description:
        "Cross-board list of tasks related to the current user (assigned, created, or assigned to one of their teams)",
      responses: {
        200: {
          description: "Tasks related to the current user",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({
        organizationId: v.optional(v.string()),
        relation: v.optional(
          v.picklist(["assigned", "created", "team", "followed", "all"]),
        ),
        includeCompleted: v.optional(v.picklist(["true", "false"])),
        limit: v.optional(v.pipe(v.string(), v.transform(Number))),
        offset: v.optional(v.pipe(v.string(), v.transform(Number))),
      }),
    ),
    async (c) => {
      const userId = c.get("userId");
      const { organizationId, relation, includeCompleted, limit, offset } =
        c.req.valid("query");

      const tasks = await getMyTasks({
        userId,
        organizationId,
        relation: relation ?? "all",
        includeCompleted: includeCompleted === "true",
        limit,
        offset,
      });

      return c.json(tasks);
    },
  )
  .get(
    "/tasks/:boardId",
    describeRoute({
      operationId: "listTasks",
      tags: ["Tasks"],
      description: "Get all tasks for a specific board",
      responses: {
        200: {
          description: "Board with tasks organized by columns",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string() })),
    validator(
      "query",
      v.optional(
        v.object({
          status: v.optional(v.string()),
          priority: v.optional(v.string()),
          assigneeId: v.optional(v.string()),
          page: v.optional(v.pipe(v.string(), v.transform(Number))),
          limit: v.optional(v.pipe(v.string(), v.transform(Number))),
          sortBy: v.optional(
            v.picklist([
              "createdAt",
              "priority",
              "dueDate",
              "position",
              "title",
              "number",
            ]),
          ),
          sortOrder: v.optional(v.picklist(["asc", "desc"])),
          dueBefore: v.optional(v.string()),
          dueAfter: v.optional(v.string()),
        }),
      ),
    ),
    organizationAccess.fromBoard("boardId"),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const filters = c.req.valid("query") || {};

      const tasks = await getTasks(boardId, filters);

      return c.json(tasks);
    },
  )
  .patch(
    "/reorder/:boardId",
    describeRoute({
      operationId: "reorderTasks",
      tags: ["Tasks"],
      description: "Atomically update task positions after drag and drop",
      responses: {
        200: {
          description: "Task order updated successfully",
          content: {
            "application/json": {
              schema: resolver(
                v.object({ success: v.boolean(), updatedCount: v.number() }),
              ),
            },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        tasks: v.pipe(
          v.array(
            v.object({
              id: v.string(),
              position: v.pipe(v.number(), v.integer(), v.minValue(0)),
              status: v.string(),
            }),
          ),
          v.minLength(1),
        ),
      }),
    ),
    validator("param", v.object({ boardId: v.string() })),
    organizationAccess.fromBoard("boardId"),
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const { tasks } = c.req.valid("json");
      return c.json(await reorderTasks(boardId, tasks, c.get("userId")));
    },
  )
  .patch(
    "/bulk",
    describeRoute({
      operationId: "bulkUpdateTasks",
      tags: ["Tasks"],
      description: "Perform bulk operations on multiple tasks",
      responses: {
        200: {
          description: "Bulk operation completed successfully",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  success: v.boolean(),
                  updatedCount: v.number(),
                }),
              ),
            },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        taskIds: v.pipe(v.array(v.string()), v.minLength(1)),
        operation: v.picklist([
          "updateStatus",
          "updatePriority",
          "updateAssignee",
          "updateTeam",
          "delete",
          "addLabel",
          "removeLabel",
          "updateDueDate",
          // #226: archival is orthogonal to status, so it needs its own
          // operations — `updateStatus: "archived"` is no longer valid.
          "archive",
          "unarchive",
        ] as const),
        value: v.optional(v.nullable(v.string())),
      }),
    ),
    async (c) => {
      const { taskIds, operation, value } = c.req.valid("json");
      const userId = c.get("userId");

      if (!userId) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }

      if (
        operation !== "delete" &&
        operation !== "updateDueDate" &&
        // archive/unarchive carry their intent in the operation name itself;
        // they take no value, so requiring one would reject every call.
        operation !== "archive" &&
        operation !== "unarchive" &&
        value === undefined
      ) {
        throw new HTTPException(400, {
          message: "Value is required for this operation",
        });
      }

      const result = await bulkUpdateTasks({
        taskIds,
        operation,
        value,
        userId,
      });

      return c.json(result);
    },
  )
  .post(
    "/:boardId",
    describeRoute({
      operationId: "createTask",
      tags: ["Tasks"],
      description: "Create a new task in a board",
      responses: {
        200: {
          description: "Task created successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        title: v.string(),
        description: v.string(),
        startDate: v.optional(v.string()),
        dueDate: v.optional(v.string()),
        priority: v.picklist(VALID_PRIORITIES),
        status: v.string(),
        userId: v.optional(v.string()),
        teamId: v.optional(v.string()),
      }),
    ),
    organizationAccess.fromBoard("boardId"),
    requireOrganizationPermission({ task: ["create"] }),
    async (c) => {
      const { boardId } = c.req.param();
      const {
        title,
        description,
        startDate,
        dueDate,
        priority,
        status,
        userId,
        teamId,
      } = c.req.valid("json");

      const task = await createTask({
        boardId,
        currentUserId: c.get("userId"),
        userId,
        teamId,
        title,
        description,
        startDate: startDate ? new Date(startDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        priority,
        status,
      });

      return c.json(task);
    },
  )
  .get(
    "/:id",
    describeRoute({
      operationId: "getTask",
      tags: ["Tasks"],
      description: "Get a specific task by ID",
      responses: {
        200: {
          description: "Task details",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromTask(),
    async (c) => {
      const { id } = c.req.valid("param");

      const task = await getTask(id);

      return c.json(task);
    },
  )
  .get(
    "/:id/repo-links",
    describeRoute({
      operationId: "listTaskRepoLinks",
      tags: ["Tasks"],
      description: "List GitHub issues and pull requests linked to a task",
      responses: {
        200: {
          description: "Linked repository items",
          content: {
            "application/json": {
              schema: resolver(
                v.array(
                  v.object({
                    id: v.string(),
                    // #75: lets the client distinguish a synced issue from a
                    // merely linked one.
                    syncEnabled: v.boolean(),
                    itemType: v.picklist(["issues", "pull-requests"] as const),
                    repoId: v.string(),
                    number: v.number(),
                    title: v.string(),
                    state: v.string(),
                    url: v.string(),
                    createdAt: v.date(),
                  }),
                ),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromTask(),
    async (c) => {
      const { id } = c.req.valid("param");
      const links = await getTaskRepoItemLinks(id, c.get("organizationId"));
      return c.json(links);
    },
  )
  .put(
    "/move/:id",
    describeRoute({
      operationId: "moveTask",
      tags: ["Tasks"],
      description: "Move a task to another board",
      responses: {
        200: {
          description: "Task moved successfully",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  task: taskSchema,
                  sourceBoardId: v.string(),
                  destinationBoardId: v.string(),
                }),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        destinationBoardId: v.string(),
        destinationStatus: v.optional(v.string()),
      }),
    ),
    organizationAccess.fromTask(),
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { destinationBoardId, destinationStatus } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const result = await moveTask({
        taskId: id,
        destinationBoardId,
        destinationStatus,
        currentUserId,
      });

      return c.json(result);
    },
  )
  .put(
    "/:id",
    describeRoute({
      operationId: "updateTask",
      tags: ["Tasks"],
      description: "Update all fields of a task",
      responses: {
        200: {
          description: "Task updated successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        title: v.string(),
        description: v.string(),
        startDate: v.optional(v.string()),
        dueDate: v.optional(v.string()),
        priority: v.picklist(VALID_PRIORITIES),
        status: v.string(),
        boardId: v.string(),
        position: v.number(),
        userId: v.optional(v.string()),
      }),
    ),
    organizationAccess.fromTask(),
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const {
        title,
        description,
        startDate,
        dueDate,
        priority,
        status,
        boardId,
        position,
        userId,
      } = c.req.valid("json");

      const currentUserId = c.get("userId");

      const task = await updateTask(
        id,
        title,
        status,
        startDate ? new Date(startDate) : undefined,
        dueDate ? new Date(dueDate) : undefined,
        boardId,
        description,
        priority,
        position,
        userId,
        currentUserId,
      );

      return c.json(task);
    },
  )
  .get(
    "/export/:boardId",
    describeRoute({
      operationId: "exportTasks",
      tags: ["Tasks"],
      description: "Export all tasks from a board",
      responses: {
        200: {
          description: "Exported tasks data",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string() })),
    organizationAccess.fromBoard("boardId"),
    async (c) => {
      const { boardId } = c.req.valid("param");

      const exportData = await exportTasks(boardId);

      return c.json(exportData);
    },
  )
  .post(
    "/import/:boardId",
    describeRoute({
      operationId: "importTasks",
      tags: ["Tasks"],
      description: "Import multiple tasks into a board",
      responses: {
        200: {
          description: "Tasks imported successfully",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string() })),
    validator(
      "json",
      v.object({
        tasks: v.array(
          v.object({
            title: v.string(),
            description: v.optional(v.string()),
            status: v.string(),
            priority: v.optional(v.string()),
            startDate: v.optional(v.nullable(v.string())),
            dueDate: v.optional(v.nullable(v.string())),
            userId: v.optional(v.nullable(v.string())),
          }),
        ),
      }),
    ),
    organizationAccess.fromBoard("boardId"),
    requireOrganizationPermission({ task: ["create"] }),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const { tasks } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const result = await importTasks(boardId, tasks, currentUserId);

      return c.json(result);
    },
  )
  .get(
    "/trash/board/:boardId",
    describeRoute({
      operationId: "listTrashedBoardTasks",
      tags: ["Tasks"],
      description: "List soft-deleted (trashed) tasks for a board",
      responses: {
        200: {
          description: "Trashed tasks for the board",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string() })),
    organizationAccess.fromBoard("boardId"),
    async (c) => {
      const { boardId } = c.req.valid("param");

      const tasks = await getTrashedTasks({ boardId });

      return c.json(tasks);
    },
  )
  .get(
    "/trash/organization/:organizationId",
    describeRoute({
      operationId: "listTrashedOrganizationTasks",
      tags: ["Tasks"],
      description: "List soft-deleted (trashed) tasks for an organization",
      responses: {
        200: {
          description: "Trashed tasks for the organization",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("param", v.object({ organizationId: v.string() })),
    organizationAccess.fromParam("organizationId"),
    async (c) => {
      const { organizationId } = c.req.valid("param");

      const tasks = await getTrashedTasks({ organizationId });

      return c.json(tasks);
    },
  )
  .post(
    "/trash/:id/restore",
    describeRoute({
      operationId: "restoreTask",
      tags: ["Tasks"],
      description: "Restore a soft-deleted task from the recycle bin",
      responses: {
        200: {
          description: "Task restored successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromTask(),
    requireOrganizationPermission({ task: ["delete"] }),
    async (c) => {
      const { id } = c.req.valid("param");

      const task = await restoreTask(id, c.get("userId"));

      return c.json(task);
    },
  )
  .delete(
    "/trash/:id",
    describeRoute({
      operationId: "permanentlyDeleteTask",
      tags: ["Tasks"],
      description:
        "Permanently delete a trashed task. This cannot be undone and removes all attached assets.",
      responses: {
        200: {
          description: "Task permanently deleted",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromTask(),
    requireOrganizationPermission({ task: ["delete"] }),
    async (c) => {
      const { id } = c.req.valid("param");

      const task = await permanentlyDeleteTask(id, c.get("userId"));

      return c.json(task);
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteTask",
      tags: ["Tasks"],
      description: "Move a task to the trash (soft delete)",
      responses: {
        200: {
          description: "Task deleted successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromTask(),
    requireOrganizationPermission({ task: ["delete"] }),
    async (c) => {
      const { id } = c.req.valid("param");

      const currentUserId = c.get("userId");
      const task = await deleteTask(id, currentUserId);

      return c.json(task);
    },
  )
  .put(
    "/status/:id",
    describeRoute({
      operationId: "updateTaskStatus",
      tags: ["Tasks"],
      description: "Update only the status of a task",
      responses: {
        200: {
          description: "Task status updated successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ status: v.string() })),
    organizationAccess.fromTask(),
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { status } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const task = await updateTaskStatus({ id, status, currentUserId });

      return c.json(task);
    },
  )
  .get(
    "/following/:id",
    describeRoute({
      operationId: "isFollowingTask",
      tags: ["Tasks"],
      description:
        "Whether the current user follows this ticket. Following is separate from assignment: it records an explicit interest so the user keeps receiving notifications.",
      responses: {
        200: {
          description: "Following state for the current user",
          content: {
            "application/json": {
              schema: resolver(v.object({ following: v.boolean() })),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromTask(),
    async (c) => {
      const { id } = c.req.valid("param");
      const following = await isFollowingTask({
        taskId: id,
        userId: c.get("userId"),
      });
      return c.json({ following });
    },
  )
  .put(
    "/following/:id",
    describeRoute({
      operationId: "setTaskFollowing",
      tags: ["Tasks"],
      description:
        "Follow or unfollow a ticket. Idempotent on both sides. Gated on READ, not update: following is a personal subscription and must not require mutate rights on the ticket.",
      responses: {
        200: {
          description: "Following state updated",
          content: {
            "application/json": {
              schema: resolver(
                v.object({ taskId: v.string(), following: v.boolean() }),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ following: v.boolean() })),
    organizationAccess.fromTask(),
    async (c) => {
      const { id } = c.req.valid("param");
      const { following } = c.req.valid("json");
      const result = await setTaskFollowing({
        taskId: id,
        userId: c.get("userId"),
        following,
      });
      return c.json(result);
    },
  )
  .put(
    "/archived/:id",
    describeRoute({
      operationId: "setTaskArchived",
      tags: ["Tasks"],
      description:
        "Archive or unarchive a task. Archival is separate from status: an archived task retains its status and is hidden everywhere except the backlog's archived section.",
      responses: {
        200: {
          description: "Task archival state updated successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ archived: v.boolean() })),
    organizationAccess.fromTask(),
    // Archiving hides a task from every view, so it is gated on the same
    // permission as any other task mutation.
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { archived } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const task = await setTaskArchived({ id, archived, currentUserId });

      return c.json(task);
    },
  )
  .put(
    "/priority/:id",
    describeRoute({
      operationId: "updateTaskPriority",
      tags: ["Tasks"],
      description: "Update only the priority of a task",
      responses: {
        200: {
          description: "Task priority updated successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ priority: v.picklist(VALID_PRIORITIES) })),
    organizationAccess.fromTask(),
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { priority } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const task = await updateTaskPriority({ id, priority, currentUserId });

      return c.json(task);
    },
  )
  .put(
    "/assignee/:id",
    describeRoute({
      operationId: "updateTaskAssignee",
      tags: ["Tasks"],
      description: "Assign or unassign a task to a user or team",
      responses: {
        200: {
          description: "Task assignee updated successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        userId: v.optional(v.nullable(v.string())),
        teamId: v.optional(v.nullable(v.string())),
      }),
    ),
    organizationAccess.fromTask(),
    requireOrganizationPermission({ task: ["assign"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const raw = c.req.valid("json");
      const currentUserId = c.get("userId");

      // Treat "" as "no assignee". assignee_id/team_assignee_id are FK columns,
      // so an empty string is not a valid id and reaches Postgres as a literal
      // value that matches no row — the UPDATE then fails with a 500 instead of
      // unassigning. Normalising here keeps every client (web, mobile, API
      // consumers, older cached bundles) from being able to trigger that.
      const userId = raw.userId ? raw.userId : null;
      const teamId = raw.teamId ? raw.teamId : null;

      const task = await updateTaskAssignee({
        id,
        userId,
        teamId,
        currentUserId,
        organizationId: c.get("organizationId"),
      });

      return c.json(task);
    },
  )
  .put(
    "/due-date/:id",
    describeRoute({
      operationId: "updateTaskDueDate",
      tags: ["Tasks"],
      description: "Update only the due date of a task",
      responses: {
        200: {
          description: "Task due date updated successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ dueDate: v.optional(v.string()) })),
    organizationAccess.fromTask(),
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { dueDate = null } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const task = await updateTaskDueDate({
        id,
        dueDate: dueDate ? new Date(dueDate) : null,
        currentUserId,
      });

      return c.json(task);
    },
  )

  .put(
    "/title/:id",
    describeRoute({
      operationId: "updateTaskTitle",
      tags: ["Tasks"],
      description: "Update only the title of a task",
      responses: {
        200: {
          description: "Task title updated successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ title: v.string() })),
    organizationAccess.fromTask(),
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { title } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const task = await updateTaskTitle({ id, title, currentUserId });

      return c.json(task);
    },
  )

  .put(
    "/image-upload/:id",
    describeRoute({
      operationId: "createTaskImageUpload",
      tags: ["Tasks"],
      description:
        "Create a presigned image upload URL for a task description or comment",
      responses: {
        200: {
          description: "Image upload URL created successfully",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        filename: v.string(),
        contentType: v.string(),
        size: v.number(),
        surface: v.picklist(["description", "comment"] as const),
      }),
    ),
    organizationAccess.fromTask(),
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { filename, contentType, size, surface } = c.req.valid("json");

      try {
        validateTaskAssetUploadInput(contentType, size);
      } catch (error) {
        throw new HTTPException(400, {
          message:
            error instanceof Error
              ? error.message
              : "Invalid image upload request",
        });
      }

      const [taskContext] = await db
        .select({
          taskId: taskTable.id,
          boardId: taskTable.boardId,
          organizationId: organizationTable.id,
        })
        .from(taskTable)
        .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
        .innerJoin(
          organizationTable,
          eq(boardTable.organizationId, organizationTable.id),
        )
        .where(eq(taskTable.id, id))
        .limit(1);

      if (!taskContext) {
        throw new HTTPException(404, { message: "Task not found" });
      }

      try {
        const upload = await createTaskImageUploadUrl({
          organizationId: taskContext.organizationId,
          boardId: taskContext.boardId,
          taskId: taskContext.taskId,
          surface,
          filename,
          contentType,
        });

        return c.json(upload);
      } catch (error) {
        throw new HTTPException(503, {
          message:
            error instanceof Error
              ? error.message
              : "Image uploads are not configured",
        });
      }
    },
  )
  .post(
    "/image-upload/:id/finalize",
    describeRoute({
      operationId: "finalizeTaskImageUpload",
      tags: ["Tasks"],
      description:
        "Finalize an uploaded task image and create a private asset record",
      responses: {
        200: {
          description: "Image upload finalized successfully",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        key: v.string(),
        filename: v.string(),
        contentType: v.string(),
        size: v.number(),
        surface: v.picklist(["description", "comment"] as const),
      }),
    ),
    organizationAccess.fromTask(),
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { key, filename, contentType, size, surface } = c.req.valid("json");
      const userId = c.get("userId");

      try {
        validateTaskAssetUploadInput(contentType, size);
      } catch (error) {
        throw new HTTPException(400, {
          message:
            error instanceof Error
              ? error.message
              : "Invalid image upload request",
        });
      }

      const [taskContext] = await db
        .select({
          taskId: taskTable.id,
          boardId: taskTable.boardId,
          organizationId: organizationTable.id,
        })
        .from(taskTable)
        .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
        .innerJoin(
          organizationTable,
          eq(boardTable.organizationId, organizationTable.id),
        )
        .where(eq(taskTable.id, id))
        .limit(1);

      if (!taskContext) {
        throw new HTTPException(404, { message: "Task not found" });
      }

      const normalizedKey = key.trim();
      if (
        !assertTaskImageKeyMatchesContext(normalizedKey, {
          organizationId: taskContext.organizationId,
          boardId: taskContext.boardId,
          taskId: taskContext.taskId,
          surface,
        })
      ) {
        throw new HTTPException(400, {
          message: "Image upload key does not match the task context.",
        });
      }

      const [existingAsset] = await db
        .select({ id: assetTable.id })
        .from(assetTable)
        .where(eq(assetTable.objectKey, normalizedKey))
        .limit(1);

      const [asset] = existingAsset
        ? await db
            .update(assetTable)
            .set({
              organizationId: taskContext.organizationId,
              boardId: taskContext.boardId,
              taskId: taskContext.taskId,
              filename,
              mimeType: contentType,
              size,
              kind: isImageContentType(contentType) ? "image" : "attachment",
              surface,
              createdBy: userId || null,
            })
            .where(eq(assetTable.id, existingAsset.id))
            .returning({
              id: assetTable.id,
            })
        : await db
            .insert(assetTable)
            .values({
              organizationId: taskContext.organizationId,
              boardId: taskContext.boardId,
              taskId: taskContext.taskId,
              objectKey: normalizedKey,
              filename,
              mimeType: contentType,
              size,
              kind: isImageContentType(contentType) ? "image" : "attachment",
              surface,
              createdBy: userId || null,
            })
            .returning({
              id: assetTable.id,
            });

      const apiBaseUrl = normalizeApiServerUrl(
        process.env.KANEO_API_URL || new URL(c.req.url).origin,
      );
      return c.json({
        id: asset.id,
        url: `${apiBaseUrl}/asset/${asset.id}`,
      });
    },
  )
  .put(
    "/description/:id",
    describeRoute({
      operationId: "updateTaskDescription",
      tags: ["Tasks"],
      description: "Update only the description of a task",
      responses: {
        200: {
          description: "Task description updated successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ description: v.string() })),
    organizationAccess.fromTask(),
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { description } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const task = await updateTaskDescription({
        id,
        description,
        currentUserId,
      });

      return c.json(task);
    },
  );

export default task;
