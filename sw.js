self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  const title = data.title || "Ny workout";
  const options = {
    body: data.body || "Någon har lagt upp en ny workout.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: data.url || "/"
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data));
});
