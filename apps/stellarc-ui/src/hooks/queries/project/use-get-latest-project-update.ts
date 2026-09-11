import { useQuery } from "@tanstack/react-query";
import listProjectUpdates from "@/fetchers/project/list-project-updates";
export default function useGetLatestProjectUpdate({
  projectId,
}: {
  projectId: string;
}) {
  return useQuery({
    queryKey: ["project-updates", "latest", projectId],
    queryFn: () => listProjectUpdates({ id: projectId }),
    enabled: !!projectId,
    select: (updates) => updates[0],
  });
}
