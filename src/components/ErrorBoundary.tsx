import { Component, type ErrorInfo, type ReactNode } from "react";
import { PageShell } from "./PageShell";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <PageShell>
        <div role="alert" className="flex flex-col items-center gap-4">
          <h1 className="font-serif text-3xl">Something went wrong</h1>
          <p className="text-pretty text-muted">
            {"We couldn't load this page. Please refresh, or try again in a moment."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Refresh page
          </button>
        </div>
      </PageShell>
    );
  }
}
