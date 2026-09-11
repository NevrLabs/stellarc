/**
 * Parent-ticket options for the create-ticket modal (#154).
 *
 * Three requirements from the ticket:
 *   1. show the ticket number, not just the title
 *   2. allow cross-board parents
 *   3. pin the selected parent to the top, above the "no parent" option
 *
 * The board's own tickets are always available; typing also pulls in matches
 * from other boards via the organization-wide search. Both shapes are
 * normalised to one option type here so the component renders a single list.
 */
export type ParentOption = {
  id: string;
  title: string;
  /** Board-scoped ticket number, e.g. 154. Null when the source omits it. */
  number: number | null;
  /** Short board key, e.g. "KFL". Null for same-board tickets. */
  boardSlug: string | null;
  /** True when the ticket lives on a different board than the one in context. */
  crossBoard: boolean;
};

type BoardTask = {
  id: string;
  title?: string | null;
  number?: number | null;
};

type SearchResult = {
  id: string;
  type?: string;
  title?: string | null;
  taskNumber?: number | null;
  boardId?: string | null;
  boardSlug?: string | null;
};

/** `KFL-154 Fix the thing`, or just the title when no number is known. */
export function formatParentLabel(option: ParentOption) {
  if (option.number === null) return option.title;
  const prefix = option.boardSlug
    ? `${option.boardSlug}-${option.number}`
    : `#${option.number}`;
  return `${prefix} ${option.title}`;
}

export function boardTaskToOption(task: BoardTask): ParentOption {
  return {
    id: task.id,
    title: task.title ?? "",
    number: task.number ?? null,
    boardSlug: null,
    crossBoard: false,
  };
}

export function searchResultToOption(
  result: SearchResult,
  currentBoardId?: string | null,
): ParentOption {
  return {
    id: result.id,
    title: result.title ?? "",
    number: result.taskNumber ?? null,
    boardSlug: result.boardSlug ?? null,
    crossBoard: Boolean(result.boardId && result.boardId !== currentBoardId),
  };
}

/**
 * Builds the rendered option list.
 *
 * The selected parent is pinned first — including when it is not in the
 * current result set, which is exactly the cross-board case: search for a
 * ticket on another board, pick it, clear the query, and it must still be
 * visible rather than silently vanishing from the list.
 */
export function buildParentOptions({
  boardTasks,
  searchResults,
  selectedId,
  selectedOption,
  query,
  currentBoardId,
}: {
  boardTasks: BoardTask[];
  searchResults: SearchResult[];
  selectedId: string | null;
  selectedOption: ParentOption | null;
  query: string;
  currentBoardId?: string | null;
}): ParentOption[] {
  const term = query.trim().toLowerCase();

  const local = boardTasks.map(boardTaskToOption).filter((option) => {
    if (!term) return true;
    return (
      option.title.toLowerCase().includes(term) ||
      String(option.number ?? "").includes(term)
    );
  });

  const remote = searchResults
    .filter((result) => (result.type ?? "task") === "task")
    .map((result) => searchResultToOption(result, currentBoardId));

  const seen = new Set<string>();
  const merged: ParentOption[] = [];

  // Pinned first, so the current choice never scrolls out of reach.
  if (selectedId) {
    const pinned =
      [...local, ...remote].find((option) => option.id === selectedId) ??
      selectedOption;
    if (pinned) {
      merged.push(pinned);
      seen.add(pinned.id);
    }
  }

  for (const option of [...local, ...remote]) {
    if (seen.has(option.id)) continue;
    seen.add(option.id);
    merged.push(option);
  }

  return merged;
}

export default buildParentOptions;
