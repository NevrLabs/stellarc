import { describe, expect, it } from "vitest";
import { isDevelopmentEnvironment } from "./environment";

describe("isDevelopmentEnvironment", () => {
  it("accepts only the exact explicit dev identity", () => {
    expect(isDevelopmentEnvironment("dev")).toBe(true);
    expect(isDevelopmentEnvironment(undefined)).toBe(false);
    expect(isDevelopmentEnvironment("")).toBe(false);
    expect(isDevelopmentEnvironment("DEV")).toBe(false);
    expect(isDevelopmentEnvironment("Dev")).toBe(false);
    expect(isDevelopmentEnvironment(" dev ")).toBe(false);
    expect(isDevelopmentEnvironment("development")).toBe(false);
  });
});