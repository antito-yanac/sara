// js/auth-anonima.js
// ============================================================
// Autenticación anónima de Firebase.
// Garantiza que cada dispositivo tenga un authUid válido
// que las reglas de Firestore puedan verificar.
// ============================================================

//import { auth } from "./firebase-config.js";
//import { auth } from "./firebase-app.js";
import { obtenerAuth, obtenerFirestore } from "./firebase-app.js";
import { COLECCIONES } from "./firebase-config.js";

// Inicializamos las referencias AQUÍ:
const auth = obtenerAuth();
const db = obtenerFirestore();

import {
    signInAnonymously,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

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
            unsub();
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
// ============================================================
// v2 — Sesión con EMAIL + CONTRASEÑA (rescatistas / ambulancias)
// La cuenta real es estable: aunque se borre el localStorage,
// al ingresar de nuevo se recupera el MISMO uid, documento y
// autorización. (Las funciones anónimas de index.html siguen
// funcionando igual para el botón SOS.)
// ============================================================

export function registrarConEmail(email, password) {
    return createUserWithEmailAndPassword(auth, email, password).then(c => c.user);
}

export function ingresarConEmail(email, password) {
    return signInWithEmailAndPassword(auth, email, password).then(c => c.user);
}

export async function salirSesion() {
    try { await signOut(auth); } catch (e) { }
}

/** onAuthStateChanged con callback simple. */
export function escucharSesion(callback) {
    return onAuthStateChanged(auth, callback);
}
