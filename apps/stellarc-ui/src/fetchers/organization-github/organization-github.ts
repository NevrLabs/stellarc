import { getApiUrl } from "@/fetchers/get-api-url";

export type GithubInstallation = {
  installationId: number;
  accountId?: number | null;
  accountLogin?: string | null;
  accountType?: string | null;
  accountAvatarUrl?: string | null;
  repositorySelection?: string | null;
  permissions?: Record<string, string> | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(getApiUrl(path), {
    credentials: "include",
    ...init,
  });

  if (!response.ok) {
    throw new Error((await response.text()) || "GitHub request failed");
  }

  return (await response.json()) as T;
}

export function getOrganizationGithubInstallations(organizationId: string) {
  return request<GithubInstallation[]>(
    `/organization-github?organizationId=${encodeURIComponent(organizationId)}`,
  );
}

export function getOrganizationGithubInstallUrl(organizationId: string) {
  return request<{ url: string }>(
    `/organization-github/install-url?organizationId=${encodeURIComponent(organizationId)}`,
  );
}

export function getAvailableOrganizationGithubInstallations(
  organizationId: string,
) {
  return request<GithubInstallation[]>(
    `/organization-github/available?organizationId=${encodeURIComponent(organizationId)}`,
  );
}

export type GithubRepository = {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  isPrivate: boolean;
  defaultBranch: string;
  installationId: number;
};

export function getOrganizationGithubRepositories(organizationId: string) {
  return request<GithubRepository[]>(
    `/organization-github/repositories?organizationId=${encodeURIComponent(organizationId)}`,
  );
}

export function connectOrganizationGithubInstallation({
  organizationId,
  installationId,
}: {
  organizationId: string;
  installationId: number;
}) {
  return request<GithubInstallation>("/organization-github", {
    body: JSON.stringify({ organizationId, installationId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

export function disconnectOrganizationGithubInstallation({
  organizationId,
  installationId,
}: {
  organizationId: string;
  installationId: number;
}) {
  return request<{ success: true }>(
    `/organization-github/${installationId}?organizationId=${encodeURIComponent(organizationId)}`,
    { method: "DELETE" },
  );
}
