import { useQuery } from "@tanstack/react-query";
import listProjectUpdates from "@/fetchers/project/list-project-updates";
export default function useGetProjectUpdates({
  projectId,
}: {
  projectId: string;
}) {
  return useQuery({
    queryKey: ["project-updates", projectId],
    queryFn: () => listProjectUpdates({ id: projectId }),
    enabled: !!projectId,
  });
}
