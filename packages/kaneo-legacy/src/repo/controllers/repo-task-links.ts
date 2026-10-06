import { and, eq, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  boardTable,
  externalLinkTable,
  repoIssueTable,
  repoPullRequestTable,
  taskRepoItemLinkTable,
  taskTable,
} from "../../database/schema";

type RepoItemType = "issue" | "pullRequest";

type TaskLink = {
  id: string;
  taskId: string;
  createdAt: Date;
  syncEnabled: boolean;
  syncBrokenAt: Date | null;
  syncBrokenReason: string | null;
  task: {
    id: string;
    title: string;
    status: string;
    priority: string | null;
    number: number | null;
    boardId: string;
  };
};

function itemColumn(itemType: RepoItemType) {
  return itemType === "issue"
    ? taskRepoItemLinkTable.repoIssueId
    : taskRepoItemLinkTable.repoPullRequestId;
}

function itemTable(itemType: RepoItemType) {
  return itemType === "issue" ? repoIssueTable : repoPullRequestTable;
}

/**
 * Tasks linked to a repository issue or pull request, from BOTH linkage
 * mechanisms (#174).
 *
 * A task can be attached to a GitHub item two independent ways:
 *   1. `task_repo_item_link` — written by "Create synced issue in repo" and by
 *      manual linking from the task's Resources panel;
 *   2. `external_link` — written by the board↔GitHub integration, which has no
 *      `task_repo_item_link` row at all.
 *
 * Reading only (1) is why board-integration-synced tasks were invisible here:
 * 9 of 10 such tasks had no repo-item link, so the issue view showed an empty
 * task list while the task itself displayed the issue as synced.
 */
export async function getRepoItemTaskLinks(
  repoId: string,
  number: number,
  itemType: RepoItemType,
  organizationId: string,
): Promise<TaskLink[]> {
  const item = itemTable(itemType);
  const itemId = itemColumn(itemType);

  const repoItemLinks = await db
    .select({
      id: taskRepoItemLinkTable.id,
      taskId: taskTable.id,
      createdAt: taskRepoItemLinkTable.createdAt,
      syncEnabled: taskRepoItemLinkTable.syncEnabled,
      syncBrokenAt: taskRepoItemLinkTable.syncBrokenAt,
      syncBrokenReason: taskRepoItemLinkTable.syncBrokenReason,
      task: {
        id: taskTable.id,
        title: taskTable.title,
        status: taskTable.status,
        priority: taskTable.priority,
        number: taskTable.number,
        boardId: taskTable.boardId,
      },
    })
    .from(taskRepoItemLinkTable)
    .innerJoin(taskTable, eq(taskRepoItemLinkTable.taskId, taskTable.id))
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .innerJoin(item, eq(itemId, item.id))
    .where(
      and(
        eq(item.repoId, repoId),
        eq(item.number, number),
        eq(boardTable.organizationId, organizationId),
        isNull(taskTable.deletedAt),
      ),
    );

  // Only issues arrive via the integration; pull requests have no such path.
  if (itemType !== "issue") return repoItemLinks;

  const integrationLinks = await getIntegrationTaskLinks(
    repoId,
    number,
    organizationId,
  );

  // A task reachable through both mechanisms must appear once. The repo-item
  // link wins because it carries the real sync flags.
  const seen = new Set(repoItemLinks.map((link) => link.taskId));

  return [
    ...repoItemLinks,
    ...integrationLinks.filter((link) => !seen.has(link.taskId)),
  ];
}

/**
 * Tasks attached to an issue by the board↔GitHub integration (#174).
 *
 * `external_link` stores the issue as a URL plus its number, with no repo
 * foreign key, so the repository is matched on the mirrored item's own URL
 * rather than a join column.
 */
async function getIntegrationTaskLinks(
  repoId: string,
  number: number,
  organizationId: string,
): Promise<TaskLink[]> {
  const issue = await db.query.repoIssueTable.findFirst({
    where: and(
      eq(repoIssueTable.repoId, repoId),
      eq(repoIssueTable.number, number),
    ),
    columns: { url: true },
  });
  if (!issue?.url) return [];

  const rows = await db
    .select({
      id: externalLinkTable.id,
      taskId: taskTable.id,
      createdAt: externalLinkTable.createdAt,
      task: {
        id: taskTable.id,
        title: taskTable.title,
        status: taskTable.status,
        priority: taskTable.priority,
        number: taskTable.number,
        boardId: taskTable.boardId,
      },
    })
    .from(externalLinkTable)
    .innerJoin(taskTable, eq(externalLinkTable.taskId, taskTable.id))
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .where(
      and(
        eq(externalLinkTable.resourceType, "issue"),
        eq(externalLinkTable.url, issue.url),
        eq(boardTable.organizationId, organizationId),
        isNull(taskTable.deletedAt),
      ),
    );

  return rows.map((row) => ({
    ...row,
    // The integration link IS the sync; it has no separate flag or break state.
    syncEnabled: true,
    syncBrokenAt: null,
    syncBrokenReason: null,
  }));
}

