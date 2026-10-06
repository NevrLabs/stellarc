import { Octokit } from "octokit";
import { getUsableDelegatedToken } from "../../github-delegation";

type Installation = {
  id: number;
  account?: {
    id?: number;
    login?: string;
    type?: string;
    avatar_url?: string;
  } | null;
  repository_selection?: string;
  permissions?: Record<string, string>;
};

/** List only GitHub App installations visible to the acting GitHub user. */
export async function listAdministeredInstallations({
  userId,
}: {
  organizationId: string;
  userId: string;
}) {
  const accessToken = await getUsableDelegatedToken(userId);
  if (!accessToken) return [];

  const octokit = new Octokit({ auth: accessToken });
  const installations = await octokit.paginate(
    octokit.rest.apps.listInstallationsForAuthenticatedUser,
    { per_page: 100 },
  );
  return installations as Installation[];
}

export function toInstallationResponse(installation: Installation) {
  return {
    installationId: installation.id,
    accountId: installation.account?.id,
    accountLogin: installation.account?.login,
    accountType: installation.account?.type,
    accountAvatarUrl: installation.account?.avatar_url,
    repositorySelection: installation.repository_selection,
    permissions: installation.permissions,
  };
}
