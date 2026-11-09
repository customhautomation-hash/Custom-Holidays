/**
 * Profile & settings — opened by clicking your name at the bottom of the sidebar.
 * Account details, the apps the dashboard connects to, and light/dark mode.
 */
import { useEffect, useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDarkMode } from "@/hooks/useDarkMode";
import { supabase } from "@/lib/supabase";
import { API_ROOT } from "@/lib/api";
import {
  canSaveDirect, getSavedBaseDir, pickBaseDir, isDriveConfigured, loadGoogleSignIn, getDriveToken,
  hasConnectedDrive, driveAccountEmail, disconnectDrive, parseDriveFolderId, DEFAULT_DRIVE_PARENT,
} from "@/lib/tripFolders";
import { Page, Card, Btn, Field, Muted, Dot, useT } from "@/components/ch/kit";

async function authHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ? `Bearer ${data.session.access_token}` : "";
}
const lsGet = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };

type Conn = { key: string; letter: string; name: string; use: string; state: "on" | "off" | "soon" | "loading"; detail?: string; onConnect?: () => void; onManage?: () => void };

export default function ProfilePage() {
  const t = useT();
  const { user, profile } = useAuth();
  const { dark, toggle } = useDarkMode();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [saved, setSaved] = useState("");
  const [pw, setPw] = useState("");
  const [gmail, setGmail] = useState<{ connected: boolean; email?: string } | null>(null);
  const [ga, setGa] = useState<boolean | null>(null);
  const fullDrive = !!parseDriveFolderId(lsGet("trip:driveParent", DEFAULT_DRIVE_PARENT));
  const [drive, setDrive] = useState(hasConnectedDrive(fullDrive));
  const [driveEmail, setDriveEmail] = useState(driveAccountEmail());
  const [pcFolder, setPcFolder] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => { setName(profile?.full_name ?? ""); }, [profile?.full_name]);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_ROOT}/gmail/status`, { headers: { Authorization: await authHeader() } });
        const d = await r.json(); setGmail({ connected: !!d.connected, email: d.gmail_email });
      } catch { setGmail({ connected: false }); }
    })();
    supabase.functions.invoke("ga4-analytics").then(({ data, error }: any) => setGa(!error && !data?.error)).catch(() => setGa(false));
    if (canSaveDirect()) getSavedBaseDir().then(h => setPcFolder(h?.name ?? null));
    if (isDriveConfigured()) loadGoogleSignIn().catch(() => {});
  }, []);

  const saveName = async () => {
    if (!user || !name.trim()) return;
    await supabase.from("profiles").update({ full_name: name.trim() }).eq("id", user.id);
    setSaved("Saved"); setTimeout(() => setSaved(""), 2000);
  };
  const resetPassword = async () => {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: window.location.origin });
    setPw(error ? "Could not send the email, try again" : `Reset link sent to ${user.email}`);
  };
  const connectGmail = async () => {
    try {
      const r = await fetch(`${API_ROOT}/gmail/oauth/url`, { headers: { Authorization: await authHeader() } });
      const d = await r.json(); if (d.url) window.location.href = d.url; else setErr("Gmail isn't set up on the server yet");
    } catch { setErr("Could not reach the server, it may be waking up. Try again in a minute."); }
  };
  const disconnectGmail = async () => {
    if (!confirm("Disconnect Gmail?")) return;
    await fetch(`${API_ROOT}/gmail/disconnect`, { method: "POST", headers: { Authorization: await authHeader() } }).catch(() => {});
    setGmail({ connected: false });
  };
  const connectDrive = async () => {
    try { await getDriveToken(fullDrive); setDrive(true); setDriveEmail(driveAccountEmail()); }
    catch (e: any) { setErr(e?.message || "Could not connect Google Drive"); }
  };

  const conns: Conn[] = [
    { key: "gmail", letter: "G", name: "Gmail", use: "Reads supplier rates and confirmations, sends client replies",
      state: gmail === null ? "loading" : gmail.connected ? "on" : "off", detail: gmail?.email, onConnect: connectGmail, onManage: disconnectGmail },
    { key: "drive", letter: "D", name: "Google Drive", use: "Saves each client's trip folder",
      state: !isDriveConfigured() ? "soon" : drive ? "on" : "off", detail: driveEmail || undefined, onConnect: connectDrive,
      onManage: () => { if (confirm("Disconnect Google Drive in this browser?")) { disconnectDrive(); setDrive(false); } } },
    { key: "pc", letter: "PC", name: "Trips folder on this PC", use: "Where trip folders are saved on this computer",
      state: !canSaveDirect() ? "soon" : pcFolder ? "on" : "off", detail: pcFolder || undefined,
      onConnect: async () => { try { const h = await pickBaseDir(); setPcFolder(h?.name ?? null); } catch { /* cancelled */ } },
      onManage: async () => { try { const h = await pickBaseDir(); setPcFolder(h?.name ?? null); } catch { /* cancelled */ } } },
    { key: "ga", letter: "A", name: "Google Analytics", use: "Website visitors and enquiries", state: ga === null ? "loading" : ga ? "on" : "off" },
    { key: "meta", letter: "M", name: "Meta Ads", use: "Instagram and Facebook lead forms and ad spend", state: "soon" },
    { key: "notion", letter: "N", name: "Notion", use: "One-time import of clients into Master CRM", state: "soon" },
    { key: "wa", letter: "W", name: "WhatsApp Business", use: "Lead messages and drafted replies", state: "soon" },
  ];
  const onCount = conns.filter(c => c.state === "on").length;

  const initials = (profile?.full_name || user?.email || "?").split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("");
  const role = profile?.role ? profile.role[0].toUpperCase() + profile.role.slice(1) : "Member";
  const row = { display: "flex", alignItems: "center", gap: 12, padding: "11px 0", fontSize: 13 } as const;

  return (
    <Page
      title={<span className="flex items-center gap-4">
        <span style={{ width: 60, height: 60, borderRadius: 99, border: "2px solid #D4AF5A", color: "#B8913E", background: t.GOLD_BG, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 19, fontWeight: 600, fontFamily: "inherit" }}>{initials}</span>
        {profile?.full_name || user?.email?.split("@")[0]}
      </span>}
      sub={`${role} · Custom Holidays, Mumbai`}
      actions={<Btn onClick={() => supabase.auth.signOut()}><LogOut size={15} />Sign out</Btn>}>
      <div className="flex flex-col xl:flex-row items-start gap-6">
        <Card style={{ flex: 1, width: "100%" }} pad="20px 24px 10px">
          <div className="flex items-center justify-between">
            <div><b style={{ fontSize: 15 }}>Connections</b><div><Muted>Apps the dashboard and its automations use</Muted></div></div>
            <Muted>{onCount} of {conns.length} connected</Muted>
          </div>
          {err && <div style={{ color: t.RED, fontSize: 12, marginTop: 10 }}>{err}</div>}
          <div style={{ marginTop: 8 }}>
            {conns.map((c, i) => (
              <div key={c.key} style={{ display: "grid", gridTemplateColumns: "40px 1fr 170px 110px", gap: 16, alignItems: "center", padding: "14px 4px", borderTop: i ? `1px solid ${t.LINE}` : "none" }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: c.letter.length > 1 ? 11 : 14, color: t.TEAL, boxShadow: t.BTN }}>{c.letter}</span>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name}</div><Muted>{c.use}</Muted></div>
                <div style={{ fontSize: 12, color: c.state === "on" ? t.TEAL : t.FAINT, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.state === "loading" ? <Loader2 size={14} className="animate-spin" /> :
                   c.state === "on" ? <><Dot color={t.TEAL} />{c.detail || "Connected"}</> :
                   c.state === "soon" ? "Set up needed" : "Not connected"}
                </div>
                {c.state === "on" ? (c.onManage ? <Btn onClick={c.onManage} style={{ height: 34 }}>Manage</Btn> : <span />)
                  : c.state === "off" && c.onConnect ? <Btn kind="primary" onClick={c.onConnect} style={{ height: 34 }}>Connect</Btn>
                  : <span style={{ fontSize: 11.5, color: t.FAINT, textAlign: "center" }}>{c.state === "soon" ? "Coming next" : ""}</span>}
              </div>
            ))}
          </div>
        </Card>
        <div className="flex flex-col gap-5 w-full xl:w-[340px] shrink-0">
          <Card>
            <b style={{ fontSize: 15 }}>Account</b>
            <div style={{ marginTop: 8 }}>
              <div style={row}><span style={{ width: 80, color: t.MUTED }}>Name</span>
                <Field value={name} onChange={setName} style={{ flex: 1 }} />
                <Btn onClick={saveName} style={{ height: 34 }}>{saved || "Save"}</Btn></div>
              <div style={{ ...row, borderTop: `1px solid ${t.LINE}` }}><span style={{ width: 80, color: t.MUTED }}>Email</span><span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{user?.email}</span></div>
              <div style={{ ...row, borderTop: `1px solid ${t.LINE}` }}><span style={{ width: 80, color: t.MUTED }}>Role</span>{role}</div>
              <div style={{ ...row, borderTop: `1px solid ${t.LINE}` }}><span style={{ width: 80, color: t.MUTED }}>Password</span>
                <button onClick={resetPassword} style={{ background: "none", border: "none", color: t.TEAL, fontWeight: 600, cursor: "pointer", padding: 0 }}>Send reset link</button></div>
              {pw && <Muted>{pw}</Muted>}
            </div>
          </Card>
          <Card>
            <b style={{ fontSize: 15 }}>Appearance</b>
            <div className="flex gap-3" style={{ marginTop: 12 }}>
              <Btn kind={!dark ? "primary" : "quiet"} onClick={() => dark && toggle()} style={{ flex: 1 }}>Light</Btn>
              <Btn kind={dark ? "primary" : "quiet"} onClick={() => !dark && toggle()} style={{ flex: 1 }}>Dark</Btn>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}
