import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { RemainingComponentsPlayground } from "./RemainingComponentsPlayground";

describe("remaining component playgrounds", () => {
  it("exposes all fifteen visible component examples", () => {
    render(<RemainingComponentsPlayground />);
    for (const title of ["Direction", "Input OTP", "Toast", "Attachment", "Bubble", "Message", "Calendar", "Carousel", "Menubar", "Resizable", "Message Scroller", "Item", "Form", "Navigation Menu", "Sidebar"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  it("configures direction, OTP length and carousel controls", async () => {
    const user = userEvent.setup();
    render(<RemainingComponentsPlayground />);
    await user.click(screen.getByLabelText("RTL direction"));
    expect(screen.getByTestId("direction-preview")).toHaveAttribute("dir", "rtl");
    await user.selectOptions(screen.getByLabelText("OTP length"), "4");
    await user.click(screen.getByRole("button", { name: "Paste sample" }));
    expect(screen.getByLabelText("One-time password")).toHaveValue("1234");
    await user.click(screen.getByRole("button", { name: "Next slide" }));
    expect(screen.getByText("Slide 2 / 3")).toBeInTheDocument();
  });
});
