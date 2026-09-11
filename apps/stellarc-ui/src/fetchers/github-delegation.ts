import { getApiUrl } from "@/fetchers/get-api-url";

export type GithubDelegationStatus = {
  connected: boolean;
  githubLogin: string | null;
  scope: string | null;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(getApiUrl(path), {
    credentials: "include",
    ...init,
  });

  if (!response.ok) {
    throw new Error((await response.text()) || "GitHub request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getGithubDelegationStatus() {
  return request<GithubDelegationStatus>("/github-delegation/status");
}

export function startGithubDelegation() {
  return { url: getApiUrl("/github-delegation/initiate") };
}

export function disconnectGithubDelegation() {
  return request<void>("/github-delegation/disconnect", { method: "DELETE" });
}
