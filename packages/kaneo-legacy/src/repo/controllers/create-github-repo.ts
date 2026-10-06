import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { organizationGithubInstallationTable } from "../../database/schema";
import { getInstallationOctokit } from "../../plugins/github/utils/github-app";
import createRepo from "./create-repo";

export async function createGithubRepo({
  organizationId,
  installationId,
  owner,
  name,
}: {
  organizationId: string;
  installationId: number;
  owner: string;
  name: string;
}) {
  const connection =
    await db.query.organizationGithubInstallationTable.findFirst({
      where: and(
        eq(organizationGithubInstallationTable.organizationId, organizationId),
        eq(organizationGithubInstallationTable.installationId, installationId),
      ),
    });
  if (!connection) {
    throw new HTTPException(400, {
      message: "GitHub account is not connected to this organization",
    });
  }

  try {
    const octokit = await getInstallationOctokit(installationId);
    const { data } = await octokit.rest.repos.get({ owner, repo: name });
    return await createRepo({
      organizationId,
      provider: "github",
      owner: data.owner.login,
      name: data.name,
      url: data.html_url,
      externalId: String(data.id),
      description: data.description ?? undefined,
      defaultBranch: data.default_branch,
      isPrivate: data.private,
      // Internal execution metadata only; it is never UI-entered or API-exposed.
      config: { installationId },
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    const status = (error as { status?: number }).status;
    if (status === 404)
      throw new HTTPException(404, {
        message: "Repository is not available to this GitHub account",
      });
    throw error;
  }
}
