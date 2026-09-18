import { workFetch } from "@/lib/work-client";

async function setTaskArchived(taskId: string, archived: boolean) {
  const envelope = await workFetch<{
    data: { id: string; archivedAt: string | null };
    txid: number;
  }>(`/tickets/${taskId}/archive`, {
    method: "PUT",
    json: { archived },
  });
  return envelope.data;
}

export default setTaskArchived;
