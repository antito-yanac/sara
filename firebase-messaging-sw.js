// firebase-messaging-sw.js (MODO EXTREMO)
importScripts("https://www.gstatic.com/firebasejs/12.17.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.17.0/firebase-messaging-compat.js");

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
//  CACHÉ MODO EXTREMO: Limpieza total y red prioritaria
// ============================================================
// El nombre de la caché cambia cada vez que se instala este archivo, forzando la limpieza.
const CACHE_VERSION = "sara-extreme-" + Date.now();
const CACHE_PREFIJO = "sara-";

// 1. Forzar activación inmediata sin esperar a que cierren la app
self.addEventListener("install", () => {
    self.skipWaiting();
});

// 2. Al activarse, borrar TODAS las cachés antiguas y tomar el control
self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const nombres = await caches.keys();
        await Promise.all(
            nombres.map((n) => {
                // Si no es la versión actual, la borramos sin piedad
                if (n !== CACHE_VERSION) {
                    console.log("[SW] Borrando caché antigua:", n);
                    return caches.delete(n);
                }
            })
        );
        // Tomar el control de todas las pestañas abiertas inmediatamente
        await self.clients.claim();
    })());
});

// 3. Mensaje para forzar recarga desde el cliente
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

// 4. Intercepción de peticiones: SIEMPRE RED (Network First Absoluto)
self.addEventListener("fetch", (event) => {
    const req = event.request;

    // Solo GET, mismo origen y sin rangos (para evitar conflictos)
    if (req.method !== "GET") return;
    if (!esMismoOrigen(req.url)) return;
    if (req.headers.get("range")) return;

    const url = new URL(req.url);

    // version.json: intocable, siempre red pura y dura
    if (url.pathname.endsWith("/version.json")) {
        event.respondWith(fetch(req, { cache: "no-store" }));
        return;
    }

    // Para HTML, JS, CSS, JSON e Imágenes:
    // Intentamos SIEMPRE traer del servidor con un "cache-buster" (rompe-caché)
    event.respondWith((async () => {
        try {
            // Añadimos un parámetro único para burlar el CDN de GitHub Pages (Fastly)
            const u = new URL(req.url);
            u.searchParams.set("_ext", Date.now());

            const res = await fetch(u.toString(), {
                cache: "no-store", // Obliga al navegador a no usar su caché local
                credentials: "same-origin"
            });

            // Si el servidor responde bien, guardamos una copia por si se cae el internet
            if (res && res.ok) {
                const cache = await caches.open(CACHE_VERSION);
                cache.put(req, res.clone()).catch(() => {});
            }
            return res;
        } catch (e) {
            // Si no hay internet (offline), usamos la última copia guardada
            console.warn("[SW] Fallo de red, buscando en caché offline...", req.url);
            const cache = await caches.open(CACHE_VERSION);
            const hit = await cache.match(req, { ignoreSearch: true });
            if (hit) return hit;
            throw e;
        }
    })());
});
