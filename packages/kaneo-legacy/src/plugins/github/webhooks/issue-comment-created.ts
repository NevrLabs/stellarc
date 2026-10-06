import { and, eq } from "drizzle-orm";
import db from "../../../database";
import {
  activityTable,
  boardTable,
  externalLinkTable,
  repoIssueTable,
  repoTable,
  taskRepoItemLinkTable,
  taskTable,
} from "../../../database/schema";
import { publishEvent } from "../../../events";

import { findAllIntegrationsByRepo } from "../services/task-service";

type IssueCommentPayload = {
  action: "created" | "edited" | string;
  issue: { number: number };
  comment: {
    id: number;
    body: string;
    html_url: string;
    user: { login: string; avatar_url: string } | null;
    created_at: string;
  };
  repository: { owner: { login: string }; name: string };
};

export function shouldMirrorIssueComment(payload: IssueCommentPayload) {
  return (
    (payload.action === "created" || payload.action === "edited") &&
    !(payload.comment.user?.login ?? "").endsWith("[bot]")
  );
}

export async function handleIssueCommentCreated(payload: IssueCommentPayload) {
  const { issue, comment, repository } = payload;
  if (!shouldMirrorIssueComment(payload)) return;

  const followers = new Map<string, string>();
  const integrations = await findAllIntegrationsByRepo(
    repository.owner.login,
    repository.name,
  );
  for (const integration of integrations) {
    const links = await db
      .select({ taskId: taskTable.id, boardId: taskTable.boardId })
      .from(externalLinkTable)
      .innerJoin(taskTable, eq(externalLinkTable.taskId, taskTable.id))
      .where(
        and(
          eq(externalLinkTable.integrationId, integration.id),
          eq(externalLinkTable.resourceType, "issue"),
          eq(externalLinkTable.externalId, issue.number.toString()),
        ),
      );
    for (const link of links) followers.set(link.taskId, link.boardId);
  }

  const manualFollowers = await db
    .select({ taskId: taskTable.id, boardId: boardTable.id })
    .from(taskRepoItemLinkTable)
    .innerJoin(
      repoIssueTable,
      eq(taskRepoItemLinkTable.repoIssueId, repoIssueTable.id),
    )
    .innerJoin(repoTable, eq(repoIssueTable.repoId, repoTable.id))
    .innerJoin(taskTable, eq(taskRepoItemLinkTable.taskId, taskTable.id))
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .where(
      and(
        eq(repoTable.owner, repository.owner.login),
        eq(repoTable.name, repository.name),
        eq(repoIssueTable.number, issue.number),
        eq(taskRepoItemLinkTable.syncEnabled, true),
      ),
    );
  for (const follower of manualFollowers)
    followers.set(follower.taskId, follower.boardId);

  for (const [taskId, boardId] of followers) {
    const [existing] = await db
      .select({ id: activityTable.id })
      .from(activityTable)
      .where(
        and(
          eq(activityTable.taskId, taskId),
          eq(activityTable.externalSource, "github"),
          eq(activityTable.externalUrl, comment.html_url),
        ),
      )
      .limit(1);
    const values = {
      content: comment.body,
      externalUserName: comment.user?.login ?? "Unknown",
      externalUserAvatar: comment.user?.avatar_url ?? null,
      externalSource: "github",
      externalUrl: comment.html_url,
    };
    const [activity] = await db
      .insert(activityTable)
      .values({ taskId, type: "comment", ...values })
      .onConflictDoUpdate({
        target: [
          activityTable.taskId,
          activityTable.externalSource,
          activityTable.externalUrl,
        ],
        set: values,
      })
      .returning();
    await publishEvent(existing ? "comment.updated" : "comment.created", {
      ...activity,
      taskId,
      boardId,
      comment: comment.body,
      authorName: comment.user?.login ?? "Unknown",
      externalSource: "github",
    });
  }
}
