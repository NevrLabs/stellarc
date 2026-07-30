import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ContentPlaygrounds, DisclosurePlaygrounds, SelectFamilyPlayground } from "./MoleculePlaygrounds";

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
Element.prototype.scrollIntoView = () => {};

describe("molecule playgrounds", () => {
  it("filters and selects a searchable option with the keyboard", async () => {
    const user = userEvent.setup();
    render(<SelectFamilyPlayground />);
    await user.selectOptions(screen.getByLabelText("Select type"), "searchable");
    const search = screen.getByPlaceholderText("Search agents…");
    await user.type(search, "cod");
    expect(screen.queryByText("Hermes")).not.toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByText("Codex")).toBeInTheDocument();
  });

  it("opens and closes disclosure content from the keyboard", async () => {
    const user = userEvent.setup();
    render(<DisclosurePlaygrounds />);
    const trigger = screen.getByRole("button", { name: "Runtime details" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("PID 4182 · healthy")).toBeVisible();
    await user.keyboard("{Enter}");
    expect(screen.queryByText("PID 4182 · healthy")).not.toBeInTheDocument();
  });

  it("keeps a wide table inside a horizontal overflow region", () => {
    render(<ContentPlaygrounds />);
    expect(screen.getByTestId("table-overflow")).toHaveClass("overflow-x-auto");
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
