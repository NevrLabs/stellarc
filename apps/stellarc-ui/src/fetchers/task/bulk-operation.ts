import { workFetch } from "@/lib/work-client";

/** Fork bulk grammar ({taskIds, operation, value}) → work API calls. */
export default async function bulkOperation({
  taskIds,
  operation,
  value,
}: {
  taskIds: string[];
  operation:
    | "archive"
    | "updateStatus"
    | "updateAssignee"
    | "updateTeam"
    | "updatePriority"
    | "addLabel"
    | "updateDueDate";
  value?: string | boolean | null;
}) {
  // archive is not a patch member: per-ticket archive PUTs (#226 semantics).
  if (operation === "archive") {
    const results = await Promise.all(
      taskIds.map((id) =>
        workFetch<{ data: { id: string }; txid: number }>(
          `/tickets/${id}/archive`,
          { method: "PUT", json: { archived: value !== false } },
        ),
      ),
    );
    return results.map((r) => r.data);
  }
  // addLabel is a label-attach call per ticket (work labels are task-scoped
  // rows); updateDueDate falls back to per-ticket PATCH until the bulk
  // envelope carries dates (work patch union: status/priority/assignee/team).
  if (operation === "addLabel") {
    const results = await Promise.all(
      taskIds.map((id) =>
        workFetch<{ data: { id: string }; txid: number }>(
          `/labels/${value}/task`,
          { method: "PUT", json: { taskId: id } },
        ),
      ),
    );
    return results.map((r) => r.data);
  }
  if (operation === "updateDueDate") {
    const results = await Promise.all(
      taskIds.map((id) =>
        workFetch<{ data: { id: string }; txid: number }>(`/tickets/${id}`, {
          method: "PATCH",
          json: { dueDate: value ?? null },
        }),
      ),
    );
    return results.map((r) => r.data);
  }
  const patch: Record<string, unknown> = {};
  if (operation === "updateStatus") patch.status = value;
  if (operation === "updateAssignee") patch.assigneeId = value ?? null;
  if (operation === "updateTeam") patch.teamId = value ?? null;
  if (operation === "updatePriority") patch.priority = value;
  const envelope = await workFetch<{ data: { ids: string[] }; txid: number }>(
    "/tickets/bulk",
    { method: "PATCH", json: { ids: taskIds, patch } },
  );
  return envelope.data;
}
