import { useQuery } from "@tanstack/react-query";
import getMyFlags from "@/fetchers/flag/get-my-flags";

function useGetMyFlags(organizationId?: string) {
  return useQuery({
    queryKey: ["my-flags", organizationId],
    queryFn: () => getMyFlags(organizationId),
  });
}

export default useGetMyFlags;
