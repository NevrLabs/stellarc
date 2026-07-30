import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Accessibility } from "./Accessibility";
import { Icons } from "./Icons";
import { Motion } from "./Motion";
import { Naming } from "./Naming";
import { Radius } from "./Radius";
import { Spacing } from "./Spacing";
import { readThemeTables, Themes } from "./Themes";
import { Typography } from "./Typography";

afterEach(() => {
  document.querySelectorAll("style[data-foundation-test]").forEach((node) => node.remove());
  document.documentElement.style.cssText = "";
});

describe("design-system foundations", () => {
  it("documents the complete hierarchy and required inclusive states", () => {
    render(<><Naming /><Themes /><Typography /><Spacing /><Radius /><Motion /><Icons /><Accessibility /></>);
    expect(screen.getByRole("img", { name: /View contains Sidebar and Page/i })).toBeInTheDocument();
    expect(screen.getByText("Obsidian")).toBeInTheDocument();
    expect(screen.getByText("Daybreak")).toBeInTheDocument();
    expect(screen.getAllByText(/prefers-reduced-motion/i)).not.toHaveLength(0);
    expect(screen.getByText(/24 × 24 viewBox/i)).toBeInTheDocument();
    expect(screen.getAllByText(/WCAG AA/i)).not.toHaveLength(0);
    expect(screen.getByText(/logical CSS properties/i)).toBeInTheDocument();
  });

  it("reads token values from representative theme selectors", () => {
    const style = document.createElement("style");
    style.dataset.foundationTest = "";
    style.textContent = ':root, :root[data-theme="obsidian"] { --bg: #0a0a0b; } :root[data-theme="light"] { --bg: #f6f6f7; }';
    document.head.append(style);
    expect(readThemeTables()).toMatchObject({ obsidian: { "--bg": "#0a0a0b" }, light: { "--bg": "#f6f6f7" } });
  });

  it("shows computed spacing and radius values with honest specimens", () => {
    document.documentElement.style.setProperty("--space-1", "2px");
    document.documentElement.style.setProperty("--space-24", "48px");
    document.documentElement.style.setProperty("--radius-full", "999px");
    render(<><Spacing /><Radius /></>);
    expect(screen.getByTestId("spacing---space-1")).toHaveTextContent("2px");
    expect(screen.getByTestId("spacing---space-24")).toHaveTextContent("48px");
    expect(screen.getByTestId("radius---radius-full")).toHaveTextContent("999px");
    expect(screen.getByTestId("radius---radius-full").firstElementChild).toHaveStyle({ borderRadius: "var(--radius-full, 9999px)" });
  });
});
