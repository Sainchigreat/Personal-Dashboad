import { Component, type ErrorInfo, type ReactNode } from "react";

type State = { failed: boolean };

/** Show a recovery option instead of a blank page if rendering fails. */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Momentum OS could not render the workspace", error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="boot-screen" role="alert">
          <div className="boot-logo">M</div>
          <h1>Unable to open Momentum OS</h1>
          <p>Please reload the page. If this continues, try another browser.</p>
          <button className="button primary" onClick={() => location.reload()}>
            Reload preview
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
