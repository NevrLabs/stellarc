import { useQuery } from "@tanstack/react-query";
import getLabelsByOrganization from "@/fetchers/label/get-label-by-organization";

function useGetLabelsByOrganization(
  organizationId: string,
  { includeRepo = false }: { includeRepo?: boolean } = {},
) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["labels", organizationId],
    queryFn: () => getLabelsByOrganization({ organizationId }),
    select: (labels) =>
      includeRepo ? labels : labels.filter((label) => label.source !== "repo"),
  });
}

export default useGetLabelsByOrganization;
