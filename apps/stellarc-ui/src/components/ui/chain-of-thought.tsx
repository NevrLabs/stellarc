import { Brain } from "lucide-react";
import type { ReactNode } from "react";

import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";

export interface ChainOfThoughtProps {
  /** Summary tense while running, past tense once done ("Researched in 3 steps"). */
  title: string;
  status: "running" | "error" | "pending" | undefined;
  /** The steps taken; each renders as its own TraceLine. */
  steps: Array<{
    title: string;
    status?: "running" | "error" | "pending";
  }>;
  /** Badge chips (e.g. search-result hostnames). */
  badges?: ReactNode;
}

/**
 * Chain of Thought (shadcn AI-elements recipe over Trace + Badge): a summary
 * line that expands into the steps an agent took. The summary opens while
 * steps run; steps keep their state via keepMounted.
 */
export function ChainOfThought({
  title,
  status,
  steps,
  badges,
}: ChainOfThoughtProps) {
  return (
    <Trace>
      <TraceCollapsible defaultOpen={status === "running"}>
        <TraceCollapsibleTrigger>
          <TraceLine status={status}>
            <TraceIcon>
              <Brain />
            </TraceIcon>
            <TraceTitle>{title}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent keepMounted>
          <Trace>
            {steps.map((step) => (
              <TraceLine key={step.title} status={step.status}>
                <TraceIcon>
                  <Brain />
                </TraceIcon>
                <TraceTitle>{step.title}</TraceTitle>
              </TraceLine>
            ))}
          </Trace>
          {badges ? (
            <div className="mt-2 flex flex-wrap gap-1.5">{badges}</div>
          ) : null}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
