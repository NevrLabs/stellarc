import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { organizationMemberTable, projectTable } from "../database/schema";
import { requireResourcePrivilege } from "../resource-access";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";
import addProjectTicketCtrl from "./controllers/add-project-ticket";
import archiveProjectCtrl from "./controllers/archive-project";
import assignProjectTicketMilestoneCtrl from "./controllers/assign-project-ticket-milestone";
import completeProjectMilestoneCtrl from "./controllers/complete-project-milestone";
import createProjectCtrl, {
  PROJECT_STATUSES,
} from "./controllers/create-project";
import createProjectMilestoneCtrl from "./controllers/create-project-milestone";
import createProjectUpdateCtrl from "./controllers/create-project-update";
import deleteProjectMilestoneCtrl from "./controllers/delete-project-milestone";
import deleteProjectUpdateCtrl from "./controllers/delete-project-update";
import getProjectCtrl from "./controllers/get-project";
import listProjectMilestonesCtrl from "./controllers/list-project-milestones";
import listProjectTicketsCtrl from "./controllers/list-project-tickets";
import listProjectUpdatesCtrl from "./controllers/list-project-updates";
import listProjectsCtrl from "./controllers/list-projects";
import removeProjectTicketCtrl from "./controllers/remove-project-ticket";
import renameProjectSlugCtrl from "./controllers/rename-project-slug";
import reopenProjectMilestoneCtrl from "./controllers/reopen-project-milestone";
import resolveProjectCtrl from "./controllers/resolve-project";
import createProjectResourceLinkCtrl from "./controllers/resources/create-project-resource-link";
import deleteProjectResourceLinkCtrl from "./controllers/resources/delete-project-resource-link";
import listProjectResourcesCtrl from "./controllers/resources/list-project-resources";
import updateProjectResourceLinkCtrl from "./controllers/resources/update-project-resource-link";
import unarchiveProjectCtrl from "./controllers/unarchive-project";
import updateProjectCtrl from "./controllers/update-project";
import updateProjectMilestoneCtrl from "./controllers/update-project-milestone";
import updateProjectUpdateCtrl from "./controllers/update-project-update";
import {
  projectResourceLinkSchema,
  projectResourceRelationshipSchema,
  projectResourceTypeSchema,
} from "./project-resource-projection";

const PROJECT_PRIORITY_VALUES = [
  "no-priority",
  "low",
  "medium",
  "high",
  "urgent",
] as const;
const projectProgressSchema = v.object({
  completed: v.number(),
  eligible: v.number(),
  percent: v.nullable(v.number()),
});

const projectTicketSchema = v.object({
  id: v.string(),
  boardId: v.string(),
  boardSlug: v.string(),
  boardName: v.string(),
  number: v.number(),
  key: v.string(),
  title: v.string(),
  status: v.string(),
  priority: v.nullable(v.string()),
  archivedAt: v.nullable(v.date()),
  startDate: v.nullable(v.date()),
  dueDate: v.nullable(v.date()),
  projectMilestoneId: v.nullable(v.string()),
  rank: v.number(),
  addedAt: v.date(),
  addedBy: v.string(),
});

const projectTicketsResponseSchema = v.object({
  tickets: v.array(projectTicketSchema),
  progress: projectProgressSchema,
});

const projectMilestoneSchema = v.object({
  id: v.string(),
  projectId: v.string(),
  name: v.string(),
  description: v.nullable(v.string()),
  targetDate: v.nullable(v.string()),
  rank: v.number(),
  completedAt: v.nullable(v.date()),
  completedBy: v.nullable(
    v.object({ id: v.string(), name: v.nullable(v.string()) }),
  ),
  createdAt: v.date(),
  updatedAt: v.date(),
  progress: projectProgressSchema,
});

