import { Badge } from "@/components/ui/badge";
import { resolveLabelColor } from "@/constants/label-colors";

type TaskLabel = { id: string; name: string; color: string };

/**
 * Labels come from the task the caller already rendered.
 *
 * This used to fetch per task (`useGetLabelsByTask`) with `refetchOnMount`,
 * which meant one GET plus a CORS preflight per card — 186 requests on a
 * 180-task board, the last of them queued over a second deep. The board
 * payload already includes `labels` on every task, so the fetch was pure
 * duplication.
 *
 * #169: colour resolution used to live here as a private `validColor` helper.
 * It now comes from `resolveLabelColor` so the dropdowns render synced hex
 * labels the same way these chips always did.
 */
function TaskCardLabels({ labels }: { labels: TaskLabel[] | undefined }) {
  if (!labels?.length) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((label) => (
        <Badge
          key={label.id}
          variant="outline"
          className="px-2 py-0.5 text-[10px] flex items-center"
        >
          <span
            className="inline-block w-1.5 h-1.5 mr-1 rounded-full"
            style={{
              backgroundColor: resolveLabelColor(label.color),
            }}
          />
          <span className="max-w-20 truncate">{label.name}</span>
        </Badge>
      ))}
    </div>
  );
}

export default TaskCardLabels;
