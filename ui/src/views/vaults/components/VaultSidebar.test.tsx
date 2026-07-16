import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VaultSidebar } from "./VaultSidebar";
import type { NoteTreeEntry, VaultSummary } from "../../../types";

const vaults: VaultSummary[] = [{ id: "v1", name: "Vault", noteCount: 1, updatedAt: 1, backend: null }];
const notes: NoteTreeEntry[] = [{ kind: "note", path: "deep/note.md", title: "Note", updatedAt: 1, children: [] }];

describe("VaultSidebar", () => {
  it("bounds the file action menu to the viewport instead of inheriting bottom stretch", async () => {
    vi.stubGlobal("innerHeight", 600);
    render(
      <VaultSidebar
        vaults={vaults}
        activeVaultId="v1"
        notes={notes}
        activeNotePath={null}
        onSelectVault={vi.fn()}
        onCreateVault={vi.fn()}
        onCreateNote={vi.fn()}
        onOpenNote={vi.fn()}
        onOpenGraph={vi.fn()}
        onOpenTable={vi.fn()}
        onRenameNote={vi.fn()}
        onDeleteNote={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Actions for Note"), { clientX: 48, clientY: 540 });

    const menu = screen.getByRole("menu", { name: "File actions" });
    expect(menu).toHaveStyle({ top: "540px", bottom: "auto", maxHeight: "48px", overflowY: "auto" });
  });
});
