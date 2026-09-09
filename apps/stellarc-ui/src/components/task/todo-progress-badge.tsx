import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { getTodoProgress } from "@/lib/todo-progress";

type TodoProgressBadgeProps = {
  description: string | null | undefined;
  className?: string;
};

export function TodoProgressBadge({
  description,
  className,
}: TodoProgressBadgeProps) {
  const progress = getTodoProgress(description);
  if (!progress || progress.total === 0) return null;
  const allDone = progress.completed === progress.total;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-[11px]",
        allDone ? "text-success" : "text-muted-foreground",
        className,
      )}
      title={`${progress.completed}/${progress.total} done`}
    >
      <CheckCircle2 className="size-3" />
      {progress.completed}/{progress.total}
    </span>
  );
}
