// Web Push handlers, imported into the generated service worker.
// Payload: { title, body, tag, url } from server/lib/push.js.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Nova', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Nova', {
    body: data.body || '',
    tag: data.tag || 'nova',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: data.url || './#/inbox' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './#/inbox';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      if ('focus' in client) {
        client.focus();
        if (client.navigate && url) client.navigate(url).catch(() => {});
        return;
      }
    }
    return self.clients.openWindow(url);
  }));
});
