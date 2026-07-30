import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CommandSelectorPlaygrounds, DataTablePlayground, StatusNotificationPlaygrounds } from "./OrganismPlaygrounds";

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
Element.prototype.scrollIntoView = () => {};

describe("organism playgrounds", () => {
  it("filters and sorts the data table", async () => {
    const user = userEvent.setup();
    render(<DataTablePlayground />);
    await user.type(screen.getByLabelText("Filter nodes"), "orbit");
    expect(screen.queryByText("fxcompute-01")).not.toBeInTheDocument();
    const status = screen.getByRole("button", { name: /sort by status/i });
    await user.click(status);
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
  });

  it("searches selectors and exposes unavailable state", async () => {
    const user = userEvent.setup();
    render(<CommandSelectorPlaygrounds />);
    await user.selectOptions(screen.getByLabelText("Selector type"), "node");
    await user.type(screen.getByPlaceholderText("Search nodes…"), "missing");
    expect(screen.getByText("No nodes found.")).toBeInTheDocument();
    await user.clear(screen.getByPlaceholderText("Search nodes…"));
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  it("renders operational status states", async () => {
    const user = userEvent.setup();
    render(<StatusNotificationPlaygrounds />);
    await user.selectOptions(screen.getByLabelText("Connection state"), "offline");
    expect(screen.getByText("Axis offline")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Session status" }));
    expect(screen.getByText("runtime held by axis/orbit")).toBeInTheDocument();
  });
});
