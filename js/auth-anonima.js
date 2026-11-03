// js/auth-anonima.js
// ============================================================
// Autenticación anónima de Firebase.
// Garantiza que cada dispositivo tenga un authUid válido
// que las reglas de Firestore puedan verificar.
// ============================================================

//import { auth } from "./firebase-config.js";
import { auth } from "./firebase-app.js";
import {
    signInAnonymously,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Aseguramos persistencia local (la sesión sobrevive al cerrar)
setPersistence(auth, browserLocalPersistence).catch(() => { });

/**
 * Devuelve una promesa que resuelve con el usuario actual.
 * Si no hay sesión, hace signInAnonymously primero.
 * @returns {Promise<import("firebase/auth").User>}
 */
export function asegurarSesionAnonima() {
    return new Promise((resolve, reject) => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            unsub(); // solo nos interesa el primer estado
            if (user) { resolve(user); return; }
            try {
                const cred = await signInAnonymously(auth);
                resolve(cred.user);
            } catch (e) {
                reject(e);
            }
        }, reject);
    });
}

/**
 * Cierra la sesión actual (para testing o borrar datos).
 */
export async function cerrarSesionAnonima() {
    try { await auth.signOut(); } catch (e) { }
}

/**
 * Devuelve el authUid actual sin forzar login (puede ser null).
 */
export function authUidActual() {
    return auth.currentUser ? auth.currentUser.uid : null;
}
