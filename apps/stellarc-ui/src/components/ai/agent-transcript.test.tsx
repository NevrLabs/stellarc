import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalCard } from "@/components/ui/approval-card";
import { ChainOfThought } from "@/components/ui/chain-of-thought";
import { Confirmation } from "@/components/ui/confirmation";
import { Sources } from "@/components/ui/sources";
import { Subagent } from "@/components/ui/subagent";
import { TestResults } from "@/components/ui/test-results";
import { Tool } from "@/components/ui/tool";
import {
  type ConfirmationElementProps,
  type ToolElementProps,
  toApprovalCardElementProps,
  toConfirmationElementProps,
  toSourcesElementProps,
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

// The vitest config runs without globals, so testing-library's auto-cleanup
// never registers: several tests render the same texts (the confirmation
// question appears in both the Confirmation and ApprovalCard suites).
afterEach(cleanup);

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

  it("maps the ACP tool kind through for the tool icon", () => {
    const props = toolProps({ kind: "read" });
    expect(props.kind).toBe("read");
    const withoutKind = toolProps({});
    expect(withoutKind.kind).toBeNull();
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
    expect(props.description).toBeNull();
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

describe("toSourcesElementProps", () => {
  const searchCall = (
    content: Parameters<typeof toToolElementProps>[0]["content"],
  ) =>
    toSourcesElementProps({
      toolCallId: "call-web-search",
      title: "web_search",
      status: "completed",
      content,
    });

  it("collects resource_link blocks deduped by URL, first-seen order", () => {
    const props = searchCall([
      {
        type: "resource_link",
        name: "nextjs.org — Image Optimization",
        uri: "https://nextjs.org/docs/images",
      },
      {
        type: "resource_link",
        name: "Image Component — duplicate crawl",
        uri: "https://nextjs.org/docs/images",
      },
      {
        type: "resource_link",
        name: "vercel.com",
        uri: "https://vercel.com/docs/optimizing-images",
      },
    ]);
    expect(props.count).toBe(2);
    expect(props.sources).toEqual([
      {
        title: "nextjs.org — Image Optimization",
        url: "https://nextjs.org/docs/images",
      },
      {
        title: "vercel.com",
        url: "https://vercel.com/docs/optimizing-images",
      },
    ]);
  });

  it("falls back to name then hostname for the label", () => {
    const props = searchCall([
      { type: "resource_link", name: "", uri: "https://github.com/v/next" },
    ]);
    expect(props.sources[0]?.title).toBe("github.com");
    const titled = searchCall([
      {
        type: "resource_link",
        name: "fallback-name",
        title: "Preferred title",
        uri: "https://example.com/a",
      },
    ]);
    expect(titled.sources[0]?.title).toBe("Preferred title");
  });

  it("drops non-http(s) URIs and non-link content blocks", () => {
    const props = searchCall([
      { type: "content", text: "3 results" },
      { type: "resource_link", name: "doc", uri: "file:///etc/hosts" },
      { type: "resource_link", name: "mcp", uri: "mcp://server/resource" },
      { type: "resource_link", name: "web", uri: "https://example.com/ok" },
    ]);
    expect(props.count).toBe(1);
    expect(props.sources[0]?.url).toBe("https://example.com/ok");
  });

  it("returns an empty entry set for a call without links", () => {
    const props = searchCall([{ type: "content", text: "no links" }]);
    expect(props.count).toBe(0);
    expect(props.sources).toEqual([]);
  });
});

describe("toApprovalCardElementProps", () => {
  it("maps a pending request to a ready card wrapping the confirmation", () => {
    const props = toApprovalCardElementProps({
      sessionId: "s1",
      toolCallId: "call-42",
      toolName: "bash",
      title: "rm -rf dist",
      options: [
        { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
        { optionId: "reject_once", name: "Deny", kind: "reject_once" },
      ],
    });
    expect(props.status).toBe("ready");
    expect(props.toolCallId).toBe("call-42");
    expect(props.confirmation).toMatchObject({
      title: "Run rm -rf dist?",
      toolCallId: "call-42",
    });
    expect(props.confirmation?.options).toHaveLength(2);
  });

  it("maps a missing request to the preparing shimmer state", () => {
    const props = toApprovalCardElementProps(null);
    expect(props.status).toBe("preparing");
    expect(props.confirmation).toBeNull();
    expect(props.toolCallId).toBeNull();
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

  it("renders failed output in a destructive code block", () => {
    const props = toolProps({
      title: "pnpm --version",
      status: "failed",
      content: [{ type: "content", text: "command not found: pnpm" }],
    });
    render(<Tool {...props} />);
    expect(screen.getByText("Failed to run pnpm --version")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: /failed to run pnpm --version/i }),
    );
    expect(screen.getByText("command not found: pnpm")).toBeVisible();
    // code-block.tsx exposes the variant as data-variant on the CodeBlock.
    const block = screen
      .getByText("command not found: pnpm")
      .closest("[data-slot='code-block']");
    expect(block).not.toBeNull();
    expect(block?.getAttribute("data-variant")).toBe("destructive");
  });

  it("renders multiple locations with line breaks preserved", () => {
    const props = toolProps({
      title: "rg --files src",
      locations: [
        { path: "src/a.ts", line: 1 },
        { path: "src/b.ts", line: 42 },
      ],
    });
    render(<Tool {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: /ran rg --files src/i }),
    );
    // jsdom does not apply CSS, so the newline contract is asserted on the
    // whitespace-pre-line class the paragraph must carry (defect 5).
    const p = screen.getByText(/src\/a\.ts:1/).closest("p");
    expect(p).not.toBeNull();
    expect(p?.className).toContain("whitespace-pre-line");
    expect(p?.textContent).toContain("src/a.ts:1\nsrc/b.ts:42");
  });

  it("shows the file icon for read-kind calls instead of the terminal", () => {
    const props = toolProps({ kind: "read" });
    const { container } = render(<Tool {...props} />);
    // lucide icons render as <svg class="lucide-file-text ...">.
    const svg = container.querySelector(
      "[data-slot='trace-icon'] svg",
    ) as SVGSVGElement;
    expect(svg?.getAttribute("class")).toContain("lucide-file-text");
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

describe("Sources component", () => {
  const sourcesProps = () =>
    toSourcesElementProps({
      toolCallId: "call-web-search",
      title: "web_search",
      status: "completed",
      content: [
        {
          type: "resource_link",
          name: "nextjs.org — Image Optimization",
          uri: "https://nextjs.org/docs/images",
        },
        {
          type: "resource_link",
          name: "duplicate crawl",
          uri: "https://nextjs.org/docs/images",
        },
        {
          type: "resource_link",
          name: "",
          uri: "https://github.com/vercel/next.js/discussions/59073",
        },
      ],
    });

  it("renders the collapsed Used N sources line with the unique count", () => {
    render(<Sources {...sourcesProps()} />);
    // 3 links, one duplicate URL -> "Used 2 sources".
    expect(screen.getByText("Used 2 sources")).toBeVisible();
  });

  it("collapses the citation list until the trigger opens it", () => {
    render(<Sources {...sourcesProps()} />);
    // Collapsed by default: no citation text in the document yet.
    expect(screen.queryByText(/Image Optimization/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /used 2 sources/i }));
    expect(screen.getByText(/nextjs\.org — Image Optimization/)).toBeVisible();
  });

  it("renders accessible external links with new-tab announcements", () => {
    render(<Sources {...sourcesProps()} />);
    fireEvent.click(screen.getByRole("button", { name: /used 2 sources/i }));
    const github = screen.getByText(/github\.com/).closest("a");
    expect(github?.getAttribute("href")).toBe(
      "https://github.com/vercel/next.js/discussions/59073",
    );
    expect(github?.getAttribute("target")).toBe("_blank");
    expect(github?.getAttribute("rel")).toBe("noreferrer");
    // Every citation announces the new tab to screen readers.
    const announcements = screen.getAllByText("(opens in a new tab)");
    expect(announcements).toHaveLength(2);
  });

  it("renders nothing when the call produced no usable sources", () => {
    const { container } = render(<Sources count={0} sources={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("ApprovalCard component", () => {
  const approvalProps = () =>
    toApprovalCardElementProps({
      sessionId: "sess-fixture",
      toolCallId: "call-fixture-permission",
      toolName: "bash",
      title: "rm -rf dist",
      options: [
        { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
        { optionId: "reject_once", name: "Deny", kind: "reject_once" },
      ],
    });

  it("renders the pending request and answers through the toolCallId seam", () => {
    const onAnswer = vi.fn();
    render(<ApprovalCard {...approvalProps()} onAnswer={onAnswer} />);
    expect(screen.getByText("Run rm -rf dist?")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
    expect(onAnswer).toHaveBeenCalledWith(
      "call-fixture-permission",
      "allow_once",
    );
  });

  it("keeps the Deny choice reachable from the card", () => {
    const onAnswer = vi.fn();
    render(<ApprovalCard {...approvalProps()} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(onAnswer).toHaveBeenCalledWith(
      "call-fixture-permission",
      "reject_once",
    );
  });

  it("renders the preparing shimmer while the request is unreported", () => {
    render(<ApprovalCard {...toApprovalCardElementProps(null)} />);
    expect(screen.getByText("Preparing a question…")).toBeVisible();
    expect(screen.queryByTestId("confirmation")).toBeNull();
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

  it("a running subagent is open by default", () => {
    const props = toSubagentElementProps({
      sessionId: "child",
      title: "the research agent",
      state: { state: "running", activity: "reading logs" },
    });
    render(
      <Subagent {...props}>
        <span>Ran tail -f deploy.log</span>
      </Subagent>,
    );
    // defaultOpen while running: the child work is visible without a click.
    expect(screen.getByText("Ran tail -f deploy.log")).toBeVisible();
    expect(screen.getByText("reading logs")).toBeVisible();
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
