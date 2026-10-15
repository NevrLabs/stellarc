import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChainOfThought } from "@/components/ui/chain-of-thought";
import { Confirmation } from "@/components/ui/confirmation";
import { Subagent } from "@/components/ui/subagent";
import { TestResults } from "@/components/ui/test-results";
import { Tool } from "@/components/ui/tool";
import {
  type ConfirmationElementProps,
  type ToolElementProps,
  toConfirmationElementProps,
  toSubagentElementProps,
  toToolElementProps,
} from "@/lib/agent-transcript";

const toolProps = (
  overrides: Partial<Parameters<typeof toToolElementProps>[0]>,
): ToolElementProps =>
  toToolElementProps({
    toolCallId: "call-x",
    title: "git status",
    status: "completed",
    content: [{ type: "content", text: "nothing to commit" }],
    ...overrides,
  });

const confirmationProps = (): ConfirmationElementProps =>
  toConfirmationElementProps({
    sessionId: "s",
    toolCallId: "c",
    toolName: "bash",
    title: "rm -rf dist",
    options: [
      { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
      { optionId: "reject_once", name: "Deny", kind: "reject_once" },
    ],
  });

describe("toToolElementProps", () => {
  it("maps a running tool call to a shimmering Running line", () => {
    const props = toolProps({ status: "in_progress", content: undefined });
    expect(props.status).toBe("running");
    expect(props.title).toBe("Running git status");
    expect(props.hasOutput).toBe(false);
  });

  it("maps a completed call with content to an expandable Ran line", () => {
    const props = toolProps({});
    expect(props.status).toBeUndefined();
    expect(props.title).toBe("Ran git status");
    expect(props.hasOutput).toBe(true);
    expect(props.output).toBe("nothing to commit");
  });

  it("maps a failed call to the error status and destructive output", () => {
    const props = toolProps({
      title: "pnpm --version",
      status: "failed",
      content: [{ type: "content", text: "command not found: pnpm" }],
    });
    expect(props.status).toBe("error");
    expect(props.title).toBe("Failed to run pnpm --version");
    expect(props.failed).toBe(true);
  });

  it("renders diff content blocks as file-annotated output", () => {
    const props = toolProps({
      content: [
        {
          type: "diff",
          path: "src/a.ts",
          oldText: "old",
          newText: "new text",
        },
      ],
    });
    expect(props.output).toContain("src/a.ts");
    expect(props.output).toContain("new text");
  });
});

describe("toConfirmationElementProps", () => {
  it("maps a permission request to the question and protocol options", () => {
    const props = confirmationProps();
    expect(props.title).toBe("Run rm -rf dist?");
    expect(props.options).toHaveLength(2);
    expect(props.options[0]).toMatchObject({
      label: "Allow once",
      variant: "default",
    });
    expect(props.options[1]).toMatchObject({
      label: "Deny",
      variant: "outline",
    });
  });
});

describe("toSubagentElementProps", () => {
  it("maps a running child session to a shimmering Running title", () => {
    const props = toSubagentElementProps({
      sessionId: "child-1",
      title: "the research agent",
      description: "Find the slow deploy.",
      state: { state: "running", activity: "reading logs" },
    });
    expect(props.status).toBe("running");
    expect(props.title).toBe("Running the research agent");
    expect(props.activity).toBe("reading logs");
  });

  it("maps an idle child session to a done title", () => {
    const props = toSubagentElementProps({
      sessionId: "child-2",
      title: "the test agent",
      state: { state: "idle" },
    });
    expect(props.status).toBeUndefined();
    expect(props.title).toBe("Ran the test agent");
  });
});

describe("Tool component", () => {
  it("renders output inside a collapsed code block after completion", () => {
    const props = toolProps({});
    render(<Tool {...props} />);
    expect(screen.getByText("Ran git status")).toBeVisible();
    // Collapsed by default: output hidden until the trigger opens it.
    expect(screen.queryByText("nothing to commit")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /ran git status/i }));
    expect(screen.getByText("nothing to commit")).toBeVisible();
  });
});

describe("Confirmation component", () => {
  it("fires onDecide with the chosen option id", () => {
    const onDecide = vi.fn();
    const props = confirmationProps();
    render(<Confirmation {...props} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
    expect(onDecide).toHaveBeenCalledWith("allow_once");
  });
});

describe("TestResults component", () => {
  it("renders the summary line and opens failed suites", () => {
    render(
      <TestResults
        passed={1}
        failed={1}
        suites={[
          {
            name: "a.test.ts",
            cases: [
              {
                name: "flaky",
                status: "failed",
                error: "Expected 2, received 1",
              },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByText("Ran 2 tests, 1 failed")).toBeVisible();
    expect(screen.getByText("a.test.ts, 1 tests, 1 failed")).toBeVisible();
  });
});

describe("Subagent + ChainOfThought", () => {
  it("subagent renders nested tool lines as children", () => {
    const props = toSubagentElementProps({
      sessionId: "child",
      title: "the research agent",
      state: { state: "idle" },
    });
    render(
      <Subagent {...props}>
        <span>Ran grep -rn cacheKey scripts</span>
      </Subagent>,
    );
    expect(screen.getByText("Ran the research agent")).toBeVisible();
    // Idle runs collapse (keepMounted): expand to reveal the child work.
    fireEvent.click(
      screen.getByRole("button", { name: /ran the research agent/i }),
    );
    expect(screen.getByText("Ran grep -rn cacheKey scripts")).toBeVisible();
  });

  it("chain-of-thought renders its summary and steps", () => {
    render(
      <ChainOfThought
        title="Researched in 3 steps"
        status={undefined}
        steps={[
          { title: "Read the build log" },
          { title: "Searched the code" },
        ]}
      />,
    );
    expect(screen.getByText("Researched in 3 steps")).toBeVisible();
    // Completed summaries collapse; expand to reveal the steps.
    fireEvent.click(
      screen.getByRole("button", { name: /researched in 3 steps/i }),
    );
    expect(screen.getByText("Read the build log")).toBeVisible();
  });
});
