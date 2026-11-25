// Service worker : uniquement pour les notifications push (pas de cache hors-ligne).
self.addEventListener('push', (e) => {
  const d = e.data?.json() ?? {};
  e.waitUntil(self.registration.showNotification(d.title || 'Giftmas 🎁', { body: d.body, icon: 'icons/icon-192.png' }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow('./#/notifs'));
});
