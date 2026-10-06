import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import {
  projectBoardTable,
  projectRepoTable,
  projectTableLinkTable,
} from "../../../database/schema";
import { publishEvent } from "../../../events";
import { requireResourcePrivilege } from "../../../resource-access";
import {
  type ProjectResourceRelationship,
  safeSummaryFor,
} from "../../project-resource-projection";
import {
  assertProjectPrivilege,
  normalizeNullable,
  RESOURCE_TABLE,
} from "./shared";

export type UpdateProjectResourceLinkInput = {
  organizationId: string;
  projectId: string;
  linkId: string;
  userId: string;
  relationship: ProjectResourceRelationship;
  label?: string | null;
  note?: string | null;
  rank?: number;
};

const linkNotFound = () =>
  new HTTPException(404, { message: "Resource link not found" });

/**
 * KFL-368: update a Project-scoped link's mutable metadata. Resource type and
 * ID are immutable; the linked target must still be `view`-discoverable.
 */
async function updateProjectResourceLink(
  input: UpdateProjectResourceLinkInput,
) {
  await assertProjectPrivilege(
    input.organizationId,
    input.projectId,
    input.userId,
    "edit",
  );

  const scope = {
    projectId: input.projectId,
    organizationId: input.organizationId,
    linkId: input.linkId,
  };

  const found = await findLink(scope);

  if (!found) throw linkNotFound();

  const { resourceType, resourceId } = found;

  const canView = await requireResourcePrivilege({
    organizationId: input.organizationId,
    resourceType,
    resourceId,
    userId: input.userId,
    required: "view",
  });
  if (!canView) throw linkNotFound();

  const table = found.table;
  await db
    .update(table)
    .set({
      relationship: input.relationship,
      label: normalizeNullable(input.label),
      note: normalizeNullable(input.note),
      rank: input.rank ?? 0,
    })
    .where(eq(table.id, input.linkId));

  const resourceTable = RESOURCE_TABLE[resourceType];
  const [resource] = await db
    .select()
    .from(resourceTable)
    .where(
      and(
        eq(resourceTable.id, resourceId),
        eq(resourceTable.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!resource) throw linkNotFound();

  const [link] = await db
    .select()
    .from(table)
    .where(eq(table.id, input.linkId))
    .limit(1);
  if (!link) throw linkNotFound();

  await publishEvent("project.updated", {
    organizationId: input.organizationId,
    projectId: input.projectId,
  });

  return {
    id: link.id,
    projectId: link.projectId,
    resourceType,
    resourceId,
    relationship: link.relationship as ProjectResourceRelationship,
    label: link.label,
    note: link.note,
    rank: link.rank,
    createdBy: link.createdBy,
    createdAt: link.createdAt,
    resource: safeSummaryFor(resourceType, resource),
  };
}

async function findLink(scope: {
  organizationId: string;
  projectId: string;
  linkId: string;
}) {
  const where = (table: typeof projectBoardTable) =>
    and(
      eq(table.id, scope.linkId),
      eq(table.projectId, scope.projectId),
      eq(table.organizationId, scope.organizationId),
    );

  const [boardLink] = await db
    .select()
    .from(projectBoardTable)
    .where(where(projectBoardTable))
    .limit(1);
  if (boardLink) {
    return {
      table: projectBoardTable,
      resourceType: "board" as const,
      resourceId: boardLink.boardId,
    };
  }

  const [repoLink] = await db
    .select()
    .from(projectRepoTable)
    .where(
      and(
        eq(projectRepoTable.id, scope.linkId),
        eq(projectRepoTable.projectId, scope.projectId),
        eq(projectRepoTable.organizationId, scope.organizationId),
      ),
    )
    .limit(1);
  if (repoLink) {
    return {
      table: projectRepoTable,
      resourceType: "repo" as const,
      resourceId: repoLink.repoId,
    };
  }

  const [tableLink] = await db
    .select()
    .from(projectTableLinkTable)
    .where(
      and(
        eq(projectTableLinkTable.id, scope.linkId),
        eq(projectTableLinkTable.projectId, scope.projectId),
        eq(projectTableLinkTable.organizationId, scope.organizationId),
      ),
    )
    .limit(1);
  if (tableLink) {
    return {
      table: projectTableLinkTable,
      resourceType: "table" as const,
      resourceId: tableLink.tableId,
    };
  }

  return null;
}

export default updateProjectResourceLink;
