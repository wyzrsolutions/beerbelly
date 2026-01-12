self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  const title = data.title || "Ny workout";
  const options = {
    body: data.body || "Någon har lagt upp en ny workout.",
    icon: "https://cdn.prod.website-files.com/68e01de2e7d9d52f889935ed/69654f38fc18d3fa51bade1a_EA339E66-CA1B-452C-90AA-2A9E685C%20(1).png",
    badge: "https://cdn.prod.website-files.com/68e01de2e7d9d52f889935ed/69654f38fc18d3fa51bade1a_EA339E66-CA1B-452C-90AA-2A9E685C%20(1).png",
    data: data.url || "/"
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data));
});
