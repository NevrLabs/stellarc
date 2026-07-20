import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionSidebar } from "./SessionSidebar";
import type { Session } from "../../../types";
import { attachContextProject, attachSessionToProject } from "../../../api";

const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
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
          source: "stellarc",
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

vi.mock("../../../api", () => ({ attachSessionToProject: vi.fn(), attachContextProject: vi.fn() }));

// Mock useResizable — the sidebar v4 uses it for the RECENT/PROJECTS section resize.
vi.mock("../../../hooks/useResizable", () => ({
  useResizable: () => ({ size: 200, setSize: vi.fn(), onResizeStart: vi.fn() }),
}));

describe("SessionSidebar", () => {
  beforeEach(() => vi.clearAllMocks());

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

  it("writes a dockview session drag payload", () => {
    // The session is rendered twice on purpose: RECENT is cross-project and the
    // PROJECTS tree also lists it under project-a. Select by data attribute —
    // getByText("Focused session") would match both rows and throw.
    const { container } = render(<SessionSidebar width={220} activeSessionId="s-1" />);
    const data = new Map<string, string>();

    const row = container.querySelector("[data-session-id='s-1']") as HTMLElement;
    fireEvent.dragStart(row, {
      dataTransfer: {
        effectAllowed: "none",
        setData: (type: string, value: string) => data.set(type, value),
      },
    });

    expect(JSON.parse(data.get("application/x-stellarc-session") ?? "{}")).toMatchObject({
      type: "session",
      sessionId: "s-1",
    });
  });

  it("opens a client-side draft without creating a Hall session", () => {
    render(<SessionSidebar width={220} activeSessionId={null} activeProjectId="project-a" />);
    fireEvent.click(screen.getByRole("button", { name: "New session⌘N" }));
    expect(navigate).toHaveBeenCalledWith({
      to: "/sessions/$sessionId",
      params: { sessionId: "new" },
      search: { project: "project-a" },
    });
  });

  it("offers context modes when a drop conflicts with the primary project", async () => {
    vi.mocked(attachSessionToProject).mockRejectedValueOnce(Object.assign(new Error("conflict"), { status: 409 }));
    const { container } = render(<SessionSidebar width={220} activeSessionId="s-1" />);
    fireEvent.drop(container.querySelector("[data-project-id='project-a']") as HTMLElement, {
      dataTransfer: { getData: () => JSON.stringify({ type: "session", sessionId: "s-1" }) },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Attach read-only" }));
    await waitFor(() => expect(attachContextProject).toHaveBeenCalledWith("s-1", "project-a", "read"));
  });

  it("opens a project-prefilled draft from the project shortcut", () => {
    render(<SessionSidebar width={220} activeSessionId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "New session in QA project" }));
    expect(navigate).toHaveBeenCalledWith({
      to: "/sessions/$sessionId",
      params: { sessionId: "new" },
      search: { project: "project-a" },
    });
  });

  it("surfaces a failed drag-to-project association", async () => {
    vi.mocked(attachSessionToProject).mockRejectedValueOnce(new Error("Axis unavailable"));
    const { container } = render(<SessionSidebar width={220} activeSessionId="s-1" />);

    // Project rows are div.navitem.proj-row with data-project-id
    const projRow = container.querySelector("[data-project-id='project-a']") as HTMLElement;
    fireEvent.drop(projRow, {
      dataTransfer: {
        getData: () => JSON.stringify({ type: "session", sessionId: "s-1" }),
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not move session to project: Axis unavailable",
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

    // Same duplication as above: click the first rendered row explicitly.
    fireEvent.click(
      document.querySelector("[data-session-id='s-1']") as HTMLElement,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not open session: Project unavailable",
    );
  });

  it("renders New session button, Agents/History/Usage navitems, and collapsible sections", () => {
    render(<SessionSidebar width={220} activeSessionId="s-1" />);
    expect(screen.getByRole("button", { name: "New session⌘N" })).toBeTruthy();
    expect(screen.getByText("Agents")).toBeTruthy();
    expect(screen.getByText("History")).toBeTruthy();
    expect(screen.getByText("Usage")).toBeTruthy();
    expect(screen.getByText("RECENT")).toBeTruthy();
    expect(screen.getByText("PROJECTS")).toBeTruthy();
  });

  it("collapses and expands sections on header click", () => {
    const { container } = render(<SessionSidebar width={220} activeSessionId="s-1" />);
    const [recentHeader, projectsHeader] = Array.from(
      container.querySelectorAll(".sec-head-toggle"),
    ) as HTMLElement[];

    expect(recentHeader).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector(".sec-recent [data-session-id='s-1']")).toBeTruthy();

    // Collapsing RECENT hides only RECENT's rows. The session also appears in
    // the PROJECTS tree (it has projectId project-a), so asserting on the
    // container as a whole would still find it there.
    fireEvent.click(recentHeader);
    expect(recentHeader).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector(".sec-recent [data-session-id='s-1']")).toBeFalsy();

    // With both sections collapsed no row is rendered anywhere.
    fireEvent.click(projectsHeader);
    expect(container.querySelector("[data-session-id='s-1']")).toBeFalsy();

    // Expanding RECENT brings its rows back.
    fireEvent.click(recentHeader);
    expect(container.querySelector(".sec-recent [data-session-id='s-1']")).toBeTruthy();
  });
});
