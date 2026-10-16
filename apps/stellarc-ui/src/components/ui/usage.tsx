import { Coins } from "lucide-react";

import {
  Trace,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import {
  contextOf,
  fmtInt,
  formatCost,
  type UsageElementProps,
} from "@/lib/agent-transcript";

/**
 * Usage (trace-only composition, NEVR-243): the harness-reported cost/token
 * telemetry the plane recorded for each attempt of a run — the shape-language
 * of Multica's per-run row (tokens in/out/total, context/window, cost), not
 * its code. Harness-reported only: absent cost renders an em-dash, never
 * $0.00; no pricing table, no client-side computation.
 */
export function Usage({ totals, lines }: UsageElementProps) {
  if (lines.length === 0) {
    return null;
  }

  return (
    <Trace data-testid="usage-element">
      {totals ? (
        <TraceLine data-testid="usage-totals">
          <TraceIcon>
            <Coins />
          </TraceIcon>
          <TraceTitle>
            {totals.attempts} {totals.attempts === 1 ? "run" : "runs"} ·{" "}
            {fmtInt(totals.tokensTotal)} tokens
          </TraceTitle>
          <TraceDescription>
            {fmtInt(totals.tokensIn)} in / {fmtInt(totals.tokensOut)} out ·{" "}
            {formatCost(totals.costAmount, totals.costCurrency)}
          </TraceDescription>
        </TraceLine>
      ) : null}
      {lines.map((line) => (
        <TraceLine
          key={line.attempt}
          data-testid={`usage-attempt-${line.attempt}`}
        >
          <TraceIcon aria-hidden={false}>
            <span className="text-xs tabular-nums">{line.attempt}</span>
          </TraceIcon>
          <TraceTitle>Attempt {line.attempt}</TraceTitle>
          <TraceDescription>
            {fmtInt(line.tokensIn)} in / {fmtInt(line.tokensOut)} out ·{" "}
            {fmtInt(line.tokensTotal)} total
          </TraceDescription>
          <TraceDescription>ctx {contextOf(line)}</TraceDescription>
          <TraceDescription>
            {formatCost(line.costAmount, line.costCurrency)}
          </TraceDescription>
        </TraceLine>
      ))}
    </Trace>
  );
}
