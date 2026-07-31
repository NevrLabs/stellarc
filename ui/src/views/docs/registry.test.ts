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

  it("covers the remaining documented playgrounds", () => {
    const slugs = [
      "direction", "input-otp", "toast", "attachment", "bubble", "message", "calendar",
      "carousel", "menubar", "resizable", "message-scroller", "item", "form",
      "navigation-menu", "sidebar",
    ];
    expect(slugs.every((slug) => registry.some((entry) => entry.slug === slug && entry.status === "covered" && entry.playgroundKey === "remaining-components"))).toBe(true);
  });
});
