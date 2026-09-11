/**
 * #265: links and attachments already present in a task's description surface
 * as resources.
 *
 * These are DERIVED, never persisted. The description stays the single source of
 * truth, so a resource row cannot drift from the text that produced it: edit the
 * description and the list follows automatically, with nothing to reconcile.
 *
 * The description is markdown (see `formatTaskMarkdown`), and the editor also
 * writes raw HTML for images and embeds, so both shapes are scanned.
 */
export type DescriptionResource = {
  /** Stable within a task: the URL is the identity of a link resource. */
  id: string;
  url: string;
  /** Link text / alt text / filename, whichever is available. */
  title: string;
  kind: "image" | "link";
};

/** Only http(s) is surfaced — a resource must be something the user can open. */
function isHttpUrl(value: string) {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Trailing punctuation is not part of a bare URL. Markdown like `see https://x.com.`
 * would otherwise yield `https://x.com.` and 404 when clicked.
 */
function trimTrailingPunctuation(url: string) {
  return url.replace(/[).,;:!?'"\]]+$/, "");
}

/** Last path segment, used as a fallback label for attachments. */
function filenameFromUrl(url: string) {
  try {
    const { pathname } = new URL(url);
    const segment = pathname.split("/").filter(Boolean).pop();
    return segment ? decodeURIComponent(segment) : url;
  } catch {
    return url;
  }
}

export function extractDescriptionResources(
  description: string | null | undefined,
): DescriptionResource[] {
  if (!description) return [];

  const found: DescriptionResource[] = [];

  const push = (rawUrl: string, title: string, kind: "image" | "link") => {
    const url = trimTrailingPunctuation(rawUrl.trim());
    if (!isHttpUrl(url)) return;
    found.push({
      id: url,
      url,
      title: title.trim() || filenameFromUrl(url),
      kind,
    });
  };

  // Markdown images: ![alt](url) — matched before links, since a link regex
  // would otherwise swallow the image and lose the `image` kind.
  for (const match of description.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) {
    push(match[2] ?? "", match[1] ?? "", "image");
  }

  // Markdown links: [text](url). The leading (?<!!) keeps images out.
  for (const match of description.matchAll(
    /(?<!!)\[([^\]]*)\]\(([^)\s]+)\)/g,
  )) {
    push(match[2] ?? "", match[1] ?? "", "link");
  }

  // Raw HTML the editor writes for images and attachments.
  for (const match of description.matchAll(
    /<img\b[^>]*?src=["']([^"']+)["'][^>]*>/gi,
  )) {
    const tag = match[0];
    const alt = /alt=["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
    push(match[1] ?? "", alt, "image");
  }

  for (const match of description.matchAll(
    /<a\b[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    // Strip any nested markup from the anchor's label.
    const label = (match[2] ?? "").replace(/<[^>]*>/g, "");
    push(match[1] ?? "", label, "link");
  }

  // Bare URLs. Anything already captured above is deduped below, so a URL that
  // appears inside markdown syntax is not double counted.
  for (const match of description.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
    push(match[0], "", "link");
  }

  // Dedupe by URL, keeping the FIRST occurrence: markdown/HTML matches run
  // before the bare-URL sweep, so a titled link keeps its title instead of
  // being overwritten by a bare match with no label.
  const unique = new Map<string, DescriptionResource>();
  for (const resource of found) {
    if (!unique.has(resource.url)) unique.set(resource.url, resource);
  }

  return [...unique.values()];
}

export default extractDescriptionResources;
