import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock the per-node catalog with duplicate agent IDs to prove node-scoped sync.
// profile + a claude-code harness). This tests the grouped selector rendering.
vi.mock("../../../hooks/queries", () => ({
  useModels: () => ({ data: { models: [
    { provider: "zai", id: "glm-5.2", displayName: "GLM 5.2", default: true },
    { provider: "zai", id: "glm-5v-turbo", displayName: "GLM 5V Turbo" },
    { provider: "openai-codex", id: "gpt-5.5", displayName: "GPT 5.5" },
    { provider: "claude-code", id: "claude-opus-4-8", displayName: "Claude Opus 4.8" },
    { provider: "claude-code", id: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6" },
    { provider: "claude-code", id: "claude-fable-5", displayName: "Claude Fable 5" },
    { provider: "claude-code", id: "claude-haiku-4-5", displayName: "Claude Haiku 4.5" },
    { provider: "remote-provider", id: "remote-model", displayName: "Remote Model" },
  ] } }),
  useAgentCatalog: () => ({
    data: {
      nodes: [{ nodeId: "local", agents: [
        {
          id: "default",
          provider: "zai",
          model: "glm-5.2",
          kind: "hermes",
          isDefault: true,
          models: [
            { provider: "zai", id: "glm-5.2", default: true },
            { provider: "zai", id: "glm-5v-turbo" },
            { provider: "openai-codex", id: "gpt-5.5" },
          ],
        },
        {
          id: "claude-code",
          provider: "claude-code",
          model: "claude-opus-4-8",
          kind: "claude-code",
          isDefault: false,
          models: [
            { provider: "claude-code", id: "claude-opus-4-8", default: true },
            { provider: "claude-code", id: "claude-sonnet-4-6" },
            { provider: "claude-code", id: "claude-fable-5" },
            { provider: "claude-code", id: "claude-haiku-4-5" },
          ],
        },
      ]}, {
        nodeId: "remote",
        agents: [{
          id: "default", provider: "remote-provider", model: "remote-model",
          kind: "hermes", isDefault: true,
          models: [{ provider: "remote-provider", id: "remote-model", default: true }],
        }],
      }],
    },
  }),
}));

// Mock BrandIcons so it doesn't pull heavy deps.
vi.mock("../../../components/BrandIcons", () => ({
  BrandIcon: () => null,
  agentBrand: () => undefined,
}));

import { Composer } from "./Composer";

const noop = () => {};

function renderComposer(overrides: Record<string, unknown> = {}) {
  const onSend = vi.fn();
  render(
    <Composer
      text=""
      onTextChange={noop}
      onKeyDown={noop}
      onSend={onSend}
      onStop={noop}
      sending={false}
      sessionModel={null}
      sessionAgent="default"
      sessionNode="local"
      {...overrides}
    />,
  );
  return { onSend };
}

describe("Composer model selector", () => {
  const modelTrigger = () => screen.getByRole("button", { name: "Model" });

  it("exposes separate model and thinking/context controls", () => {
    renderComposer();
    expect(modelTrigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Thinking and context" })).toBeInTheDocument();
    fireEvent.click(modelTrigger());
    expect(modelTrigger()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByPlaceholderText("Search models…")).toBeInTheDocument();
  });

  it("uses models from the global provider catalog", () => {
    renderComposer({ sessionNode: "remote" });
    fireEvent.click(modelTrigger());
    expect(screen.getByText("remote-provider")).toBeInTheDocument();
    expect(screen.getByText("Remote Model")).toBeInTheDocument();
  });

  it("groups models by provider with headers", () => {
    renderComposer();
    fireEvent.click(modelTrigger());
    expect(screen.getByText("zai")).toBeInTheDocument();
    expect(screen.getByText("openai-codex")).toBeInTheDocument();
    expect(screen.getByText("GLM 5V Turbo")).toBeInTheDocument();
    expect(screen.getByText("GPT 5.5")).toBeInTheDocument();
  });

  it("dispatches the selected model on send", () => {
    renderComposer();
    fireEvent.click(modelTrigger());
    fireEvent.click(screen.getByText("GLM 5V Turbo"));
    expect(modelTrigger()).toHaveTextContent("glm-5v-turbo");
  });

  it("syncs the pill to session truth over the local default", () => {
    renderComposer({ sessionModel: "glm-5.2" });
    expect(modelTrigger()).toHaveTextContent("glm-5.2");
  });

  it("shows claude-fable-5 for the claude-code agent", () => {
    renderComposer({ sessionAgent: "claude-code", sessionModel: "claude-opus-4-8" });
    fireEvent.click(modelTrigger());
    expect(screen.getByText("Claude Fable 5")).toBeInTheDocument();
    expect(screen.getAllByText("claude-code").length).toBeGreaterThan(0);
  });
});
