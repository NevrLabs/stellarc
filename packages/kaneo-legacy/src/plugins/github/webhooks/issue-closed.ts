import { and, eq } from "drizzle-orm";
import db from "../../../database";
import { externalLinkTable, taskTable } from "../../../database/schema";
import { publishEvent } from "../../../events";
import { syncFollowerStatusForIssue } from "../../../repo/controllers/sync-follower-status-for-issue";
import { updateExternalLink } from "../services/link-manager";
import {
  findAllIntegrationsByRepo,
  updateTaskStatus,
} from "../services/task-service";
import { resolveTargetStatus } from "../utils/resolve-column";

type IssueClosedPayload = {
  action: string;
  issue: {
    number: number;
    title: string;
    html_url: string;
    state: string;
  };
  repository: {
    owner: { login: string };
    name: string;
    full_name: string;
  };
};

export async function handleIssueClosed(payload: IssueClosedPayload) {
  const { issue, repository } = payload;

  // #2: tasks linked directly to this issue must sync even when their board
  // has no repo integration at all. Track what the integration path already
  // updated so a board-synced task isn't touched twice.
  const handledTaskIds: string[] = [];

  const integrations = await findAllIntegrationsByRepo(
    repository.owner.login,
    repository.name,
  );

  for (const integration of integrations) {
    const externalLink = await db.query.externalLinkTable.findFirst({
      where: and(
        eq(externalLinkTable.integrationId, integration.id),
        eq(externalLinkTable.resourceType, "issue"),
        eq(externalLinkTable.externalId, issue.number.toString()),
      ),
    });

    if (!externalLink) {
      continue;
    }

    const task = await db.query.taskTable.findFirst({
      where: eq(taskTable.id, externalLink.taskId),
    });

    if (!task) {
      continue;
    }

    const existingMetadata = externalLink.metadata
      ? JSON.parse(externalLink.metadata)
      : {};

    if (existingMetadata.createdFrom === "kaneo") {
      continue;
    }

    // Was `task.projectId`, which does not exist on the task row — the board
    // rename left this reading `undefined`, so resolveTargetStatus never found
    // the board's columns and silently fell back for every close.
    const targetStatus = await resolveTargetStatus(
      task.boardId,
      "issue_closed",
      "done",
    );

    const statusResult = await updateTaskStatus(task.id, targetStatus);
    if (
      statusResult.applied &&
      statusResult.before.status !== statusResult.after.status
    ) {
      await publishEvent("task.status_changed", {
        taskId: statusResult.after.id,
        boardId: statusResult.after.boardId,
        userId: null,
        oldStatus: statusResult.before.status,
        newStatus: statusResult.after.status,
        title: statusResult.after.title,
        assigneeId: statusResult.after.userId,
        type: "status_changed",
      });
    }

    await updateExternalLink(externalLink.id, {
      metadata: {
        ...existingMetadata,
        state: "closed",
      },
    });

    handledTaskIds.push(task.id);
    break;
  }

  await syncFollowerStatusForIssue({
    owner: repository.owner.login,
    repo: repository.name,
    issueNumber: issue.number,
    eventType: "issue_closed",
    fallbackStatus: "done",
    alreadyHandledTaskIds: handledTaskIds,
  });
}
