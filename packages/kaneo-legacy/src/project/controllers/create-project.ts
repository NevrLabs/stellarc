import { and, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectSlugAliasTable, projectTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { normalizeProjectSlug } from "../../identity/identity";
import { VALID_PRIORITIES } from "../../task/validate-task-fields";
import { findProjectById } from "../project-projection";
import { validateProjectLeads } from "../validate-project-leads";

export const PROJECT_STATUSES = [
  "planned",
  "started",
  "completed",
  "canceled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

const PROJECT_SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function assertValidProjectStatus(status: string): void {
  if (!(PROJECT_STATUSES as readonly string[]).includes(status)) {
    throw new HTTPException(400, {
      message: `Invalid status "${status}". Valid values: ${PROJECT_STATUSES.join(", ")}`,
    });
  }
}

export function assertValidProjectPriority(priority: string | null): void {
  if (priority === null || priority === undefined) return;
  if (!(VALID_PRIORITIES as readonly string[]).includes(priority)) {
    throw new HTTPException(400, {
      message: `Invalid priority "${priority}". Valid values: ${VALID_PRIORITIES.join(", ")}`,
    });
  }
}

export type CreateProjectInput = {
  organizationId: string;
  name: string;
  summary: string;
  leadUserId: string;
  leadTeamId?: string | null;
  createdBy: string;
  slug?: string;
  status?: string;
  priority?: string | null;
  icon?: string | null;
  color?: string | null;
  description?: string | null;
  successCriteria?: string | null;
  startDate?: string | null;
  targetDate?: string | null;
};

async function createProject(input: CreateProjectInput): Promise<string> {
  const status = input.status ?? "planned";
  assertValidProjectStatus(status);
  assertValidProjectPriority(input.priority ?? null);

  await validateProjectLeads({
    organizationId: input.organizationId,
    leadUserId: input.leadUserId,
    leadTeamId: input.leadTeamId,
  });

  const requestedSlug = normalizeProjectSlug(input.slug || slugify(input.name));
  if (
    requestedSlug.length < 2 ||
    requestedSlug.length > 63 ||
    !PROJECT_SLUG.test(requestedSlug)
  ) {
    throw new HTTPException(400, { message: "Invalid project slug" });
  }

  return db.transaction(async (tx) => {
    const [existingCanonical] = await tx
      .select({ id: projectTable.id })
      .from(projectTable)
      .where(
        and(
          eq(projectTable.organizationId, input.organizationId),
          sql`lower(${projectTable.slug}) = ${requestedSlug}`,
        ),
      )
      .limit(1);
    if (existingCanonical) {
      throw new HTTPException(409, {
        message: "Project slug is already reserved",
      });
    }

    const [existingAlias] = await tx
      .select({ id: projectSlugAliasTable.id })
      .from(projectSlugAliasTable)
      .where(
        and(
          eq(projectSlugAliasTable.organizationId, input.organizationId),
          sql`lower(${projectSlugAliasTable.slug}) = ${requestedSlug}`,
        ),
      )
      .limit(1);
    if (existingAlias) {
      throw new HTTPException(409, {
        message: "Project slug is already reserved",
      });
    }

    const [created] = await tx
      .insert(projectTable)
      .values({
        organizationId: input.organizationId,
        name: input.name,
        summary: input.summary,
        slug: requestedSlug,
        status,
        priority: input.priority ?? null,
        leadUserId: input.leadUserId,
        leadTeamId: input.leadTeamId ?? null,
        icon: input.icon ?? null,
        color: input.color ?? null,
        description: input.description ?? null,
        successCriteria: input.successCriteria ?? null,
        startDate: input.startDate ?? null,
        targetDate: input.targetDate ?? null,
        createdBy: input.createdBy,
      })
      .returning({ id: projectTable.id });

    if (!created) {
      throw new HTTPException(500, { message: "Failed to create project" });
    }
    return created.id;
  });
}

export default async function createProjectController(
  input: CreateProjectInput,
) {
  const id = await createProject(input);
  const project = await findProjectById(
    input.organizationId,
    id,
    input.createdBy,
  );
  if (!project) {
    throw new HTTPException(500, { message: "Failed to load created project" });
  }
  await publishEvent("project.created", {
    organizationId: input.organizationId,
    projectId: id,
  });
  return project;
}
