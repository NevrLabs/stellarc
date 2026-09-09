export type GithubPermission = {
  label: string;
  detail?: string;
};

const APP_PERMISSION_FALLBACK: GithubPermission[] = [
  {
    label: "GitHub account identity",
    detail: "Used to attribute actions you initiate to your GitHub account.",
  },
  {
    label: "Installed repository access",
    detail:
      "Limited to repositories and permissions approved for the GitHub App installation.",
  },
];

/**
 * GitHub OAuth Apps return classic scopes, while GitHub App user tokens return
 * an empty scope string because their access is inherited from installations.
 * Keep that distinction visible instead of presenting an empty permission list
 * or inventing classic scopes for an App token.
 */
export function getGithubPermissions(
  scope: string | null | undefined,
): GithubPermission[] {
  const scopes = scope?.split(/[\s,]+/).filter(Boolean) ?? [];
  if (scopes.length > 0) {
    return scopes.map((label) => ({ label }));
  }
  return APP_PERMISSION_FALLBACK;
}
