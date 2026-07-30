import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ComponentPlayground } from "./ComponentPlayground";
import { ControlRow } from "./controls";

describe("ComponentPlayground", () => {
  it("separates the preview from an accessible component-specific configuration region", () => {
    render(
      <ComponentPlayground
        title="Select"
        importLine={'import { Select } from "@/components/ui/select"'}
        controls={<ControlRow label="Type"><select aria-label="Select type"><option>Native</option></select></ControlRow>}
      >
        <button>Preview trigger</button>
      </ComponentPlayground>,
    );

    expect(screen.getByRole("heading", { name: "Select" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Select configuration" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview trigger" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Select type" })).toBeInTheDocument();
  });
});
