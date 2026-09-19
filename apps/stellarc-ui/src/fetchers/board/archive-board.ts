import { workFetch } from "@/lib/work-client";

async function archiveBoard(id: string) {
  const envelope = await workFetch<{
    data: { id: string; archivedAt: string | null };
    txid: number;
  }>(`/boards/${id}/archive`, { method: "POST", json: {} });
  return envelope.data;
}

export default archiveBoard;
