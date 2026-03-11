// Nkhuku Service Worker v2 — Offline + Push Notifications
const CACHE = 'nkhuku-v2';
const OFFLINE_URL = '/offline.html';

// ── Install ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll(['/index.html', '/offline.html', '/icon-192.png', '/icon-512.png'])
        .catch(() => cache.add('/offline.html').catch(() => {}))
    ).then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch — app shell cached, Supabase always network ─
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Always go network for Supabase API
  if (url.hostname.includes('supabase.co')) return;

  // For navigation (page loads) — cache first, network fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then(cached => {
        if (cached) {
          // Refresh cache in background
          fetch(event.request).then(r => {
            if (r && r.status === 200) {
              caches.open(CACHE).then(c => c.put('/index.html', r));
            }
          }).catch(() => {});
          return cached;
        }
        return fetch(event.request).catch(() => caches.match(OFFLINE_URL));
      })
    );
    return;
  }

  // For assets — network first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          caches.open(CACHE).then(c => c.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Push Notifications ───────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'Nkhuku', body: 'You have a vaccine reminder.' };
  try { data = event.data.json(); } catch(e) {}

  event.waitUntil(
    self.registration.showNotification(data.title || 'Nkhuku', {
      body: data.body || 'Check your vaccine schedule.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'nkhuku-reminder',
      requireInteraction: false,
      data: { url: data.url || '/' }
    })
  );
});

// ── Notification click — open app ────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

// ── Background sync for vaccine checks ───────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CHECK_VACCINES') {
    // Triggered by the app — handled in main thread
    event.ports[0]?.postMessage({ status: 'ok' });
  }
});
