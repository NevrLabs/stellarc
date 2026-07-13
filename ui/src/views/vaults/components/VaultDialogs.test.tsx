import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateVaultDialog } from "./VaultDialogs";

describe("CreateVaultDialog", () => {
  it("creates an Olympus-only vault from its name", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <CreateVaultDialog
        busy={false}
        error={null}
        onClose={vi.fn()}
        onCreate={onCreate}
      />,
    );

    expect(screen.queryByText(/backend store/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/repository/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Olympus manages the authoritative working copy/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Vault name"), "  Engineering  ");
    await user.click(screen.getByRole("button", { name: "Create vault" }));

    expect(onCreate).toHaveBeenCalledWith({ name: "Engineering" });
  });
});
