import { useQuery } from "@tanstack/react-query";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import { getPendingInvitations } from "@/fetchers/invitation/get-pending-invitations";

export function usePendingInvitations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["invitations", "pending", user?.email],
    queryFn: getPendingInvitations,
    enabled: !!user?.email,
    refetchInterval: 60000,
  });
}
