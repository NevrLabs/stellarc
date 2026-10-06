import { and, eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import { getResourcePrivilege, privilegeAllows } from "../resource-access";
import { validateOrganizationAccess } from "./validate-organization-access";

type OrganizationIdSource =
  | { type: "query"; key: string }
  | { type: "body"; key: string }
  | { type: "param"; key: string }
  | {
      type: "lookup";
      resource:
        | "board"
        | "task"
        | "label"
        | "timeEntry"
        | "activity"
        | "comment"
        | "column"
        | "workflowRule"
        | "project";
      idKey: string;
    };

type OrganizationAccessMiddlewareConfig = {
  sources: OrganizationIdSource[];
};

async function readJsonObjectBody(
  c: Context,
): Promise<Record<string, unknown>> {
  const raw = (await c.req.json().catch(() => ({}))) || {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }
  return raw as Record<string, unknown>;
}

export function organizationAccessMiddleware(
  config: OrganizationAccessMiddlewareConfig,
) {
  return async (c: Context, next: Next) => {
    const userId = c.get("userId");

    if (!userId) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    let organizationId: string | null = null;

    for (const source of config.sources) {
      if (source.type === "query") {
        organizationId = c.req.query(source.key) || null;
      } else if (source.type === "body") {
        const body = await readJsonObjectBody(c);
        organizationId =
          typeof body[source.key] === "string" ? body[source.key] : null;
      } else if (source.type === "param") {
        organizationId = c.req.param(source.key) || null;
      } else if (source.type === "lookup") {
        const body = await readJsonObjectBody(c);
        const idFromBody =
          typeof body[source.idKey] === "string" ? body[source.idKey] : null;
        const id =
          c.req.param(source.idKey) || c.req.query(source.idKey) || idFromBody;
        if (id) {
          organizationId = await lookupOrganizationId(source.resource, id);
        }
      }

      if (organizationId) {
        break;
      }
    }

    if (!organizationId) {
      // Project routes must not leak existence: an unresolvable project id
      // yields the same 404 a hidden or foreign project yields (KFL-370).
      if (
        config.sources.some(
          (source) => source.type === "lookup" && source.resource === "project",
        )
      ) {
        throw new HTTPException(404, { message: "Project not found" });
      }
      throw new HTTPException(400, {
        message: "Organization ID could not be determined",
      });
    }

    const apiKey = c.get("apiKey");
    const apiKeyId = apiKey?.id;

    try {
      await validateOrganizationAccess(userId, organizationId, apiKeyId);
    } catch (error) {
      // Cross-organization access to a project route is indistinguishable
      // from a missing project: identical non-leaking 404 (KFL-370).
      if (
        error instanceof HTTPException &&
        error.status === 403 &&
        config.sources.some(
          (source) => source.type === "lookup" && source.resource === "project",
        )
      ) {
        throw new HTTPException(404, { message: "Project not found" });
      }
      throw error;
    }

    // #366: the guarded lookup resource belongs to exactly one resource
    // family (board or project) today; each family maps to its own
    // resourceType/id resolver so the privilege check runs against the right
    // resource regardless of which family the caller is guarding.
    type BoardFamilySource = {
      type: "lookup";
      resource: Exclude<
        Extract<OrganizationIdSource, { type: "lookup" }>["resource"],
        "label" | "project"
      >;
      idKey: string;
    };
    const guardedSource = config.sources.find(
      (source): source is BoardFamilySource =>
        source.type === "lookup" &&
        source.resource !== "label" &&
        source.resource !== "project",
    );
    const projectSource = config.sources.find(
      (source) => source.type === "lookup" && source.resource === "project",
    );
    const boardSource = guardedSource;
    if (boardSource?.type === "lookup") {
      const body = await readJsonObjectBody(c);
      const resourceId =
        c.req.param(boardSource.idKey) ||
        c.req.query(boardSource.idKey) ||
        (typeof body[boardSource.idKey] === "string"
          ? body[boardSource.idKey]
          : null);
      if (resourceId) {
        const boardId = await lookupBoardId(boardSource.resource, resourceId);
        if (!boardId) {
          throw new HTTPException(404, { message: "Resource not found" });
        }
        const privilege = await getResourcePrivilege({
          organizationId,
          resourceType: "board",
          resourceId: boardId,
          userId,
        });
        const required = c.req.method === "GET" ? "view" : "edit";
        if (!privilegeAllows(privilege, required)) {
          throw new HTTPException(404, { message: "Board not found" });
        }
      }
    }
    if (projectSource?.type === "lookup") {
      const body = await readJsonObjectBody(c);
      const resourceId: string | null =
        c.req.param(projectSource.idKey) ||
        c.req.query(projectSource.idKey) ||
        (typeof body[projectSource.idKey] === "string"
          ? (body[projectSource.idKey] as string)
          : null);
      if (resourceId) {
        const [project] = await db
          .select({ id: schema.projectTable.id })
          .from(schema.projectTable)
          .where(
            and(
              eq(schema.projectTable.id, resourceId),
              eq(schema.projectTable.organizationId, organizationId),
            ),
          )
          .limit(1);
        if (!project) {
          throw new HTTPException(404, { message: "Project not found" });
        }
        const privilege = await getResourcePrivilege({
          organizationId,
          resourceType: "project",
          resourceId: project.id,
          userId,
        });
        const required = c.req.method === "GET" ? "view" : "edit";
        if (!privilegeAllows(privilege, required)) {
          throw new HTTPException(404, { message: "Project not found" });
        }
      }
    }

    c.set("organizationId", organizationId);

    return next();
  };
}

async function lookupOrganizationId(
  resource:
    | "board"
    | "task"
    | "label"
    | "timeEntry"
    | "activity"
    | "comment"
    | "column"
    | "workflowRule"
    | "project",
  id: string,
): Promise<string | null> {
  try {
    switch (resource) {
      case "board": {
        const [board] = await db
          .select({ organizationId: schema.boardTable.organizationId })
          .from(schema.boardTable)
          .where(eq(schema.boardTable.id, id))
          .limit(1);
        return board?.organizationId || null;
      }

      case "project": {
        const [project] = await db
          .select({ organizationId: schema.projectTable.organizationId })
          .from(schema.projectTable)
          .where(eq(schema.projectTable.id, id))
          .limit(1);
        return project?.organizationId || null;
      }

      case "task": {
        const [task] = await db
          .select({
            organizationId: schema.boardTable.organizationId,
          })
          .from(schema.taskTable)
          .innerJoin(
            schema.boardTable,
            eq(schema.taskTable.boardId, schema.boardTable.id),
          )
          .where(eq(schema.taskTable.id, id))
          .limit(1);
        return task?.organizationId || null;
      }

      case "label": {
        const [label] = await db
          .select({ organizationId: schema.labelTable.organizationId })
          .from(schema.labelTable)
          .where(eq(schema.labelTable.id, id))
          .limit(1);
        return label?.organizationId || null;
      }

      case "timeEntry": {
        const [timeEntry] = await db
          .select({
            organizationId: schema.boardTable.organizationId,
          })
          .from(schema.timeEntryTable)
          .innerJoin(
            schema.taskTable,
            eq(schema.timeEntryTable.taskId, schema.taskTable.id),
          )
          .innerJoin(
            schema.boardTable,
            eq(schema.taskTable.boardId, schema.boardTable.id),
          )
          .where(eq(schema.timeEntryTable.id, id))
          .limit(1);
        return timeEntry?.organizationId || null;
      }

      case "activity": {
        const [activity] = await db
          .select({
            organizationId: schema.boardTable.organizationId,
          })
          .from(schema.activityTable)
          .innerJoin(
            schema.taskTable,
            eq(schema.activityTable.taskId, schema.taskTable.id),
          )
          .innerJoin(
            schema.boardTable,
            eq(schema.taskTable.boardId, schema.boardTable.id),
          )
          .where(eq(schema.activityTable.id, id))
          .limit(1);
        return activity?.organizationId || null;
      }

      case "comment": {
        const [comment] = await db
          .select({
            organizationId: schema.boardTable.organizationId,
          })
          .from(schema.activityTable)
          .innerJoin(
            schema.taskTable,
            eq(schema.activityTable.taskId, schema.taskTable.id),
          )
          .innerJoin(
            schema.boardTable,
            eq(schema.taskTable.boardId, schema.boardTable.id),
          )
          .where(
            and(
              eq(schema.activityTable.id, id),
              eq(schema.activityTable.type, "comment"),
            ),
          )
          .limit(1);
        return comment?.organizationId || null;
      }

      case "column": {
        const [column] = await db
          .select({
            organizationId: schema.boardTable.organizationId,
          })
          .from(schema.columnTable)
          .innerJoin(
            schema.boardTable,
            eq(schema.columnTable.boardId, schema.boardTable.id),
          )
          .where(eq(schema.columnTable.id, id))
          .limit(1);
        return column?.organizationId || null;
      }

      case "workflowRule": {
        const [workflowRule] = await db
          .select({
            organizationId: schema.boardTable.organizationId,
          })
          .from(schema.workflowRuleTable)
          .innerJoin(
            schema.boardTable,
            eq(schema.workflowRuleTable.boardId, schema.boardTable.id),
          )
          .where(eq(schema.workflowRuleTable.id, id))
          .limit(1);
        return workflowRule?.organizationId || null;
      }

      default:
        return null;
    }
  } catch (error) {
    console.error(`Error looking up organizationId for ${resource}:`, error);
    return null;
  }
}

async function lookupBoardId(
  resource: Exclude<
    Extract<OrganizationIdSource, { type: "lookup" }>["resource"],
    "label" | "project"
  >,
  id: string,
): Promise<string | null> {
  switch (resource) {
    case "board":
      return id;
    case "task": {
      const [row] = await db
        .select({ boardId: schema.taskTable.boardId })
        .from(schema.taskTable)
        .where(eq(schema.taskTable.id, id))
        .limit(1);
      return row?.boardId ?? null;
    }
    case "timeEntry": {
      const [row] = await db
        .select({ boardId: schema.taskTable.boardId })
        .from(schema.timeEntryTable)
        .innerJoin(
          schema.taskTable,
          eq(schema.timeEntryTable.taskId, schema.taskTable.id),
        )
        .where(eq(schema.timeEntryTable.id, id))
        .limit(1);
      return row?.boardId ?? null;
    }
    case "activity":
    case "comment": {
      const [row] = await db
        .select({ boardId: schema.taskTable.boardId })
        .from(schema.activityTable)
        .innerJoin(
          schema.taskTable,
          eq(schema.activityTable.taskId, schema.taskTable.id),
        )
        .where(
          resource === "comment"
            ? and(
                eq(schema.activityTable.id, id),
                eq(schema.activityTable.type, "comment"),
              )
            : eq(schema.activityTable.id, id),
        )
        .limit(1);
      return row?.boardId ?? null;
    }
    case "column": {
      const [row] = await db
        .select({ boardId: schema.columnTable.boardId })
        .from(schema.columnTable)
        .where(eq(schema.columnTable.id, id))
        .limit(1);
      return row?.boardId ?? null;
    }
    case "workflowRule": {
      const [row] = await db
        .select({ boardId: schema.workflowRuleTable.boardId })
        .from(schema.workflowRuleTable)
        .where(eq(schema.workflowRuleTable.id, id))
        .limit(1);
      return row?.boardId ?? null;
    }
  }
}

export const organizationAccess = {
  fromQuery: (key = "organizationId") =>
    organizationAccessMiddleware({ sources: [{ type: "query", key }] }),

  fromBody: (key = "organizationId") =>
    organizationAccessMiddleware({ sources: [{ type: "body", key }] }),

  fromParam: (key = "organizationId") =>
    organizationAccessMiddleware({ sources: [{ type: "param", key }] }),

  fromBoard: (idKey = "id") =>
    organizationAccessMiddleware({
      sources: [{ type: "lookup", resource: "board", idKey }],
    }),

  fromProject: (idKey = "id") =>
    organizationAccessMiddleware({
      sources: [{ type: "lookup", resource: "project", idKey }],
    }),

  fromTask: (idKey = "id") =>
    organizationAccessMiddleware({
      sources: [
        { type: "lookup", resource: "task", idKey },
        { type: "query", key: "organizationId" },
      ],
    }),

  fromTaskId: (idKey = "taskId") =>
    organizationAccessMiddleware({
      sources: [
        { type: "lookup", resource: "task", idKey },
        { type: "query", key: "organizationId" },
      ],
    }),

  fromLabel: (idKey = "id") =>
    organizationAccessMiddleware({
      sources: [
        { type: "lookup", resource: "label", idKey },
        { type: "query", key: "organizationId" },
      ],
    }),

  fromTimeEntry: (idKey = "id") =>
    organizationAccessMiddleware({
      sources: [
        { type: "lookup", resource: "timeEntry", idKey },
        { type: "query", key: "organizationId" },
      ],
    }),

  fromActivity: (idKey = "id") =>
    organizationAccessMiddleware({
      sources: [
        { type: "lookup", resource: "activity", idKey },
        { type: "query", key: "organizationId" },
      ],
    }),

  fromComment: (idKey = "id") =>
    organizationAccessMiddleware({
      sources: [
        { type: "lookup", resource: "comment", idKey },
        { type: "query", key: "organizationId" },
      ],
    }),

  fromColumn: (idKey = "id") =>
    organizationAccessMiddleware({
      sources: [
        { type: "lookup", resource: "column", idKey },
        { type: "query", key: "organizationId" },
      ],
    }),

  fromWorkflowRule: (idKey = "id") =>
    organizationAccessMiddleware({
      sources: [
        { type: "lookup", resource: "workflowRule", idKey },
        { type: "query", key: "organizationId" },
      ],
    }),
};
