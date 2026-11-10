/**
 * AppGuards.tsx
 * - PageGuard: if one page hits an unexpected problem, only that page shows a calm
 *   message with a "Try again" button. The sidebar, header and every other page keep working.
 * - WakeNote: small note shown while the backend server is waking up.
 */
import { Component, ErrorInfo, ReactNode, createContext, useEffect, useState } from "react";
import { onServerWake } from "@/lib/serverWake";
import { useDarkMode } from "@/hooks/useDarkMode";

/** True for the page on screen. Pages kept open in the background get false. */
export const PageVisible = createContext(true);

type GuardProps = { children: ReactNode; resetKey?: string; compact?: boolean };
type GuardState = { failed: boolean };

function isStaleBuild(err: unknown) {
  const m = String((err as Error)?.message || err || "");
  return /dynamically imported module|Loading chunk|Importing a module script failed/i.test(m);
}

export class PageGuard extends Component<GuardProps, GuardState> {
  state: GuardState = { failed: false };

  static getDerivedStateFromError(): GuardState { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // A new version was published while this tab was open: reload once to pick it up
    if (isStaleBuild(error) && !sessionStorage.getItem("ch-reloaded")) {
      try { sessionStorage.setItem("ch-reloaded", "1"); } catch { /* ignore */ }
      window.location.reload();
      return;
    }
    console.error("[Custom Holidays] page problem:", error, info.componentStack);
  }

  componentDidUpdate(prev: GuardProps) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.compact) return null;
    return <GuardMessage onRetry={() => this.setState({ failed: false })} />;
  }
}

function GuardMessage({ onRetry }: { onRetry: () => void }) {
  const { dark } = useDarkMode();
  const ink = dark ? "#E6EFEC" : "#1A2324", muted = dark ? "#8FA6A3" : "#5B6766";
  const bg = dark ? "#0C2C32" : "#F3EAEA";
  const shadow = dark ? "6px 6px 14px #061A1E,-6px -6px 14px #16434A" : "6px 6px 14px #D9C6C8,-6px -6px 14px #FFFFFF";
  return (
    <div style={{ flex: 1, minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center", padding: "32px 28px", borderRadius: 18, boxShadow: shadow, color: ink }}>
        <div className="font-serif" style={{ fontSize: 24 }}>This page didn't load properly</div>
        <p style={{ color: muted, fontSize: 13.5, lineHeight: 1.6, margin: "10px 0 20px" }}>
          Nothing has been lost. Try again, and if it keeps happening, reload the dashboard.
          The rest of the dashboard still works from the sidebar.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onRetry} style={{ height: 38, padding: "0 16px", borderRadius: 12, border: "none", background: "#13585B", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Try again</button>
          <button onClick={() => window.location.reload()} style={{ height: 38, padding: "0 16px", borderRadius: 12, border: "none", background: bg, boxShadow: shadow, color: dark ? "#5FB3AE" : "#13585B", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Reload dashboard</button>
        </div>
      </div>
    </div>
  );
}

export function WakeNote() {
  const [waking, setWaking] = useState(false);
  const { dark } = useDarkMode();
  useEffect(() => onServerWake(setWaking), []);
  if (!waking) return null;
  return (
    <div role="status" style={{ position: "fixed", top: 66, left: "50%", transform: "translateX(-50%)", zIndex: 100,
      display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderRadius: 999, fontSize: 12.5,
      background: dark ? "#16434A" : "#13585B", color: "#fff", boxShadow: "0 6px 18px rgba(0,0,0,.18)" }}>
      <span className="animate-spin" style={{ width: 12, height: 12, borderRadius: 99, border: "2px solid rgba(255,255,255,.35)", borderTopColor: "#fff", display: "inline-block" }} />
      Waking up the server. The first load after a quiet spell can take up to a minute
    </div>
  );
}
