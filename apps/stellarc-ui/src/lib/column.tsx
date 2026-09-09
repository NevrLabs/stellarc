import { Circle } from "lucide-react";
import columnIcons, {
  DEFAULT_COLUMN_ICON_NAMES,
} from "@/constants/column-icons";

const COLUMN_ICON_COLORS: Record<string, string> = {
  "to-do": "text-slate-500 dark:text-slate-400",
  "in-progress": "text-sky-600 dark:text-sky-400",
  "in-review": "text-amber-600 dark:text-amber-400",
  done: "text-emerald-600 dark:text-emerald-400",
  archived: "text-violet-600 dark:text-violet-400",
  planned: "text-rose-600 dark:text-rose-400",
};

/**
 * Icon for a final ("done") column.
 *
 * A check-in-a-circle read as "there is a tick somewhere in here" at 16px, so
 * done was hard to tell apart from the other states at a glance (#64). This is
 * the in-progress dot taken almost all the way: a nearly full fill with a
 * deliberate gap left between the fill and the outline, so completion is
 * legible from shape alone rather than from a glyph.
 */
export const ColumnDoneIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    data-testid="column-done-icon"
  >
    <circle cx="12" cy="12" r="10" />
    {/* r=7 against the r=10 ring keeps a visible ring of background. */}
    <circle cx="12" cy="12" r="7" fill="currentColor" stroke="none" />
  </svg>
);

export const getColumnIcon = (
  columnId: string,
  isFinal?: boolean,
  iconName?: string | null,
) => {
  const className = `w-4 h-4 ${COLUMN_ICON_COLORS[columnId] ?? "text-muted-foreground"}`;
  const resolvedIconName =
    iconName ||
    DEFAULT_COLUMN_ICON_NAMES[
      columnId as keyof typeof DEFAULT_COLUMN_ICON_NAMES
    ];

  // CheckCircle2 is the done marker everywhere it appears, default or
  // explicitly configured, so it resolves to the filled circle instead.
  if (resolvedIconName === "CheckCircle2") {
    return <ColumnDoneIcon className={className} />;
  }

  const Icon =
    resolvedIconName &&
    columnIcons[resolvedIconName as keyof typeof columnIcons];

  if (Icon) {
    return <Icon className={className} />;
  }

  return isFinal ? (
    <ColumnDoneIcon className={className} />
  ) : (
    <Circle className={className} />
  );
};
