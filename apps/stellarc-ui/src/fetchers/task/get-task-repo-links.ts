import { getApiUrl } from "@/fetchers/get-api-url";

export type TaskRepoLink = {
  id: string;
  itemType: "issues" | "pull-requests";
  /**
   * True when the ticket's content is bidirectionally synced to this issue
   * (#75). False for a plain link, which only records that the ticket mentions
   * the issue.
   */
  syncEnabled: boolean;
  repoId: string;
  number: number;
  title: string;
  state: string;
  url: string;
  createdAt: string;
};

async function getTaskRepoLinks(taskId: string) {
  if (!taskId) return [];

  const response = await fetch(getApiUrl(`/task/${taskId}/repo-links`), {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error((await response.text()) || "Could not load linked items.");
  }

  return (await response.json()) as TaskRepoLink[];
}

export default getTaskRepoLinks;
