import { useQuery } from "@tanstack/react-query";
import getProjectMilestones from "@/fetchers/project/get-project-milestones";

export default function useGetProjectMilestones(projectId: string) {
  return useQuery({
    queryKey: ["project-milestones", projectId],
    queryFn: () => getProjectMilestones({ projectId }),
    enabled: Boolean(projectId),
  });
}
