// js/device-id.js
// ============================================================
// Genera y recupera el ID de dispositivo SARA-XXXXXXXX
// Persistente en localStorage. Si el usuario borra caché,
// se genera uno nuevo y deberá registrarse de nuevo.
// ============================================================

const STORAGE_KEY = "sara_device_id";

/**
 * Genera un UUID v4 usando crypto.randomUUID si está disponible,
 * o un fallback basado en crypto.getRandomValues.
 */
function generarUUID() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID().toUpperCase();
    }
    // Fallback para navegadores antiguos
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // versión 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toUpperCase();
}

/**
 * Obtiene el deviceId actual. Si no existe, lo genera y lo guarda.
 * @returns {string} deviceId con formato "SARA-XXXXXXXX-XXXX-..."
 */
export function obtenerDeviceId() {
    try {
        let id = localStorage.getItem(STORAGE_KEY);
        if (id && id.startsWith("SARA-")) return id;
        id = "SARA-" + generarUUID();
        localStorage.setItem(STORAGE_KEY, id);
        return id;
    } catch (e) {
        // Si localStorage está bloqueado, generamos uno efímero (no persistirá)
        console.warn("device-id: localStorage no disponible, usando ID efímero:", e);
        return "SARA-" + generarUUID();
    }
}

/**
 * Elimina el deviceId (útil para testing o "borrar mis datos").
 */
export function borrarDeviceId() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { }
}

/**
 * Detecta el tipo de equipo a partir del userAgent.
 * @returns {string} "android" | "ios" | "windows" | "mac" | "linux" | "desconocido"
 */
export function detectarEquipo() {
    const ua = (navigator.userAgent || "").toLowerCase();
    if (ua.includes("android")) return "android";
    if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) return "ios";
    if (ua.includes("windows")) return "windows";
    if (ua.includes("mac os")) return "mac";
    if (ua.includes("linux")) return "linux";
    return "desconocido";
}
