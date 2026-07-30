import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PageStatesPlayground, ViewTemplatePlayground } from "./TemplatesPlaygrounds";

describe("template and page playgrounds", () => {
  it("switches panel drawer side and mode", async () => {
    const user = userEvent.setup();
    render(<ViewTemplatePlayground />);
    await user.selectOptions(screen.getByLabelText("View type"), "projects");
    expect(screen.getByText("Project board")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Drawer side"), "right");
    await user.selectOptions(screen.getByLabelText("Drawer mode"), "floating");
    expect(screen.getByTestId("template-drawer")).toHaveAttribute("data-side", "right");
    expect(screen.getByTestId("template-drawer")).toHaveAttribute("data-mode", "floating");
  });

  it("renders representative fixture-backed page states", async () => {
    const user = userEvent.setup();
    render(<PageStatesPlayground />);
    expect(screen.getByText(/sessions from MSW fixtures/i)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Page"), "vaults");
    expect(screen.getByText(/vaults from MSW fixtures/i)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("State"), "error");
    expect(screen.getByRole("alert")).toHaveTextContent("Vaults failed to load");
  });
});
