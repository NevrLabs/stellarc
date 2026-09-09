import { getColumnIcon } from "@/lib/column";
import { formatDateMedium } from "@/lib/format";

export type ArchiveBadgeInput = {
  archivedAt: string | null | undefined;
  status: string;
  isFinal?: boolean;
  icon?: string | null;
};

export type ArchiveBadgeParts = {
  /** Whether to layer the Archive glyph over the status icon. */
  showArchive: boolean;
  /** The underlying icon is always the workflow status icon (#226). */
  baseIconType: "status";
};

/**
 * Archival is orthogonal to status (#226): the status badge keeps showing the
 * real workflow icon, and the Archive glyph is layered on top when
 * `archivedAt` is set. The parts object exists so surfaces can compose the
 * overlay without duplicating the orthogonality rule.
 */
export function archiveBadgeParts(input: ArchiveBadgeInput): ArchiveBadgeParts {
  return {
    showArchive: input.archivedAt != null,
    baseIconType: "status",
  };
}

/**
 * "Archived at Aug 14, 2026 by Raisal Wardana" — subtext for the ticket
 * detail, rendered beside the "sub ticket of" line. Empty when unarchived;
 * date-only when the archiver is unknown (pre-migration rows).
 */
export function formatArchivedSubtext(
  archivedAt: string | null | undefined,
  archivedByName: string | null | undefined,
): string {
  if (!archivedAt) return "";
  const date = formatDateMedium(archivedAt);
  return archivedByName
    ? `Archived at ${date} by ${archivedByName}`
    : `Archived at ${date}`;
}

/**
 * Re-export so badge surfaces can render the base icon without a second
 * import site drifting from lib/column.
 */
export { getColumnIcon };
