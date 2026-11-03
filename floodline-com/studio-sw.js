/* Adventuity Floodline Studio: push notifications for new quote requests. No caching: the Studio always loads fresh. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: 'Adventuity', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'New flood line request', { body: d.body || '', tag: d.tag || 'floodline', renotify: true, icon: '/assets/icon-192.png', badge: '/assets/icon-192.png', data: { url: '/studio.html?tab=inbox&source=push' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || '/studio.html?tab=inbox';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { for (const c of cs) { if (c.url.indexOf('studio.html') >= 0 && 'focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } } return self.clients.openWindow(url); }));
});
