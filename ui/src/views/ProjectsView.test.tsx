import "../test/setup";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectsView } from "./ProjectsView";

vi.mock("../hooks/queries", () => ({
  useCards: () => ({ data: { cards: [], total: 0 }, isLoading: false }),
}));

describe("ProjectsView", () => {
  it("uses the existing resizable sidebar and leaves the board pane full-width", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProjectsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Boards → Cards")).toBeInTheDocument();
    expect(screen.getByText("Default board")).toBeInTheDocument();
    expect(screen.getByText("Boards contain cards. Projects group boards and context.")).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Resize projects sidebar" })).toHaveAttribute("aria-valuenow", "260");
    expect(screen.getByText("No cards on this board")).toBeInTheDocument();
  });
});
