import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { repoTable } from "../../database/schema";
import { getGitHubRepoClient } from "./manage-github-repo";

export type GitHubRelease = {
  id: number;
  tagName: string;
  name: string | null;
  body: string | null;
  publishedAt: string | null;
  createdAt: string;
  isDraft: boolean;
  isPrerelease: boolean;
  url: string;
  assets: Array<{
    id: number;
    name: string;
    size: number;
    downloadUrl: string;
    downloadCount: number;
  }>;
};

export type GitHubPackage = {
  id: number;
  name: string;
  packageType: string;
  visibility: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  versionCount: number;
};

function toPackage(pkg: {
  id: number;
  name: string;
  package_type: string;
  visibility: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  version_count: number;
}): GitHubPackage {
  return {
    id: pkg.id,
    name: pkg.name,
    packageType: pkg.package_type,
    visibility: pkg.visibility,
    url: pkg.html_url,
    createdAt: pkg.created_at,
    updatedAt: pkg.updated_at,
    versionCount: pkg.version_count,
  };
}

async function isGitHubRepo(repoId: string) {
  const [repo] = await db
    .select({ provider: repoTable.provider })
    .from(repoTable)
    .where(eq(repoTable.id, repoId))
    .limit(1);

  if (!repo) throw new HTTPException(404, { message: "Repo not found" });
  return repo.provider === "github";
}

/** Lists live GitHub releases. Non-GitHub repositories return an empty list. */
export async function listGitHubRepoReleases(
  repoId: string,
): Promise<GitHubRelease[]> {
  if (!(await isGitHubRepo(repoId))) return [];

  const { repo, octokit } = await getGitHubRepoClient(repoId);
  const releases = await octokit.paginate(octokit.rest.repos.listReleases, {
    owner: repo.owner,
    repo: repo.name,
    per_page: 100,
  });

  return releases.map((release) => ({
    id: release.id,
    tagName: release.tag_name,
    name: release.name ?? null,
    body: release.body ?? null,
    publishedAt: release.published_at ?? null,
    createdAt: release.created_at,
    isDraft: release.draft,
    isPrerelease: release.prerelease,
    url: release.html_url,
    assets: release.assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      size: asset.size,
      downloadUrl: asset.browser_download_url,
      downloadCount: asset.download_count,
    })),
  }));
}

/**
 * Lists container packages owned by the repository owner. GitHub packages are
 * owner-scoped rather than repo-scoped, and GitHub Apps may not have Packages
 * permission. A missing/inaccessible endpoint is deliberately an empty list.
 */
export async function listGitHubRepoPackages(
  repoId: string,
): Promise<GitHubPackage[]> {
  if (!(await isGitHubRepo(repoId))) return [];

  const { repo, octokit } = await getGitHubRepoClient(repoId);
  const parameters = {
    username: repo.owner,
    package_type: "container" as const,
    per_page: 100,
  };

  try {
    const packages = await octokit.paginate(
      "GET /users/{username}/packages",
      parameters,
    );
    return packages.map(toPackage);
  } catch {
    try {
      const packages = await octokit.paginate("GET /orgs/{org}/packages", {
        org: repo.owner,
        package_type: "container",
        per_page: 100,
      });
      return packages.map(toPackage);
    } catch {
      // The GitHub Packages API returns 404 when Packages permission is absent
      // or when the owner type does not match. Do not expose provider details.
      return [];
    }
  }
}
