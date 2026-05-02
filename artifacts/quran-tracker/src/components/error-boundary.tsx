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
      return (
        <div
          className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-rose-50 via-white to-slate-50"
          data-testid="error-boundary"
        >
          <div className="max-w-2xl w-full bg-white border border-rose-200 rounded-xl shadow-md p-6 space-y-4">
            <div>
              <h1 className="text-xl font-semibold text-rose-700">Something went wrong</h1>
              <p className="text-sm text-muted-foreground mt-1">
                The page failed to render. Try reloading or returning to the dashboard.
              </p>
            </div>
            <details className="text-xs bg-slate-50 border border-slate-200 rounded p-3 overflow-auto max-h-80">
              <summary className="font-medium cursor-pointer">Error details</summary>
              <pre className="mt-2 whitespace-pre-wrap break-all" data-testid="error-boundary-message">
                {String(this.state.error?.message ?? this.state.error)}
              </pre>
              <pre className="mt-2 whitespace-pre-wrap break-all text-slate-600" data-testid="error-boundary-stack">
                {stack}
              </pre>
              <pre className="mt-2 whitespace-pre-wrap break-all text-slate-500" data-testid="error-boundary-component-stack">
                {componentStack}
              </pre>
            </details>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 text-sm bg-teal-700 text-white rounded-md hover:bg-teal-800"
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
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
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
