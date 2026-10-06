import { and, eq, inArray } from "drizzle-orm";
import db from "../../../database";
import {
  boardTable,
  dataTableTable,
  projectBoardTable,
  projectRepoTable,
  projectTableLinkTable,
  repoTable,
} from "../../../database/schema";
import { listAccessibleResourceIds } from "../../../resource-access";
import {
  boardSafeSummary,
  type ProjectResourceLink,
  type ProjectResourceRelationship,
  repoSafeSummary,
  tableSafeSummary,
} from "../../project-resource-projection";
import { assertProjectPrivilege } from "./shared";

function compareLinks(a: ProjectResourceLink, b: ProjectResourceLink): number {
  return (
    a.rank - b.rank ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}

/**
 * KFL-368: union the three association tables in stable `rank, created_at, id`
 * order, applying target `view` filtering per type BEFORE projection so an
 * inaccessible linked Resource is omitted with no metadata or count leakage.
 */
async function listProjectResources(
  organizationId: string,
  projectId: string,
  userId: string,
): Promise<ProjectResourceLink[]> {
  await assertProjectPrivilege(organizationId, projectId, userId, "view");

  const [boardLinks, repoLinks, tableLinks] = await Promise.all([
    db
      .select()
      .from(projectBoardTable)
      .where(
        and(
          eq(projectBoardTable.projectId, projectId),
          eq(projectBoardTable.organizationId, organizationId),
        ),
      ),
    db
      .select()
      .from(projectRepoTable)
      .where(
        and(
          eq(projectRepoTable.projectId, projectId),
          eq(projectRepoTable.organizationId, organizationId),
        ),
      ),
    db
      .select()
      .from(projectTableLinkTable)
      .where(
        and(
          eq(projectTableLinkTable.projectId, projectId),
          eq(projectTableLinkTable.organizationId, organizationId),
        ),
      ),
  ]);

  const [visibleBoardIds, visibleRepoIds, visibleTableIds] = await Promise.all([
    listAccessibleResourceIds({
      organizationId,
      resourceType: "board",
      userId,
      resourceIds: boardLinks.map((link) => link.boardId),
    }),
    listAccessibleResourceIds({
      organizationId,
      resourceType: "repo",
      userId,
      resourceIds: repoLinks.map((link) => link.repoId),
    }),
    listAccessibleResourceIds({
      organizationId,
      resourceType: "table",
      userId,
      resourceIds: tableLinks.map((link) => link.tableId),
    }),
  ]);

  const [boards, repos, tables] = await Promise.all([
    visibleBoardIds.length > 0
      ? db
          .select()
          .from(boardTable)
          .where(
            and(
              eq(boardTable.organizationId, organizationId),
              inArray(boardTable.id, visibleBoardIds),
            ),
          )
      : Promise.resolve([]),
    visibleRepoIds.length > 0
      ? db
          .select()
          .from(repoTable)
          .where(
            and(
              eq(repoTable.organizationId, organizationId),
              inArray(repoTable.id, visibleRepoIds),
            ),
          )
      : Promise.resolve([]),
    visibleTableIds.length > 0
      ? db
          .select()
          .from(dataTableTable)
          .where(
            and(
              eq(dataTableTable.organizationId, organizationId),
              inArray(dataTableTable.id, visibleTableIds),
            ),
          )
      : Promise.resolve([]),
  ]);

  const boardById = new Map(boards.map((board) => [board.id, board]));
  const repoById = new Map(repos.map((repo) => [repo.id, repo]));
  const tableById = new Map(tables.map((table) => [table.id, table]));

  const links: ProjectResourceLink[] = [];

  for (const link of boardLinks) {
    const board = boardById.get(link.boardId);
    if (!board) continue;
    links.push({
      id: link.id,
      projectId: link.projectId,
      resourceType: "board",
      resourceId: link.boardId,
      relationship: link.relationship as ProjectResourceRelationship,
      label: link.label,
      note: link.note,
      rank: link.rank,
      createdBy: link.createdBy,
      createdAt: link.createdAt,
      resource: boardSafeSummary(board),
    });
  }

  for (const link of repoLinks) {
    const repo = repoById.get(link.repoId);
    if (!repo) continue;
    links.push({
      id: link.id,
      projectId: link.projectId,
      resourceType: "repo",
      resourceId: link.repoId,
      relationship: link.relationship as ProjectResourceRelationship,
      label: link.label,
      note: link.note,
      rank: link.rank,
      createdBy: link.createdBy,
      createdAt: link.createdAt,
      resource: repoSafeSummary(repo),
    });
  }

  for (const link of tableLinks) {
    const table = tableById.get(link.tableId);
    if (!table) continue;
    links.push({
      id: link.id,
      projectId: link.projectId,
      resourceType: "table",
      resourceId: link.tableId,
      relationship: link.relationship as ProjectResourceRelationship,
      label: link.label,
      note: link.note,
      rank: link.rank,
      createdBy: link.createdBy,
      createdAt: link.createdAt,
      resource: tableSafeSummary(table),
    });
  }

  return links.sort(compareLinks);
}

export default listProjectResources;
