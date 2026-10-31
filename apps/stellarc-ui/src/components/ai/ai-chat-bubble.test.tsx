import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AiChatBubble } from "@/components/ai/ai-chat-bubble";

// The chat bubble reads organization + AI settings through the BetterAuth
// client and TanStack Query. Mock at that boundary: the component only needs
// { data } shapes it destructures.
const mockUseActiveOrganization = vi.hoisted(() => ({
  data: undefined as { id: string; name: string } | undefined,
}));
const mockUseGetAiSettings = vi.hoisted(() => ({
  data: undefined as
    | {
        enabled: boolean;
        configured: boolean;
        effectiveCharacterLimit: number;
      }
    | undefined,
}));

vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => mockUseActiveOrganization,
}));

vi.mock("@/hooks/queries/ai/use-get-ai-settings", () => ({
  default: () => mockUseGetAiSettings,
}));

vi.mock("@/fetchers/get-api-url", () => ({
  getApiUrl: (path: string) => `http://api.test/api/${path}`,
}));

describe("AiChatBubble transcript wiring (NEVR-170)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    mockUseActiveOrganization.data = undefined;
    mockUseGetAiSettings.data = undefined;
  });

  function enablePanel() {
    mockUseActiveOrganization.data = {
      id: "org-1",
      name: "Foundation Lab",
    };
    mockUseGetAiSettings.data = {
      enabled: true,
      configured: true,
      effectiveCharacterLimit: 2000,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          message: "**Done.** Ticket assigned to Ada.",
          actions: [],
        }),
      })),
    );
  }

  test("history renders through MessageScroller/Message/Bubble with jump-to-latest", async () => {
    enablePanel();

    const { container } = render(<AiChatBubble />);

    // Panel is closed until the floating button opens it.
    expect(screen.queryByTestId("ai-chat-panel")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Open organization AI assistant" }),
    );

    const panel = screen.getByTestId("ai-chat-panel");
    expect(panel).toBeInTheDocument();

    // The transcript is a MessageScroller viewport (role=region aria-label
    // "Messages") wrapping the log — not a hand-rolled overflow div.
    expect(
      screen.getByRole("region", { name: "Messages" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("log")).toBeInTheDocument();

    // Send a message; the user entry and the assistant reply render as
    // registered scroller items with bubble content.
    fireEvent.change(
      screen.getByLabelText("Message organization AI assistant"),
      { target: { value: "Assign STL-1 to Ada" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Assign STL-1 to Ada")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(
        screen.getByText("**Done.** Ticket assigned to Ada."),
      ).toBeInTheDocument();
    });

    // Every history entry is a registered scroller item keyed by message id,
    // which is what jump-to-latest / scroll anchoring operate on.
    const items = container.querySelectorAll("[data-message-id]");
    expect(items.length).toBeGreaterThanOrEqual(2);

    // Jump-to-latest control from MessageScrollerButton exists and is wired.
    expect(
      screen.getByRole("button", { name: "Jump to latest message" }),
    ).toBeInTheDocument();
  });

  test("assistant replies render inside the typeset chat preset", async () => {
    enablePanel();

    render(<AiChatBubble />);
    fireEvent.click(
      screen.getByRole("button", { name: "Open organization AI assistant" }),
    );
    fireEvent.change(
      screen.getByLabelText("Message organization AI assistant"),
      { target: { value: "Summarize the board" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(
        screen.getByText("**Done.** Ticket assigned to Ada."),
      ).toBeInTheDocument();
    });

    const typeset = document.querySelector(".typeset.typeset-chat");
    expect(typeset).not.toBeNull();
    expect(typeset?.textContent).toBe("**Done.** Ticket assigned to Ada.");
  });
});
