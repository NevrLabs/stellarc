import "./test/setup";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "./theme";
import { AuthGate } from "./auth";
import { router } from "./router";
import { RouterProvider } from "@tanstack/react-router";

// Mock heavy views to avoid loading real component trees in shell test
vi.mock("./views/docs/DocsView", () => ({ DocsView: () => null }));
vi.mock("./views/VaultWorkspaceView", () => ({ VaultWorkspaceView: () => null }));
vi.mock("./views/SessionsView", () => ({ SessionsView: () => null }));
vi.mock("./views/FleetView", () => ({ default: () => null }));


function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderApp() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider>
        <AuthGate><RouterProvider router={router} /></AuthGate>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  void router.navigate({ to: "/" });
});

describe("AppShell account menu", () => {
  it("opens from the avatar without logging out and signs out only from the explicit item", async () => {
    let authenticated = true;
    let logoutCount = 0;
    vi.spyOn(window, "fetch").mockImplementation(async (input, init) => {
      const path = String(input);
      if (path.endsWith("/api/auth/session")) {
        return authenticated
          ? json({ user: { userId: "u1", username: "alice", kind: "user" } })
          : new Response(null, { status: 401 });
      }
      if (path.endsWith("/api/organizations")) {
        return json({ organizations: [{ id: "org-a", slug: "a", displayName: "Org A", role: "owner" }] });
      }
      if (path.endsWith("/api/organizations/org-a/cards")) {
        return json({ cards: [], total: 0 });
      }
      if (path.endsWith("/api/auth/logout") && init?.method === "POST") {
        authenticated = false;
        logoutCount += 1;
        return new Response(null, { status: 204 });
      }
      if (path.endsWith("/api/auth/bootstrap")) return json({ usersExist: true });
      throw new Error(`unexpected request ${path}`);
    });

    await router.navigate({ to: "/projects" });
    renderApp();

    const avatar = await screen.findByRole("button", { name: "Account menu for alice" });
    await userEvent.click(avatar);

    expect(logoutCount).toBe(0);
    expect(await screen.findByText("Organization")).toBeInTheDocument();
    expect(screen.getAllByText("Org A").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("menuitem", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByText("No other organizations available.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(logoutCount).toBe(1));
    expect(await screen.findByRole("heading", { name: "Sign in to this Axis" })).toBeInTheDocument();
  });
});