const projectSchema = v.object({
  id: v.string(),
  organizationId: v.string(),
  slug: v.string(),
  name: v.string(),
  icon: v.nullable(v.string()),
  color: v.nullable(v.string()),
  summary: v.string(),
  description: v.nullable(v.string()),
  successCriteria: v.nullable(v.string()),
  status: v.picklist(PROJECT_STATUSES),
  priority: v.nullable(v.picklist(PROJECT_PRIORITY_VALUES)),
  leadUserId: v.string(),
  leadUserName: v.nullable(v.string()),
  leadTeamId: v.nullable(v.string()),
  leadTeamName: v.nullable(v.string()),
  startDate: v.nullable(v.string()),
  targetDate: v.nullable(v.string()),
  orgPrivilege: v.nullable(v.string()),
  archivedAt: v.nullable(v.date()),
  archivedBy: v.nullable(v.string()),
  archivedByName: v.nullable(v.string()),
  createdAt: v.date(),
  updatedAt: v.date(),
  createdBy: v.string(),
  // KFL-367 derives progress from the authorization-filtered visible set;
  // health remains presentation-only until the Updates ticket.
  progress: projectProgressSchema,
  health: v.null_(),
  // KFL-369: the requesting user's effective Project resource privilege, so
  // the web surface can gate mutation controls the same way the API does.
  viewerPrivilege: v.optional(v.picklist(["none", "view", "edit", "manage"])),
});
function projectPrivilege(required: "view" | "edit" | "manage") {
  return createMiddleware<{
    Variables: { userId: string; organizationId: string };
  }>(async (c, next) => {
    const projectId = c.req.param("id") ?? "";
    const [project] = await db
      .select({ organizationId: projectTable.organizationId })
      .from(projectTable)
      .where(eq(projectTable.id, projectId))
      .limit(1);
    const [membership] = project
      ? await db
          .select({ id: organizationMemberTable.id })
          .from(organizationMemberTable)
          .where(
            and(
              eq(
                organizationMemberTable.organizationId,
                project.organizationId,
              ),
              eq(organizationMemberTable.userId, c.get("userId")),
            ),
          )
          .limit(1)
      : [];
    const allowed =
      membership &&
      project &&
      (await requireResourcePrivilege({
        organizationId: project.organizationId,
        resourceType: "project",
        resourceId: projectId,
        userId: c.get("userId"),
        required,
      }));
    if (!allowed)
      throw new HTTPException(404, { message: "Project not found" });
    c.set("organizationId", project.organizationId);
    await next();
  });
}

const optionalNullableString = v.optional(v.nullable(v.string()));

// KFL-370: authored-health Update payload shape (OpenAPI response schema).
const projectUpdateSchema = v.object({
  id: v.string(),
  organizationId: v.string(),
  projectId: v.string(),
  authorId: v.string(),
  authorName: v.nullable(v.string()),
  content: v.string(),
  health: v.picklist(["on-track", "at-risk", "off-track"]),
  editHistory: v.array(
    v.object({
      content: v.string(),
      editedAt: v.string(),
      userId: v.string(),
    }),
  ),
  createdAt: v.date(),
  updatedAt: v.date(),
});

