import { useQuery } from "@tanstack/react-query";
import getOrganizations from "@/fetchers/organization/get-organizations";
import type { OrganizationPublic } from "@/lib/identity-collections";

function useGetOrganizations() {
  return useQuery<OrganizationPublic[]>({
    queryKey: ["organizations"],
    queryFn: getOrganizations,
  });
}

export default useGetOrganizations;
