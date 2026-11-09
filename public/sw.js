/* Custom Holidays — desktop notifications.
   Shows a notification when the dashboard sends one, even if no dashboard tab is open
   (the browser just needs to be running). Clicking it opens the right page. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Custom Holidays", body: e.data ? e.data.text() : "" }; }
  e.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // If you're looking at the dashboard right now, the bell already shows it — don't pop up as well
    if (!d.always && tabs.some(c => c.focused && c.visibilityState === "visible")) {
      tabs.forEach(c => c.postMessage({ type: "ch-push", data: d }));
      return;
    }
    await self.registration.showNotification(d.title || "Custom Holidays", {
      body: d.body || "",
      icon: "/ch-icon-512.png",
      badge: "/favicon.png",
      tag: d.tag || undefined,
      renotify: !!d.tag,
      timestamp: Date.now(),
      data: { url: d.url || "/" },
    });
  })());
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of tabs) {
      if (c.url.startsWith(self.location.origin)) { await c.focus(); try { await c.navigate(url); } catch { /* same page */ } return; }
    }
    await self.clients.openWindow(url);
  })());
});
