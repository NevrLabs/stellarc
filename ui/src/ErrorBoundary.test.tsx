import { Button } from "@/components/ui/button";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Broken(): never { throw new Error("render failed"); }

describe("ErrorBoundary", () => {
  it("shows the error and offers recovery", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary><Broken /></ErrorBoundary>);
    expect(screen.getByRole("alert")).toHaveTextContent("render failed");
    expect(screen.getByRole("button", { name: "Reload Stellarc" })).toBeVisible();
    consoleError.mockRestore();
  });

  it("supports localized recovery without replacing the shell", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<><nav>Vault navigation</nav><ErrorBoundary fallback={(error, retry) => <section role="alert">{error.message}<Button onClick={retry}>Retry note</Button></section>}><Broken /></ErrorBoundary></>);
    expect(screen.getByText("Vault navigation")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry note" })).toBeVisible();
    consoleError.mockRestore();
  });
});
