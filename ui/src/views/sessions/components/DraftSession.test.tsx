import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DraftSession } from "./DraftSession";
import { attachContextProject, attachSessionToProject, createSession, sendMessage } from "../../../api";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("../../../hooks/queries", () => ({
  useProjects: () => ({ data: { projects: [
    { id: "alpha", name: "Alpha", vaults: ["home"], repos: ["alpha-repo"], boards: [], layout: null, createdAt: 2 },
    { id: "beta", name: "Beta", vaults: [], repos: [], boards: [], layout: null, createdAt: 1 },
  ] } }),
  useVaults: () => ({ data: { vaults: [{ id: "home", name: "Home", noteCount: 0, updatedAt: 1, backend: null }] } }),
  useAgentCatalog: () => ({ data: { nodes: [{
    nodeId: "local", hostname: "olympus", status: "online", slotsUsed: 0, slotsTotal: 4,
    version: "1", local: true, lastHeartbeatAgoSecs: 1, transport: "local",
    agents: [{ id: "default", provider: "anthropic", model: "claude", kind: "hermes", isDefault: true }],
  }] }, isLoading: false }),
  useSessions: () => ({ data: { sessions: [] } }),
  useAgents: () => ({ data: { agents: [{ id: "default", provider: "anthropic", model: "claude", kind: "hermes", isDefault: true }] } }),
}));
vi.mock("../../../api", () => ({
  createSession: vi.fn(), attachSessionToProject: vi.fn(), attachContextProject: vi.fn(), sendMessage: vi.fn(),
}));
vi.mock("./Composer", () => ({
  Composer: ({ text, onTextChange, onSend, sessionAgent }: any) => <>
    <input aria-label={`Message ${sessionAgent}`} value={text} onChange={onTextChange} />
    <button type="button" onClick={() => onSend()}>Send</button>
  </>,
}));

describe("DraftSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSession).mockResolvedValue({ id: "created" } as any);
    vi.mocked(attachContextProject).mockResolvedValue([]);
  });

  it("prefills inherited project resources and creates only on first send", async () => {
    render(<DraftSession initialProjectId="alpha" />);

    expect(createSession).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remove alpha-repo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Home" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "＋ context" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Beta" }).at(-1)!);
    fireEvent.change(screen.getByRole("textbox", { name: "Message default" }), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith("created", "hello", undefined, undefined));
    expect(createSession).toHaveBeenCalledWith({ agent: "default", node: "local" });
    expect(attachSessionToProject).toHaveBeenCalledWith("created", "alpha");
    expect(attachContextProject).toHaveBeenCalledWith("created", "beta", "read");
    expect(navigate).toHaveBeenCalledWith({ to: "/sessions/$sessionId", params: { sessionId: "created" }, replace: true });
  });

  it("shows the selected agent highlighted in the selector", () => {
    render(<DraftSession />);
    // The default agent is auto-selected and should have aria-selected=true
    const option = screen.getByRole("option", { name: "default on olympus" });
    expect(option).toHaveAttribute("aria-selected", "true");
  });

  it("filters agents by search query", () => {
    render(<DraftSession />);
    const search = screen.getByRole("textbox", { name: "Search agents" });
    // Default agent visible before filtering
    expect(screen.getByRole("option", { name: "default on olympus" })).toBeInTheDocument();
    // Search for something that doesn't match
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText("No matching agents")).toBeInTheDocument();
  });

  it("exposes model preview for the selected agent", () => {
    render(<DraftSession />);
    // The model preview should show the agent model — it appears in both the
    // agent list item and the model preview bar.
    const matches = screen.getAllByText("claude");
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
