import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DirectionPlayground, InputOTPPlayground, CarouselPlayground, ToastPlayground, CalendarPlayground, SidebarPlayground } from "./RemainingComponentsPlayground";

describe("individual component playgrounds", () => {
  it("direction toggles RTL", async () => {
    const user = userEvent.setup();
    render(<DirectionPlayground />);
    await user.click(screen.getByLabelText("RTL direction"));
    expect(screen.getByTestId("direction-preview")).toHaveAttribute("dir", "rtl");
  });

  it("input OTP configures length and paste", async () => {
    const user = userEvent.setup();
    render(<InputOTPPlayground />);
    await user.selectOptions(screen.getByLabelText("OTP length"), "4");
    await user.click(screen.getByRole("button", { name: "Paste sample" }));
    expect(screen.getByLabelText("One-time password")).toHaveValue("1234");
  });

  it("carousel advances slides", async () => {
    const user = userEvent.setup();
    render(<CarouselPlayground />);
    await user.click(screen.getByRole("button", { name: "Next slide" }));
    expect(screen.getByText("Slide 2 / 3")).toBeInTheDocument();
  });

  it("toast shows and dismisses", () => {
    render(<ToastPlayground />);
    expect(screen.getByText(/Build finished/)).toBeInTheDocument();
  });

  it("calendar renders date inputs", () => {
    render(<CalendarPlayground />);
    expect(screen.getByLabelText("Start date")).toBeInTheDocument();
  });

  it("sidebar collapses", async () => {
    const user = userEvent.setup();
    render(<SidebarPlayground />);
    await user.click(screen.getByRole("button", { name: /Collapse sidebar/ }));
    expect(screen.getByText("ST")).toBeInTheDocument();
  });
});
