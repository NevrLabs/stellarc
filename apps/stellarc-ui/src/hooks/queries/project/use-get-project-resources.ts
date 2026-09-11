import { useQuery } from "@tanstack/react-query";
import getProjectResources from "@/fetchers/project/get-project-resources";

function useGetProjectResources({ projectId }: { projectId: string }) {
  return useQuery({
    queryFn: () => getProjectResources({ id: projectId }),
    queryKey: ["project-resources", projectId],
    enabled: !!projectId,
  });
}

export default useGetProjectResources;
