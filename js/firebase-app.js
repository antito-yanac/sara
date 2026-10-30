// js/firebase-app.js
//
// Instancia ÚNICA y COMPARTIDA de Firebase para toda la app.
// v2: Añadida persistencia local de Firestore (caché offline).
// ============================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import {
    initializeFirestore,
    persistentLocalCache,
    getFirestore
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

let firestoreInstance = null;

export function obtenerApp() {
    if (getApps().length === 0) {
        return initializeApp(firebaseConfig);
    }
    return getApp();
}

/**
 * Obtiene la instancia de Firestore con caché persistente.
 * La persistencia permite que la app siga mostrando datos
 * (alertas, zonas) incluso sin conexión, y acelera las cargas.
 * Es idempotente: si ya se inicializó, devuelve la misma instancia.
 */
export function obtenerFirestore() {
    if (firestoreInstance) return firestoreInstance;

    const app = obtenerApp();

    try {
        firestoreInstance = initializeFirestore(app, {
            localCache: persistentLocalCache()
        });
    } catch (e) {
        // Si ya estaba inicializado por otra llamada, usar getFirestore
        console.warn("[firebase-app] initializeFirestore falló, usando getFirestore:", e.message);
        firestoreInstance = getFirestore(app);
    }

    return firestoreInstance;
}
