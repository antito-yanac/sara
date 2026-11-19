// firebase-messaging-sw.js
// ============================================================
//  Notificaciones push (FCM) + caché inteligente.
//
//  Estrategia de caché:
//   - HTML / version.json / estado.json  -> RED primero (siempre frescos),
//     con copia en caché solo como respaldo si no hay internet.
//   - JS, CSS, imágenes, sonidos, zonas  -> stale-while-revalidate:
//     responde al instante desde la caché y la actualiza en segundo plano.
//
//  La caché se nombra con BUILD_SW. Al subir el build (./bump-build.sh)
//  este archivo cambia, el navegador instala el SW nuevo y se borran
//  las cachés antiguas. BUILD_SW lo actualiza bump-build.sh.
// ============================================================
importScripts("https://www.gstatic.com/firebasejs/12.17.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.17.0/firebase-messaging-compat.js");

const BUILD_SW = "20261104-081950";

// ============================================================
//  FIREBASE MESSAGING (Notificaciones Push)
// ============================================================
const firebaseConfig = {
    apiKey: "AIzaSyDc5EUjoE5HjkVWnTGJwWSDraszijxBz1E",
    authDomain: "antitomessage.firebaseapp.com",
    projectId: "antitomessage",
    storageBucket: "antitomessage.firebasestorage.app",
    messagingSenderId: "301615802026",
    appId: "1:301615802026:web:d1a6cec0c1e21a71ad92d3",
    measurementId: "G-2NWGFM3L53"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log("[SW] Mensaje en segundo plano:", payload);

    const titulo = payload.notification?.title || "🔔 Alerta Antamina";
    const opciones = {
        body: payload.notification?.body || "Tienes una nueva notificación",
        icon: "https://cdn-icons-png.flaticon.com/512/1827/1827301.png",
        badge: "https://cdn-icons-png.flaticon.com/512/1827/1827301.png",
        tag: "antamina-fcm",
        requireInteraction: false,
        data: payload.data || {}
    };

    self.registration.showNotification(titulo, opciones);
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const urlAbrir = (event.notification.data && event.notification.data.url) || "/";

    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((listaClientes) => {
            for (const cliente of listaClientes) {
                if (cliente.url.includes(self.location.origin) && "focus" in cliente) {
                    return cliente.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow(urlAbrir);
        })
    );
});

// ============================================================
//  CACHÉ
// ============================================================
const CACHE_PREFIJO = "sara-";
const CACHE_ACTUAL = CACHE_PREFIJO + BUILD_SW;   // nombre FIJO por build

self.addEventListener("install", () => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const nombres = await caches.keys();
        await Promise.all(
            nombres
                .filter((n) => n.startsWith(CACHE_PREFIJO) && n !== CACHE_ACTUAL)
                .map((n) => caches.delete(n))
        );
        await self.clients.claim();
    })());
});

self.addEventListener("message", (event) => {
    const d = event.data;
    if (d === "SKIP_WAITING" || (d && d.type === "SKIP_WAITING")) {
        self.skipWaiting();
    }
});

function esMismoOrigen(url) {
    try { return new URL(url).origin === self.location.origin; }
    catch (e) { return false; }
}

// Recursos que deben ser siempre frescos (cambian sin cambiar de build)
function esDinamico(req, url) {
    if (req.mode === "navigate" || req.destination === "document") return true;
    return /\/(version|estado)\.json$/.test(url.pathname);
}

async function guardar(req, res) {
    if (!res || !res.ok) return;
    try {
        const cache = await caches.open(CACHE_ACTUAL);
        await cache.put(req, res.clone());
    } catch (e) { /* cuota llena o respuesta no cacheable: se ignora */ }
}

// RED primero. "no-cache" revalida con el servidor/CDN en cada pedido,
// sin añadir parámetros a la URL (no ensucia la caché del CDN).
async function redPrimero(req) {
    try {
        const res = await fetch(req, { cache: "no-cache" });
        guardar(req, res);
        return res;
    } catch (e) {
        const cache = await caches.open(CACHE_ACTUAL);
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        throw e;
    }
}

// Responde desde caché al instante y refresca en segundo plano.
async function cacheYActualiza(event, req) {
    const cache = await caches.open(CACHE_ACTUAL);
    const hit = await cache.match(req);

    const refresco = fetch(req, { cache: "no-cache" })
        .then((res) => { guardar(req, res); return res; })
        .catch(() => null);

    if (hit) {
        event.waitUntil(refresco);   // mantiene vivo el SW hasta terminar
        return hit;
    }
    const res = await refresco;
    if (res) return res;
    return Response.error();
}

self.addEventListener("fetch", (event) => {
    const req = event.request;

    // Solo GET, mismo origen y sin rangos (audio/video)
    if (req.method !== "GET") return;
    if (!esMismoOrigen(req.url)) return;
    if (req.headers.get("range")) return;

    const url = new URL(req.url);

    // version.json: siempre red pura, jamás se guarda
    if (url.pathname.endsWith("/version.json")) {
        event.respondWith(fetch(req, { cache: "no-store" }));
        return;
    }

    if (esDinamico(req, url)) {
        event.respondWith(redPrimero(req));
    } else {
        event.respondWith(cacheYActualiza(event, req));
    }
});
