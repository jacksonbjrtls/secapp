const CACHE_NAME = 'secapp-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo_file/logo_32x32pixel.png',
  '/logo_file/logo_400pixel.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  
  const url = e.request.url;
  // Bypass live firebase requests, dev services, or API routes
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('/api/') || 
    url.includes('__vite') || 
    url.includes('ws://') || 
    url.includes('wss://')
  ) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(e.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (e.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
      })
  );
});
