/**
 * Normalize blank-line runs in comment markdown WITHOUT deleting paragraph
 * separation (KFL-330: blank lines still get truncated).
 *
 * The old normalizeMarkdown collapsed `\n{3,}` → `\n\n` correctly, but the
 * on-keystroke path ALSO collapsed `\n{2,}$` → `\n` which could eat the final
 * paragraph break; and the load path re-flowed single newlines inside
 * `<details>`. The real truncation, though, happened because the regexes ran
 * inside fenced code blocks too — where blank lines are literal content.
 * Splitting on fences keeps prose normalization from touching code.
 */
export function preserveParagraphSpacing(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, "\n");

  // Split into fence / non-fence segments; only normalize prose segments.
  const segments = normalized.split(/(```[\s\S]*?(?:```|$))/g);
  return segments
    .map((segment, index) => {
      if (index % 2 === 1) return segment; // inside a fence — literal content
      return segment
        .replace(/\n{3,}/g, "\n\n") // many blanks → exactly one blank line
        .replace(/\n{2,}$/g, "\n"); // single trailing newline at EOF
    })
    .join("");
}
