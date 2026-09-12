"use client";

import React from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Expose the full stack for diagnostics (readable via window.__bdErr).
    try { window.__bdErr = String(error?.stack || error) + "\n---\n" + String(info?.componentStack || ""); } catch {}
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="fixed inset-0 z-[100] flex items-center justify-center p-6"
        style={{ background: "var(--cb-bg)" }}
      >
        <div
          className="max-w-md w-full rounded-2xl p-6 text-center"
          style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}
        >
          <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-3" style={{ background: "color-mix(in srgb, #ef4444 12%, transparent)" }}>
            <AlertTriangle size={22} className="text-red-500" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight mb-1">Something went wrong</h1>
          <p className="text-sm mb-4" style={{ color: "var(--cb-muted)" }}>
            A component crashed. Your chats and settings are safe in localStorage. Reload to recover.
          </p>
          <pre className="text-left text-xs whitespace-pre-wrap p-3 rounded-md max-h-40 overflow-auto mb-4" style={{ background: "var(--cb-bg)", border: "1px solid var(--cb-border)" }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div className="flex gap-2 justify-center">
            <button
              onClick={this.reset}
              className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
              style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}
            >
              <RefreshCcw size={14} /> Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: "var(--cb-accent)" }}
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
