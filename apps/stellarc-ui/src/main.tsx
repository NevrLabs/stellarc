import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRouter,
  type ErrorComponentProps,
  RouterProvider,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import queryClient from "@/query-client";
import "@/index.css";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import { ErrorBoundary, ErrorFallback } from "./components/error-boundary";
import { KeyboardShortcutsHelp } from "./components/keyboard-shortcuts-help";
import AuthProvider from "./components/providers/auth-provider";
import { ThemeProvider } from "./components/providers/theme-provider";
import { KeyboardShortcutsProvider } from "./hooks/use-keyboard-shortcuts";
import { AppI18nProvider } from "./lib/i18n/provider";
import { routeTree } from "./routeTree.gen";

console.log(`
                     ////////  
              /////  ////////  
            //////// ////////  
  //////// ///////// ///////   
  //////// ///////// //////    
  //////// ///////// ////      
  //////// ///////// ///       
  //////// ///////// /////     
  //////// ///////// //////    
  //////// ///////// ////////  
  //////// ///////// ////////  
  //////// ///////// ////////  
  //////// ////////            
  ////////  /////              
  ///////                      
                   
  
  All you need. Nothing you don't.
`);

/** Applied to every route that doesn't define its own `errorComponent`. */
function RouteErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error("[RouteErrorComponent]", error);

  return (
    <div className="flex w-full items-center justify-center p-6">
      <ErrorFallback
        className="max-w-2xl"
        description="This view failed to render. You can retry it or navigate elsewhere."
        error={error}
        onRetry={reset}
        title="This view failed to load"
      />
    </div>
  );
}

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  // Preloaded route data stays fresh briefly so hovering a tab and then
  // clicking it doesn't immediately refetch what was just preloaded.
  defaultPreloadStaleTime: 10_000,
  defaultErrorComponent: RouteErrorComponent,
  context: {
    user: null,
    queryClient,
  },
});

function App() {
  const { user } = useAuth();

  return <RouterProvider router={router} context={{ user }} />;
}

const rootElement = document.getElementById("root") as HTMLElement;
if (!rootElement.innerHTML) {
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <ErrorBoundary
        className="m-6"
        fallbackDescription="Kaneo could not start this view. Reload the page to try again."
        fallbackTitle="Kaneo hit an unexpected error"
      >
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <AppI18nProvider>
                <KeyboardShortcutsProvider>
                  <App />
                  <ErrorBoundary fallback={() => null}>
                    <KeyboardShortcutsHelp />
                  </ErrorBoundary>
                </KeyboardShortcutsProvider>
              </AppI18nProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
