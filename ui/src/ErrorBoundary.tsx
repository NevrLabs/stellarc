import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode; fallback?: (error: Error, retry: () => void) => ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Uncaught UI error", error, info.componentStack); }
  retry = () => this.setState({ error: null });
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.retry);
    return <main className="fatal-error" role="alert"><h1>Something went wrong</h1><p>{error.message}</p><button type="button" onClick={() => window.location.reload()}>Reload Stellarc</button></main>;
  }
}
