// js/boton-panico.js
// ============================================================
// Lógica del botón SOS.
// v3:
//   - Añade envío de WhatsApp con los datos del SOS nuevo
//     (nombre, DNI, celular, empresa, ubicación).
//   - Unifica SDK a 12.17.0 y elimina imports duplicados.
// ============================================================

import { obtenerAuth, obtenerFirestore } from "./firebase-app.js";
import { COLECCIONES } from "./firebase-config.js";

const auth = obtenerAuth();
const db = obtenerFirestore();

import { obtenerDeviceId } from "./device-id.js";
import { leerUsuarioActual } from "./registro-usuario.js";
import { encolarAlerta, listarPendientes, eliminarPendiente } from "./cola-offline.js";

import {
    collection, addDoc, doc, updateDoc,
    serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const VENTANA_CANCELACION_MS = 30_000;

// ===== WhatsApp (CallMeBot) =====
const CALLMEBOT_PHONE  = "+51954125058";
const CALLMEBOT_APIKEY = "9034887";

// ===== GPS (caché compartido con panico.js) =====
const GPS_CACHE_KEY        = "keraunos_gps_cache";
const GPS_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

function leerGPSCache() {
    try {
        const raw = localStorage.getItem(GPS_CACHE_KEY);
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (!d || typeof d.lat !== "number" || typeof d.lng !== "number") return null;
        if (!d.ts || (Date.now() - d.ts) > GPS_CACHE_MAX_AGE_MS) return null;
        return d;
    } catch { return null; }
}

function pedirPosicion(ops) {
    return new Promise((resolve) => {
        if (!navigator.geolocation) { resolve(null); return; }
        let hecho = false;
        const timer = setTimeout(() => {
            if (hecho) return;
            hecho = true;
            resolve(null);
        }, ops.timeout);

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                if (hecho) return;
                hecho = true;
                clearTimeout(timer);
                resolve({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    precision: pos.coords.accuracy ?? null
                });
            },
            () => {
                if (hecho) return;
                hecho = true;
                clearTimeout(timer);
                resolve(null);
            },
            ops
        );
    });
}

export async function obtenerUbicacion() {
    const c = leerGPSCache();
    if (c) return { lat: c.lat, lng: c.lng, precision: c.accuracy ?? null, fuente: "cache" };

    let p = await pedirPosicion({ enableHighAccuracy: false, maximumAge: 120000, timeout: 3000 });
    if (p) return { ...p, fuente: "red-cache" };

    p = await pedirPosicion({ enableHighAccuracy: false, maximumAge: 30000, timeout: 6000 });
    if (p) return { ...p, fuente: "red" };

    p = await pedirPosicion({ enableHighAccuracy: true, maximumAge: 0, timeout: 8000 });
    if (p) return { ...p, fuente: "gps" };

    return null;
}

function construirPayload(usuario, ubicacion) {
    const ahora = Date.now();
    return {
        authUid: usuario.data.authUid,
        deviceId: usuario.deviceId,
        nombre:   usuario.data.nombre,
        dni:      usuario.data.dni,
        celular:  usuario.data.celular,
        empresa:  usuario.data.empresa,
        equipo:   usuario.data.equipo || "desconocido",
        ubicacion: ubicacion || null,
        ubicacionEstado: ubicacion ? "ok" : "no-disponible",
        ubicacionFuente: ubicacion?.fuente || null,
        estado: "pendiente",
        timestamp: null,
        fechaMs: ahora,
        cancelableHasta: Timestamp.fromMillis(ahora + VENTANA_CANCELACION_MS)
    };
}

async function enviarDirecto(payload) {
    const ref = await addDoc(collection(db, COLECCIONES.PANIC_ALERTS), {
        ...payload,
        timestamp: serverTimestamp()
    });
    return ref.id;
}

async function enviarEncolado(payload) {
    await encolarAlerta(payload);
}

