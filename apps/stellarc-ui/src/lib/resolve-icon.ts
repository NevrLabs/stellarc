import type { ComponentType } from "react";
import boardIcons from "@/constants/board-icons";

/**
 * Resolution for a stored board/repo icon value (#171, #172).
 *
 * An icon value can be:
 *   - a lucide name from the shared `board-icons` map (`Rocket`, `Target`);
 *   - an emoji (`🚀`) — #171 asks for these alongside our own icons;
 *   - a legacy/mistyped value that matches nothing (`github`, `Flask`) — #172.
 *
 * Lookup is case-insensitive with a small alias table, so the values already in
 * the database resolve to a real icon instead of silently falling back to the
 * generic glyph on every surface that renders them.
 */
export type ResolvedIcon =
  | {
      kind: "lucide";
      Icon: ComponentType<
        { className?: string } & Record<`data-${string}`, unknown>
      >;
    }
  | { kind: "emoji"; emoji: string };

/**
 * Values seen in the wild that aren't valid map keys (#172).
 *
 * `github` was stored lowercase and has no entry; `Flask` doesn't exist in
 * lucide at all — the map exports `FlaskConical`.
 */
const ALIASES: Record<string, keyof typeof boardIcons> = {
  flask: "FlaskConical",
  github: "GitBranch",
  git: "GitBranch",
  kanban: "FolderKanban",
  board: "Layout",
  book: "BookOpen",
  tool: "PenTool",
};

/** Case-insensitive index of the shared icon map, built once. */
const BY_LOWER_NAME = new Map(
  Object.keys(boardIcons).map((name) => [name.toLowerCase(), name]),
);

/**
 * Whether `value` is (just) an emoji rather than an icon name.
 *
 * Emoji are matched by Unicode property rather than a hardcoded range so
 * flags, skin-tone modifiers and ZWJ sequences all work.
 */
export function isEmojiIcon(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 16) return false;

  try {
    /*
      A ZWJ composes several emoji into one grapheme, so it cannot live inside a
      character class — it has to be an alternation branch of its own.
    */
    return /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\u200d|\ufe0f|\p{Emoji}|\p{Emoji_Modifier}|\p{Emoji_Component})*$/u.test(
      trimmed,
    );
  } catch {
    // Older engines without Unicode property escapes: treat any non-ASCII
    // single grapheme as an emoji rather than crashing.
    return !/^[\x20-\x7e]+$/.test(trimmed);
  }
}

/**
 * Resolves a stored icon value to something renderable.
 *
 * Falls back to `Layout`, matching what every existing surface already did for
 * unknown values.
 */
export function resolveIcon(value: string | null | undefined): ResolvedIcon {
  const trimmed = (value ?? "").trim();

  if (!trimmed) return { kind: "lucide", Icon: boardIcons.Layout };
  if (isEmojiIcon(trimmed)) return { kind: "emoji", emoji: trimmed };

  const exact = boardIcons[trimmed as keyof typeof boardIcons];
  if (exact) return { kind: "lucide", Icon: exact };

  const lower = trimmed.toLowerCase();

  const aliased = ALIASES[lower];
  if (aliased && boardIcons[aliased]) {
    return { kind: "lucide", Icon: boardIcons[aliased] };
  }

  const caseInsensitive = BY_LOWER_NAME.get(lower);
  if (caseInsensitive) {
    return {
      kind: "lucide",
      Icon: boardIcons[caseInsensitive as keyof typeof boardIcons],
    };
  }

  return { kind: "lucide", Icon: boardIcons.Layout };
}

/** Whether a value resolves to a real icon rather than the generic fallback. */
export function isKnownIconValue(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return false;
  if (isEmojiIcon(trimmed)) return true;

  const lower = trimmed.toLowerCase();
  return (
    Boolean(boardIcons[trimmed as keyof typeof boardIcons]) ||
    Boolean(ALIASES[lower]) ||
    BY_LOWER_NAME.has(lower)
  );
}
