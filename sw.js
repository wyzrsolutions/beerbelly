export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/sw.js") {
      const sw = `self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  const title = data.title || "Ny workout";
  const options = {
    body: data.body || "Någon har lagt upp en ny workout.",
    icon: "https://cdn.prod.website-files.com/68e01de2e7d9d52f889935ed/69654f38fc18d3fa51bade1a_EA339E66-CA1B-452C-90AA-2A9E685C%20(1).png",
    // badge is optional; ok to remove if you don't have a monochrome badge:
    // badge: "https://.../badge.png",
    data: { url: data.url || "/" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";
  event.waitUntil(clients.openWindow(url));
});`;

      return new Response(sw, {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });
    }

    return fetch(request);
  }
};
