import { Check, CircleDashed, FlaskConical, X } from "lucide-react";
import type { ReactNode } from "react";

import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";

/** One test case inside a suite. */
export interface TestResultCase {
  name: string;
  status: "passed" | "failed" | "skipped";
  /** Error text for failures; rendered in a destructive code block. */
  error?: string | null;
}

/** One suite (usually a file) with its cases. */
export interface TestResultSuite {
  name: string;
  cases: TestResultCase[];
}

export interface TestResultsProps {
  /** Total passed / failed / skipped across all suites. */
  passed: number;
  failed: number;
  skipped?: number;
  suites: TestResultSuite[];
}

const caseIcon = (status: TestResultCase["status"]): ReactNode => {
  if (status === "passed") return <Check />;
  if (status === "failed") return <X />;
  return <CircleDashed />;
};

/**
 * Test Results (shadcn AI-elements recipe over Trace + Code Block): a test
 * run by the agent, with its suites and failures. The summary line counts
 * what passed and failed; suites with failures default open.
 */
export function TestResults({
  passed,
  failed,
  skipped = 0,
  suites,
}: TestResultsProps) {
  const title = `Ran ${passed + failed + skipped} tests, ${failed} failed${
    skipped > 0 ? `, ${skipped} skipped` : ""
  }`;

  return (
    <Trace>
      <TraceCollapsible defaultOpen={failed > 0}>
        <TraceCollapsibleTrigger>
          <TraceLine status={failed > 0 ? "error" : undefined}>
            <TraceIcon>
              <FlaskConical />
            </TraceIcon>
            <TraceTitle>{title}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          {suites.map((suite) => {
            const suiteFailed = suite.cases.filter(
              (testCase) => testCase.status === "failed",
            ).length;
            return (
              <TraceCollapsible key={suite.name} defaultOpen={suiteFailed > 0}>
                <TraceCollapsibleTrigger>
                  <TraceLine status={suiteFailed > 0 ? "error" : undefined}>
                    <TraceIcon>
                      {caseIcon(suiteFailed > 0 ? "failed" : "passed")}
                    </TraceIcon>
                    <TraceTitle>
                      {suite.name}, {suite.cases.length} tests
                      {suiteFailed > 0 ? `, ${suiteFailed} failed` : ""}
                    </TraceTitle>
                  </TraceLine>
                </TraceCollapsibleTrigger>
                <TraceCollapsibleContent>
                  {suite.cases.map((testCase) =>
                    testCase.status === "failed" && testCase.error ? (
                      <TraceCollapsible key={testCase.name}>
                        <TraceCollapsibleTrigger>
                          <TraceLine status="error">
                            <TraceIcon>{caseIcon(testCase.status)}</TraceIcon>
                            <TraceTitle>{testCase.name}</TraceTitle>
                          </TraceLine>
                        </TraceCollapsibleTrigger>
                        <TraceCollapsibleContent>
                          <CodeBlock size="sm" variant="destructive">
                            <CodeBlockContent wrap className="max-h-64">
                              {testCase.error}
                            </CodeBlockContent>
                          </CodeBlock>
                        </TraceCollapsibleContent>
                      </TraceCollapsible>
                    ) : (
                      <TraceLine key={testCase.name}>
                        <TraceIcon>{caseIcon(testCase.status)}</TraceIcon>
                        <TraceTitle>
                          {testCase.status === "skipped"
                            ? `Skipped ${testCase.name}`
                            : testCase.name}
                        </TraceTitle>
                      </TraceLine>
                    ),
                  )}
                </TraceCollapsibleContent>
              </TraceCollapsible>
            );
          })}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
