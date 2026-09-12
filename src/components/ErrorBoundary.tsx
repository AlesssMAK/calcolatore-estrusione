import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Rendered instead of the children when a descendant render throws. Gets the
   *  error so the message can be surfaced (e.g. on a phone with no console). */
  fallback: (error: Error) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Minimal error boundary. A single malformed saved calculation must never blank
 * the whole app — wrapping the results in this keeps the rest usable and shows
 * the error text so we can diagnose it from a screenshot. Give it a `key` that
 * changes per result (e.g. formKey) so a new, good result remounts it clean.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept for desktop debugging; the on-screen fallback covers mobile.
    console.error('ErrorBoundary caught a render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) return this.props.fallback(this.state.error);
    return this.props.children;
  }
}

export default ErrorBoundary;
