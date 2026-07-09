const CACHE_NAME = 'kr2melo-v5.3.5';
const CORE = ['./', 'index.html', 'mobile.html', 'styles.css', 'mobile.css', 'sync.js', 'app.js', 'mobile.js', 'manifest.webmanifest', 'assets/logo.png', 'assets/assinatura.png'];
const FRESH_FILES = /(?:\.html$|\.js$|\.css$|manifest\.webmanifest$)/i;

self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('kr2melo-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const isFresh = request.mode === 'navigate' || FRESH_FILES.test(url.pathname);
  if (isFresh) {
    event.respondWith(fetch(request).then(response => { if (response?.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone())); return response; }).catch(() => caches.match(request).then(hit => hit || (request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => { if (response?.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone())); return response; })));
});
