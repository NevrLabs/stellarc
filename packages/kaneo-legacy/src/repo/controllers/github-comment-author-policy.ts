export type GitHubCommentAuthor = "github-user" | "github-app";

export function selectGitHubCommentAuthor(hasDelegatedGrant: boolean): {
  author: GitHubCommentAuthor;
  mayFallbackToApp: boolean;
} {
  return hasDelegatedGrant
    ? { author: "github-user", mayFallbackToApp: false }
    : { author: "github-app", mayFallbackToApp: true };
}

/**
 * Attribution appended to every Kaneo-originated GitHub comment.
 *
 * The body is emitted verbatim and the attribution trails it as a single
 * quoted line. Quoting the body instead (the original behaviour) broke rich
 * markdown: images, fenced code, tables, and lists all collapse once every
 * line is prefixed with "> ".
 *
 * This applies to delegated (human-authored) comments too. GitHub's native
 * "with <App>" provenance is easy to miss, and the comment should still say
 * who wrote it when read as plain text or mirrored elsewhere.
 */
export function formatGitHubCommentBody(
  body: string,
  authorName: string | null | undefined,
): string {
  const who = authorName?.trim() || "A Kaneo user";
  return `${body.replace(/\s+$/, "")}\n\n> ${who} (sent from kaneo)`;
}
