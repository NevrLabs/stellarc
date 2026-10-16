import type { RunToolCall } from "./types";

/** One citation the Sources collapsible renders (deduped by URL). */
export interface SourceEntry {
  /** Resolved label: the resource's title, or its hostname. */
  title: string;
  /** Absolute http(s) URL the link opens. */
  url: string;
}

/** Props the Sources element renders (trace-only composition). */
export interface SourcesElementProps {
  /** "Used N sources" count = unique source entries. */
  count: number;
  /** Unique-by-URL citations, first-seen order. */
  sources: SourceEntry[];
}

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const hostnameOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

/**
 * Collect the resource_link blocks a (web-search) tool call produced into
 * unique-by-URL source entries. Non-http(s) URIs (mcp://, file://, …) are
 * dropped: the element opens browser links, not MCP resources.
 */
export function toSourcesElementProps(call: RunToolCall): SourcesElementProps {
  const sources: SourceEntry[] = [];
  const seen = new Set<string>();
  for (const block of call.content ?? []) {
    if (block.type !== "resource_link" || !isHttpUrl(block.uri)) continue;
    if (seen.has(block.uri)) continue;
    seen.add(block.uri);
    sources.push({
      title: block.title || block.name || hostnameOf(block.uri),
      url: block.uri,
    });
  }
  return { count: sources.length, sources };
}
