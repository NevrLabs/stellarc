import { createGitHubComment } from "../../../repo/controllers/manage-github-repo";
import type { PluginContext, TaskCommentCreatedEvent } from "../../types";
import type { GitHubConfig } from "../config";
import { findExternalLinkByTaskAndType } from "../services/link-manager";
import { getGithubApp, getInstallationIdForRepo } from "../utils/github-app";

export async function handleTaskCommentCreated(
  event: TaskCommentCreatedEvent,
  context: PluginContext,
): Promise<void> {
  const githubApp = getGithubApp();
  if (!githubApp) {
    return;
  }

  const config = context.config as GitHubConfig;
  const { repositoryOwner, repositoryName } = config;

  const existingLink = await findExternalLinkByTaskAndType(
    event.taskId,
    context.integrationId,
    "issue",
  );

  if (!existingLink) {
    return;
  }

  const installationId =
    config.installationId ??
    (await getInstallationIdForRepo(repositoryOwner, repositoryName));
  const installationOctokit =
    await githubApp.getInstallationOctokit(installationId);

  await createGitHubComment({
    owner: repositoryOwner,
    repo: repositoryName,
    number: Number.parseInt(existingLink.externalId, 10),
    body: event.comment,
    userId: event.userId,
    installationOctokit,
    fallbackToInstallation: true,
  });
}
