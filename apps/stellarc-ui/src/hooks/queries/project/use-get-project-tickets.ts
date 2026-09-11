import { useQuery } from "@tanstack/react-query";
import getProjectTickets from "@/fetchers/project/get-project-tickets";

function useGetProjectTickets({ id }: { id: string }) {
  return useQuery({
    queryFn: () => getProjectTickets({ id }),
    queryKey: ["project-tickets", id],
    enabled: !!id,
  });
}

export default useGetProjectTickets;
