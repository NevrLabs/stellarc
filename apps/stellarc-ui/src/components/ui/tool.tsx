import { FileText, Terminal } from "lucide-react";
import type { ReactNode } from "react";

import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import type { ToolElementProps } from "@/lib/agent-transcript";

/** Icon for an ACP tool kind, Lucide everywhere (ADR 0008). */
function ToolKindIcon({ kind }: { kind?: string | null }) {
  if (kind === "read" || kind === "edit" || kind === "fetch") {
    return <FileText />;
  }
  return <Terminal />;
}

/**
 * Tool (shadcn AI-elements recipe over Trace + Code Block): a tool call the
 * agent makes, from input to output. Plain TraceLine while running, a
 * TraceCollapsible once output arrives; failures render a destructive code
 * block.
 */
export function Tool({
  status,
  title,
  name,
  hasOutput,
  output,
  failed,
  locations,
  icon,
  description,
}: ToolElementProps & {
  icon?: ReactNode;
  description?: ReactNode;
}) {
  const line = (
    <TraceLine status={status}>
      <TraceIcon>{icon ?? <ToolKindIcon kind={name} />}</TraceIcon>
      <TraceTitle>{title}</TraceTitle>
      {description ? <TraceDescription>{description}</TraceDescription> : null}
    </TraceLine>
  );

  if (!hasOutput || output === null) {
    return <Trace>{line}</Trace>;
  }

  return (
    <Trace>
      <TraceCollapsible>
        <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="flex flex-col gap-2">
          {locations.length > 0 ? (
            <p className="font-mono text-xs text-muted-foreground">
              {locations
                .map((location) =>
                  location.line
                    ? `${location.path}:${location.line}`
                    : location.path,
                )
                .join("\n")}
            </p>
          ) : null}
          <CodeBlock size="sm" variant={failed ? "destructive" : "default"}>
            <CodeBlockContent wrap className="max-h-64">
              {output}
            </CodeBlockContent>
          </CodeBlock>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
