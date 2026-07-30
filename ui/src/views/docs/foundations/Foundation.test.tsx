import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Accessibility } from "./Accessibility";
import { Icons } from "./Icons";
import { Motion } from "./Motion";
import { Naming } from "./Naming";
import { Radius } from "./Radius";
import { Spacing } from "./Spacing";
import { Themes } from "./Themes";
import { Typography } from "./Typography";

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
});
