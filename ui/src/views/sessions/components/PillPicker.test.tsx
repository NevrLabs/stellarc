import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { clampMenuOffset, PillPicker } from "./PillPicker";

describe("PillPicker", () => {
  it("clamps an overflowing menu inside the viewport", () => {
    expect(clampMenuOffset(900, 1160, 1024)).toBe(-144);
  });
  it("filters items and selects one", () => {
    const onSelect = vi.fn();
    render(
      <PillPicker
        items={[{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }]}
        value={null}
        onSelect={onSelect}
        placeholder="＋ context"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "＋ context" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "bet" } });
    expect(screen.queryByRole("button", { name: "Alpha" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));

    expect(onSelect).toHaveBeenCalledWith("b");
    expect(screen.getByRole("button", { name: "＋ context" })).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Escape", () => {
    render(<PillPicker items={[]} value={null} onSelect={() => {}} placeholder="＋ repo" />);
    fireEvent.click(screen.getByRole("button", { name: "＋ repo" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "＋ repo" })).toHaveAttribute("aria-expanded", "false");
  });
});
