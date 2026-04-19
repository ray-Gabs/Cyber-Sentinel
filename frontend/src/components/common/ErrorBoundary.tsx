import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          className="min-h-screen flex items-center justify-center p-6"
          style={{ backgroundColor: "var(--bg-base)" }}
        >
          <div
            className="max-w-md w-full rounded-2xl p-8 text-center"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: "rgba(239,68,68,0.1)" }}
            >
              <AlertTriangle size={28} style={{ color: "var(--red)" }} />
            </div>
            <h2
              className="text-xl font-bold mb-2"
              style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}
            >
              Something went wrong
            </h2>
            <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
              An unexpected error occurred in this part of the application.
            </p>
            {this.state.error && (
              <pre
                className="text-left text-xs rounded-lg p-3 mb-5 overflow-x-auto whitespace-pre-wrap"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  color: "var(--red)",
                  border: "1px solid var(--border)",
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleRetry}
                className="btn-primary flex items-center gap-2"
              >
                <RefreshCw size={14} /> Retry
              </button>
              <button
                onClick={() => { window.location.href = "/dashboard"; }}
                className="btn-secondary"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
