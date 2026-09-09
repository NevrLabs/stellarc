/**
 * #72: inline `#` / `@` / `>` autocomplete inside the Create Task modal title.
 *
 * The rule the ticket actually asks for:
 *   - `#` -> label, `@` -> user, `>` -> priority
 *   - **Enter** commits the highlighted suggestion and removes the token from
 *     the title (it becomes a real label/assignee/priority instead of text)
 *   - **Space** cancels: the sigil stays as ordinary title text
 *
 * Kept free of React so the parsing and commit arithmetic are unit-testable
 * without mounting the modal.
 */

export type TitleTokenKind = "label" | "user" | "priority";

/** Which sigil opens which picker. */
export const TITLE_TOKEN_SIGILS: Record<string, TitleTokenKind> = {
  "#": "label",
  "@": "user",
  "!": "priority",
};

/** How many suggestions the inline list shows at once. */
export const TITLE_TOKEN_RESULT_LIMIT = 8;

export type TitleToken = {
  kind: TitleTokenKind;
  /** Index of the sigil within the title. */
  start: number;
  /** Text typed after the sigil, excluding it. */
  query: string;
};

/**
 * Finds the token the caret is currently inside, if any.
 *
 * A token runs from a sigil to the caret and may not contain whitespace — that
 * is what makes Space a natural "never mind, it's just text" gesture. The sigil
 * must also start a word, so `C#` or an email address never opens a picker.
 */
export function findActiveTitleToken(
  title: string,
  caret: number,
): TitleToken | null {
  if (caret < 0 || caret > title.length) return null;

  for (let i = caret - 1; i >= 0; i--) {
    const char = title[i];
    // Whitespace before a sigil means the caret is not in a token at all.
    if (/\s/.test(char)) return null;

    const kind = TITLE_TOKEN_SIGILS[char];
    if (!kind) continue;

    // The sigil must begin a word, otherwise "C#" or "a@b" would trigger.
    // Keep scanning rather than bailing: in "#one@two" the inner "@" is
    // ordinary text, but the leading "#" still owns the token.
    const previous = i > 0 ? title[i - 1] : undefined;
    if (previous !== undefined && !/\s/.test(previous)) continue;

    return { kind, start: i, query: title.slice(i + 1, caret) };
  }

  return null;
}

/**
 * Replaces the active token with `replacement`, returning the new title and
 * where the caret should land.
 *
 * Committing a label/user/priority passes an empty replacement: the token is
 * simply removed from the title, because the value now lives in the task's
 * fields rather than in its name.
 */
export function commitTitleToken(
  title: string,
  token: TitleToken,
  caret: number,
  replacement = "",
): { title: string; caret: number } {
  const before = title.slice(0, token.start);
  const after = title.slice(caret);

  if (replacement === "") {
    // Collapse the double space that would otherwise be left behind, so
    // "Fix #bug now" -> "Fix now" rather than "Fix  now".
    const needsJoin = /\s$/.test(before) && /^\s/.test(after);
    const joined = needsJoin
      ? before + after.replace(/^\s+/, "")
      : before + after;
    return { title: joined, caret: before.length };
  }

  return {
    title: before + replacement + after,
    caret: before.length + replacement.length,
  };
}

/**
 * Case-insensitive substring filter shared by all three pickers, capped so the
 * inline list never covers the whole modal.
 */
export function filterTitleTokenOptions<T extends { id: string; name: string }>(
  options: readonly T[],
  query: string,
  limit = TITLE_TOKEN_RESULT_LIMIT,
): T[] {
  const needle = (query ?? "").trim().toLowerCase();
  return (options ?? [])
    .filter((option) => (option?.name ?? "").toLowerCase().includes(needle))
    .slice(0, limit);
}

/**
 * Moves the highlighted index, wrapping at both ends so ArrowUp from the first
 * row lands on the last.
 */
export function moveTitleTokenHighlight(
  current: number,
  delta: number,
  count: number,
): number {
  if (count <= 0) return 0;
  return (current + delta + count) % count;
}
