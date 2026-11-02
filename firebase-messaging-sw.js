// firebase-messaging-sw.js
//
// Service Worker ÚNICO del sitio. Hace DOS cosas:
//
//  1) FIREBASE CLOUD MESSAGING (push en segundo plano). Igual que antes.
//
//  2) ESTRATEGIA DE CACHÉ "NETWORK-FIRST" (nuevo).
//     GitHub Pages sirve todo con `cache-control: max-age=600`, así que
//     el navegador puede reutilizar HTML/JS viejos hasta 10 minutos (y
//     más, si la pestaña lleva horas abierta). Un Service Worker que
//     intercepta las peticiones y las pide a la red con `cache:"no-store"`
//     SALTA esa caché por completo: cada carga trae el archivo real.
//
//     - Navegación (HTML) y scripts/estilos => RED primero, sin caché.
//       Si la red falla, se usa la copia guardada (modo offline).
//     - Imágenes/fuentes => caché primero (no cambian y son pesadas).
//     - Cualquier petición a otro dominio (Firestore, gstatic, Leaflet,
//       MapTiler…) NO se toca: pasa directa a la red.
//
//  Debe estar en la RAÍZ del sitio (mismo nivel que index.html) para
//  tener alcance sobre todo el dominio.

importScripts("https://www.gstatic.com/firebasejs/12.17.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.17.0/firebase-messaging-compat.js");

// ============================================================
//  FIREBASE MESSAGING
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
    const urlAbrir = event.notification.data.url || "/";

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
//  CACHÉ: NETWORK-FIRST
// ============================================================
const CACHE = "sara-v2";
const CACHE_PREFIJO = "sara-";

// IMPORTANTE: sube este valor junto con version.json y el <meta sara-build>.
// Se usa para "romper" la caché del CDN de GitHub Pages (Fastly) añadiendo
// un parámetro único a cada petición de HTML/JS/CSS. Sin esto, Fastly puede
// devolver un app.js viejo hasta 10 minutos aunque el navegador no lo cachee.
const BUILD_SW = "20261101-1";

// Rutas que NUNCA deben servirse de caché (siempre red)
const SIEMPRE_RED = ["/version.json"];

self.addEventListener("install", () => {
    // Toma el control cuanto antes: no esperar a cerrar pestañas
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const nombres = await caches.keys();
        await Promise.all(
            nombres
                .filter((n) => n.startsWith(CACHE_PREFIJO) && n !== CACHE)
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

function debeSerRedPrimero(request) {
    const dest = request.destination;
    return dest === "document" || dest === "script" || dest === "style" ||
           dest === "worker" || dest === "manifest" || dest === "";
}

self.addEventListener("fetch", (event) => {
    const req = event.request;

    // Solo GET y solo mismo origen. Firestore/gstatic/CDN pasan directo.
    if (req.method !== "GET") return;
    if (!esMismoOrigen(req.url)) return;
    if (req.headers.get("range")) return;   // descargas parciales

    const url = new URL(req.url);

    // version.json: siempre red, jamás caché
    if (SIEMPRE_RED.some((p) => url.pathname.endsWith(p))) {
        event.respondWith(fetch(req, { cache: "no-store" }));
        return;
    }

    // Imágenes/fuentes: caché primero (rendimiento)
    if (req.destination === "image" || req.destination === "font") {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE);
            const hit = await cache.match(req);
            if (hit) return hit;
            try {
                const res = await fetch(req);
                if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
                return res;
            } catch (e) {
                return hit || Response.error();
            }
        })());
        return;
    }

    // HTML, JS, CSS, JSON: RED PRIMERO, sin caché HTTP y con "cache-buster"
    // de CDN (parámetro _sw=BUILD). Esto obliga a Fastly a ir al origen.
    if (debeSerRedPrimero(req)) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE);
            try {
                const u = new URL(req.url);
                u.searchParams.set("_sw", BUILD_SW);
                const res = await fetch(u.toString(), {
                    cache: "no-store",
                    credentials: "same-origin"
                });
                if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
                return res;
            } catch (e) {
                const hit = await cache.match(req, { ignoreSearch: true });
                if (hit) return hit;
                throw e;
            }
        })());
        return;
    }

    // Resto: red con respaldo de caché
    event.respondWith((async () => {
        try { return await fetch(req); }
        catch (e) {
            const cache = await caches.open(CACHE);
            const hit = await cache.match(req, { ignoreSearch: true });
            if (hit) return hit;
            throw e;
        }
    })());
});
