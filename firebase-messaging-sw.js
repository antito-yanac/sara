// firebase-messaging-sw.js
//
// Service Worker para Firebase Cloud Messaging.
// Debe estar en la RAÍZ del sitio.
// v2: Notificaciones más insistentes (requireInteraction, vibrate, sound).

importScripts("https://www.gstatic.com/firebasejs/12.17.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.17.0/firebase-messaging-compat.js");

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

    const titulo = payload.notification?.title || "🚨 Alerta Antamina";
    const opciones = {
        body: payload.notification?.body || "Tienes una nueva notificación",
        icon: "https://cdn-icons-png.flaticon.com/512/1827/1827301.png",
        badge: "https://cdn-icons-png.flaticon.com/512/1827/1827301.png",
        tag: "antamina-alerta",
        // MEJORA: La notificación no desaparece hasta que el usuario interactúe
        requireInteraction: true, 
        // MEJORA: Vibración (en dispositivos que lo soporten, como Android)
        vibrate: [200, 100, 200, 100, 200], 
        data: payload.data || {},
        // MEJORA: Asegura que no sea silenciosa
        silent: false 
    };

    self.registration.showNotification(titulo, opciones);
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const urlAbrir = event.notification.data.url || "/";

    event.waitUntil(
        clients.matchAll({
            type: "window",
            includeUncontrolled: true
        }).then((listaClientes) => {
            for (const cliente of listaClientes) {
                if (cliente.url.includes(self.location.origin) && "focus" in cliente) {
                    return cliente.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlAbrir);
            }
        })
    );
});
