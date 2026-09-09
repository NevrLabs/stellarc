/**
 * Markdown normalization for task descriptions.
 *
 * Extracted from task-description.tsx so the round-trip contract can be tested
 * directly. This function runs on BOTH the save path and the hydrate path, so
 * anything it rewrites is permanent: the editor writes the normalized form, and
 * the normalized form is what comes back.
 *
 * #99: it used to collapse `\n{3,}` to `\n\n`, which silently deleted authored
 * blank lines. Reopening the drawer showed fewer line breaks than the user
 * typed. Blank lines inside the body are authored content and are preserved.
 *
 * A trailing run of newlines IS stripped: that tail is an editor artifact
 * rather than authored content, and leaving it in makes every re-hydrate look
 * like a fresh change (which re-triggers the debounced save in a loop).
 */
export function formatTaskMarkdown(markdown: string) {
  return repairSelfClosingIssueLinks(
    markdown.replace(/\r\n/g, "\n").replace(/\n+$/g, ""),
  );
}

/**
 * #128: repair legacy self-closing ticket mentions.
 *
 * `<kaneo-issue-link ... />` is not valid HTML for a non-void element, so the
 * parser treats it as an OPEN tag and everything after it gets swallowed into
 * the element — the mention rendered blank AND the rest of the description
 * disappeared.
 *
 * The serializer now emits an explicit closing tag, but descriptions already
 * saved in the old form are still in the database. Normalizing on the hydrate
 * path repairs them in place, and because this function also runs on save the
 * repaired form is what gets written back.
 */
function repairSelfClosingIssueLinks(markdown: string) {
  return markdown.replace(
    /<kaneo-issue-link\b([^>]*?)\s*\/>/g,
    "<kaneo-issue-link$1></kaneo-issue-link>",
  );
}

export default formatTaskMarkdown;
