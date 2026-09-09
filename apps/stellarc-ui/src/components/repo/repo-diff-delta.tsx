import { cn } from "@/lib/cn";

type RepoDiffDeltaProps = {
  additions: number | null | undefined;
  deletions: number | null | undefined;
  changedFiles?: number | null;
  className?: string;
  /** Detail views have room for the file count; list rows do not. */
  showChangedFiles?: boolean;
  /** Distinguishes the detail header delta from list-row deltas in tests. */
  testId?: string;
};

/**
 * GitHub-style `+n −n` diff delta.
 *
 * Renders nothing when both counts are unknown: a pull request whose diff
 * counts have not been mirrored yet must not claim "+0 −0", which reads as an
 * empty diff rather than missing data.
 */
export default function RepoDiffDelta({
  additions,
  deletions,
  changedFiles,
  className,
  showChangedFiles = false,
  testId,
}: RepoDiffDeltaProps) {
  if (additions == null && deletions == null) return null;

  return (
    <span
      className={cn(
        "flex items-center gap-1.5 whitespace-nowrap font-mono text-[11px] tabular-nums",
        className,
      )}
      data-slot="repo-diff-delta"
      data-testid={testId}
    >
      {showChangedFiles && changedFiles != null && (
        <span className="text-muted-foreground">
          {changedFiles} {changedFiles === 1 ? "file" : "files"}
        </span>
      )}
      <span className="text-emerald-600">+{additions ?? 0}</span>
      <span className="text-destructive">−{deletions ?? 0}</span>
    </span>
  );
}
