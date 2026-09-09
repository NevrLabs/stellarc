import { getColumnIcon } from "@/lib/column";
import type { TicketCandidate } from "@/lib/link-ticket-candidates";

/**
 * Row body for ticket candidates in linking pickers.
 *
 * Status is conveyed by the column's ICON (the same one the board renders),
 * not a text badge — review feedback on KFL-333: "use the status icons,
 * don't use badge for tickets." The human name stays available as a tooltip.
 */
export default function LinkTicketCandidateRow({
  task,
}: {
  task: TicketCandidate;
}) {
  return (
    <>
      <span
        className="shrink-0"
        data-testid={`link-ticket-status-icon-${task.id}`}
        title={task.statusName}
      >
        {getColumnIcon(task.status, task.statusIsFinal, task.statusIcon)}
      </span>
      <span className="font-mono text-xs text-muted-foreground">
        {task.boardSlug}-{task.number ?? "—"}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
    </>
  );
}
