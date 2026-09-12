// No-op service worker (disabled). Keep file to avoid 404s on previously-registered SW.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  // Unregister: claim and then unregister all clients
  self.registration.unregister().catch(() => {});
  e.waitUntil(self.clients.claim());
});
