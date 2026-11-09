// push-notify — sends desktop notifications to the team.
// Called by Supabase itself (database triggers + a daily schedule, see supabase/push_notifications.sql)
// and by the dashboard (GET = public key, POST {type:"test"} = test notification).
// The keys it needs are created on first use and kept in the private push_config table.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hook-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
type Note = { title: string; body: string; url: string; tag?: string; always?: boolean };

async function config() {
  const { data, error } = await sb.from("push_config").select("*").eq("id", 1).single();
  if (error || !data) throw new Error("Run supabase/push_notifications.sql first");
  if (!data.vapid_public) {
    const k = webpush.generateVAPIDKeys();
    await sb.from("push_config").update({ vapid_public: k.publicKey, vapid_private: k.privateKey }).eq("id", 1);
    data.vapid_public = k.publicKey; data.vapid_private = k.privateKey;
  }
  webpush.setVapidDetails("https://custom-holidays.vercel.app", data.vapid_public, data.vapid_private);
  return data;
}

async function allUserIds(): Promise<string[]> {
  const { data } = await sb.from("profiles").select("id");
  return (data || []).map((p: any) => p.id);
}

async function send(userIds: string[], note: Note) {
  if (!userIds.length) return 0;
  const { data: subs } = await sb.from("push_subscriptions").select("*").in("user_id", userIds);
  let sent = 0;
  await Promise.all((subs || []).map(async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(note), { TTL: 60 * 60 * 24 });
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from("push_subscriptions").delete().eq("id", s.id); // browser unsubscribed
    }
  }));
  return sent;
}

const nameOf = async (id?: string, fallback?: string) => {
  if (!id) return fallback || "Someone";
  const { data } = await sb.from("profiles").select("full_name").eq("id", id).maybeSingle();
  return data?.full_name || fallback || "Someone";
};
const what = (m: any) => m.text?.trim() || (m.kind === "voice" ? "🎤 Voice message"
  : m.attachment?.items?.length ? `📷 ${m.attachment.items.length} photos and videos`
  : m.attachment?.mime?.startsWith("image/") ? "📷 Photo" : m.attachment?.mime?.startsWith("video/") ? "🎥 Video" : m.attachment ? `📎 ${m.attachment.name || "File"}` : "");

async function onChat(m: any) {
  if (!m || m.kind === "system" || m.deleted_at) return 0;
  const { data: room } = await sb.from("chat_rooms").select("*").eq("id", m.channel).maybeSingle();
  const members: string[] = room?.members?.length ? room.members : await allUserIds();
  const from = await nameOf(m.sender_id, m.sender);
  const dm = room?.kind === "dm"; const roomName = dm ? "" : (room?.name || m.channel);
  const others = members.filter(id => id && id !== m.sender_id);
  const mentioned: string[] = (m.mentions || []).filter((id: string) => others.includes(id));
  const url = `/chat?room=${encodeURIComponent(m.channel)}`; const body = what(m).slice(0, 180);
  let n = 0;
  if (mentioned.length) n += await send(mentioned, { title: `${from} mentioned you${dm ? "" : ` in ${roomName}`}`, body, url, tag: `chat-${m.channel}` });
  n += await send(others.filter(id => !mentioned.includes(id)), { title: dm ? from : `${from} · ${roomName}`, body, url, tag: `chat-${m.channel}` });
  return n;
}

async function onLead(c: any) {
  if (!c || c.deleted_at) return 0;
  return send(await allUserIds(), { title: `New lead: ${c.name || "Unnamed"}`, body: [c.source, c.destination].filter(Boolean).join(" · ") || "Open Master CRM to reply", url: "/leads", tag: `lead-${c.id}` });
}

async function daily() {
  // dates in India time
  const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
  const plus = (d: number) => new Date(new Date(today).getTime() + d * 86400000).toISOString().slice(0, 10);
  const { data: trips } = await sb.from("trips").select("*");
  const everyone = await allUserIds(); let n = 0;
  for (const t of trips || []) {
    if (/cancel|enquiry/i.test(t.status || "")) continue;
    const who = t.client || t.name; const where = t.places || t.name;
    const s = (t.start_date || "").slice(0, 10), e = (t.end_date || "").slice(0, 10);
    if (s === today) n += await send(everyone, { title: `${who} leave today`, body: `${where} · send the bon voyage message`, url: "/trips", tag: `trip-${t.id}` });
    else if (s === plus(1)) n += await send(everyone, { title: `${who} leave tomorrow`, body: `${where} · is the trip folder sent?`, url: `/vouchers?client=${encodeURIComponent(who)}&trip=${encodeURIComponent(t.name)}`, tag: `trip-${t.id}` });
    else if (s === plus(3) || s === plus(7)) n += await send(everyone, { title: `${who} leave in ${s === plus(3) ? 3 : 7} days`, body: `${where} · check the vouchers`, url: `/vouchers?client=${encodeURIComponent(who)}&trip=${encodeURIComponent(t.name)}`, tag: `trip-${t.id}` });
    if (e === today) n += await send(everyone, { title: `${who} come back today`, body: "Send a welcome back message and ask for feedback", url: "/trips", tag: `back-${t.id}` });
  }
  return n;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const cfg = await config();
    if (req.method === "GET") return json({ publicKey: cfg.vapid_public });
    const body = await req.json().catch(() => ({}));

    if (body.type === "test") { // from the dashboard, signed in
      const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const { data } = await sb.auth.getUser(token);
      if (!data.user) return json({ error: "Sign in first" }, 401);
      const sent = await send([data.user.id], { title: "Desktop notifications are on", body: "You'll get new messages, leads and trip reminders here.", url: "/", always: true });
      return json({ sent });
    }

    if (req.headers.get("x-hook-secret") !== cfg.hook_secret) return json({ error: "forbidden" }, 403);
    if (body.type === "daily") return json({ sent: await daily() });
    if (body.table === "chat_messages") return json({ sent: await onChat(body.record) });
    if (body.table === "contacts") return json({ sent: await onLead(body.record) });
    return json({ ignored: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
