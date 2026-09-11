import { useQuery } from "@tanstack/react-query";
import getProject from "@/fetchers/project/get-project";

function useGetProject({ id }: { id: string }) {
  return useQuery({
    queryFn: () => getProject({ id }),
    queryKey: ["project", id],
    enabled: !!id,
  });
}

export default useGetProject;
