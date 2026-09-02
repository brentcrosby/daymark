const CACHE_NAME = 'daymark-v6';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.endsWith('/sw.js')
  )
    return;

  event.respondWith(
    fetch(event.request, {
      cache: event.request.mode === 'navigate' ? 'reload' : 'default',
    })
      .then((response) => {
        const copy = response.clone();
        void caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then((cached) => cached || caches.match('./')),
      ),
  );
});
