import { describe, expect, test } from "bun:test";
import { socketPath } from "./paths";

describe("auth sidecar configuration", () => {
  test("requires a private socket under STELLARC_HOME", () => {
    expect(socketPath("/tmp/stellarc")).toBe("/tmp/stellarc/auth.sock");
    expect(() => socketPath("")).toThrow();
  });
});
