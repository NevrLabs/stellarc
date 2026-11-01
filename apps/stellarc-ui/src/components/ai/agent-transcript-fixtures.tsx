import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ChainOfThought } from "@/components/ui/chain-of-thought";
import { Confirmation } from "@/components/ui/confirmation";
import { Subagent } from "@/components/ui/subagent";
import { TestResults } from "@/components/ui/test-results";
import { Tool } from "@/components/ui/tool";
import {
  toConfirmationElementProps,
  toSubagentElementProps,
  toToolElementProps,
} from "@/lib/agent-transcript";
import {
  fixturePermissionRequest,
  fixtureSubagentSpawns,
  fixtureTestSuites,
  fixtureThoughtSteps,
  fixtureToolCalls,
} from "@/lib/agent-transcript/fixtures";

/**
 * Dev-only fixture surface for the agent-transcript patterns (NEVR-223).
 *
 * Renders every composed AI element from recorded run fixtures so the frozen
 * Playwright suites can capture them without a live agent session. Not part
 * of the product surface: the route has no navigation entry and makes no API
 * calls (same contract as /test-error).
 */
export function AgentTranscriptFixtures() {
  const [research, tests] = fixtureSubagentSpawns;
  const researchProps = toSubagentElementProps(research);
  const testAgentProps = toSubagentElementProps(tests);

  return (
    <div
      data-testid="agent-transcript-fixtures"
      className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-8"
    >
      <section data-testid="fixture-tool-calls" className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">Tool calls</h2>
        {fixtureToolCalls.map((call) => (
          <Tool key={call.toolCallId} {...toToolElementProps(call)} />
        ))}
      </section>

      <section data-testid="fixture-subagents" className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">Subagents</h2>
        <Subagent {...researchProps}>
          <Tool {...toToolElementProps(fixtureToolCalls[0])} />
          <Tool {...toToolElementProps(fixtureToolCalls[1])} />
        </Subagent>
        <Subagent {...testAgentProps} />
      </section>

      <section
        data-testid="fixture-test-results"
        className="flex flex-col gap-4"
      >
        <h2 className="text-base font-semibold">Test results</h2>
        <TestResults
          passed={4}
          failed={1}
          suites={fixtureTestSuites.map((suite) => ({
            ...suite,
            cases: suite.cases.map((c) => ({ ...c })),
          }))}
        />
      </section>

      <section
        data-testid="fixture-confirmation"
        className="flex flex-col gap-4"
      >
        <h2 className="text-base font-semibold">Confirmation</h2>
        <Confirmation
          {...toConfirmationElementProps(fixturePermissionRequest)}
          onDecide={() => {}}
        />
      </section>

      <section
        data-testid="fixture-chain-of-thought"
        className="flex flex-col gap-4"
      >
        <h2 className="text-base font-semibold">Chain of thought</h2>
        <ChainOfThought
          title="Researched in 3 steps"
          status={undefined}
          steps={fixtureThoughtSteps}
          badges={
            <>
              <Badge variant="secondary">nextjs.org</Badge>
              <Badge variant="secondary">github.com</Badge>
            </>
          }
        />
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="size-3" />
        Recorded run fixtures — composed shadcn AI elements over trace +
        code-block (NEVR-223).
      </p>
    </div>
  );
}
