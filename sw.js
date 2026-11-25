// Service worker : notifications push + fichiers de l'app toujours à jour.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

// GitHub Pages autorise 10 min de cache (plus sur iOS) : on revalide chaque fichier de l'app.
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  // une requête de navigation ne peut pas être recopiée avec des options : on repart de son URL
  e.respondWith(fetch(r.mode === 'navigate' ? r.url : r, { cache: 'no-cache' }));
});

self.addEventListener('push', (e) => {
  const d = e.data?.json() ?? {};
  e.waitUntil(self.registration.showNotification(d.title || 'Giftmas 🎁', { body: d.body, icon: 'icons/icon-192.png' }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow('./#/notifs'));
});
