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
import type { ProjectResourceType } from "../../project-resource-projection";
import { assertProjectPrivilege } from "./shared";

export type DeleteProjectResourceLinkInput = {
  organizationId: string;
  projectId: string;
  linkId: string;
  userId: string;
};

/**
 * KFL-368: delete an association row only. Never mutates the Resource.
 * Returns 204 via the router; the controller throws a uniform 404 when the
 * link is missing, cross-org, or its target is no longer viewable.
 */
async function deleteProjectResourceLink(
  input: DeleteProjectResourceLinkInput,
) {
  await assertProjectPrivilege(
    input.organizationId,
    input.projectId,
    input.userId,
    "edit",
  );

  const found = await findLink({
    organizationId: input.organizationId,
    projectId: input.projectId,
    linkId: input.linkId,
  });
  if (!found) {
    return;
  }

  const canView = await requireResourcePrivilege({
    organizationId: input.organizationId,
    resourceType: found.resourceType,
    resourceId: found.resourceId,
    userId: input.userId,
    required: "view",
  });
  if (!canView) {
    throw new HTTPException(404, { message: "Resource link not found" });
  }

  await db.delete(found.table).where(eq(found.table.id, input.linkId));

  await publishEvent("project.updated", {
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
}

type FoundLink = {
  table:
    | typeof projectBoardTable
    | typeof projectRepoTable
    | typeof projectTableLinkTable;
  resourceType: ProjectResourceType;
  resourceId: string;
};

async function findLink(scope: {
  organizationId: string;
  projectId: string;
  linkId: string;
}): Promise<FoundLink | null> {
  const [boardLink] = await db
    .select({ boardId: projectBoardTable.boardId })
    .from(projectBoardTable)
    .where(
      and(
        eq(projectBoardTable.id, scope.linkId),
        eq(projectBoardTable.projectId, scope.projectId),
        eq(projectBoardTable.organizationId, scope.organizationId),
      ),
    )
    .limit(1);
  if (boardLink) {
    return {
      table: projectBoardTable,
      resourceType: "board",
      resourceId: boardLink.boardId,
    };
  }

  const [repoLink] = await db
    .select({ repoId: projectRepoTable.repoId })
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
      resourceType: "repo",
      resourceId: repoLink.repoId,
    };
  }

  const [tableLink] = await db
    .select({ tableId: projectTableLinkTable.tableId })
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
      resourceType: "table",
      resourceId: tableLink.tableId,
    };
  }

  return null;
}

export default deleteProjectResourceLink;
