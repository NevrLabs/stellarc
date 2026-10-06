/**
 * Provider credentials belong in repo.config at rest but must never cross the
 * API boundary. Keep non-secret metadata (e.g. GitHub installationId) useful
 * to the client while stripping tokens and webhook secrets.
 */
export function toRepoResponse<T extends { config: unknown } | undefined>(
  repo: T,
) {
  if (!repo) return repo;
  const config =
    repo.config && typeof repo.config === "object"
      ? { ...(repo.config as Record<string, unknown>) }
      : repo.config;

  if (config && typeof config === "object") {
    delete (config as Record<string, unknown>).accessToken;
    delete (config as Record<string, unknown>).webhookSecret;
  }

  return { ...repo, config };
}

export function toRepoResponses<T extends { config: unknown } | undefined>(
  repos: T[],
) {
  return repos.map(toRepoResponse);
}
