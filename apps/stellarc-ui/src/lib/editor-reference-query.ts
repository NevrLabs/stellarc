/**
 * Query handling for the `#` reference autocomplete.
 *
 * Typing `#` on its own must already show a list of referenceable tasks: users
 * expect the picker to open on the trigger character, not after they have
 * guessed a search term. The search endpoint rejects an empty `q`
 * (`minLength(1)`), so an empty query is mapped onto a match-everything
 * pattern instead of being dropped on the floor.
 */

/** LIKE wildcard: the API interpolates `q` into `%<q>%`, so this matches all rows. */
export const REFERENCE_MATCH_ALL_QUERY = "%";

/**
 * True when the reference menu should ask the server for results.
 *
 * Deliberately also true for an empty query — that is the eager-open case.
 */
export function shouldShowReferenceMenu(query: string): boolean {
  return typeof query === "string";
}

/**
 * #103: whether the `#` suggestion may open at the current selection.
 *
 * The trigger has to come from the person typing. Loading a task whose
 * description already contains `#3` used to be enough to pop the reference
 * menu open over the drawer, because tiptap's Suggestion plugin re-matches the
 * text around the selection on every transaction — including the programmatic
 * setContent that hydrates the editor, and including a collapsed selection
 * that merely lands next to existing `#` text.
 *
 * A real trigger requires an editable, focused editor. Hydration happens while
 * the editor is unfocused, so gating on focus removes the false open without
 * touching the genuine typing path.
 */
export function canOpenReferenceMenu(editor: {
  isFocused?: boolean;
  isEditable?: boolean;
}): boolean {
  return Boolean(editor?.isFocused && editor?.isEditable);
}

/** Maps the raw suggestion query onto the query string sent to the search API. */
export function toReferenceSearchQuery(query: string): string {
  const trimmed = (query ?? "").trim();
  return trimmed.length === 0 ? REFERENCE_MATCH_ALL_QUERY : trimmed;
}
