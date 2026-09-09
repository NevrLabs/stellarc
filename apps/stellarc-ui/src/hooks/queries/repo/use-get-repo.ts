import { useQuery } from "@tanstack/react-query";
import { repoQueryOptions } from "@/lib/navigation-prefetch";

function useGetRepo({ id }: { id: string }) {
  return useQuery({
    ...repoQueryOptions(id),
    enabled: !!id,
  });
}

export default useGetRepo;
