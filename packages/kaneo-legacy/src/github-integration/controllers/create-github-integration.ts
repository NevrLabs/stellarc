import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { boardTable, integrationTable } from "../../database/schema";
import { defaultGitHubConfig } from "../../plugins/github/config";
import { getGithubApp } from "../../plugins/github/utils/github-app";

async function createGithubIntegration({
  boardId,
  repositoryOwner,
  repositoryName,
}: {
  boardId: string;
  repositoryOwner: string;
  repositoryName: string;
}) {
  const githubApp = getGithubApp();

  if (!githubApp) {
    throw new HTTPException(500, {
      message: "GitHub app not configured",
    });
  }

  const board = await db.query.boardTable.findFirst({
    where: eq(boardTable.id, boardId),
  });

  if (!board) {
    throw new HTTPException(404, { message: "Board not found" });
  }

  const allGitHubIntegrations = await db.query.integrationTable.findMany({
    where: eq(integrationTable.type, "github"),
  });

  for (const integration of allGitHubIntegrations) {
    if (integration.boardId === boardId) {
      continue;
    }

    try {
      const config = JSON.parse(integration.config);
      if (
        config.repositoryOwner === repositoryOwner &&
        config.repositoryName === repositoryName
      ) {
        throw new HTTPException(409, {
          message: `Repository ${repositoryOwner}/${repositoryName} is already linked to another board`,
        });
      }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
    }
  }

  let installationId: number | null = null;
  try {
    const { data: installation } =
      await githubApp.octokit.rest.apps.getRepoInstallation({
        owner: repositoryOwner,
        repo: repositoryName,
      });
    installationId = installation.id;
  } catch (error) {
    console.warn("Could not get installation ID for repository:", error);
  }

  const existingIntegration = await db.query.integrationTable.findFirst({
    where: and(
      eq(integrationTable.boardId, boardId),
      eq(integrationTable.type, "github"),
    ),
  });

  const config = {
    repositoryOwner,
    repositoryName,
    installationId,
    ...defaultGitHubConfig,
  };

  if (existingIntegration) {
    const [updatedIntegration] = await db
      .update(integrationTable)
      .set({
        config: JSON.stringify(config),
        isActive: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(integrationTable.boardId, boardId),
          eq(integrationTable.type, "github"),
        ),
      )
      .returning();

    return {
      id: updatedIntegration?.id,
      boardId: updatedIntegration?.boardId,
      repositoryOwner,
      repositoryName,
      installationId,
      isActive: updatedIntegration?.isActive,
      createdAt: updatedIntegration?.createdAt,
      updatedAt: updatedIntegration?.updatedAt,
    };
  }

  const [newIntegration] = await db
    .insert(integrationTable)
    .values({
      boardId,
      type: "github",
      config: JSON.stringify(config),
      isActive: true,
    })
    .returning();

  return {
    id: newIntegration?.id,
    boardId: newIntegration?.boardId,
    repositoryOwner,
    repositoryName,
    installationId,
    isActive: newIntegration?.isActive,
    createdAt: newIntegration?.createdAt,
    updatedAt: newIntegration?.updatedAt,
  };
}

export default createGithubIntegration;
