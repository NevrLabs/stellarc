function slugify(text: string | undefined): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/**
 * Branch name from the board's configured pattern.
 *
 * {slug} renders the CAPITALIZED board prefix (KFL-337) so the branch matches
 * the canonical ticket key shown everywhere else in the app (KFL-338).
 * {title} stays slugified lowercase — it is prose, not an identifier.
 */
export function generateBranchName(
  pattern: string,
  boardSlug: string | undefined,
  taskNumber: number | null | undefined,
  taskTitle: string | undefined,
): string {
  if (!boardSlug || !taskNumber) return "";
  return pattern
    .replace("{slug}", boardSlug.toUpperCase())
    .replace("{number}", taskNumber.toString())
    .replace("{title}", slugify(taskTitle));
}