export async function getTaskRepoItemLinks(
  taskId: string,
  organizationId: string,
) {
  const rows = await db
    .select({
      id: taskRepoItemLinkTable.id,
      createdAt: taskRepoItemLinkTable.createdAt,
      // #75: whether this link is a two-way *sync* or a plain mention. The
      // column was always written (createSyncedIssueForTask sets it true) but
      // never selected, so the UI could not tell Synced from Linked and
      // rendered every row — including freshly created synced issues — as a
      // plain link.
      syncEnabled: taskRepoItemLinkTable.syncEnabled,
      issue: {
        id: repoIssueTable.id,
        number: repoIssueTable.number,
        title: repoIssueTable.title,
        state: repoIssueTable.state,
        url: repoIssueTable.url,
        repoId: repoIssueTable.repoId,
      },
      pullRequest: {
        id: repoPullRequestTable.id,
        number: repoPullRequestTable.number,
        title: repoPullRequestTable.title,
        state: repoPullRequestTable.state,
        url: repoPullRequestTable.url,
        repoId: repoPullRequestTable.repoId,
      },
    })
    .from(taskRepoItemLinkTable)
    .innerJoin(taskTable, eq(taskRepoItemLinkTable.taskId, taskTable.id))
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .leftJoin(
      repoIssueTable,
      eq(taskRepoItemLinkTable.repoIssueId, repoIssueTable.id),
    )
    .leftJoin(
      repoPullRequestTable,
      eq(taskRepoItemLinkTable.repoPullRequestId, repoPullRequestTable.id),
    )
    .where(
      and(
        eq(taskRepoItemLinkTable.taskId, taskId),
        eq(boardTable.organizationId, organizationId),
      ),
    );

  return rows.map((row) => {
    const item = row.issue?.id ? row.issue : row.pullRequest;
    return {
      id: row.id,
      createdAt: row.createdAt,
      syncEnabled: row.syncEnabled ?? false,
      itemType: row.issue?.id
        ? ("issues" as const)
        : ("pull-requests" as const),
      repoId: item?.repoId ?? "",
      number: item?.number ?? 0,
      title: item?.title ?? "",
      state: item?.state ?? "",
      url: item?.url ?? "",
    };
  });
}

export async function addRepoItemTaskLink({
  repoId,
  number,
  itemType,
  taskId,
  organizationId,
}: {
  repoId: string;
  number: number;
  itemType: RepoItemType;
  taskId: string;
  organizationId: string;
}) {
  const item = itemTable(itemType);
  const itemId = itemColumn(itemType);
  const [repoItem] = await db
    .select({ id: item.id })
    .from(item)
    .where(and(eq(item.repoId, repoId), eq(item.number, number)))
    .limit(1);
  if (!repoItem) {
    throw new HTTPException(404, {
      message: `${itemType === "issue" ? "Issue" : "Pull request"} not found`,
    });
  }

  const [task] = await db
    .select({ id: taskTable.id })
    .from(taskTable)
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .where(
      and(
        eq(taskTable.id, taskId),
        eq(boardTable.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!task) throw new HTTPException(404, { message: "Task not found" });

  const values =
    itemType === "issue"
      ? { taskId, repoIssueId: repoItem.id }
      : { taskId, repoPullRequestId: repoItem.id };
  const [link] = await db
    .insert(taskRepoItemLinkTable)
    .values(values)
    .onConflictDoNothing()
    .returning();
  if (link) return link;

  const [existing] = await db
    .select()
    .from(taskRepoItemLinkTable)
    .where(
      and(eq(taskRepoItemLinkTable.taskId, taskId), eq(itemId, repoItem.id)),
    )
    .limit(1);
  return existing;
}

export async function removeRepoItemTaskLink({
  repoId,
  number,
  itemType,
  taskId,
  organizationId,
}: {
  repoId: string;
  number: number;
  itemType: RepoItemType;
  taskId: string;
  organizationId: string;
}) {
  const item = itemTable(itemType);
  const itemId = itemColumn(itemType);
  const [link] = await db
    .select({ id: taskRepoItemLinkTable.id })
    .from(taskRepoItemLinkTable)
    .innerJoin(taskTable, eq(taskRepoItemLinkTable.taskId, taskTable.id))
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .innerJoin(item, eq(itemId, item.id))
    .where(
      and(
        eq(item.repoId, repoId),
        eq(item.number, number),
        eq(taskTable.id, taskId),
        eq(boardTable.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!link) throw new HTTPException(404, { message: "Task link not found" });

  await db
    .delete(taskRepoItemLinkTable)
    .where(eq(taskRepoItemLinkTable.id, link.id));
  return link;
}

export type { RepoItemType };
