import type { RunToolCall } from "./types";

/** Props the Tool component renders (trace + code-block composition). */
export interface ToolElementProps {
  /** "running" | "error" | "pending" trace status, undefined = done. */
  status: "running" | "error" | "pending" | undefined;
  /** Prefix tense the docs recipes use: Running/Failed to run/Ran/Denied. */
  title: string;
  /** Tool programmatic name for the icon + secondary label. */
  name: string | null;
  /** Collapsed once output exists; open line while running. */
  hasOutput: boolean;
  /** Rendered inside CodeBlockContent when hasOutput. */
  output: string | null;
  /** True when output is an error text (destructive code block). */
  failed: boolean;
  locations: Array<{ path: string; line?: number | null }>;
}

const titleOf = (call: RunToolCall) =>
  call.title || call.name || call.toolCallId;

const outputOf = (call: RunToolCall): string | null => {
  const parts: string[] = [];
  for (const block of call.content ?? []) {
    if (block.type === "content" && typeof block.text === "string") {
      parts.push(block.text);
    } else if (block.type === "diff") {
      parts.push(`--- ${block.path}\n${block.newText}`);
    }
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
};

/**
 * Map one merged ACP tool call to Tool element props. A call is a plain
 * TraceLine while it runs and a TraceCollapsible once output arrives
 * (shadcn Tool recipe "States" table).
 */
export function toToolElementProps(call: RunToolCall): ToolElementProps {
  const failed = call.status === "failed";
  const output = outputOf(call);
  const running = call.status === "pending" || call.status === "in_progress";
  const label = titleOf(call);

  let title: string;
  if (failed) {
    title = `Failed to run ${label}`;
  } else if (running) {
    title = `Running ${label}`;
  } else if (call.status === "completed") {
    title = `Ran ${label}`;
  } else {
    title = label;
  }

  return {
    status: running ? "running" : failed ? "error" : undefined,
    title,
    name: call.name ?? null,
    hasOutput: output !== null,
    output,
    failed,
    locations: call.locations ?? [],
  };
}
