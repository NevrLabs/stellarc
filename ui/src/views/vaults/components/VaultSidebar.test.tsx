import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { VaultSummary } from "../../../types";
import { VaultSidebar } from "./VaultSidebar";

const localVault: VaultSummary = {
  id: "engineering",
  name: "Engineering",
  noteCount: 0,
  updatedAt: 1,
  authority: { kind: "olympus" },
  syncBindings: [],
  backupBindings: [],
};

function renderSidebar(vault: VaultSummary = localVault) {
  render(
    <VaultSidebar
      vaults={[vault]}
      activeVaultId={vault.id}
      notes={[]}
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
}

describe("VaultSidebar vault details", () => {
  it("shows synchronization and backups as separate optional concepts", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole("button", { name: /Engineering/i }));
    await user.click(screen.getByRole("menuitem", { name: /Vault details/i }));

    expect(screen.getByRole("dialog", { name: "Vault details" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Synchronization" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Backups" })).toBeInTheDocument();
    expect(screen.getByText("No synchronization bindings")).toBeInTheDocument();
    expect(screen.getByText(/No editable replica or external merge transport is configured/i)).toBeInTheDocument();
    expect(screen.getByText("No backup bindings")).toBeInTheDocument();
    expect(screen.getByText(/No snapshot target or retention policy is configured/i)).toBeInTheDocument();
    expect(screen.getByText("Olympus authoritative copy")).toBeInTheDocument();
    expect(screen.queryByText(/backend store/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog", { name: "Vault details" })).not.toBeInTheDocument();
  });

  it("renders sync and backup bindings in their own sections", async () => {
    const user = userEvent.setup();
    renderSidebar({
      ...localVault,
      syncBindings: [{
        id: "github-origin",
        name: "GitHub origin",
        direction: "bidirectional",
        adapter: { kind: "github", repository: "IEatCodeDaily/engineering", branch: "main" },
        status: { state: "not-run", lastAttemptAt: null, error: null, conflict: null },
      }],
      backupBindings: [{
        id: "daily-r2",
        name: "Daily R2",
        target: { kind: "s3", bucket: "olympus-backups", prefix: "engineering", endpoint: "https://example.r2.cloudflarestorage.com", region: null, credentialId: "cred-r2" },
        status: { state: "not-run", lastAttemptAt: null, lastSuccessAt: null, error: null },
      }],
    });

    await user.click(screen.getByRole("button", { name: /Engineering/i }));
    await user.click(screen.getByRole("menuitem", { name: /Vault details/i }));

    expect(screen.getByText("GitHub origin")).toBeInTheDocument();
    expect(screen.getByText("GitHub · IEatCodeDaily/engineering · main")).toBeInTheDocument();
    expect(screen.getByText("Bidirectional synchronization · no attempt recorded")).toBeInTheDocument();
    expect(screen.getByText("Daily R2")).toBeInTheDocument();
    expect(screen.getByText("S3-compatible · olympus-backups/engineering · https://example.r2.cloudflarestorage.com")).toBeInTheDocument();
    expect(screen.getByText("S3-compatible snapshot target · no snapshot recorded")).toBeInTheDocument();
    expect(screen.getAllByText("Not run")).toHaveLength(2);
  });

  it("renders Olympus sync providers and binding status details without treating them as backups", async () => {
    const user = userEvent.setup();
    renderSidebar({
      ...localVault,
      syncBindings: [{
        id: "olympus-peer",
        name: "Lab peer",
        direction: "pull",
        adapter: { kind: "olympus", peerId: "hall-west", vaultId: "runbooks" },
        status: { state: "failed", lastAttemptAt: 1_700_000_000, error: "Remote lease expired", conflict: { localRevision: "a", remoteRevision: "b", paths: ["ops.md"] } },
      }],
      backupBindings: [],
    });

    await user.click(screen.getByRole("button", { name: /Engineering/i }));
    await user.click(screen.getByRole("menuitem", { name: /Vault details/i }));

    expect(screen.getByText("Olympus · hall-west · runbooks")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText(/Pull synchronization · last attempt/i)).toBeInTheDocument();
    expect(screen.getByText("Remote lease expired")).toBeInTheDocument();
    expect(screen.getByText("Conflict on 1 path")).toBeInTheDocument();
    expect(screen.getByText("No backup bindings")).toBeInTheDocument();
    expect(screen.queryByText(/S3-compatible snapshot target/i)).not.toBeInTheDocument();
  });
});
