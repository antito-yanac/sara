// js/cola-offline.js
// ============================================================
// Cola de alertas pendientes en IndexedDB cuando no hay red.
// Al recuperar la conexión, se vacía y se envían a Firestore.
// ============================================================
import { obtenerAuth, obtenerFirestore } from "./firebase-app.js";
import { COLECCIONES } from "./firebase-config.js";

const auth = obtenerAuth();
const db = obtenerFirestore();

import { obtenerDeviceId } from "./device-id.js";
import { leerUsuarioActual } from "./registro-usuario.js";
import { encolarAlerta, listarPendientes, eliminarPendiente } from "./cola-offline.js";

// ✅ MISMA versión
import {
    collection, addDoc, doc, updateDoc,
    serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

//=============================================================================
const DB_NAME    = "sara_offline";
const DB_VERSION = 1;
const STORE      = "alertas_pendientes";

let dbPromise = null;

function abrirDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (ev) => {
            const db = ev.target.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror  = () => reject(req.error);
    });
    return dbPromise;
}

async function conStore(modo, fn) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, modo);
        const store = tx.objectStore(STORE);
        let result;
        try { result = fn(store); }
        catch (e) { reject(e); return; }
        tx.oncomplete = () => resolve(result);
        tx.onerror    = () => reject(tx.error);
        tx.onabort    = () => reject(tx.error);
    });
}

/**
 * Encola una alerta para enviarla cuando vuelva la conexión.
 * @param {object} payload - El mismo objeto que enviarías a Firestore.
 */
export async function encolarAlerta(payload) {
    await conStore("readwrite", (store) => {
        store.add({
            payload,
            encoladaEn: Date.now()
        });
    });
}

/**
 * Devuelve todas las alertas pendientes.
 * @returns {Promise<Array<{id, payload, encoladaEn}>>}
 */
export async function listarPendientes() {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await abrirDB();
            const tx = db.transaction(STORE, "readonly");
            const store = tx.objectStore(STORE);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror   = () => reject(req.error);
        } catch (e) { reject(e); }
    });
}

/**
 * Elimina una alerta de la cola por id.
 */
export async function eliminarPendiente(id) {
    await conStore("readwrite", (store) => {
        store.delete(id);
    });
}

/**
 * Cuenta cuántas alertas pendientes hay.
 */
export async function contarPendientes() {
    const items = await listarPendientes();
    return items.length;
}
