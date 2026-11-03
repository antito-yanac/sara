// js/registro-usuario.js
// ============================================================
// Registro del usuario (4 campos) y validación de DNI único.
// Se muestra como tarjeta flotante; al completar se guarda en
// Firestore con transacción para evitar DNIs duplicados.
// ============================================================

import { auth, db, COLECCIONES } from "./firebase-config.js";
import { obtenerDeviceId, detectarEquipo } from "./device-id.js";
import {
    doc,
    getDoc,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const ESTADO_USUARIO_KEY = "sara_usuario_registrado"; // bandera local

// ── Helpers de validación ───────────────────────────────────
function validarDNI(dni) {
    return /^[0-9]{8}$/.test(dni);
}
function validarCelular(cel) {
    return /^[0-9]{9}$/.test(cel);
}
function limpiarTexto(s) {
    return String(s || "").trim().replace(/\s+/g, " ");
}

// ── Estado local del usuario ────────────────────────────────
export function yaEstaRegistrado() {
    try { return localStorage.getItem(ESTADO_USUARIO_KEY) === "1"; }
    catch { return false; }
}
function marcarRegistrado() {
    try { localStorage.setItem(ESTADO_USUARIO_KEY, "1"); } catch { }
}
export function borrarRegistroLocal() {
    try { localStorage.removeItem(ESTADO_USUARIO_KEY); } catch { }
}

/**
 * Lee el documento del usuario desde Firestore.
 * @returns {Promise<{deviceId, data}|null>}
 */
export async function leerUsuarioActual() {
    const deviceId = obtenerDeviceId();
    if (!deviceId) return null;
    try {
        const snap = await getDoc(doc(db, COLECCIONES.USUARIOS, deviceId));
        if (!snap.exists()) return null;
        return { deviceId, data: snap.data() };
    } catch (e) {
        console.warn("registro-usuario: error leyendo usuario:", e);
        return null;
    }
}

/**
 * Guarda al usuario en Firestore de forma atómica:
 *  - Verifica que el DNI no exista (colección dni_registrados).
 *  - Crea usuarios/{deviceId} y dni_registrados/{dni}.
 * @param {{nombre, dni, celular, empresa, aceptoTerminos}} datos
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function registrarUsuario(datos) {
    const nombre  = limpiarTexto(datos.nombre);
    const dni     = limpiarTexto(datos.dni);
    const celular = limpiarTexto(datos.celular);
    const empresa = limpiarTexto(datos.empresa);
    const acepto  = datos.aceptoTerminos === true;

    // Validaciones locales (rápidas)
    if (!nombre || nombre.length < 3) return { ok: false, error: "Ingresa tu nombre completo." };
    if (!validarDNI(dni))             return { ok: false, error: "El DNI debe tener 8 dígitos." };
    if (!validarCelular(celular))     return { ok: false, error: "El celular debe tener 9 dígitos." };
    if (!empresa)                     return { ok: false, error: "Ingresa tu empresa." };
    if (!acepto)                      return { ok: false, error: "Debes aceptar el uso de tus datos para emergencias." };

    const user = auth.currentUser;
    if (!user) return { ok: false, error: "Sesión no iniciada. Recarga la página." };

    const deviceId = obtenerDeviceId();
    const authUid  = user.uid;
    const equipo   = detectarEquipo();

    const refUsuario = doc(db, COLECCIONES.USUARIOS, deviceId);
    const refDNI     = doc(db, COLECCIONES.DNI_REGISTRADOS, dni);

    try {
        await runTransaction(db, async (tx) => {
            // 1) Verificar que el DNI no esté registrado
            const dniSnap = await tx.get(refDNI);
            if (dniSnap.exists()) {
                throw new Error("DNI_YA_REGISTRADO");
            }

            // 2) Verificar que el deviceId no tenga ya un usuario (por seguridad)
            const userSnap = await tx.get(refUsuario);
            if (userSnap.exists()) {
                // Si ya existe pero el authUid no coincide, es un conflicto
                if (userSnap.data().authUid !== authUid) {
                    throw new Error("DEVICE_YA_REGISTRADO_OTRO_UID");
                }
            }

            // 3) Crear/actualizar usuario
            const payloadUsuario = {
                authUid,
                deviceId,
                nombre,
                dni,
                celular,
                empresa,
                equipo,
                estado: "activo",
                aceptoTerminos: true,
                fechaRegistro: serverTimestamp(),
                ultimoPanico: null
            };
            tx.set(refUsuario, payloadUsuario, { merge: true });

            // 4) Reservar el DNI
            tx.set(refDNI, { deviceId, authUid });
        });

        marcarRegistrado();
        return { ok: true };
    } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes("DNI_YA_REGISTRADO")) {
            return { ok: false, error: "Este DNI ya está registrado. Contacta al administrador." };
        }
        if (msg.includes("DEVICE_YA_REGISTRADO_OTRO_UID")) {
            return { ok: false, error: "Este dispositivo ya está vinculado a otro usuario." };
        }
        if (msg.includes("permission-denied") || msg.includes("PERMISSION_DENIED")) {
            return { ok: false, error: "No se pudo guardar (permisos). Verifica las reglas de Firestore." };
        }
        console.error("registro-usuario: error inesperado:", e);
        return { ok: false, error: "Error al registrar: " + msg };
    }
}

/**
 * Actualiza los datos del usuario (excepto DNI, authUid, deviceId, estado).
 */
export async function actualizarUsuario({ nombre, celular, empresa }) {
    const user = auth.currentUser;
    if (!user) return { ok: false, error: "Sesión no iniciada." };
    const deviceId = obtenerDeviceId();

    const nombreL  = limpiarTexto(nombre);
    const celularL = limpiarTexto(celular);
    const empresaL = limpiarTexto(empresa);
    if (!nombreL || nombreL.length < 3) return { ok: false, error: "Nombre inválido." };
    if (!validarCelular(celularL))      return { ok: false, error: "Celular inválido." };
    if (!empresaL)                      return { ok: false, error: "Empresa requerida." };

    try {
        // Importamos updateDoc dinámicamente para no cargar si no se usa
        const { updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        await updateDoc(doc(db, COLECCIONES.USUARIOS, deviceId), {
            nombre: nombreL,
            celular: celularL,
            empresa: empresaL
        });
        return { ok: true };
    } catch (e) {
        return { ok: false, error: String(e?.message || e) };
    }
}
