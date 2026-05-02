import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary] Caught error:", error);
    console.error("[ErrorBoundary] Component stack:", info.componentStack);
    this.setState({ error, info });
  }

  reset = () => {
    this.setState({ error: null, info: null });
  };

  render() {
    if (this.state.error) {
      const stack = this.state.error.stack ?? String(this.state.error);
      const componentStack = this.state.info?.componentStack ?? "(no component stack)";
      const showDetails = import.meta.env.DEV;
      return (
        <div
          className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-destructive/5 via-background to-card"
          data-testid="error-boundary"
        >
          <div className="max-w-2xl w-full bg-card border border-destructive/30 rounded-xl shadow-md p-6 space-y-4">
            <div>
              <h1 className="text-xl font-semibold text-destructive">Something went wrong</h1>
              <p className="text-sm text-muted-foreground mt-1">
                The page failed to render. Try reloading or returning to the dashboard.
              </p>
            </div>
            {showDetails && (
              <details className="text-xs bg-muted/50 border border-border rounded p-3 overflow-auto max-h-80">
                <summary className="font-medium cursor-pointer">Error details</summary>
                <pre className="mt-2 whitespace-pre-wrap break-all text-foreground" data-testid="error-boundary-message">
                  {String(this.state.error?.message ?? this.state.error)}
                </pre>
                <pre className="mt-2 whitespace-pre-wrap break-all text-muted-foreground" data-testid="error-boundary-stack">
                  {stack}
                </pre>
                <pre className="mt-2 whitespace-pre-wrap break-all text-muted-foreground/80" data-testid="error-boundary-component-stack">
                  {componentStack}
                </pre>
              </details>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                data-testid="error-boundary-reload"
              >
                Reload page
              </button>
              <button
                type="button"
                onClick={() => {
                  this.reset();
                  window.location.assign("/");
                }}
                className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted"
                data-testid="error-boundary-home"
              >
                Go home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