const project = new Hono<{
  Variables: { userId: string; organizationId: string };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listProjects",
      tags: ["Projects"],
      description: "Get all projects in an organization",
      responses: {
        200: {
          description: "List of projects",
          content: {
            "application/json": { schema: resolver(v.array(projectSchema)) },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({
        organizationId: v.string(),
        includeArchived: v.optional(v.string()),
      }),
    ),
    organizationAccess.fromQuery(),
    requireOrganizationPermission({ project: ["read"] }),
    async (c) => {
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const { includeArchived } = c.req.valid("query");
      const projects = await listProjectsCtrl(
        organizationId,
        userId,
        includeArchived === "true",
      );
      return c.json(projects);
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createProject",
      tags: ["Projects"],
      description: "Create a new project in an organization",
      responses: {
        200: {
          description: "Project created successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        organizationId: v.string(),
        name: v.string(),
        summary: v.string(),
        leadUserId: v.string(),
        leadTeamId: optionalNullableString,
        slug: v.optional(v.string()),
        status: v.optional(v.string()),
        priority: optionalNullableString,
        icon: optionalNullableString,
        color: optionalNullableString,
        description: optionalNullableString,
        successCriteria: optionalNullableString,
        startDate: optionalNullableString,
        targetDate: optionalNullableString,
      }),
    ),
    organizationAccess.fromBody(),
    requireOrganizationPermission({ project: ["create"] }),
    async (c) => {
      const body = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const created = await createProjectCtrl({
        organizationId,
        name: body.name,
        summary: body.summary,
        leadUserId: body.leadUserId,
        leadTeamId: body.leadTeamId,
        createdBy: userId,
        slug: body.slug,
        status: body.status,
        priority: body.priority,
        icon: body.icon,
        color: body.color,
        description: body.description,
        successCriteria: body.successCriteria,
        startDate: body.startDate,
        targetDate: body.targetDate,
      });
      return c.json(created);
    },
  )
  .get(
    "/resolve",
    describeRoute({
      operationId: "resolveProject",
      tags: ["Projects"],
      description:
        "Resolve a project slug (canonical or alias) to its canonical projection",
      responses: {
        200: {
          description: "Resolved project",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  ...projectSchema.entries,
                  usedSlugAlias: v.boolean(),
                }),
              ),
            },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({ organizationId: v.string(), slug: v.string() }),
    ),
    organizationAccess.fromQuery(),
    requireOrganizationPermission({ project: ["read"] }),
    async (c) => {
      const { slug } = c.req.valid("query");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const resolved = await resolveProjectCtrl(organizationId, slug, userId);
      return c.json(resolved);
    },
  )
  .get(
    "/:id",
    describeRoute({
      operationId: "getProject",
      tags: ["Projects"],
      description: "Get a specific project by ID",
      responses: {
        200: {
          description: "Project details",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["read"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const projectData = await getProjectCtrl(organizationId, id, userId);
      return c.json(projectData);
    },
  )
  .put(
    "/:id",
    describeRoute({
      operationId: "updateProject",
      tags: ["Projects"],
      description: "Update project metadata",
      responses: {
        200: {
          description: "Project updated successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        name: v.string(),
        summary: v.string(),
        status: v.string(),
        priority: v.nullable(v.string()),
        icon: v.nullable(v.string()),
        color: v.nullable(v.string()),
        description: v.nullable(v.string()),
        successCriteria: v.nullable(v.string()),
        leadUserId: v.string(),
        leadTeamId: v.nullable(v.string()),
        startDate: v.nullable(v.string()),
        targetDate: v.nullable(v.string()),
        orgPrivilege: v.nullable(
          v.picklist(["none", "view", "edit", "manage"] as const),
        ),
      }),
    ),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const updatedBy = c.get("userId");
      const updated = await updateProjectCtrl(id, {
        organizationId,
        updatedBy,
        ...body,
      });
      return c.json(updated);
    },
  )
  .put(
    "/:id/slug",
    describeRoute({
      operationId: "renameProjectSlug",
      tags: ["Projects"],
      description: "Rename a project's canonical slug",
      responses: {
        200: {
          description: "Project slug renamed successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ slug: v.string() })),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { slug } = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const updated = await renameProjectSlugCtrl(
        id,
        organizationId,
        slug,
        userId,
      );
      return c.json(updated);
    },
  )
  .put(
    "/:id/archive",
    describeRoute({
      operationId: "archiveProject",
      tags: ["Projects"],
      description: "Archive a project",
      responses: {
        200: {
          description: "Project archived successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const archived = await archiveProjectCtrl(id, organizationId, userId);
      return c.json(archived);
    },
  )
  .put(
    "/:id/unarchive",
    describeRoute({
      operationId: "unarchiveProject",
      tags: ["Projects"],
      description: "Unarchive a project",
      responses: {
        200: {
          description: "Project unarchived successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const unarchived = await unarchiveProjectCtrl(id, organizationId, userId);
      return c.json(unarchived);
    },
  )
  .get(
    "/:id/tickets",
    describeRoute({
      operationId: "listProjectTickets",
      tags: ["Projects"],
      description:
        "List scoped Project tickets with requester-filtered progress",
      responses: {
        200: {
          description: "Scoped tickets and progress",
          content: {
            "application/json": {
              schema: resolver(projectTicketsResponseSchema),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["read"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      return c.json(await listProjectTicketsCtrl(organizationId, id, userId));
    },
  )
  .post(
    "/:id/tickets",
    describeRoute({
      operationId: "addProjectTicket",
      tags: ["Projects"],
      description: "Scope a ticket into a Project",
      responses: {
        200: {
          description: "Scoped ticket projection",
          content: {
            "application/json": { schema: resolver(projectTicketSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        taskId: v.string(),
        rank: v.optional(v.number()),
        projectMilestoneId: v.optional(v.nullable(v.string())),
      }),
    ),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["update"] }),
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { taskId, rank, projectMilestoneId } = c.req.valid("json");
      const userId = c.get("userId");
      const ticket = await addProjectTicketCtrl({
        projectId: id,
        taskId,
        rank,
        projectMilestoneId,
        userId,
      });
      return c.json(ticket);
    },
  )
  .delete(
    "/:id/tickets/:taskId",
    describeRoute({
      operationId: "removeProjectTicket",
      tags: ["Projects"],
      description: "Remove a ticket from a Project",
      responses: {
        200: {
          description: "Membership removed",
          content: {
            "application/json": {
              schema: resolver(v.object({ ok: v.boolean() })),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string(), taskId: v.string() })),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["update"] }),
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const { id, taskId } = c.req.valid("param");
      const userId = c.get("userId");
      await removeProjectTicketCtrl({ projectId: id, taskId, userId });
      return c.json({ ok: true });
    },
  )
  .get(
    "/:id/resources",
    describeRoute({
      operationId: "listProjectResources",
      tags: ["Projects"],
      description: "List contextual resource links for a project",
      responses: {
        200: {
          description: "List of project resource links",
          content: {
            "application/json": {
              schema: resolver(v.array(projectResourceLinkSchema)),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["read"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const links = await listProjectResourcesCtrl(organizationId, id, userId);
      return c.json(links);
    },
  )
  .post(
    "/:id/resources",
    describeRoute({
      operationId: "createProjectResourceLink",
      tags: ["Projects"],
      description: "Link a contextual resource to a project",
      responses: {
        200: {
          description: "Project resource link created",
          content: {
            "application/json": { schema: resolver(projectResourceLinkSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        resourceType: projectResourceTypeSchema,
        resourceId: v.string(),
        relationship: projectResourceRelationshipSchema,
        label: v.optional(v.nullable(v.string())),
        note: v.optional(v.nullable(v.string())),
        rank: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
      }),
    ),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const link = await createProjectResourceLinkCtrl({
        organizationId,
        projectId: id,
        userId,
        ...body,
      });
      return c.json(link);
    },
  )
  .put(
    "/:id/resources/:linkId",
    describeRoute({
      operationId: "updateProjectResourceLink",
      tags: ["Projects"],
      description: "Update a project resource link's metadata",
      responses: {
        200: {
          description: "Project resource link updated",
          content: {
            "application/json": { schema: resolver(projectResourceLinkSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string(), linkId: v.string() })),
    validator(
      "json",
      v.object({
        relationship: projectResourceRelationshipSchema,
        label: v.optional(v.nullable(v.string())),
        note: v.optional(v.nullable(v.string())),
        rank: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
      }),
    ),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["update"] }),
    async (c) => {
      const { id, linkId } = c.req.valid("param");
      const body = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const link = await updateProjectResourceLinkCtrl({
        organizationId,
        projectId: id,
        linkId,
        userId,
        ...body,
      });
      return c.json(link);
    },
  )
  .delete(
    "/:id/resources/:linkId",
    describeRoute({
      operationId: "deleteProjectResourceLink",
      tags: ["Projects"],
      description: "Remove a project resource link",
      responses: {
        204: { description: "Project resource link removed" },
      },
    }),
    validator("param", v.object({ id: v.string(), linkId: v.string() })),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["update"] }),
    async (c) => {
      const { id, linkId } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      await deleteProjectResourceLinkCtrl({
        organizationId,
        projectId: id,
        linkId,
        userId,
      });
      return new Response(null, { status: 204 });
    },
  )
  .get(
    "/:id/milestones",
    describeRoute({
      operationId: "listProjectMilestones",
      tags: ["Projects"],
      description: "List Project Milestones with requester-filtered progress",
      responses: {
        200: {
          description: "Ordered Project Milestones",
          content: {
            "application/json": {
              schema: resolver(v.array(projectMilestoneSchema)),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    projectPrivilege("view"),
    requireOrganizationPermission({ project: ["read"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      return c.json(
        await listProjectMilestonesCtrl(organizationId, id, userId),
      );
    },
  )
  .post(
    "/:id/milestones",
    describeRoute({
      operationId: "createProjectMilestone",
      tags: ["Projects"],
      description: "Create an open Project Milestone",
      responses: {
        200: {
          description: "Created Project Milestone",
          content: {
            "application/json": { schema: resolver(projectMilestoneSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        name: v.string(),
        description: optionalNullableString,
        targetDate: optionalNullableString,
        rank: v.optional(v.number()),
      }),
    ),
    projectPrivilege("edit"),
    requireOrganizationPermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const milestone = await createProjectMilestoneCtrl(
        organizationId,
        id,
        userId,
        body,
      );
      return c.json(milestone);
    },
  )
  .put(
    "/:id/milestones/:milestoneId",
    describeRoute({
      operationId: "updateProjectMilestone",
      tags: ["Projects"],
      description: "Update Project Milestone metadata and order",
      responses: {
        200: {
          description: "Updated Project Milestone",
          content: {
            "application/json": { schema: resolver(projectMilestoneSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string(), milestoneId: v.string() })),
    validator(
      "json",
      v.object({
        name: v.string(),
        description: optionalNullableString,
        targetDate: optionalNullableString,
        rank: v.number(),
      }),
    ),
    projectPrivilege("edit"),
    requireOrganizationPermission({ project: ["update"] }),
    async (c) => {
      const { id, milestoneId } = c.req.valid("param");
      const body = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const milestone = await updateProjectMilestoneCtrl(
        organizationId,
        id,
        milestoneId,
        userId,
        body,
      );
      return c.json(milestone);
    },
  )
  .delete(
    "/:id/milestones/:milestoneId",
    describeRoute({
      operationId: "deleteProjectMilestone",
      tags: ["Projects"],
      description: "Delete a Project Milestone, clearing assignments",
      responses: {
        200: {
          description: "Milestone deleted",
          content: {
            "application/json": {
              schema: resolver(v.object({ ok: v.boolean() })),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string(), milestoneId: v.string() })),
    projectPrivilege("edit"),
    requireOrganizationPermission({ project: ["update"] }),
    async (c) => {
      const { id, milestoneId } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      await deleteProjectMilestoneCtrl(organizationId, id, milestoneId);
      return c.json({ ok: true });
    },
  )
  .put(
    "/:id/milestones/:milestoneId/complete",
    describeRoute({
      operationId: "completeProjectMilestone",
      tags: ["Projects"],
      description: "Explicitly complete a Project Milestone",
      responses: {
        200: {
          description: "Completed Project Milestone",
          content: {
            "application/json": { schema: resolver(projectMilestoneSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string(), milestoneId: v.string() })),
    projectPrivilege("edit"),
    requireOrganizationPermission({ project: ["update"] }),
    async (c) => {
      const { id, milestoneId } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const milestone = await completeProjectMilestoneCtrl(
        organizationId,
        id,
        milestoneId,
        userId,
      );
      return c.json(milestone);
    },
  )
  .put(
    "/:id/milestones/:milestoneId/reopen",
    describeRoute({
      operationId: "reopenProjectMilestone",
      tags: ["Projects"],
      description: "Reopen a completed Project Milestone",
      responses: {
        200: {
          description: "Reopened Project Milestone",
          content: {
            "application/json": { schema: resolver(projectMilestoneSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string(), milestoneId: v.string() })),
    projectPrivilege("edit"),
    requireOrganizationPermission({ project: ["update"] }),
    async (c) => {
      const { id, milestoneId } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const milestone = await reopenProjectMilestoneCtrl(
        organizationId,
        id,
        milestoneId,
        userId,
      );
      return c.json(milestone);
    },
  )
  .put(
    "/:id/tickets/:taskId",
    describeRoute({
      operationId: "assignProjectTicketMilestone",
      tags: ["Projects"],
      description:
        "Assign, reassign, or clear a Project Milestone on a scoped ticket",
      responses: {
        200: {
          description: "Updated scoped ticket projection",
          content: {
            "application/json": { schema: resolver(projectTicketSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string(), taskId: v.string() })),
    validator("json", v.object({ projectMilestoneId: v.nullable(v.string()) })),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["update"] }),
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const { id, taskId } = c.req.valid("param");
      const { projectMilestoneId } = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const ticket = await assignProjectTicketMilestoneCtrl(
        organizationId,
        id,
        taskId,
        projectMilestoneId,
        userId,
      );
      return c.json(ticket);
    },
  )
  .get(
    "/:id/updates",
    describeRoute({
      operationId: "listProjectUpdates",
      tags: ["Projects"],
      description: "List a project's updates, newest first",
      responses: {
        200: {
          description: "Project updates (possibly empty)",
          content: {
            "application/json": {
              schema: resolver(v.array(projectUpdateSchema)),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromProject(),
    requireOrganizationPermission({ project: ["read"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const updates = await listProjectUpdatesCtrl({
        organizationId,
        projectId: id,
        userId,
      });
      return c.json(updates);
    },
  )
  .post(
    "/:id/updates",
    describeRoute({
      operationId: "createProjectUpdate",
      tags: ["Projects"],
      description: "Publish an authored health update on a project",
      responses: {
        200: {
          description: "Update published",
          content: {
            "application/json": { schema: resolver(projectUpdateSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        content: v.pipe(
          v.string(),
          v.trim(),
          v.minLength(1),
          v.maxLength(65535),
        ),
        health: v.picklist(["on-track", "at-risk", "off-track"]),
      }),
    ),
    organizationAccess.fromProject(),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const created = await createProjectUpdateCtrl({
        organizationId,
        projectId: id,
        userId,
        body,
      });
      return c.json(created);
    },
  )
  .put(
    "/:id/updates/:updateId",
    describeRoute({
      operationId: "updateProjectUpdate",
      tags: ["Projects"],
      description: "Edit an authored update (author only)",
      responses: {
        200: {
          description: "Update edited",
          content: {
            "application/json": { schema: resolver(projectUpdateSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string(), updateId: v.string() })),
    validator(
      "json",
      v.object({
        content: v.pipe(
          v.string(),
          v.trim(),
          v.minLength(1),
          v.maxLength(65535),
        ),
        health: v.picklist(["on-track", "at-risk", "off-track"]),
      }),
    ),
    organizationAccess.fromProject(),
    async (c) => {
      const { id, updateId } = c.req.valid("param");
      const body = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const updated = await updateProjectUpdateCtrl({
        organizationId,
        projectId: id,
        updateId,
        userId,
        body,
      });
      return c.json(updated);
    },
  )
  .delete(
    "/:id/updates/:updateId",
    describeRoute({
      operationId: "deleteProjectUpdate",
      tags: ["Projects"],
      description: "Delete an authored update (author only, hard delete)",
      responses: {
        200: {
          description: "Update deleted",
          content: {
            "application/json": {
              schema: resolver(v.object({ success: v.boolean() })),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string(), updateId: v.string() })),
    organizationAccess.fromProject(),
    async (c) => {
      const { id, updateId } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const result = await deleteProjectUpdateCtrl({
        organizationId,
        projectId: id,
        updateId,
        userId,
      });
      return c.json(result);
    },
  );

export default project;
