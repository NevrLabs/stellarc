import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ReasoningPlayground,
  ToolPlayground,
  TaskPlayground,
  CodeBlockPlayground,
  AIImagePlayground,
  SourcesPlayground,
  ActionsPlayground,
  AttachmentsPlayground,
} from "./AIElementsPlaygrounds";

describe("AI Elements playgrounds", () => {
  it("Reasoning renders thinking state with streaming toggle", () => {
    render(<ReasoningPlayground />);
    expect(screen.getByRole("heading", { name: "Reasoning" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Reasoning configuration" })).toBeInTheDocument();
  });

  it("Tool renders header with status badge and configuration", () => {
    render(<ToolPlayground />);
    expect(screen.getByRole("heading", { name: "Tool" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Tool configuration" })).toBeInTheDocument();
  });

  it("Task renders with expandable content and file chips", () => {
    render(<TaskPlayground />);
    expect(screen.getByRole("heading", { name: "Task" })).toBeInTheDocument();
    expect(screen.getByText("docs/DESIGN_SYSTEM.md")).toBeInTheDocument();
  });

  it("CodeBlock renders with language selector and copy button", () => {
    render(<CodeBlockPlayground />);
    expect(screen.getByRole("heading", { name: "Code Block" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });

  it("Image renders loaded state with alt text control", () => {
    render(<AIImagePlayground />);
    expect(screen.getByRole("heading", { name: "Image" })).toBeInTheDocument();
    expect(screen.getByLabelText("Alt text")).toBeInTheDocument();
  });

  it("Sources renders citation list with count control", () => {
    render(<SourcesPlayground />);
    expect(screen.getByRole("heading", { name: "Sources" })).toBeInTheDocument();
    expect(screen.getByLabelText("Source count")).toBeInTheDocument();
  });

  it("Actions renders copy/retry/share buttons", () => {
    render(<ActionsPlayground />);
    expect(screen.getByRole("heading", { name: "Actions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
  });

  it("Attachments renders file items with layout selector", () => {
    render(<AttachmentsPlayground />);
    expect(screen.getByRole("heading", { name: "Attachments" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Layout" })).toBeInTheDocument();
    expect(screen.getByText("screenshot.png")).toBeInTheDocument();
  });
});
