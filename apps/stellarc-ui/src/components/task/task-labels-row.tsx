import type { ReactNode } from "react";

type TaskLabelsRowProps = {
  label: string;
  children: ReactNode;
};

export default function TaskLabelsRow({ label, children }: TaskLabelsRowProps) {
  return (
    <div
      className="flex min-w-0 items-center gap-2 px-2"
      data-testid="task-labels-row"
    >
      <span className="shrink-0 px-2 text-xs font-medium text-foreground/70">
        {label}
      </span>
      <div
        className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
        data-testid="task-labels-list"
      >
        {children}
      </div>
    </div>
  );
}
