import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateVaultDialog, NewNoteDialog } from "./VaultDialogs";
import type { NoteTreeEntry } from "../../../types";

const notes: NoteTreeEntry[] = [
  {
    kind: "folder",
    path: "docs",
    title: "docs",
    updatedAt: 1,
    children: [
      { kind: "folder", path: "docs/api", title: "api", updatedAt: 1, children: [] },
      { kind: "note", path: "docs/readme.md", title: "Readme", updatedAt: 1, children: [] },
    ],
  },
  { kind: "note", path: "root.md", title: "Root", updatedAt: 1, children: [] },
];

describe("CreateVaultDialog", () => {
  it("creates an Olympus-only vault by default", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<CreateVaultDialog busy={false} error={null} onClose={vi.fn()} onCreate={onCreate} />);
    await userEvent.type(screen.getByLabelText("Vault name"), "Local notes");
    await userEvent.click(screen.getByRole("button", { name: "Create vault" }));
    expect(onCreate).toHaveBeenCalledWith({ name: "Local notes", syncBindings: [] });
  });

  it("renders fields for both optional adapters", async () => {
    render(<CreateVaultDialog busy={false} error={null} onClose={vi.fn()} onCreate={vi.fn()} />);
    await userEvent.click(screen.getByText("Synchronization (optional)"));
    await userEvent.selectOptions(screen.getByLabelText("Synchronization adapter"), "github");
    expect(screen.getByLabelText("Repository")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Synchronization adapter"), "olympus");
    expect(screen.getByLabelText("Remote Olympus installation")).toBeInTheDocument();
  });
});

describe("NewNoteDialog", () => {
  it("renders the folder tree and preselects the current folder", async () => {
    const onCreate = vi.fn();
    render(<NewNoteDialog folder="docs/api" notes={notes} busy={false} error={null} onClose={vi.fn()} onCreate={onCreate} />);

    const picker = screen.getByRole("tree", { name: "Destination folder" });
    expect(within(picker).getByRole("treeitem", { name: "Vault root" })).toBeInTheDocument();
    expect(within(picker).getByRole("treeitem", { name: "docs" })).toBeInTheDocument();
    expect(within(picker).getByRole("treeitem", { name: "api" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.type(screen.getByLabelText("Title"), "RFC");
    await userEvent.click(screen.getByRole("button", { name: "Create note" }));

    expect(onCreate).toHaveBeenCalledWith("docs/api/rfc.md", "RFC");
  });
});
