import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

function getErrorText(error: unknown) {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  return "An unexpected error occurred.";
}

export type ErrorFallbackProps = {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  description?: string;
  className?: string;
};

/**
 * Presentational fallback shared by the class boundary below and by TanStack
 * Router's `errorComponent` / `defaultErrorComponent` hooks. Deliberately free
 * of hooks, i18n and data fetching so it still renders when those break.
 */
export function ErrorFallback({
  error,
  onRetry,
  title = "Something went wrong",
  description = "This section failed to render. The rest of the app is still usable.",
  className,
}: ErrorFallbackProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-border/80 bg-card px-5 py-8 text-center",
        className,
      )}
      role="alert"
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-destructive/12">
        <AlertTriangle className="size-5 text-destructive-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="font-semibold text-base text-foreground">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <pre className="max-h-32 w-full max-w-lg overflow-auto rounded-md bg-muted/60 px-3 py-2 text-left font-mono text-muted-foreground text-xs whitespace-pre-wrap">
        {getErrorText(error)}
      </pre>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        {onRetry && (
          <Button onClick={onRetry} size="sm" variant="outline">
            <RotateCcw />
            Try again
          </Button>
        )}
        <Button
          onClick={() => window.location.reload()}
          size="sm"
          variant="ghost"
        >
          <RefreshCw />
          Reload
        </Button>
      </div>
    </div>
  );
}

type ErrorBoundaryProps = {
  children: ReactNode;
  /** Heading shown in the fallback, e.g. "Linked tasks unavailable". */
  fallbackTitle?: string;
  fallbackDescription?: string;
  className?: string;
  /** Fully custom fallback; receives the error and a reset callback. */
  fallback?: (error: unknown, reset: () => void) => ReactNode;
};

type ErrorBoundaryState = {
  error: unknown;
  hasError: boolean;
};

/**
 * Scoped React error boundary. Wrap risky panels with this so a runtime error
 * degrades to an inline fallback instead of blanking the whole UI.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, hasError: false };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error, hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Never swallow: keep the stack in the console for debugging.
    console.error(
      `[ErrorBoundary${this.props.fallbackTitle ? `: ${this.props.fallbackTitle}` : ""}]`,
      error,
      errorInfo.componentStack,
    );
  }

  reset = () => {
    this.setState({ error: null, hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(this.state.error, this.reset);
    }

    return (
      <ErrorFallback
        className={this.props.className}
        description={this.props.fallbackDescription}
        error={this.state.error}
        onRetry={this.reset}
        title={this.props.fallbackTitle}
      />
    );
  }
}

export default ErrorBoundary;
