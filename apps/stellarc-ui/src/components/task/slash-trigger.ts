/**
 * Slash-command trigger detection, shared by the description and comment
 * editors.
 *
 * #267: both editors used `/(?:^|\s)\/([^\s/]*)$/`, which matches a **bare
 * trailing slash**. Because the slash menu being "open" made a capture-phase
 * window keydown handler swallow Enter, typing a checklist item that ends in a
 * slash — `- [ ] ship it /` — made Enter run a slash command instead of creating
 * the next item. That both failed to split the item and mangled the list.
 *
 * That was first fixed by refusing to open the menu on a lone `/` at all. It
 * stopped Enter being eaten, but it also pre-filtered the command list: the
 * menu only ever appeared once you had typed `/s`, `/t`, ... so the full list
 * of commands was impossible to browse. Discovering a command required already
 * knowing its name.
 *
 * The real distinction is between OPENING the menu and ACCEPTING from it:
 *   - a bare `/` opens the menu with an empty query, showing every command
 *   - Enter/Tab only accept a command once a query has actually been typed
 *
 * So `- [ ] ship it /` + Enter still splits the list item (#267 stays fixed),
 * while `/` on its own now shows the whole command list.
 */

export type SlashTriggerMatch = {
  /** The command query typed after the slash. Empty for a bare `/`. */
  query: string;
  /** The full matched text, including any leading space. */
  matchText: string;
};

/**
 * Only letters/digits/hyphen can start or continue a command name, and the
 * slash itself must begin a word. That keeps `and/or`, a URL path and a date
 * like `12/` from opening the menu, while matching both a bare `/` and every
 * real command (`todo`, `code-block`, `h1`).
 */
const SLASH_TRIGGER = /(?:^|\s)(\/[A-Za-z0-9][A-Za-z0-9-]*|\/)$/;

export function matchSlashTrigger(
  textBeforeCursor: string,
): SlashTriggerMatch | null {
  const match = SLASH_TRIGGER.exec(textBeforeCursor);
  if (!match) return null;

  const token = match[1];
  // Strip the leading slash to get the query the command list filters on.
  // An empty query is legitimate: it means "show me everything".
  const query = token.slice(1);

  return { query, matchText: match[0] };
}

/**
 * True when Enter should be treated as "accept the highlighted slash command"
 * rather than "insert a newline / split the list item".
 *
 * Callers must gate their Enter interception on this rather than on the mere
 * existence of menu state, so neither an open-but-empty menu nor a menu opened
 * by a bare `/` can eat Enter.
 *
 * `hasQuery` is what keeps #267 fixed now that a lone `/` opens the menu: with
 * no query typed, the menu is purely a browsable list and Enter belongs to the
 * document.
 */
export function shouldSlashMenuCaptureEnter({
  hasMenu,
  commandCount,
  hasQuery = true,
  hasExplicitSelection = false,
}: {
  hasMenu: boolean;
  commandCount: number;
  /** False when the menu was opened by a bare `/` with nothing typed after. */
  hasQuery?: boolean;
  /** True after arrow-key or pointer navigation selected a menu item. */
  hasExplicitSelection?: boolean;
}): boolean {
  return hasMenu && commandCount > 0 && (hasQuery || hasExplicitSelection);
}
