// Financial records and authenticated responses are intentionally never cached.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  if (event.request.method === "GET") event.respondWith(fetch(event.request));
});
