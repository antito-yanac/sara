// js/firebase-app.js
// ============================================================
// ÚNICA fuente de inicialización de Firebase.
// App, Auth y Firestore salen de aquí y se reutilizan en todo
// el proyecto. Nadie más debe llamar a initializeApp,
// getAuth, getFirestore ni initializeFirestore.
// ============================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    getFirestore
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import {
    getAuth,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

let appInstance = null;
let firestoreInstance = null;
let authInstance = null;

export function obtenerApp() {
    if (appInstance) return appInstance;
    appInstance = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    return appInstance;
}

/**
 * Firestore con caché persistente (offline).
 * Se inicializa UNA sola vez. Después se reutiliza.
 */
export function obtenerFirestore() {
    if (firestoreInstance) return firestoreInstance;
    const app = obtenerApp();
    try {
        firestoreInstance = initializeFirestore(app, {
            localCache: persistentLocalCache({
                tabManager: persistentMultipleTabManager()
            })
        });
    } catch (e) {
        // Si por algún motivo ya fue inicializado por otra vía, reutilizamos
        firestoreInstance = getFirestore(app);
    }
    return firestoreInstance;
}

/**
 * Auth de Firebase, con persistencia local para que la sesión
 * sobreviva al cerrar el navegador.
 */
export function obtenerAuth() {
    if (authInstance) return authInstance;
    const app = obtenerApp();
    authInstance = getAuth(app);
    setPersistence(authInstance, browserLocalPersistence).catch(() => {});
    return authInstance;
}

// Compatibilidad: exportar también como propiedades para módulos que
// hacían `import { auth, db } from "./firebase-config.js"`.
export const app  = obtenerApp();
export const db   = obtenerFirestore();
export const auth = obtenerAuth();
