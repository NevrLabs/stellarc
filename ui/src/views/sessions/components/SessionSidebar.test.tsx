import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionSidebar } from "./SessionSidebar";
import type { Session } from "../../../types";
import { attachSessionToProject, createSession } from "../../../api";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouterState: () => ({ location: { pathname: "/sessions/s-1" } }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("../../../hooks/queries", () => ({
  useSessions: () => ({
    data: {
      sessions: [
        {
          id: "s-1",
          hermesId: "h-1",
          orgId: "personal",
          ownerId: "rpw",
          contextId: null,
          source: "olympus",
          title: "Focused session",
          startedAt: Math.floor(Date.now() / 1000),
          lastActivity: Math.floor(Date.now() / 1000),
          messageCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          liveness: "idle",
          managed: true,
          pinned: false,
          archived: false,
          forkedFrom: null,
          forkPoint: null,
          forkType: null,
          agent: null,
          model: null,
          node: null,
          projectId: "project-a",
          capabilities: null,
        } satisfies Session,
      ],
    },
  }),
  useProjects: () => ({
    data: {
      projects: [{ id: "project-a", name: "QA project", vaults: [], repos: [], boards: [], layout: null, createdAt: 1 }],
      total: 1,
    },
  }),
  useUpdateSession: () => ({ mutate: vi.fn() }),
  useAgentCatalog: () => ({ data: { nodes: [] }, isLoading: false }),
}));

vi.mock("../../../api", () => ({ attachSessionToProject: vi.fn(), createSession: vi.fn() }));

vi.mock("./AgentPicker", () => ({
  AgentPicker: ({ open, onSelect, error }: { open: boolean; onSelect: (agent: string, node: string) => Promise<void>; error?: string | null }) => open ? (
    <>
      <button type="button" onClick={() => void onSelect("default", "talos")}>Pick test agent</button>
      {error && <div role="alert">{error}</div>}
    </>
  ) : null,
}));

describe("SessionSidebar", () => {
  it("marks the active session as open and focused", () => {
    const { container } = render(<SessionSidebar width={220} activeSessionId="s-1" openSessionIds={new Set(["s-1"])} />);

    const row = container.querySelector("[data-session-id='s-1']");
    expect(row).toHaveAttribute("data-open", "true");
    expect(row).toHaveAttribute("data-focused", "true");
    expect(row).toHaveClass("focused");
  });

  it("keeps an open, unfocused session subtly highlighted", () => {
    const { container } = render(<SessionSidebar width={220} activeSessionId={null} openSessionIds={new Set(["s-1"])} />);

    const row = container.querySelector("[data-session-id='s-1']");
    expect(row).toHaveAttribute("data-open", "true");
    expect(row).toHaveAttribute("data-focused", "false");
    expect(row).not.toHaveClass("focused");
  });

  it("keeps idle sessions operable and named in compact mode", () => {
    const { container } = render(
      <SessionSidebar mode="compact" width={220} activeSessionId="s-1" />,
    );

    expect(container.querySelector("aside.sidebar")).toHaveClass("compact");
    expect(screen.getByRole("button", { name: "Focused session" })).toHaveAttribute(
      "title",
      expect.stringContaining("Focused session"),
    );
    expect(container.querySelector("[data-session-id='s-1'] .srow-icon svg")).toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: "Resize sessions sidebar" })).not.toBeInTheDocument();
  });

  it("writes a dockview session drag payload", () => {
    render(<SessionSidebar width={220} activeSessionId="s-1" />);
    const data = new Map<string, string>();

    fireEvent.dragStart(screen.getByRole("button", { name: "Focused session" }), {
      dataTransfer: {
        effectAllowed: "none",
        setData: (type: string, value: string) => data.set(type, value),
      },
    });

    expect(JSON.parse(data.get("application/x-olympus-session") ?? "{}")).toMatchObject({
      type: "session",
      sessionId: "s-1",
    });
  });

  it("awaits project association and surfaces failure in the picker", async () => {
    vi.mocked(createSession).mockResolvedValue({ id: "new-session" } as Session);
    const onOpenSession = vi.fn().mockRejectedValue(new Error("association failed"));
    render(
      <SessionSidebar
        width={220}
        activeSessionId={null}
        activeProjectId="project-a"
        onOpenSession={onOpenSession}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New session" }));
    fireEvent.click(screen.getByRole("button", { name: "Pick test agent" }));

    await waitFor(() => expect(onOpenSession).toHaveBeenCalledWith("new-session"));
    expect(await screen.findByRole("alert")).toHaveTextContent("association failed");
  });

  it("surfaces a failed drag-to-project association", async () => {
    vi.mocked(attachSessionToProject).mockRejectedValueOnce(new Error("Hall unavailable"));
    render(<SessionSidebar width={220} activeSessionId="s-1" />);

    fireEvent.drop(screen.getByRole("button", { name: "QA project" }), {
      dataTransfer: {
        getData: () => JSON.stringify({ type: "session", sessionId: "s-1" }),
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not move session to project: Hall unavailable",
    );
  });

  it("surfaces a failed project-session open", async () => {
    const onOpenSession = vi.fn().mockRejectedValue(new Error("Project unavailable"));
    render(
      <SessionSidebar
        width={220}
        activeSessionId={null}
        activeProjectId="project-a"
        onOpenSession={onOpenSession}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Focused session" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not open session: Project unavailable",
    );
  });
});
