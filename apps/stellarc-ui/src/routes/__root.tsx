import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  Outlet,
} from "@tanstack/react-router";
import { ErrorBoundary, ErrorFallback } from "@/components/error-boundary";
import { ToastProvider } from "@/components/ui/toast";
import { useUserPreferencesEffects } from "@/hooks/use-user-preferences-effects";
import type { User } from "@/types/user";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  user: User | null | undefined;
}>()({
  component: RootComponent,
  errorComponent: RootErrorComponent,
});

function RootComponent() {
  /*
   * #125: root-level so document-wide preferences (overlay blur, compact mode)
   * apply on every route and react immediately. `Layout` is mounted per-route,
   * so hooking it there left Settings — the very page holding the toggles —
   * without the effects until a reload.
   */
  useUserPreferencesEffects();

  return (
    <ToastProvider position="bottom-right">
      <div className="flex min-h-svh w-full flex-row overflow-x-hidden bg-background scrollbar-thin scrollbar-thumb-border scrollbar-track-muted md:h-svh md:min-h-0 md:overflow-y-hidden">
        <ErrorBoundary
          className="m-auto max-w-2xl"
          fallbackDescription="This page hit an unexpected error. Try again, or reload the app."
          fallbackTitle="This page failed to load"
        >
          <Outlet />
        </ErrorBoundary>
      </div>
    </ToastProvider>
  );
}

/**
 * Last line of defence for the router: keeps the app shell painted instead of
 * unmounting into a blank document when a route tree throws during render.
 */
function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error("[RootErrorComponent]", error);

  return (
    <div className="flex h-svh w-full items-center justify-center bg-background p-6">
      <ErrorFallback
        className="max-w-2xl"
        description="Kaneo hit an unexpected error while rendering this view."
        error={error}
        onRetry={reset}
        title="Something went wrong"
      />
    </div>
  );
}

export default RootComponent;
