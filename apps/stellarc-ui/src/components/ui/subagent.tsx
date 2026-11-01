import { Bot } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
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
import type { SubagentElementProps } from "@/lib/agent-transcript";

/**
 * Subagent (shadcn AI-elements recipe over Trace + Badge): a sub-agent run,
 * with its tool calls and result. The run is the title; opening it reveals
 * the child's work. `defaultOpen` while the child session runs, per the
 * recipe's Running section.
 */
export function Subagent({
  title,
  status,
  description,
  activity,
  children,
}: SubagentElementProps & {
  /** The child session's transcript lines (nested Trace content). */
  children?: ReactNode;
}) {
  return (
    <Trace>
      <TraceCollapsible defaultOpen={status === "running"}>
        <TraceCollapsibleTrigger>
          <TraceLine status={status}>
            <TraceIcon>
              <Bot />
            </TraceIcon>
            <TraceTitle>{title}</TraceTitle>
            {activity ? <TraceDescription>{activity}</TraceDescription> : null}
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent keepMounted className="flex flex-col gap-3">
          {description ? (
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">{description}</Badge>
            </div>
          ) : null}
          {children ? <Trace>{children}</Trace> : null}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
