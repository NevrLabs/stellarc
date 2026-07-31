import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReasoningPlayground, ToolPlayground, TaskPlayground, CodeBlockPlayground, AIImagePlayground, SourcesPlayground, ActionsPlayground, AttachmentsPlayground } from "./AIElementsPlaygrounds";

describe("AI Elements playgrounds", () => {
  it("reasoning renders with streaming toggle", () => {
    const { container } = render(<ReasoningPlayground />);
    expect(container.querySelector("section")).toBeInTheDocument();
  });
  it("tool renders with state selector", () => {
    const { container } = render(<ToolPlayground />);
    expect(container.querySelector("section")).toBeInTheDocument();
  });
  it("task renders with label", () => {
    const { container } = render(<TaskPlayground />);
    expect(container.querySelector("section")).toBeInTheDocument();
  });
  it("code-block renders", () => {
    const { container } = render(<CodeBlockPlayground />);
    expect(container.querySelector("section")).toBeInTheDocument();
  });
  it("image renders with state selector", () => {
    const { container } = render(<AIImagePlayground />);
    expect(container.querySelector("section")).toBeInTheDocument();
  });
  it("sources renders", () => {
    const { container } = render(<SourcesPlayground />);
    expect(container.querySelector("section")).toBeInTheDocument();
  });
  it("actions renders", () => {
    const { container } = render(<ActionsPlayground />);
    expect(container.querySelector("section")).toBeInTheDocument();
  });
  it("attachments renders", () => {
    const { container } = render(<AttachmentsPlayground />);
    expect(container.querySelector("section")).toBeInTheDocument();
  });
});
