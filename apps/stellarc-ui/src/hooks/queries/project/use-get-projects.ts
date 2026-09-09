import { useQuery } from "@tanstack/react-query";
import getProjects from "@/fetchers/project/get-projects";

function useGetProjects({
  organizationId,
  includeArchived,
}: {
  organizationId: string;
  includeArchived?: boolean;
}) {
  return useQuery({
    queryFn: () =>
      getProjects({
        organizationId,
        includeArchived: includeArchived ? "true" : undefined,
      }),
    queryKey: ["projects", organizationId, includeArchived ?? false],
    enabled: !!organizationId,
  });
}

export default useGetProjects;
