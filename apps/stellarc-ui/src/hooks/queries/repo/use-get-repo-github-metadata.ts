import { useQuery } from "@tanstack/react-query";
import getRepoGithubMetadata from "@/fetchers/repo/get-repo-github-metadata";

function useGetRepoGithubMetadata({
  repoId,
  enabled = true,
}: {
  repoId: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryFn: () => getRepoGithubMetadata(repoId),
    queryKey: ["repo-github-metadata", repoId],
    enabled: !!repoId && enabled,
    // Labels, assignees and milestones change rarely; avoid hammering GitHub
    // every time a picker is opened.
    staleTime: 5 * 60_000,
  });
}

export default useGetRepoGithubMetadata;
