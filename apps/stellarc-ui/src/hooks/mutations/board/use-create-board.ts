import { useMutation, useQueryClient } from "@tanstack/react-query";
import createBoard from "@/fetchers/board/create-board";

function useCreateBoard({
  name,
  slug,
  organizationId,
  icon,
}: {
  name: string;
  slug: string;
  organizationId: string;
  icon: string;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => createBoard({ name, slug, organizationId, icon }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["boards", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["boards"] });
    },
  });
}

export default useCreateBoard;
