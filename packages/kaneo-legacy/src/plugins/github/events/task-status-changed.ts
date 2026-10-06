import { isClosedStatus } from "../../../task/status-taxonomy";
import type { PluginContext, TaskStatusChangedEvent } from "../../types";
import type { GitHubConfig } from "../config";
import {
  findExternalLinksByTask,
  updateExternalLink,
} from "../services/link-manager";
import { getGithubApp, getInstallationIdForRepo } from "../utils/github-app";
import { addLabelsToIssue, removeLabel } from "../utils/labels";

export async function handleTaskStatusChanged(
  event: TaskStatusChangedEvent,
  context: PluginContext,
): Promise<void> {
  const githubApp = getGithubApp();
  if (!githubApp) {
    return;
  }

  const config = context.config as GitHubConfig;
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

    let installationId = config.installationId;
    if (!installationId) {
      installationId = await getInstallationIdForRepo(
        repositoryOwner,
        repositoryName,
      );
    }

    const octokit = await githubApp.getInstallationOctokit(installationId);
    const issueNumber = Number.parseInt(issueLink.externalId, 10);

    await removeLabel(
      octokit,
      repositoryOwner,
      repositoryName,
      issueNumber,
      `status:${event.oldStatus}`,
    );

    await addLabelsToIssue(
      octokit,
      repositoryOwner,
      repositoryName,
      issueNumber,
      [`status:${event.newStatus}`],
    );

    const wasClosed = isClosedStatus(event.oldStatus);
    const isClosed = isClosedStatus(event.newStatus);

    // #226: Done, Canceled and Duplicate are all terminal outcomes. Moving
    // between terminal outcomes changes labels but must not toggle the issue.
    if (!wasClosed && isClosed) {
      await octokit.rest.issues.update({
        owner: repositoryOwner,
        repo: repositoryName,
        issue_number: issueNumber,
        state: "closed",
      });

      await updateExternalLink(issueLink.id, {
        metadata: {
          ...(issueLink.metadata ? JSON.parse(issueLink.metadata) : {}),
          state: "closed",
        },
      });
    } else if (wasClosed && !isClosed) {
      await octokit.rest.issues.update({
        owner: repositoryOwner,
        repo: repositoryName,
        issue_number: issueNumber,
        state: "open",
      });

      await updateExternalLink(issueLink.id, {
        metadata: {
          ...(issueLink.metadata ? JSON.parse(issueLink.metadata) : {}),
          state: "open",
        },
      });
    }
  } catch (error) {
    console.error("Failed to update GitHub issue status:", error);
  }
}
