import { describe, expect, it } from "vitest";
import { verifyDesignSystem } from "../../../scripts/design-system-check";

describe("design-system registry parity", () => {
  it("keeps covered registry entries aligned with source wrappers and playground sections", () => {
    expect(verifyDesignSystem()).toEqual([]);
  });
});
