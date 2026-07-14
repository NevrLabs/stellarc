import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VaultWorkspace } from "./VaultWorkspace";
import { createInitialWorkspace, noteTab, setWorkspaceLayout } from "../vaultWorkspace";

vi.mock("../pages/GraphPage", () => ({ GraphPage: () => <div>Graph</div> }));
vi.mock("../pages/NotePage", () => ({
  NotePage: ({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) => (
    <button type="button" onClick={() => onDirtyChange(true)}>Dirty note</button>
  ),
}));
vi.mock("../pages/VaultTablePage", () => ({ VaultTablePage: () => <div>Table</div> }));

describe("VaultWorkspace", () => {
  it("puts layout controls on the active pane tab row instead of a second toolbar", () => {
    const state = setWorkspaceLayout(createInitialWorkspace(noteTab("one.md", "One")), "columns");
    const { container } = render(
      <VaultWorkspace vaultId="vault-1" state={state} onActivatePane={vi.fn()} onActivateTab={vi.fn()} onCloseTab={vi.fn()} onOpenNote={vi.fn()} onLayout={vi.fn()} />,
    );

    expect(container.querySelector(".vault-workspace-toolbar")).not.toBeInTheDocument();
    const header = container.querySelector(".vault-pane.active .vault-pane-header");
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).getByRole("tablist")).toBeInTheDocument();
    expect(within(header as HTMLElement).getByRole("group", { name: "Workspace layout" })).toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: "Workspace layout" })).toHaveLength(1);
  });

  it("lets the operator resize split editor groups", () => {
    const state = setWorkspaceLayout(createInitialWorkspace(noteTab("one.md", "One")), "columns");
    const { container } = render(
      <VaultWorkspace vaultId="vault-1" state={state} onActivatePane={vi.fn()} onActivateTab={vi.fn()} onCloseTab={vi.fn()} onOpenNote={vi.fn()} onLayout={vi.fn()} />,
    );
    const workspace = container.querySelector(".vault-workspace") as HTMLElement;
    vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600, x: 0, y: 0, toJSON: () => ({}),
    });

    fireEvent.mouseDown(screen.getByRole("separator", { name: "Resize editor columns" }), { clientX: 500 });
    fireEvent.mouseMove(document, { clientX: 650 });
    fireEvent.mouseUp(document);

    expect(workspace.style.gridTemplateColumns).toContain("65%");
  });

  it("marks an unsaved note with an asterisk in its tab title", () => {
    const state = createInitialWorkspace(noteTab("one.md", "One"));
    render(
      <VaultWorkspace vaultId="vault-1" state={state} onActivatePane={vi.fn()} onActivateTab={vi.fn()} onCloseTab={vi.fn()} onOpenNote={vi.fn()} onLayout={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Dirty note" }));

    expect(screen.getByRole("tab")).toHaveTextContent("One *");
    expect(screen.queryByText("Unsaved")).not.toBeInTheDocument();
  });

  it("exposes draggable tabs and reports a tab drop position", () => {
    let state = createInitialWorkspace(noteTab("one.md", "One"));
    state = { ...state, panes: [{ ...state.panes[0], tabs: [noteTab("one.md", "One"), noteTab("two.md", "Two")] }] };
    const onMoveTab = vi.fn();
    const data = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "all",
      dropEffect: "move",
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? "",
    };
    render(
      <VaultWorkspace vaultId="vault-1" state={state} onActivatePane={vi.fn()} onActivateTab={vi.fn()} onCloseTab={vi.fn()} onMoveTab={onMoveTab} onDropNote={vi.fn()} onOpenNote={vi.fn()} onLayout={vi.fn()} />,
    );

    const one = screen.getByRole("tab", { name: "One" }).closest(".vault-tab") as HTMLElement;
    const two = screen.getByRole("tab", { name: "Two" }).closest(".vault-tab") as HTMLElement;
    expect(one).toHaveAttribute("draggable", "true");
    fireEvent.dragStart(one, { dataTransfer });
    fireEvent.dragOver(two, { dataTransfer, clientX: 1000 });
    fireEvent.drop(two, { dataTransfer, clientX: 1000 });

    expect(onMoveTab).toHaveBeenCalledWith("pane-1", "note:one.md", "pane-1", 2);
  });

  it("opens a sidebar note dropped on an editor group as a new tab", () => {
    const state = createInitialWorkspace(noteTab("one.md", "One"));
    const onDropNote = vi.fn();
    const dataTransfer = {
      effectAllowed: "all",
      dropEffect: "copy",
      setData: vi.fn(),
      getData: (type: string) => type === "application/x-olympus-vault-note"
        ? JSON.stringify({ path: "docs/new.md", title: "New" })
        : "",
    };
    const { container } = render(
      <VaultWorkspace vaultId="vault-1" state={state} onActivatePane={vi.fn()} onActivateTab={vi.fn()} onCloseTab={vi.fn()} onMoveTab={vi.fn()} onDropNote={onDropNote} onOpenNote={vi.fn()} onLayout={vi.fn()} />,
    );

    fireEvent.drop(container.querySelector(".vault-tabs") as HTMLElement, { dataTransfer });

    expect(onDropNote).toHaveBeenCalledWith("pane-1", "docs/new.md", "New", 1);
  });

  it("offers VS Code-style tab management from the context menu", () => {
    let state = createInitialWorkspace(noteTab("one.md", "One"));
    state = { ...state, panes: [{ ...state.panes[0], tabs: [noteTab("one.md", "One"), noteTab("two.md", "Two")] }] };
    const onTabMenuAction = vi.fn();
    render(
      <VaultWorkspace vaultId="vault-1" state={state} onActivatePane={vi.fn()} onActivateTab={vi.fn()} onCloseTab={vi.fn()} onTabMenuAction={onTabMenuAction} onOpenNote={vi.fn()} onLayout={vi.fn()} />,
    );

    fireEvent.contextMenu(screen.getByRole("tab", { name: "One" }).closest(".vault-tab") as HTMLElement, { clientX: 2000, clientY: 2000 });
    const menu = screen.getByRole("menuitem", { name: "Close Others" }).closest(".vault-tab-menu") as HTMLElement;
    expect(menu).toHaveClass("on");
    expect(parseFloat(menu.style.left)).toBeLessThanOrEqual(window.innerWidth - 188);
    expect(parseFloat(menu.style.top)).toBeLessThanOrEqual(window.innerHeight - 158);
    expect(screen.getByRole("menuitem", { name: "Close to the Right" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Close Others" }));

    expect(onTabMenuAction).toHaveBeenCalledWith("pane-1", "note:one.md", "closeOthers");
  });
});