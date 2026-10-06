import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { subscribeToEvent } from "../events";
import { activitySchema } from "../schemas";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";
import createActivity from "./controllers/create-activity";
import createComment from "./controllers/create-comment";
import deleteComment from "./controllers/delete-comment";
import getActivities from "./controllers/get-activities";
import updateComment from "./controllers/update-comment";

const activity = new Hono<{
  Variables: {
    userId: string;
  };
}>()
  .get(
    "/:taskId",
    describeRoute({
      operationId: "getActivities",
      tags: ["Activity"],
      description: "Get all activities for a specific task",
      responses: {
        200: {
          description: "List of activities for the task",
          content: {
            "application/json": { schema: resolver(v.array(activitySchema)) },
          },
        },
      },
    }),
    validator("param", v.object({ taskId: v.string() })),
    organizationAccess.fromTaskId(),
    async (c) => {
      const { taskId } = c.req.valid("param");
      const activities = await getActivities(taskId);
      return c.json(activities);
    },
  )
  .post(
    "/create",
    describeRoute({
      operationId: "createActivity",
      tags: ["Activity"],
      description: "Create a new activity (system-generated event)",
      responses: {
        200: {
          description: "Activity created successfully",
          content: {
            "application/json": { schema: resolver(activitySchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        taskId: v.string(),
        userId: v.string(),
        message: v.nullable(v.string()),
        type: v.string(),
        eventData: v.optional(v.nullable(v.record(v.string(), v.unknown()))),
      }),
    ),
    organizationAccess.fromTaskId(),
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const { taskId, userId, message, type, eventData } = c.req.valid("json");
      const activity = await createActivity(
        taskId,
        type,
        userId,
        message,
        eventData,
      );
      return c.json(activity);
    },
  )
  .post(
    "/comment",
    describeRoute({
      operationId: "createComment",
      tags: ["Activity"],
      description: "Create a new comment on a task",
      responses: {
        200: {
          description: "Comment created successfully",
          content: {
            "application/json": { schema: resolver(activitySchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        taskId: v.string(),
        comment: v.string(),
      }),
    ),
    organizationAccess.fromTaskId(),
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const { taskId, comment } = c.req.valid("json");
      const userId = c.get("userId");
      const newComment = await createComment(taskId, userId, comment);

      return c.json(newComment);
    },
  )
  .put(
    "/comment",
    describeRoute({
      operationId: "updateComment",
      tags: ["Activity"],
      description: "Update an existing comment",
      responses: {
        200: {
          description: "Comment updated successfully",
          content: {
            "application/json": { schema: resolver(activitySchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        activityId: v.string(),
        comment: v.string(),
      }),
    ),
    organizationAccess.fromActivity("activityId"),
    async (c) => {
      const { activityId, comment } = c.req.valid("json");
      const userId = c.get("userId");
      const updatedComment = await updateComment(userId, activityId, comment);
      return c.json(updatedComment);
    },
  )
  .delete(
    "/comment",
    describeRoute({
      operationId: "deleteComment",
      tags: ["Activity"],
      description: "Delete a comment",
      responses: {
        200: {
          description: "Comment deleted successfully",
          content: {
            "application/json": { schema: resolver(activitySchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        activityId: v.string(),
      }),
    ),
    organizationAccess.fromActivity("activityId"),
    async (c) => {
      const { activityId } = c.req.valid("json");
      const userId = c.get("userId");
      const deletedComment = await deleteComment(userId, activityId);
      return c.json(deletedComment);
    },
  );

subscribeToEvent<{
  taskId: string;
  currentUserId: string;
  type: string;
  content: string | null;
}>("task.created", async (data) => {
  if (!data.currentUserId || !data.taskId || !data.type) {
    return;
  }
  await createActivity(data.taskId, data.type, data.currentUserId, null, {});
});

subscribeToEvent<{
  taskId: string;
  userId: string;
  type: string;
  content: string;
  fromBoardId: string;
  fromBoardName: string;
  toBoardId: string;
  toBoardName: string;
  oldStatus: string;
  newStatus: string;
}>("task.moved", async (data) => {
  const {
    fromBoardId,
    fromBoardName,
    toBoardId,
    toBoardName,
    oldStatus,
    newStatus,
  } = data;

  await createActivity(data.taskId, data.type, data.userId, null, {
    fromBoardId,
    fromBoardName,
    toBoardId,
    toBoardName,
    oldStatus,
    newStatus,
  });
});

subscribeToEvent<{
  taskId: string;
  userId: string;
  oldStatus: string;
  newStatus: string;
  title: string;
  assigneeId?: string;
  type: string;
}>("task.status_changed", async (data) => {
  await createActivity(data.taskId, data.type, data.userId, null, {
    oldStatus: data.oldStatus,
    newStatus: data.newStatus,
  });
});

subscribeToEvent<{
  taskId: string;
  userId: string;
  oldPriority: string;
  newPriority: string;
  title: string;
  type: string;
}>("task.priority_changed", async (data) => {
  await createActivity(data.taskId, data.type, data.userId, null, {
    oldPriority: data.oldPriority,
    newPriority: data.newPriority,
  });
});

subscribeToEvent<{
  taskId: string;
  userId: string;
  title: string;
  type: string;
}>("task.unassigned", async (data) => {
  await createActivity(data.taskId, data.type, data.userId, null, {});
});

subscribeToEvent<{
  taskId: string;
  userId: string;
  oldAssignee: string | null;
  newAssignee: string;
  newAssigneeId: string;
  title: string;
  type: string;
}>("task.assignee_changed", async (data) => {
  await createActivity(data.taskId, data.type, data.userId, null, {
    newAssigneeId: data.newAssigneeId,
    newAssignee: data.newAssignee,
    isSelfAssigned: data.userId === data.newAssigneeId,
  });
});

subscribeToEvent<{
  taskId: string;
  userId: string;
  oldDueDate: Date | null;
  newDueDate: Date;
  title: string;
  type: string;
}>("task.due_date_changed", async (data) => {
  await createActivity(data.taskId, data.type, data.userId, null, {
    oldDueDate:
      data.oldDueDate instanceof Date
        ? data.oldDueDate.toISOString()
        : data.oldDueDate,
    newDueDate:
      data.newDueDate instanceof Date
        ? data.newDueDate.toISOString()
        : data.newDueDate,
  });
});

type TaskFlagActivityEvent = {
  taskId: string;
  userId: string;
  type: "flag_raised" | "flag_resolved";
  flagId: string;
  flagTypeId: string;
  flagTypeName?: string;
  flagTypeColor?: string | null;
  flagTypeIcon?: string | null;
  targetUserId: string | null;
  targetTeamId: string | null;
  note?: string | null;
  /** Mandatory reason supplied when resolving a flag (#167). */
  resolveNote?: string | null;
  resolvedBy?: string;
};

for (const eventName of ["task.flag_raised", "task.flag_resolved"] as const) {
  subscribeToEvent<TaskFlagActivityEvent>(eventName, async (data) => {
    await createActivity(data.taskId, data.type, data.userId, null, {
      flagId: data.flagId,
      flagTypeId: data.flagTypeId,
      flagTypeName: data.flagTypeName,
      flagTypeColor: data.flagTypeColor,
      flagTypeIcon: data.flagTypeIcon,
      targetUserId: data.targetUserId,
      targetTeamId: data.targetTeamId,
      note: data.note,
      // Raising and resolving use intentionally distinct note fields. Keeping
      // only `note` here silently discarded the mandatory unflag reason before
      // the activity row was written.
      resolveNote: data.resolveNote,
      resolvedBy: data.resolvedBy,
    });
  });
}

export default activity;
