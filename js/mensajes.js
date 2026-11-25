// js/mensajes.js
//
// Sistema de mensajes en tiempo real usando Firebase Firestore.
// v10:
//   - Usa obtenerFirestore() con persistencia local (offline).
//   - Colección dinámica según window.__APP_CONFIG__.coleccion.
//   - Las alertas manuales se procesan siempre.
// ============================================================

import {
    collection, addDoc, query, orderBy, limit,
    onSnapshot, serverTimestamp, doc
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { obtenerFirestore } from "./firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";
import { mostrarToast, reproducirSonido } from "./notifications.js";
import { mostrarAlertaCompleta, mostrarAlertaLibre, quitarAlerta, marcarArranqueListo } from "./alertas.js";

function obtenerNombreColeccion() {
    const cfg = window.__APP_CONFIG__ || {};
    return cfg.coleccion || "mensajes_push";
}

const COLECCION_SISTEMA = "sistema";
const DOC_MODO = "estado_modo";
const DURACION_ALERTA_MS = 15 * 60 * 1000;
const LIMITE_DOCS = 50;

let db = null;
let yaEscuchando = false;
let primeraCarga = true;
let firestoreServidorOk = false;
const docsProcesados = new Set();

export const estadoModo = {
    modo: "automatico",
    zonasActivas: [],
    expiraEn: 0,
    cargado: false
};

const LIBERADAS_KEY = "manual_liberadas";

function registrarLiberacion(distrito, timestampInicio) {
    try {
        const liberadas = JSON.parse(localStorage.getItem(LIBERADAS_KEY) || "{}");
        if (distrito) liberadas[distrito] = timestampInicio;
        localStorage.setItem(LIBERADAS_KEY, JSON.stringify(liberadas));
    } catch (e) { }
}

function estaLiberada(distrito, timestampInicio) {
    try {
        const liberadas = JSON.parse(localStorage.getItem(LIBERADAS_KEY) || "{}");
        return liberadas[distrito] === timestampInicio;
    } catch (e) { return false; }
}

function obtenerDB() {
    if (!db) db = obtenerFirestore();
    return db;
}

function obtenerConfig() {
    return window.__APP_CONFIG__ || {
        origenFiltro: "manual",
        usarFirestore: true,
        coleccion: "mensajes_push"
    };
}

function debeProcesar(data) {
    const cfg = obtenerConfig();
    const esAlerta = data.tipo === "alerta" ||
        (data.nivel && data.nivel !== "normal" && data.nivel !== "vigilancia");
    const esResuelta = data.tipo === "alerta-resuelta";
    const esNormal = !esAlerta && !esResuelta;

    if (esNormal) return true;

    if (data.origen === "manual") return true;

    if (cfg.origenFiltro === "manual") return false;
    if (cfg.origenFiltro === "scraper") return data.origen !== "manual";
    return true;
}

export async function enviarMensajePush(titulo, cuerpo, datosAlerta = null) {
    const database = obtenerDB();
    const coleccionNombre = obtenerNombreColeccion();
    const ref = collection(database, coleccionNombre);
    const docData = { titulo, cuerpo, fecha: serverTimestamp() };

    if (datosAlerta) {
        const esResuelta = datosAlerta.tipo === "alerta-resuelta";

        if (!esResuelta) {
            if (!datosAlerta.duracionMin || datosAlerta.duracionMin <= 0) {
                datosAlerta.duracionMin = 15;
            }
            // Solo las alertas NUEVAS reciben timestampInicio = ahora
            datosAlerta.timestampInicio = Date.now();
        }
        // Para alerta-resuelta: NO sobrescribir timestampInicio.
        // Si viene, se respeta; si no viene, se deja sin definir.

        Object.assign(docData, datosAlerta);
    }

    await addDoc(ref, docData);
    console.log(`[mensajes] Enviado a ${coleccionNombre}:`, docData.tipo || "mensaje");
}

function escucharModo() {
    try {
        const database = obtenerDB();
        const ref = doc(database, COLECCION_SISTEMA, DOC_MODO);

        onSnapshot(ref, (snap) => {
            if (!snap.exists()) {
                estadoModo.modo = "automatico";
                estadoModo.zonasActivas = [];
                estadoModo.expiraEn = 0;
                estadoModo.cargado = true;
                return;
            }
            const data = snap.data() || {};
            estadoModo.modo = data.modo || "automatico";
            estadoModo.zonasActivas = Array.isArray(data.zonasActivas) ? data.zonasActivas : [];
            estadoModo.expiraEn = (data.expiraEn && typeof data.expiraEn.toMillis === "function")
                ? data.expiraEn.toMillis()
                : (data.expiraEn || 0);
            estadoModo.cargado = true;
            console.log("[mensajes] modo actualizado:", estadoModo.modo);
        }, (err) => {
            console.warn("[mensajes] error leyendo modo:", err);
            estadoModo.modo = "automatico";
            estadoModo.cargado = true;
        });
    } catch (e) {
        console.warn("[mensajes] no se pudo escuchar modo:", e);
    }
}
//------------------------------------------
// ============================================================
// CONFIRMACIÓN RÁPIDA DE ARRANQUE (REST directa)
// El SDK abre un canal streaming (WebChannel) cuyo handshake en
// redes móviles/corporativas puede tardar mucho. Este GET simple
// llega en 1-2 s, evalúa el MISMO estado y pinta la alerta real
// o el libre sin esperar el canal. El listener del SDK queda
// como fuente de tiempo real.
// ============================================================
const ARRANQUE_REST = { resuelto: null, sdkSincronizado: false };

function convertirCampoREST(valor) {
    if (valor == null) return null;
    if ("stringValue" in valor) return valor.stringValue;
    if ("integerValue" in valor) return parseInt(valor.integerValue, 10);
    if ("doubleValue" in valor) return Number(valor.doubleValue);
    if ("booleanValue" in valor) return valor.booleanValue;
    if ("timestampValue" in valor) return { toMillis: () => Date.parse(valor.timestampValue) };
    if ("mapValue" in valor) {
        const out = {};
        for (const [k, v] of Object.entries(valor.mapValue.fields || {})) out[k] = convertirCampoREST(v);
        return out;
    }
    if ("arrayValue" in valor) return (valor.arrayValue.values || []).map(convertirCampoREST);
    return null;
}

async function confirmarArranqueREST() {
    try {
        const coleccion = encodeURIComponent(obtenerNombreColeccion());
        const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}` +
            `/databases/(default)/documents/${coleccion}?pageSize=${LIMITE_DOCS}` +
            `&orderBy=fecha%20desc&key=${firebaseConfig.apiKey}`;
        const resp = await fetch(url, { cache: "no-store" });
        if (!resp.ok) return;
        const json = await resp.json();
        if (ARRANQUE_REST.resuelto || !primeraCarga) return;   // el SDK llegó primero

        const docs = (json.documents || []).map(d => ({
            id: d.name.split("/").pop(),
            data: () => {
                const out = {};
                for (const [k, v] of Object.entries(d.fields || {})) out[k] = convertirCampoREST(v);
                return out;
            }
        }));
        const snapshotRest = { docs: docs, metadata: { fromCache: false } };

        ARRANQUE_REST.resuelto = "rest";
        primeraCarga = false;
        firestoreServidorOk = true;
        console.log("[mensajes] arranque confirmado por REST directa");
        procesarPrimeraCarga(snapshotRest);
        mostrarAlertaLibre();
        marcarArranqueListo("firestore");
    } catch (e) {
        console.warn("[mensajes] REST de arranque falló (continúa el SDK):", e);
    }
}
export function escucharMensajesPush() {
    if (yaEscuchando) return;
    yaEscuchando = true;

    const cfg = obtenerConfig();

    if (!cfg.usarFirestore) {
        console.log("[mensajes] Firestore desactivado en esta página");
        marcarArranqueListo("firestore");
        return;
    }

    const coleccionNombre = obtenerNombreColeccion();
    console.log(`[mensajes] Escuchando colección: ${coleccionNombre}`);

    escucharModo();
    // Confirmación rápida por REST en paralelo al listener del SDK
    confirmarArranqueREST();

    try {
        const database = obtenerDB();
        const ref = collection(database, coleccionNombre);
        const q = query(ref, orderBy("fecha", "desc"), limit(LIMITE_DOCS));

            onSnapshot(q, (snapshot) => {
            if (primeraCarga) {
                // Solo el SERVIDOR define el arranque. La caché local de una
                // sesión anterior puede estar expirada: pintaba verde aunque
                // hubiera alerta activa, y el snapshot del servidor no la
                // corregía (los docs ya en caché no llegan como "added").
                if (snapshot.metadata.fromCache) return;
                primeraCarga = false;
                firestoreServidorOk = true;
                ARRANQUE_REST.resuelto = "sdk";
                procesarPrimeraCarga(snapshot);
                // Si el timeout ya disparó, cierra el splash con el estado
                // real: pintar la alerta ya lo hace procesarPrimeraCarga;
                // si no hay alertas, muestra libre. Si aún está esperando,
                // este llamado no hace nada (liberarArranque se encarga).
                mostrarAlertaLibre();
                marcarArranqueListo("firestore");
                return;
            }

            // Confirmación del servidor tras un snapshot desde caché
            if (!snapshot.metadata.fromCache && !firestoreServidorOk) {
                firestoreServidorOk = true;
                marcarArranqueListo("firestore");
            }

            // Si el arranque lo resolvió la REST directa, el PRIMER snapshot
            // del SDK llega con todo como "added": solo se absorben los IDs
            // para no reprocesar (el estado ya lo pintó la REST).
            if (ARRANQUE_REST.resuelto === "rest" && !ARRANQUE_REST.sdkSincronizado) {
                if (!snapshot.metadata.fromCache) ARRANQUE_REST.sdkSincronizado = true;
                snapshot.docChanges().forEach((cambio) => {
                    if (cambio.type === "added") docsProcesados.add(cambio.doc.id);
                });
                return;
            }

            snapshot.docChanges().forEach((cambio) => {
                if (cambio.type !== "added") return;
                
                const docId = cambio.doc.id;
                if (docsProcesados.has(docId)) return;
                docsProcesados.add(docId);

                procesarDocumentoNuevo(cambio.doc.data());
            });
        }, (error) => {
            console.error("Error escuchando mensajes:", error);
            marcarArranqueListo("firestore");
            try { mostrarAlertaLibre(); } catch (e) { }
        });

    } catch (error) {
        console.error("No se pudo iniciar la escucha de mensajes:", error);
        marcarArranqueListo("firestore");
        try { mostrarAlertaLibre(); } catch (e) { }
    }
}

function procesarPrimeraCarga(snapshot) {
    const docs = snapshot.docs.map(d => ({ id: d.id, data: d.data() })).reverse();
    const estadoPorZona = new Map();
    const mensajesNormales = [];
    const ahora = Date.now();

    for (const { data } of docs) {
        const esResuelta = data.tipo === "alerta-resuelta";
        const esAlerta = data.tipo === "alerta" ||
            (data.nivel && data.nivel !== "normal" && data.nivel !== "vigilancia");
        const esNormal = !esResuelta && !esAlerta;

        if (esResuelta) {
            if (!debeProcesar(data)) continue;
            const distrito = data.distrito || "";
            if (distrito) estadoPorZona.set(distrito, { tipo: "resuelta", data });
            continue;
        }

        if (esAlerta) {
            if (!debeProcesar(data)) continue;
            const distrito = data.distrito || "";
            if (!distrito) continue;

            const tsInicio = data.timestampInicio || (data.fecha?.toMillis?.() || 0);
            
            if (estaLiberada(distrito, tsInicio)) continue;

            const duracionMin = data.duracionMin || 15;
            const duracionMs = duracionMin * 60 * 1000;

            if (tsInicio && (ahora - tsInicio) < duracionMs) {
                estadoPorZona.set(distrito, { tipo: "alerta", data, tsInicio, duracionMin });
            }
            continue;
        }

        if (esNormal) {
            const fecha = data.fecha?.toMillis?.() || 0;
            if (fecha && (ahora - fecha) < DURACION_ALERTA_MS) {
                mensajesNormales.push(data);
            }
        }
    }

    const zonasActivas = [];
    for (const [, entrada] of estadoPorZona.entries()) {
        if (entrada.tipo === "alerta") zonasActivas.push(entrada);
    }

    if (zonasActivas.length === 0) {
        if (mensajesNormales.length > 0) {
            setTimeout(() => {
                mensajesNormales.slice(0, 3).forEach(m => {
                    mostrarToast(m.titulo || "🔔 Notificación", m.cuerpo || "", "alerta", true);
                });
            }, 1500);
        }
        return;
    }

    for (const entrada of zonasActivas) {
        mostrarAlertaActiva(entrada.data, entrada.duracionMin, entrada.tsInicio);
    }
}

function procesarDocumentoNuevo(data) {
    if (!debeProcesar(data)) return;

    const esResuelta = data.tipo === "alerta-resuelta";
    const esAlerta = data.tipo === "alerta" ||
        (data.nivel && data.nivel !== "normal" && data.nivel !== "vigilancia");

    if (esResuelta) {
        const distrito = data.distrito || "";
        if (distrito) {
            if (data.timestampInicio) registrarLiberacion(distrito, data.timestampInicio);
            quitarAlerta(distrito);
        } else {
            mostrarAlertaLibre();
        }
        return;
    }

    if (esAlerta) {
        const distrito = data.distrito || "";
        const tsInicio = (typeof data.timestampInicio === "number") ? data.timestampInicio : null;
        
        if (distrito && tsInicio && estaLiberada(distrito, tsInicio)) return;

        reproducirSonido();
        const duracionMin = data.duracionMin || 15;
        mostrarAlertaActiva(data, duracionMin, tsInicio);

        if ("Notification" in window && Notification.permission === "granted") {
            try {
                new Notification(data.titulo || "🔔 Notificación", {
                    body: data.cuerpo || "",
                    icon: "https://cdn-icons-png.flaticon.com/512/1827/1827301.png",
                    tag: "antamina-alerta-" + Date.now()
                });
            } catch (e) { }
        }
        return;
    }

    const titulo = data.titulo || "🔔 Notificación";
    const cuerpo = data.cuerpo || "";
    mostrarToast(titulo, cuerpo, "alerta", true);

    if ("Notification" in window && Notification.permission === "granted") {
        try {
            new Notification(titulo, {
                body: cuerpo,
                icon: "https://cdn-icons-png.flaticon.com/512/1827/1827301.png",
                tag: "antamina-mensaje-" + Date.now()
            });
        } catch (e) { }
    }
}

function mostrarAlertaActiva(data, duracionMin, timestampInicio) {
    mostrarAlertaCompleta({
        tipo:            "alerta",
        nivel:           data.nivel || "roja",
        titulo:          data.titulo || "⚡ ALERTA DE TORMENTA ELÉCTRICA",
        mensaje:         data.cuerpo || data.mensaje || "",
        distrito:        data.distrito || "",
        intensidad:      data.intensidad || "",
        lat:             (typeof data.lat === "number") ? data.lat : null,
        lng:             (typeof data.lng === "number") ? data.lng : null,
        duracionMin:     duracionMin,
        timestampInicio: timestampInicio,
        sectorOriginal:  data.sectorOriginal || null,
        inicio:          data.inicio || null,
        fin:             data.fin || null,
        origen:          data.origen || null
    });
}


