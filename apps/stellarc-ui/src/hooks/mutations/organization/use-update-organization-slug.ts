import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/fetchers/get-api-url";

export default function useUpdateOrganizationSlug() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      slug,
    }: {
      organizationId: string;
      slug: string;
    }) => {
      const response = await fetch(
        getApiUrl(`/organization/${organizationId}/slug`),
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      return response.json() as Promise<{ id: string; slug: string }>;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
        queryClient.invalidateQueries({ queryKey: ["active-organization"] }),
      ]);
    },
  });
}
