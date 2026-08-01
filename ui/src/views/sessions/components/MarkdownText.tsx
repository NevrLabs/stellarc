// @ts-nocheck
/**
 * MarkdownText — memoized streaming markdown renderer built on Streamdown.
 *
 * Replaces raw ReactMarkdown (which re-parsed the entire string on every
 * delta). Streamdown does block-level diffing, so a streaming token only
 * re-renders the affected block — not the whole message.
 *
 * Also gives us shiki syntax highlighting + copy buttons on code fences,
 * GFM tables/strikethrough, and a streaming caret — for free.
 */
import { memo, useMemo } from "react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { cjk } from "@streamdown/cjk";

const plugins = { code, cjk };

export const MarkdownText = memo(function MarkdownText({
  children,
  isStreaming = false,
  className,
}: {
  children: string;
  isStreaming?: boolean;
  className?: string;
}) {
  // Streamdown handles the parse internally; memo is mainly to short-circuit
  // parent re-renders that pass the same string.
  const content = useMemo(() => children, [children]);

  return (
    <Streamdown
      mode={isStreaming ? "streaming" : "static"}
      plugins={plugins}
      className={className}
      isAnimating={isStreaming}
      caret={isStreaming ? "block" : undefined}
    >
      {content}
    </Streamdown>
  );
});
