/* Adventuity service worker: offline app shell, encrypted notes cache, push notifications. */
const CACHE = 'adv-20261011234654';
const SHELL = ["./portal.html", "./config.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/favicon-32.png", "./assets/app.css?v=20261011234654", "./assets/mj-config.js?v=20261011234654", "./assets/sbmini.js?v=20261011234654", "./assets/steps.js?v=20261011234654", "./assets/figlib.js?v=20261011234654", "./assets/outline.js?v=20261011234654", "./assets/portal_core.js?v=20261011234654", "./assets/portal_msgs.js?v=20261011234654", "./assets/portal_study.js?v=20261011234654", "./assets/portal_admin.js?v=20261011234654", "./assets/boot.js?v=20261011234654"];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    if (/\.(html|webmanifest)$|\/$|config\.js$/.test(u.pathname)) {   // network first: always the newest version when online
      e.respondWith(fetch(r).then((res) => { const c = res.clone(); if (res.ok) caches.open(CACHE).then((ca) => ca.put(r, c)); return res; }).catch(() => caches.match(r, { ignoreSearch: true }).then((m) => m || caches.match('./portal.html'))));
      return;
    }
    e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then((ca) => ca.put(r, c)); } return res; })));
    return;
  }
  if (/(^|\.)cdnjs\.cloudflare\.com$|fonts\.(googleapis|gstatic)\.com$/.test(u.host)) {
    e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => { if (res.ok || res.type === 'opaque') { const c = res.clone(); caches.open(CACHE).then((ca) => ca.put(r, c)); } return res; })));
  }
});
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: 'Adventuity', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Adventuity', { body: d.body || '', tag: d.tag || 'adv', renotify: true, icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', data: { url: d.url || './portal.html' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || './portal.html';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => { for (const c of cs) { if (c.url.indexOf('portal.html') >= 0 && 'focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } } return self.clients.openWindow(url); }));
});
