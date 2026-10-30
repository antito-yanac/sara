const CACHE_NAME = 'sara-v1';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './notifications.css',
  './css/alerts.css',
  './css/panico.css',
  './js/app.js',
  './js/map.js',
  './js/mensajes.js',
  './js/alertas.js',
  './js/firebase-app.js',
  './js/firebase-config.js',
  './js/index-config.js'
];

// Instalar: cachear el app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activar: limpiar cachés viejas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: Solo cachear peticiones del MISMO origen. NUNCA tocar Firebase.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ⛔ CRÍTICO: No interceptar Firebase ni otros orígenes externos
  if (url.origin !== self.location.origin) {
    return;
  }

  // Para navegación (HTML), intentar red primero, luego caché
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Para recursos estáticos locales: caché primero, red como fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
