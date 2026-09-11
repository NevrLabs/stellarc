import { History } from "lucide-react";
import { MarkdownRenderer } from "@/components/public-board/markdown-renderer";
import useGetTask from "@/hooks/queries/task/use-get-task";
import { formatDateTime } from "@/lib/format";

type TaskDescriptionRevision = {
  content: string | null;
  editedAt: string;
  userId: string;
};

export default function TaskDescriptionHistory({ taskId }: { taskId: string }) {
  const { data: task } = useGetTask(taskId);
  const history =
    (
      task as typeof task & {
        descriptionHistory?: TaskDescriptionRevision[];
      }
    )?.descriptionHistory ?? [];

  if (history.length === 0) return null;

  return (
    <details className="mt-2 rounded-md border border-border/70 px-3 py-2 text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground">
        <History className="size-3" />
        Description edit history ({history.length})
      </summary>
      <div className="mt-2 space-y-2">
        {[...history].reverse().map((revision) => (
          <div
            className="rounded-md bg-muted/50 p-2"
            key={`${revision.editedAt}-${revision.userId}`}
          >
            <div className="mb-1 text-muted-foreground">
              {formatDateTime(revision.editedAt)}
            </div>
            {revision.content ? (
              <MarkdownRenderer content={revision.content} />
            ) : (
              <p className="text-muted-foreground">No description</p>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
