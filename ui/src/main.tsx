import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "./router";
import { qk, useLiveSync } from "./hooks/queries";
import { ThemeProvider } from "./theme";
import { AuthGate, useAxisAuth } from "./auth";
import { ErrorBoundary } from "./ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReconnectOverlay } from "./ReconnectOverlay";
import { lazy, Suspense } from "react";

// Dev-only debugging surfaces: TanStack Router + Query devtools. Lazy so
// production bundles tree-shake them out entirely.
const RouterDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-router-devtools").then((m) => ({
        default: m.TanStackRouterDevtools,
      })),
    )
  : null;
const QueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((m) => ({
        default: m.ReactQueryDevtools,
      })),
    )
  : null;
// Design system: tokens (colors, type, spacing, radius, motion, fonts) + base
// resets + .ol-* component classes. Imported before index.css so the app-shell
// aliases in index.css can reference the design-system tokens.
import "./design/styles.css";
import "./index.css";
import "./mobile.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

if (import.meta.env.DEV) {
  const qaWindow = window as typeof window & {
    __stellarcQa?: { refetchProject: (projectId: string) => Promise<unknown> };
  };
  qaWindow.__stellarcQa = {
    refetchProject: (projectId) => queryClient.refetchQueries({
      queryKey: qk.project(projectId),
      exact: true,
    }),
  };
}

function Root() {
  return <AuthGate><AuthenticatedApp /></AuthGate>;
}

function AuthenticatedApp() {
  const { organization } = useAxisAuth();
  useLiveSync(organization.id);
  return (
    <>
      <RouterProvider router={router} />
      {RouterDevtools && (
        <Suspense>
          <RouterDevtools router={router} position="bottom-right" />
        </Suspense>
      )}
      {QueryDevtools && (
        <Suspense>
          <QueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
        </Suspense>
      )}
    </>
  );
}

// Bootstrap: start MSW mock worker (dev/e2e only) before React mounts.
async function bootstrap() {
  const useMocks = import.meta.env.VITE_USE_MOCKS !== "false";
  if (useMocks) {
    const { worker } = await import("./mocks/browser");
    await worker.start({
      onUnhandledRequest: "bypass",
      serviceWorker: {
        url: "/mockServiceWorker.js",
      },
    });
    const { installWsMock } = await import("./mocks/ws-mock");
    installWsMock();
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <ThemeProvider>
            <TooltipProvider><Root /><ReconnectOverlay /></TooltipProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

bootstrap();

// Register service worker for offline/reconnect support.
// Prevents Cloudflare 502 error pages during server restarts.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
