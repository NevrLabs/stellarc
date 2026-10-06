import { isClosedStatus } from "../../../task/status-taxonomy";
import {
  findExternalLinksByTask,
  updateExternalLink,
} from "../../github/services/link-manager";
import type { PluginContext, TaskStatusChangedEvent } from "../../types";
import type { GiteaConfig } from "../config";
import { createGiteaClient } from "../utils/gitea-api";
import { addLabelsToIssueGitea, removeLabelGitea } from "../utils/labels";

export async function handleTaskStatusChanged(
  event: TaskStatusChangedEvent,
  context: PluginContext,
): Promise<void> {
  const config = context.config as GiteaConfig;
  if (!config.baseUrl || !config.accessToken) {
    return;
  }

  const { repositoryOwner, repositoryName } = config;

  try {
    const links = await findExternalLinksByTask(event.taskId);
    const issueLink = links.find(
      (link) =>
        link.integrationId === context.integrationId &&
        link.resourceType === "issue",
    );

    if (!issueLink) {
      return;
    }

    const client = createGiteaClient(config);
    const issueNumber = Number.parseInt(issueLink.externalId, 10);

    await removeLabelGitea(config, issueNumber, `status:${event.oldStatus}`);

    await addLabelsToIssueGitea(config, issueNumber, [
      `status:${event.newStatus}`,
    ]);

    const wasClosed = isClosedStatus(event.oldStatus);
    const isClosed = isClosedStatus(event.newStatus);

    // #226: terminal-to-terminal transitions only change labels; they must not
    // spuriously close/reopen the upstream issue.
    if (!wasClosed && isClosed) {
      await client.updateIssue(repositoryOwner, repositoryName, issueNumber, {
        state: "closed",
      });

      await updateExternalLink(issueLink.id, {
        metadata: {
          ...(issueLink.metadata ? JSON.parse(issueLink.metadata) : {}),
          state: "closed",
          lastOutboundStateSyncAt: Date.now(),
        },
      });
    } else if (wasClosed && !isClosed) {
      await client.updateIssue(repositoryOwner, repositoryName, issueNumber, {
        state: "open",
      });

      await updateExternalLink(issueLink.id, {
        metadata: {
          ...(issueLink.metadata ? JSON.parse(issueLink.metadata) : {}),
          state: "open",
          lastOutboundStateSyncAt: Date.now(),
        },
      });
    }
  } catch (error) {
    console.error("Failed to update Gitea issue status:", error);
  }
}
