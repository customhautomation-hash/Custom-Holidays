/** Public Privacy Policy and Terms pages (needed by Google to let people connect Gmail and Drive). */
const wrap = { maxWidth: 760, margin: "0 auto", padding: "56px 24px 80px", fontFamily: "'DM Sans', system-ui, sans-serif", color: "#1A2324", lineHeight: 1.65, fontSize: 15 } as const;
const H = ({ children }: { children: React.ReactNode }) => <h2 style={{ fontSize: 19, margin: "28px 0 8px", fontFamily: "inherit", fontWeight: 600 }}>{children}</h2>;
function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F3EAEA" }}>
      <div style={wrap}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <img src="/ch-mark-teal.png" alt="" style={{ width: 44, height: 44 }} />
          <div><div className="font-serif" style={{ fontSize: 20 }}>Custom Holidays</div><div style={{ fontSize: 12, color: "#5B6766" }}>Team dashboard</div></div>
        </div>
        <h1 className="font-serif" style={{ fontSize: 32, margin: "0 0 6px" }}>{title}</h1>
        <div style={{ fontSize: 13, color: "#5B6766", marginBottom: 20 }}>Last updated 9 November 2026</div>
        {children}
        <div style={{ marginTop: 40, fontSize: 13, color: "#5B6766" }}><a href="/privacy" style={{ color: "#13585B" }}>Privacy Policy</a> · <a href="/terms" style={{ color: "#13585B" }}>Terms</a> · <a href="/login" style={{ color: "#13585B" }}>Sign in</a></div>
      </div>
    </div>);
}

export function Privacy() {
  return (
    <Shell title="Privacy Policy">
      <p>The Custom Holidays dashboard is an internal tool used by the Custom Holidays team in Mumbai to manage clients, trips and suppliers. This page explains what data it uses when a team member connects their Google account.</p>
      <H>What we access</H>
      <ul>
        <li><b>Gmail (read only):</b> the dashboard reads emails from travel suppliers (DMCs, hotels, transport and activity companies) to find the supplier's name, contact email, destination and any rates or confirmations. It cannot send, change or delete emails.</li>
        <li><b>Your Google email address:</b> to show which account is connected.</li>
        <li><b>Google Drive:</b> only to create client trip folders and save the vouchers and documents you choose to save there.</li>
      </ul>
      <H>What we store</H>
      <p>Supplier names, contact details, destinations, rates and the date of each supplier email are stored in the dashboard's database so the team can see them. Personal emails and anything not related to suppliers are skipped and not stored. The Gmail connection key is stored securely and is only used by the dashboard's server.</p>
      <H>Who can see it</H>
      <p>Only signed-in members of the Custom Holidays team. We do not sell, rent or share this data with anyone, and it is not used for advertising.</p>
      <H>Google API data</H>
      <p>The dashboard's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer" style={{ color: "#13585B" }}>Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
      <H>Disconnecting and deleting</H>
      <p>You can disconnect Gmail at any time from Profile in the dashboard, or from your Google account's security settings. To have stored data deleted, email <a href="mailto:customh.automation@gmail.com" style={{ color: "#13585B" }}>customh.automation@gmail.com</a>.</p>
    </Shell>);
}

export function Terms() {
  return (
    <Shell title="Terms of Use">
      <p>The Custom Holidays dashboard is a private tool for the Custom Holidays team. By signing in you agree to use it only for Custom Holidays work, to keep client and supplier information confidential, and not to share your sign-in with anyone else.</p>
      <p>Connecting Gmail or Google Drive is optional. You can disconnect at any time from Profile. See the <a href="/privacy" style={{ color: "#13585B" }}>Privacy Policy</a> for what is accessed and stored.</p>
      <p>Questions: <a href="mailto:customh.automation@gmail.com" style={{ color: "#13585B" }}>customh.automation@gmail.com</a>.</p>
    </Shell>);
}