// ===== WhatsApp con datos del SOS nuevo =====
function enviarWhatsAppSOS(payload) {
    if (!CALLMEBOT_APIKEY || CALLMEBOT_APIKEY === "TU_API_KEY_AQUI") {
        console.warn("boton-panico: CallMeBot no configurado. Se omite WhatsApp.");
        return;
    }
    const ub = payload.ubicacion || {};
    const mapsUrl = (ub.lat != null && ub.lng != null)
        ? `https://www.google.com/maps?q=${ub.lat},${ub.lng}`
        : "(sin ubicación)";
    const hora = new Date().toLocaleString("es-PE");

    const texto = [
        "🚨 SOLICITUD DE AYUDA (SOS) 🚨",
        "",
        `👤 Nombre: ${payload.nombre || "(no indicado)"}`,
        `🪪 DNI: ${payload.dni || "(no indicado)"}`,
        `📱 Celular: ${payload.celular || "(no indicado)"}`,
        `🏢 Empresa: ${payload.empresa || "(no indicada)"}`,
        "",
        `📍 Ubicación: ${mapsUrl}`,
        (ub.lat != null ? `🌐 Coordenadas: ${ub.lat.toFixed(6)}, ${ub.lng.toFixed(6)}` : ""),
        `🕒 Hora: ${hora}`
    ].filter(Boolean).join("\n");

    const tel = CALLMEBOT_PHONE.replace("+", "");
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(tel)}&text=${encodeURIComponent(texto)}&apikey=${encodeURIComponent(CALLMEBOT_APIKEY)}`;

    const img = new Image();
    img.src = url;
    img.onload = () => console.log("boton-panico: WhatsApp enviado (confirmado)");
    img.onerror = () => console.log("boton-panico: WhatsApp enviado (sin confirmación visual)");
}

export async function dispararPanico() {
    if (!auth.currentUser) return { ok: false, error: "Sesión no iniciada. Recarga la página." };

    const usuario = await leerUsuarioActual();
    if (!usuario) return { ok: false, error: "Debes registrarte antes de usar el botón SOS." };
    if (usuario.data.estado !== "activo") return { ok: false, error: "Tu cuenta está inactiva. Contacta al administrador." };

    const ubicacion = await obtenerUbicacion();
    const payload = construirPayload(usuario, ubicacion);

    // 1) Sin red real -> encolar directamente
    if (!navigator.onLine) {
        await enviarEncolado(payload);
        return { ok: true, encolada: true };
    }

    // 2) Con red -> intentar envío directo
    try {
        const alertId = await enviarDirecto(payload);

        // 🔔 WhatsApp con los datos del SOS nuevo (solo si se envió a Firestore)
        try { enviarWhatsAppSOS(payload); } catch (e) {
            console.warn("boton-panico: WhatsApp falló", e);
        }

        try {
            await updateDoc(doc(db, COLECCIONES.USUARIOS, usuario.deviceId), {
                ultimoPanico: serverTimestamp()
            });
        } catch { /* no es crítico */ }
        return { ok: true, alertId, encolada: false };
    } catch (e) {
        console.error("boton-panico: addDoc falló:", e.code, e.message);

        const esErrorDeRed =
            e.code === "unavailable" ||
            e.code === "deadline-exceeded" ||
            e.code === "aborted" ||
            /network|offline|timeout/i.test(e.message || "");

        if (esErrorDeRed) {
            await enviarEncolado(payload);
            return { ok: true, encolada: true };
        }

        if (e.code === "permission-denied") {
            return {
                ok: false,
                error: "No tienes permisos para enviar la alerta. Contacta al administrador (reglas de Firestore)."
            };
        }

        return {
            ok: false,
            error: `Error al enviar la alerta (${e.code || "desconocido"}). ${e.message || ""}`.trim()
        };
    }
}

export async function cancelarAlerta(alertId) {
    if (!alertId) return { ok: false, error: "ID inválido." };
    try {
        await updateDoc(doc(db, COLECCIONES.PANIC_ALERTS, alertId), { estado: "cancelada" });
        return { ok: true };
    } catch (e) {
        return { ok: false, error: String(e?.message || e) };
    }
}

export async function vaciarColaOffline() {
    if (!navigator.onLine) return { enviadas: 0 };
    const pendientes = await listarPendientes();
    let enviadas = 0;
    for (const item of pendientes) {
        try {
            if (auth.currentUser) {
                item.payload.authUid = auth.currentUser.uid;
            }
            await enviarDirecto(item.payload);
            await eliminarPendiente(item.id);
            enviadas++;
        } catch (e) {
            console.warn("boton-panico: no se pudo enviar pendiente, se reintentará:", e);
            break;
        }
    }
    return { enviadas };
}

window.addEventListener("online", () => {
    vaciarColaOffline().catch(() => { });
});
