export type UpdateEdit = { content: string; editedAt: string; userId: string };

/**
 * Append a pre-edit snapshot of `previousContent` to an Update's edit history.
 *
 * Mirrors `updateComment`'s append semantics: the array stores the content
 * as it was BEFORE each edit, so a future UI can reconstruct prior versions.
 * The compression window used by `appendDescriptionRevision` is intentionally
 * NOT applied — an Update is an authored narrative, not a free-form
 * description, and rapid successive edits by the same author still warrant
 * attributable revisions.
 */
export function appendUpdateEdit(
  history: UpdateEdit[],
  previousContent: string,
  userId: string,
): UpdateEdit[] {
  return [
    ...history,
    {
      content: previousContent,
      editedAt: new Date().toISOString(),
      userId,
    },
  ];
}
