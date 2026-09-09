/**
 * Shared shape + grouping for "link an existing ticket" pickers.
 *
 * Sectioning by board mirrors how the GitHub-resource palette sections by
 * repository: a flat cross-organization list is unusable once more than a
 * couple of boards exist (reported: "quite hard to select the issue/PR and
 * board").
 */

export type TicketCandidate = {
  id: string;
  title: string;
  number: number | null;
  boardId: string;
  boardName: string;
  boardSlug: string;
  /** Column slug, e.g. "in-progress". */
  status: string;
  /** Human column name, e.g. "In Progress", for the icon tooltip. */
  statusName: string;
  /** Column's configured icon name (null = default for the slug). */
  statusIcon: string | null;
  /** Whether the column is final ("done"), for the filled done icon. */
  statusIsFinal: boolean;
};

export type TicketCandidateGroup = {
  boardId: string;
  boardName: string;
  items: TicketCandidate[];
};

export function groupTicketCandidatesByBoard(
  candidates: TicketCandidate[],
): TicketCandidateGroup[] {
  const groups = new Map<string, TicketCandidateGroup>();
  for (const item of candidates) {
    let group = groups.get(item.boardId);
    if (!group) {
      group = { boardId: item.boardId, boardName: item.boardName, items: [] };
      groups.set(item.boardId, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}
