import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import { publishEvent } from "../../../events";
import { requireResourcePrivilege } from "../../../resource-access";
import {
  type ProjectResourceRelationship,
  type ProjectResourceType,
  safeSummaryFor,
} from "../../project-resource-projection";
import {
  assertProjectPrivilege,
  findResourceByType,
  isUniqueViolation,
  LINK_TABLE,
  normalizeNullable,
  RESOURCE_ID_COLUMN,
  resourceNotFound,
} from "./shared";

export type CreateProjectResourceLinkInput = {
  organizationId: string;
  projectId: string;
  userId: string;
  resourceType: ProjectResourceType;
  resourceId: string;
  relationship: ProjectResourceRelationship;
  label?: string | null;
  note?: string | null;
  rank?: number;
};

/**
 * KFL-368: create a context-only Project↔Resource link. Same-organization
 * existence and target discoverability are checked at controller level for a
 * uniform no-leak 404; the composite FK re-enforces identity for race safety.
 */
async function createProjectResourceLink(
  input: CreateProjectResourceLinkInput,
) {
  await assertProjectPrivilege(
    input.organizationId,
    input.projectId,
    input.userId,
    "edit",
  );

  const resource = await findResourceByType(
    input.organizationId,
    input.resourceType,
    input.resourceId,
  );
  if (!resource) throw resourceNotFound();

  const canView = await requireResourcePrivilege({
    organizationId: input.organizationId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    userId: input.userId,
    required: "view",
  });
  if (!canView) throw resourceNotFound();

  const table = LINK_TABLE[input.resourceType];
  const idColumn = RESOURCE_ID_COLUMN[input.resourceType];

  let link: (typeof table)["$inferSelect"] | undefined;
  try {
    const [inserted] = await db
      .insert(table)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        [idColumn]: input.resourceId,
        relationship: input.relationship,
        label: normalizeNullable(input.label),
        note: normalizeNullable(input.note),
        rank: input.rank ?? 0,
        createdBy: input.userId,
      })
      .returning();
    link = inserted;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HTTPException(409, { message: "Resource already linked" });
    }
    throw error;
  }

  if (!link) throw new HTTPException(500, { message: "Failed to create link" });

  await publishEvent("project.updated", {
    organizationId: input.organizationId,
    projectId: input.projectId,
  });

  return {
    id: link.id,
    projectId: link.projectId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    relationship: link.relationship as ProjectResourceRelationship,
    label: link.label,
    note: link.note,
    rank: link.rank,
    createdBy: link.createdBy,
    createdAt: link.createdAt,
    resource: safeSummaryFor(input.resourceType, resource),
  };
}

export default createProjectResourceLink;
