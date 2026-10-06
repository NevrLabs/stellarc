import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  boardTable,
  repoIssueTable,
  repoTable,
  taskRepoItemLinkTable,
  taskTable,
} from "../../database/schema";
import { syncGitHubIssue } from "../services/sync-github-repo";
import { getActingOctokit } from "./manage-github-repo";

/**
 * Creates a real GitHub issue from an existing Kaneo task and makes the task
 * follow it.
 *
 * This is the inverse of addSyncedTask(): there, GitHub already had the issue.
 * Here Kaneo owns the content first, so the task's title/description seed the
 * issue, and from then on GitHub is authoritative — the same contract every
 * other follower obeys.
 *
 * The unique index task_single_synced_issue_idx allows only one synced issue per
 * task, so a task that already follows an issue is rejected before we write to
 * GitHub. Never create a remote issue we can't link.
 */
export async function createSyncedIssueForTask({
  taskId,
  repoId,
  organizationId,
  userId,
}: {
  taskId: string;
  repoId: string;
  organizationId: string;
  userId?: string;
}) {
  const [task] = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      description: taskTable.description,
      boardId: taskTable.boardId,
    })
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

  const [repo] = await db
    .select({ id: repoTable.id })
    .from(repoTable)
    .where(
      and(
        eq(repoTable.id, repoId),
        eq(repoTable.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!repo) throw new HTTPException(404, { message: "Repo not found" });

  // Reject before touching GitHub so a failure can't orphan a remote issue.
  const [alreadySynced] = await db
    .select({ id: taskRepoItemLinkTable.id })
    .from(taskRepoItemLinkTable)
    .where(
      and(
        eq(taskRepoItemLinkTable.taskId, taskId),
        eq(taskRepoItemLinkTable.syncEnabled, true),
      ),
    )
    .limit(1);
  if (alreadySynced) {
    throw new HTTPException(409, {
      message: "This task already follows a GitHub issue",
    });
  }

  // Attribute the issue to the acting member when they have delegated access,
  // falling back to the Kaneo App installation.
  const { repo: githubRepo, octokit } = await getActingOctokit(repoId, userId);

  const { data: created } = await octokit.rest.issues.create({
    owner: githubRepo.owner,
    repo: githubRepo.name,
    title: task.title,
    body: task.description ?? "",
  });

  // Mirror just this issue. A full syncGitHubRepo() re-paginates every issue
  // and PR, which on a real repo exceeds the edge proxy timeout and would
  // strand the freshly created GitHub issue with no local row to link.
  try {
    await syncGitHubIssue(
      repoId,
      created as unknown as Record<string, unknown>,
    );
  } catch (error) {
    // The remote issue already exists; a mirror failure must say so plainly
    // rather than surfacing as an anonymous 500.
    console.error("[create-synced-issue] mirror failed", error);
    throw new HTTPException(502, {
      message: `Created GitHub issue #${created.number} (${created.html_url}) but mirroring it failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }

  const [mirrored] = await db
    .select({ id: repoIssueTable.id, number: repoIssueTable.number })
    .from(repoIssueTable)
    .where(
      and(
        eq(repoIssueTable.repoId, repoId),
        eq(repoIssueTable.number, created.number),
      ),
    )
    .limit(1);
  if (!mirrored) {
    throw new HTTPException(502, {
      message: `Created GitHub issue #${created.number} but it did not mirror into Kaneo`,
    });
  }

  // A plain insert is correct here: the "already follows an issue" case was
  // rejected above, and the (task_id, repo_issue_id) unique constraint is not
  // usable as an ON CONFLICT target because repo_pull_request_id is nullable.
  try {
    await db.insert(taskRepoItemLinkTable).values({
      taskId: task.id,
      repoIssueId: mirrored.id,
      syncEnabled: true,
    });
  } catch (error) {
    console.error("[create-synced-issue] link insert failed", error);
    throw new HTTPException(502, {
      message: `Created and mirrored GitHub issue #${mirrored.number} but linking it to the task failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }

  return {
    taskId: task.id,
    repoId,
    issueId: mirrored.id,
    number: mirrored.number,
    htmlUrl: created.html_url,
  };
}
