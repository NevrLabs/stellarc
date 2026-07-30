import { describe, expect, it } from "vitest";
import { registry, tierOrder } from "./registry";

describe("docs registry", () => {
  it("contains the 61 canonical entries", () => {
    expect(registry).toHaveLength(61);
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
});
