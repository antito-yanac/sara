// js/cola-offline.js
// ============================================================
// Cola de alertas pendientes en IndexedDB cuando no hay red.
// v2: sin imports de Firebase (este módulo NO los necesita).
// ============================================================

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

export async function encolarAlerta(payload) {
    await conStore("readwrite", (store) => {
        store.add({ payload, encoladaEn: Date.now() });
    });
}

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

export async function eliminarPendiente(id) {
    await conStore("readwrite", (store) => {
        store.delete(id);
    });
}

export async function contarPendientes() {
    const items = await listarPendientes();
    return items.length;
}
