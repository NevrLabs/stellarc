/**
 * Named label colours.
 *
 * `value` is what gets persisted, so an existing entry must never be renamed,
 * removed, or repointed at a different hue — that would silently repaint every
 * label already stored with it. New colours are only ever appended (#175).
 */
const labelColors = [
  // --- original palette: semantics frozen, do not repoint ---
  { value: "gray", label: "Stone", color: "var(--color-stone-500)" },
  { value: "dark-gray", label: "Slate", color: "var(--color-slate-500)" },
  { value: "purple", label: "Lavender", color: "var(--color-violet-500)" },
  { value: "teal", label: "Sage", color: "var(--color-emerald-600)" },
  { value: "green", label: "Forest", color: "var(--color-green-600)" },
  { value: "yellow", label: "Amber", color: "var(--color-amber-600)" },
  { value: "orange", label: "Terracotta", color: "var(--color-orange-600)" },
  { value: "pink", label: "Rose", color: "var(--color-rose-600)" },
  { value: "red", label: "Crimson", color: "var(--color-red-600)" },
  // --- #175: additional hues ---
  { value: "blossom", label: "Blossom", color: "var(--color-pink-500)" },
  { value: "honey", label: "Honey", color: "var(--color-amber-500)" },
  { value: "lime", label: "Lime", color: "var(--color-lime-600)" },
  { value: "emerald", label: "Emerald", color: "var(--color-emerald-500)" },
  { value: "lagoon", label: "Lagoon", color: "var(--color-cyan-600)" },
  { value: "sky", label: "Sky", color: "var(--color-sky-500)" },
  { value: "ocean", label: "Ocean", color: "var(--color-blue-600)" },
  { value: "indigo", label: "Indigo", color: "var(--color-indigo-500)" },
  { value: "violet", label: "Violet", color: "var(--color-violet-600)" },
  { value: "orchid", label: "Orchid", color: "var(--color-fuchsia-500)" },
  { value: "cocoa", label: "Cocoa", color: "var(--color-amber-800)" },
];

/** Fallback when a colour is neither a known token nor valid CSS. */
export const LABEL_COLOR_FALLBACK = "var(--color-neutral-400)";

/**
 * Whether the browser accepts `value` as a CSS colour.
 *
 * Labels synced from GitHub carry raw hex (`#0969da`), not one of our named
 * tokens, so a token-only lookup renders them all as the same grey.
 */
function isValidCssColor(value: string): boolean {
  const probe = new Option().style;
  probe.color = value;
  return probe.color !== "";
}

/**
 * Resolves a stored label colour to something CSS can paint (#169).
 *
 * Label colours come from two sources and both must render identically
 * everywhere:
 *   - Kaneo-native labels store a named token (`pink`, `green`);
 *   - GitHub-synced labels store raw hex (`#0969da`, `#8b5cf6`).
 *
 * Resolution order: named token → any valid CSS colour (covers hex) → grey.
 * Surfaces that only did the first step showed every hex label as grey, so the
 * same label looked different depending on which dropdown you opened.
 */
export function resolveLabelColor(value: string | null | undefined): string {
  if (!value) return LABEL_COLOR_FALLBACK;

  const token = labelColors.find((c) => c.value === value)?.color;
  if (token) return token;

  // Hex from GitHub is sometimes stored without the leading '#'.
  const candidate = /^[0-9a-f]{3,8}$/i.test(value) ? `#${value}` : value;

  return isValidCssColor(candidate) ? candidate : LABEL_COLOR_FALLBACK;
}

export default labelColors;
