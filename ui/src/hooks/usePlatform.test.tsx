import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePlatform } from "./usePlatform";

function setupEnv(platform?: string) {
  vi.stubEnv("VITE_PLATFORM", platform);
}

function Harness() {
  const p = usePlatform();
  return <div data-testid="platform">{p}</div>;
}

describe("usePlatform", () => {
  it("returns desktop when VITE_PLATFORM=desktop", () => {
    setupEnv("desktop");
    const { getByTestId } = render(<Harness />);
    expect(getByTestId("platform").textContent).toBe("desktop");
  });

  it("returns mobile when VITE_PLATFORM=mobile", () => {
    setupEnv("mobile");
    const { getByTestId } = render(<Harness />);
    expect(getByTestId("platform").textContent).toBe("mobile");
  });

  it("returns a valid platform value (does not crash)", () => {
    setupEnv(undefined);
    const { getByTestId } = render(<Harness />);
    expect(["desktop", "mobile"]).toContain(getByTestId("platform").textContent);
  });
});
