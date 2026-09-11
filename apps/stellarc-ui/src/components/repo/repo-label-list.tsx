import { cn } from "@/lib/cn";
import type { RepoLabel } from "@/types/repo";

function normalizeColor(color: string | null) {
  if (!color) return null;
  return color.startsWith("#") ? color : `#${color}`;
}

export default function RepoLabelList({
  labels,
  max = 3,
  className,
}: {
  labels: RepoLabel[];
  max?: number;
  className?: string;
}) {
  if (!labels || labels.length === 0) return null;

  const visible = labels.slice(0, max);
  const remaining = labels.length - visible.length;

  return (
    <span
      // flex-nowrap: in list rows these labels share a fixed-height line with
      // the title, so wrapping would grow the row and break list alignment.
      className={cn("inline-flex flex-nowrap items-center gap-1", className)}
      data-slot="repo-label-list"
    >
      {visible.map((label) => {
        const color = normalizeColor(label.color);

        return (
          <span
            className="inline-flex h-4 max-w-[8rem] items-center truncate rounded-sm border px-1 text-[10px] font-medium text-muted-foreground"
            key={label.name}
            style={
              color
                ? {
                    borderColor: `${color}66`,
                    backgroundColor: `${color}1a`,
                  }
                : undefined
            }
          >
            {label.name}
          </span>
        );
      })}
      {remaining > 0 && (
        <span className="shrink-0 text-[10px] text-muted-foreground">
          +{remaining}
        </span>
      )}
    </span>
  );
}
