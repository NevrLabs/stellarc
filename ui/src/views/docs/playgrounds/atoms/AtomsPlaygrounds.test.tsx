import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ProgressPlayground } from "./ProgressPlayground";
import { RadioGroupPlayground, SliderPlayground } from "./FormAtomsPlaygrounds";

describe("atom playgrounds", () => {
  it("configures progress value and label", async () => {
    const user = userEvent.setup();
    render(<ProgressPlayground />);
    await user.clear(screen.getByRole("spinbutton", { name: "Value" }));
    await user.type(screen.getByRole("spinbutton", { name: "Value" }), "25");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("Upload progress")).toBeInTheDocument();
  });

  it("changes the selected radio option", async () => {
    const user = userEvent.setup();
    render(<RadioGroupPlayground />);
    await user.click(screen.getByRole("radio", { name: "Balanced" }));
    expect(screen.getByRole("radio", { name: "Balanced" })).toBeChecked();
  });

  it("exposes the configured slider value", () => {
    const { container } = render(<SliderPlayground />);
    expect(container.querySelector('[data-slot="slider"]')).toBeInTheDocument();
    expect(screen.getByText("Value: 40")).toBeInTheDocument();
  });
});
