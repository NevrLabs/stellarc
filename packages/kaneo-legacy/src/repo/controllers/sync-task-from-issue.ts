import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  boardTable,
  repoIssueTable,
  taskRepoItemLinkTable,
  taskTable,
} from "../../database/schema";
import { getGitHubRepoClient } from "./manage-github-repo";

const accessLostReason =
  "GitHub access lost — the App may have been uninstalled";

export async function markSyncBroken(linkId: string, reason: string) {
  await db
    .update(taskRepoItemLinkTable)
    .set({
      syncBrokenAt: new Date(),
      syncBrokenReason: reason,
    })
    .where(eq(taskRepoItemLinkTable.id, linkId));
}

export async function syncFollowersForIssue({
  repoIssueId,
  title,
  body,
}: {
  repoIssueId: string;
  title: string;
  body: string | null;
}) {
  return db.transaction(async (tx) => {
    const followers = await tx
      .select({ taskId: taskRepoItemLinkTable.taskId })
      .from(taskRepoItemLinkTable)
      .where(
        and(
          eq(taskRepoItemLinkTable.repoIssueId, repoIssueId),
          eq(taskRepoItemLinkTable.syncEnabled, true),
        ),
      );
    await Promise.all(
      followers.map(({ taskId }) =>
        tx
          .update(taskTable)
          .set({ title, description: body ?? "" })
          .where(eq(taskTable.id, taskId)),
      ),
    );
    await tx
      .update(taskRepoItemLinkTable)
      .set({ syncBrokenAt: null, syncBrokenReason: null })
      .where(
        and(
          eq(taskRepoItemLinkTable.repoIssueId, repoIssueId),
          eq(taskRepoItemLinkTable.syncEnabled, true),
        ),
      );
    return followers;
  });
}

export async function syncTaskFromIssue({
  repoId,
  number,
  taskId,
  organizationId,
}: {
  repoId: string;
  number: number;
  taskId: string;
  organizationId: string;
}) {
  const [link] = await db
    .select({
      id: taskRepoItemLinkTable.id,
      repoIssueId: taskRepoItemLinkTable.repoIssueId,
    })
    .from(taskRepoItemLinkTable)
    .innerJoin(taskTable, eq(taskRepoItemLinkTable.taskId, taskTable.id))
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .innerJoin(
      repoIssueTable,
      eq(taskRepoItemLinkTable.repoIssueId, repoIssueTable.id),
    )
    .where(
      and(
        eq(taskRepoItemLinkTable.taskId, taskId),
        eq(taskRepoItemLinkTable.syncEnabled, true),
        eq(repoIssueTable.repoId, repoId),
        eq(repoIssueTable.number, number),
        eq(boardTable.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!link)
    throw new HTTPException(409, {
      message: "Task is not a synced follower of this issue",
    });
  try {
    const { repo, octokit } = await getGitHubRepoClient(repoId);
    const { data: issue } = await octokit.rest.issues.get({
      owner: repo.owner,
      repo: repo.name,
      issue_number: number,
    });
    if ("pull_request" in issue && issue.pull_request)
      throw new HTTPException(409, {
        message: "Pull requests cannot be synced as tasks",
      });
    await db.transaction(async (tx) => {
      await tx
        .update(taskTable)
        .set({ title: issue.title, description: issue.body ?? "" })
        .where(eq(taskTable.id, taskId));
      await tx
        .update(taskRepoItemLinkTable)
        .set({ syncBrokenAt: null, syncBrokenReason: null })
        .where(eq(taskRepoItemLinkTable.id, link.id));
    });
    return db.query.taskTable.findFirst({ where: eq(taskTable.id, taskId) });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 403 || status === 404)
      await markSyncBroken(link.id, accessLostReason);
    throw error;
  }
}

export { accessLostReason };
