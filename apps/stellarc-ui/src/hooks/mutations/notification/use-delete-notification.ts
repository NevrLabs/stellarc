import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteNotification from "@/fetchers/notification/delete-notification";
import type { Notification } from "@/types/notification";

function useDeleteNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationIds: string[]) =>
      Promise.all(notificationIds.map((id) => deleteNotification(id))),
    onMutate: async (notificationIds) => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const previous = queryClient.getQueryData<Notification[]>([
        "notifications",
      ]);
      const removed = new Set(notificationIds);
      queryClient.setQueryData<Notification[]>(["notifications"], (current) =>
        current?.filter(({ id }) => !removed.has(id)),
      );
      return { previous };
    },
    onError: (_error, _notificationIds, context) => {
      queryClient.setQueryData(["notifications"], context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export default useDeleteNotification;
