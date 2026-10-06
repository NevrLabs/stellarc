import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { boardTable, integrationTable } from "../../database/schema";
import {
  type GiteaConfig,
  getDefaultGiteaConfig,
  normalizeGiteaBaseUrl,
  validateGiteaConfig,
} from "../../plugins/gitea/config";
import {
  createGiteaClient,
  GiteaApiError,
  verifyGiteaToken,
} from "../../plugins/gitea/utils/gitea-api";

async function createGiteaIntegration({
  boardId,
  baseUrl,
  accessToken,
  repositoryOwner,
  repositoryName,
}: {
  boardId: string;
  baseUrl: string;
  accessToken: string | undefined;
  repositoryOwner: string;
  repositoryName: string;
}) {
  const board = await db.query.boardTable.findFirst({
    where: eq(boardTable.id, boardId),
  });

  if (!board) {
    throw new HTTPException(404, { message: "Board not found" });
  }

  const normalizedBase = normalizeGiteaBaseUrl(baseUrl);

  const existingIntegration = await db.query.integrationTable.findFirst({
    where: and(
      eq(integrationTable.boardId, boardId),
      eq(integrationTable.type, "gitea"),
    ),
  });

  let resolvedToken = accessToken?.trim() ?? "";
  if (!resolvedToken && existingIntegration) {
    try {
      const prev = JSON.parse(existingIntegration.config) as GiteaConfig;
      resolvedToken = prev.accessToken;
    } catch (error) {
      console.warn("Failed to parse existing Gitea integration config", {
        integrationId: existingIntegration.id,
        error,
      });
    }
  }

  if (!resolvedToken) {
    throw new HTTPException(400, {
      message: "Personal access token is required",
    });
  }

  try {
    await verifyGiteaToken(normalizedBase, resolvedToken);

    const client = createGiteaClient({
      baseUrl: normalizedBase,
      accessToken: resolvedToken,
    });
    await client.getRepo(repositoryOwner, repositoryName);
  } catch (error) {
    if (error instanceof GiteaApiError) {
      throw new HTTPException(error.status || 400, { message: error.message });
    }
    throw error;
  }

  const allGitea = await db.query.integrationTable.findMany({
    where: eq(integrationTable.type, "gitea"),
  });

  for (const integration of allGitea) {
    if (integration.boardId === boardId) {
      continue;
    }
    if (!integration.isActive) {
      continue;
    }
    try {
      const cfg = JSON.parse(integration.config) as {
        baseUrl?: string;
        repositoryOwner?: string;
        repositoryName?: string;
      };
      if (
        normalizeGiteaBaseUrl(cfg.baseUrl ?? "") === normalizedBase &&
        cfg.repositoryOwner === repositoryOwner &&
        cfg.repositoryName === repositoryName
      ) {
        throw new HTTPException(409, {
          message: `Repository ${repositoryOwner}/${repositoryName} on this Gitea instance is already linked to another board`,
        });
      }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      console.warn(
        "Skipping invalid Gitea integration config during conflict check",
        {
          integrationId: integration.id,
          error,
        },
      );
    }
  }

  let webhookSecret = randomBytes(24).toString("hex");
  if (existingIntegration) {
    try {
      const previousConfig = JSON.parse(
        existingIntegration.config,
      ) as GiteaConfig;
      webhookSecret = previousConfig.webhookSecret ?? webhookSecret;
    } catch (error) {
      console.warn("Failed to parse existing Gitea config for webhook secret", {
        integrationId: existingIntegration.id,
        error,
      });
    }
  }

  const config: GiteaConfig = getDefaultGiteaConfig(
    normalizedBase,
    resolvedToken,
    repositoryOwner,
    repositoryName,
    webhookSecret,
  );

  const validation = await validateGiteaConfig(config);
  if (!validation.valid) {
    throw new HTTPException(400, {
      message: validation.errors?.join(", ") ?? "Invalid config",
    });
  }

  if (existingIntegration) {
    const [updated] = await db
      .update(integrationTable)
      .set({
        config: JSON.stringify(config),
        isActive: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(integrationTable.boardId, boardId),
          eq(integrationTable.type, "gitea"),
        ),
      )
      .returning();

    if (!updated) {
      throw new HTTPException(500, {
        message: "Failed to update Gitea integration",
      });
    }

    return {
      id: updated.id,
      boardId: updated.boardId,
      baseUrl: normalizedBase,
      repositoryOwner,
      repositoryName,
      webhookSecret,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  const [newIntegration] = await db
    .insert(integrationTable)
    .values({
      boardId,
      type: "gitea",
      config: JSON.stringify(config),
      isActive: true,
    })
    .returning();

  if (!newIntegration) {
    throw new HTTPException(500, {
      message: "Failed to create Gitea integration",
    });
  }

  return {
    id: newIntegration.id,
    boardId: newIntegration.boardId,
    baseUrl: normalizedBase,
    repositoryOwner,
    repositoryName,
    webhookSecret,
    isActive: newIntegration.isActive,
    createdAt: newIntegration.createdAt,
    updatedAt: newIntegration.updatedAt,
  };
}

export default createGiteaIntegration;
