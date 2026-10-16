import { ArrowUpRight, Globe } from "lucide-react";

import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import type { SourcesElementProps } from "@/lib/agent-transcript";

/**
 * Sources (shadcn AI-elements recipe over Trace, after the chatbot
 * template's sources-part): the web-search citations a tool call used,
 * as a collapsible "Used N sources" line. Copy-in and owned here — no
 * import from the template repo; unique-by-URL dedupe happens in the
 * adapter (toSourcesElementProps), not in the layout.
 */
export function Sources({ count, sources }: SourcesElementProps) {
  if (count === 0) {
    return null;
  }

  return (
    <Trace>
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine>
            <TraceIcon>
              <Globe />
            </TraceIcon>
            <TraceTitle>
              Used {count} {count === 1 ? "source" : "sources"}
            </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <Trace>
            {sources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noreferrer"
              >
                <TraceLine>
                  <TraceIcon>
                    <Globe />
                  </TraceIcon>
                  <TraceTitle>
                    {source.title}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </TraceTitle>
                  <TraceIcon>
                    <ArrowUpRight />
                  </TraceIcon>
                </TraceLine>
              </a>
            ))}
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
