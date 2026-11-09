/**
 * ResetPassword.tsx — where the "reset your password" email link lands.
 * Signed in through the link: choose a new password. Without a valid link: ask for a new one.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useDarkMode } from "@/hooks/useDarkMode";

export default function ResetPassword() {
  const { session } = useAuth();
  const { dark } = useDarkMode();
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const BG = dark ? "#0C2C32" : "#F3EAEA", INK = dark ? "#E6EFEC" : "#1A2324", MUTED = dark ? "#8FA6A3" : "#5B6766";
  const OUT = dark ? "10px 10px 24px #061A1E,-10px -10px 24px #16434A" : "10px 10px 24px #D5C1C3,-10px -10px 24px #FFFFFF";
  const IN = dark ? "inset 3px 3px 7px #061A1E,inset -3px -3px 7px #16434A" : "inset 3px 3px 7px #D9C6C8,inset -3px -3px 7px #FFFFFF";
  const input: React.CSSProperties = { width: "100%", height: 44, borderRadius: 12, border: "none", outline: "none", boxShadow: IN, background: BG, color: INK, padding: "0 14px", fontSize: 14 };
  const primary: React.CSSProperties = { width: "100%", height: 44, borderRadius: 12, border: "none", background: "#13585B", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 };

  const save = async () => {
    setError("");
    if (pw.length < 8) return setError("Use at least 8 characters");
    if (pw !== pw2) return setError("The two passwords don't match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(error.message || "Couldn't save the new password. Try again");
    setDone(true);
  };

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: BG, color: INK, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <img src={dark ? "/ch-logo-peach.png" : "/ch-logo-teal.png"} alt="Custom Holidays" style={{ width: 200, height: "auto" }} />
        </div>
        <div style={{ background: BG, boxShadow: OUT, borderRadius: 24, padding: 32 }}>
          {!session ? (
            <>
              <div className="font-serif" style={{ fontSize: 24 }}>This link has expired</div>
              <p style={{ color: MUTED, fontSize: 13.5, lineHeight: 1.6, margin: "8px 0 20px" }}>Reset links work once and only for a short time. Ask for a new one from the sign-in page.</p>
              <button style={primary} onClick={() => nav("/login")}>Back to sign in</button>
            </>
          ) : done ? (
            <>
              <div className="font-serif" style={{ fontSize: 24 }}>Password changed</div>
              <p style={{ color: MUTED, fontSize: 13.5, lineHeight: 1.6, margin: "8px 0 20px" }}>Use your new password the next time you sign in.</p>
              <button style={primary} onClick={() => nav("/", { replace: true })}>Go to the dashboard</button>
            </>
          ) : (
            <>
              <div className="font-serif" style={{ fontSize: 24 }}>Choose a new password</div>
              <p style={{ color: MUTED, fontSize: 13.5, lineHeight: 1.6, margin: "6px 0 18px" }}>For {session.user?.email}. At least 8 characters.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <input type="password" autoComplete="new-password" placeholder="New password" value={pw} onChange={e => setPw(e.target.value)} style={input} />
                <input type="password" autoComplete="new-password" placeholder="Type it again" value={pw2} onChange={e => setPw2(e.target.value)} onKeyDown={e => e.key === "Enter" && save()} style={input} />
                {error && <div style={{ color: dark ? "#E58A7E" : "#A23B2E", fontSize: 13 }}>{error}</div>}
                <button style={{ ...primary, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={save}>
                  {busy && <Loader2 size={16} className="animate-spin" />}Save new password
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
