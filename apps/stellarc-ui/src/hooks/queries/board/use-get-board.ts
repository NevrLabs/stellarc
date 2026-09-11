import { useQuery } from "@tanstack/react-query";
import { boardQueryOptions } from "@/lib/navigation-prefetch";

function useGetBoard({
  id,
  organizationId,
}: {
  id: string;
  organizationId: string;
}) {
  return useQuery({
    ...boardQueryOptions(organizationId, id),
    enabled: !!id,
  });
}

export default useGetBoard;
