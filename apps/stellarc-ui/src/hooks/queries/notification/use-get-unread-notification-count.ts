import { useQuery } from "@tanstack/react-query";
import getUnreadNotificationCount from "@/fetchers/notification/get-unread-notification-count";

function useGetUnreadNotificationCount() {
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: getUnreadNotificationCount,
  });
}

export default useGetUnreadNotificationCount;
