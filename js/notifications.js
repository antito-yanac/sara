// js/notifications.js
//
// Sistema de notificaciones: popups/toasts visuales, sonido, y
// habilitación silenciosa de Firebase Cloud Messaging (para
// notificaciones nativas en segundo plano).
//
// v3: Avisa al usuario si las notificaciones están bloqueadas (denied).

import {
    getMessaging,
    getToken
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-messaging.js";

import { obtenerApp } from "./firebase-app.js";
import { vapidKey } from "./firebase-config.js";

let messaging = null;
let currentToken = null;
let audioCtx = null;
let audioDesbloqueado = false;

// Desbloqueo de audio
function desbloquearAudioContext() {
    if (audioDesbloqueado) return;
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC && !audioCtx) {
            audioCtx = new AC();
        }
        if (audioCtx && audioCtx.state === "suspended") {
            audioCtx.resume();
        }
        audioDesbloqueado = true;
    } catch (e) { }
}

["click", "keydown", "touchstart"].forEach((evento) => {
    document.addEventListener(evento, desbloquearAudioContext, { once: true, passive: true });
});

// Reproducir sonido
export function reproducirSonido() {
    try {
        if (!audioCtx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) audioCtx = new AC();
        }

        if (audioCtx) {
            if (audioCtx.state === "suspended") {
                audioCtx.resume().catch(() => {});
            }

            const ahora = audioCtx.currentTime;
            const osc1 = audioCtx.createOscillator();
            const gain1 = audioCtx.createGain();
            osc1.type = "sine";
            osc1.frequency.value = 880;
            gain1.gain.setValueAtTime(0, ahora);
            gain1.gain.linearRampToValueAtTime(0.3, ahora + 0.01);
            gain1.gain.linearRampToValueAtTime(0, ahora + 0.22);
            osc1.connect(gain1);
            gain1.connect(audioCtx.destination);
            osc1.start(ahora);
            osc1.stop(ahora + 0.25);

            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.type = "sine";
            osc2.frequency.value = 1175;
            gain2.gain.setValueAtTime(0, ahora + 0.27);
            gain2.gain.linearRampToValueAtTime(0.3, ahora + 0.28);
            gain2.gain.linearRampToValueAtTime(0, ahora + 0.55);
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.start(ahora + 0.27);
            osc2.stop(ahora + 0.6);
        }

        try {
            const audio = new Audio("./sounds/notificacion.wav");
            audio.volume = 0.4;
            audio.play().catch(() => {});
        } catch (e) { }
    } catch (e) { }
}

let intervalSonidoAlerta = null;

export function reproducirSonidoAlerta(duracionSeg = 30) {
    detenerSonidoAlerta();
    reproducirSonido();
    intervalSonidoAlerta = setInterval(() => {
        reproducirSonido();
    }, 2000);
    setTimeout(() => {
        detenerSonidoAlerta();
    }, duracionSeg * 1000);
}

export function detenerSonidoAlerta() {
    if (intervalSonidoAlerta) {
        clearInterval(intervalSonidoAlerta);
        intervalSonidoAlerta = null;
    }
}

export function mostrarToast(titulo, mensaje, tipo = "info", conSonido = false) {
    if (conSonido) reproducirSonido();

    let contenedor = document.getElementById("toast-container");
    if (!contenedor) {
        contenedor = document.createElement("div");
        contenedor.id = "toast-container";
        document.body.appendChild(contenedor);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${tipo}`;

    const iconos = {
        info: "ℹ️",
        exito: "✅",
        alerta: "🔔"
    };

    toast.innerHTML = `
        <div class="toast-icono">${iconos[tipo] || "ℹ️"}</div>
        <div class="toast-cuerpo">
            <div class="toast-titulo">${titulo}</div>
            <div class="toast-mensaje">${mensaje}</div>
        </div>
        <div class="toast-cerrar">&times;</div>
    `;

    contenedor.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("toast-visible"));

    toast.querySelector(".toast-cerrar").addEventListener("click", () => {
        cerrarToast(toast);
    });

    const timeoutId = setTimeout(() => cerrarToast(toast), 5000);
    toast.dataset.timeout = timeoutId;
}

function cerrarToast(toast) {
    if (!toast || !toast.parentNode) return;
    clearTimeout(Number(toast.dataset.timeout));
    toast.classList.remove("toast-visible");
    toast.classList.add("toast-saliendo");
    setTimeout(() => toast.remove(), 300);
}

async function registrarServiceWorker() {
    try {
        if (!("serviceWorker" in navigator)) return null;
        const registration = await navigator.serviceWorker.register(
            "./firebase-messaging-sw.js",
            { scope: "./firebase-cloud-messaging-push-scope/" }
        );
        
        // Forzar la espera a que el worker esté activo
        if (registration.installing) {
            console.log("Service Worker FCM instalándose...");
            await new Promise(resolve => {
                registration.installing.addEventListener('statechange', (e) => {
                    if (e.target.state === 'activated') resolve();
                });
            });
        } else if (registration.waiting) {
            console.log("Service Worker FCM en espera...");
            await registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        
        console.log("Service Worker FCM listo:", registration.scope);
        return registration;
    } catch (error) {
        console.warn("Service Worker FCM no disponible:", error.message);
        return null;
    }
}

/**
 * Inicializa Firebase Messaging.
 * v3: Valida si las notificaciones están bloqueadas y avisa al usuario.
 */
export async function inicializarFirebase() {
    try {
        if (!("Notification" in window)) {
            console.info("Este navegador no soporta notificaciones.");
            return null;
        }

        // ============================================================
        // MEJORA: Detectar si las notificaciones están bloqueadas (denied)
        // ============================================================
        if (Notification.permission === "denied") {
            console.warn("⚠️ Notificaciones bloqueadas. El usuario debe habilitarlas manualmente en el candado de la URL.");
            mostrarToast(
                "🔕 Notificaciones bloqueadas", 
                "Haz clic en el candado de la URL y activa las notificaciones para recibir alertas.", 
                "alerta", 
                false
            );
            return null;
        }

        // Si aún no se ha decidido, pedir permiso
        if (Notification.permission === "default") {
            const permiso = await Notification.requestPermission();
            if (permiso !== "granted") {
                console.info("Permiso de notificaciones no concedido:", permiso);
                return null;
            }
        }

        // A partir de aquí, el permiso es "granted"
        const app = obtenerApp();
        messaging = getMessaging(app);

        const swRegistration = await registrarServiceWorker();
        if (!swRegistration) return null;

        try {
            currentToken = await getToken(messaging, {
                vapidKey: vapidKey,
                serviceWorkerRegistration: swRegistration
            });
            if (currentToken) {
                console.log("Token FCM (uso interno):", currentToken);
            }
        } catch (e) {
            console.warn("No se obtuvo token FCM (no crítico):", e.message);
        }

        return currentToken;

    } catch (error) {
        console.warn("Firebase Messaging no disponible (no crítico):", error.message);
        return null;
    }
}

export function obtenerToken() {
    return currentToken;
}
