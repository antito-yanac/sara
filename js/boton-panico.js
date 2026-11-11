// js/boton-panico.js
// ============================================================
// Lógica del botón SOS.
// v2: unifica SDK a 12.17.0 y elimina imports duplicados.
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
//inicio agregado-----------------------------------
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
//-------------------------fin----------------------------

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

export async function dispararPanico() {
    if (!auth.currentUser) return { ok: false, error: "Sesión no iniciada. Recarga la página." };

    const usuario = await leerUsuarioActual();
    if (!usuario) return { ok: false, error: "Debes registrarte antes de usar el botón SOS." };
    if (usuario.data.estado !== "activo") return { ok: false, error: "Tu cuenta está inactiva. Contacta al administrador." };

    //const ubicacion = await obtenerUbicacion(10_000);
    const ubicacion = await obtenerUbicacion();
    const payload = construirPayload(usuario, ubicacion);

    if (navigator.onLine) {
        try {
            const alertId = await enviarDirecto(payload);
            try {
                await updateDoc(doc(db, COLECCIONES.USUARIOS, usuario.deviceId), {
                    ultimoPanico: serverTimestamp()
                });
            } catch { }
            return { ok: true, alertId, encolada: false };
        } catch (e) {
            console.warn("boton-panico: envío directo falló, encolando:", e);
            await enviarEncolado(payload);
            return { ok: true, encolada: true };
        }
    } else {
        await enviarEncolado(payload);
        return { ok: true, encolada: true };
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
