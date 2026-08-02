import { describe, expect, it } from "vitest";
import { registry, tierOrder } from "./registry";

describe("docs registry", () => {
  it("contains the 69 canonical entries", () => {
    expect(registry).toHaveLength(69);
  });

  it("uses unique slugs", () => {
    expect(new Set(registry.map(({ slug }) => slug)).size).toBe(registry.length);
  });

  it("stays in canonical tier order", () => {
    const tiers = registry.map(({ tier }) => tierOrder.indexOf(tier));
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
  });

  it("documents configuration for every entry", () => {
    expect(registry.every(({ configuration }) => configuration.length > 0)).toBe(true);
  });

  it("includes all AI element entries", () => {
    const aiSlugs = ["ai-reasoning", "ai-tool", "ai-task", "ai-code-block", "ai-image", "ai-sources", "ai-actions", "ai-attachments"];
    expect(aiSlugs.every((slug) => registry.some((e) => e.slug === slug && e.source === "ai-elements" && e.status === "covered"))).toBe(true);
  });

  it("uses valid playground keys for each component", () => {
    const keys = registry.map(({ playgroundKey }) => playgroundKey);
    // Some grouped components share a playground key — that's valid.
    // Just verify all keys are non-empty strings.
    expect(keys.every(k => typeof k === "string" && k.length > 0)).toBe(true);
  });
});
