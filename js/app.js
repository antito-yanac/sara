//======================================================
// App principal Antamina 2026
// v6: En modo keraunos también escucha Firestore
//     para recibir alertas manuales de adminkeraunos.html
//======================================================

import { crearMapa } from "./map.js";
import { inicializarFirebase } from "./notifications.js";
import { escucharMensajesPush } from "./mensajes.js";
import { mostrarAlertaCompleta, cerrarAlertaTotal, mostrarAlertaLibre } from "./alertas.js";
import { iniciarEstadoCliente } from "./estado-cliente.js";

const CONFIG = window.__APP_CONFIG__ || {
    modo: "manual",
    zonasFile: "./zonas.json",
    origenFiltro: "manual",
    usarFirestore: true,
    usarEstadoJSON: false,
    coleccion: "mensajes_push"
};

console.log(`[app] modo: ${CONFIG.modo} | zonas: ${CONFIG.zonasFile} | filtro: ${CONFIG.origenFiltro} | coleccion: ${CONFIG.coleccion}`);

async function iniciar() {
    try {
        // ==================================================
        // MODO KERAUNOS (index.html / keraunos.html)
        // ==================================================
        if (CONFIG.modo === "keraunos") {
            console.log("[app] modo keraunos");

            crearMapa("map");

            // Escuchar Firestore si está activado (scraper v12 + manuales)
            if (CONFIG.usarFirestore) {
                escucharMensajesPush();
                inicializarFirebase().catch(err => console.warn("Firebase:", err.message));
            }

            // Pintar las 4 zonas de zonas2.json en verde
            try {
                const mod = await import("./map.js");
                if (mod && typeof mod.pintarZonasBaseVerde === "function") {
                    await mod.pintarZonasBaseVerde();
                }
            } catch (e) {
                console.warn("[app] No se pudieron pintar las zonas base:", e);
            }

            // Leer estado.json como respaldo (si está configurado)
            if (CONFIG.usarEstadoJSON) {
                try {
                    iniciarEstadoCliente({ modo: "index" });
                } catch (e) {
                    console.warn("[app] estado-cliente no arrancó:", e);
                }
            }

            return;
        }

        // ==================================================
        // MODO MANUAL (strikeguard.html)
        // ==================================================
        crearMapa("map");

        if (CONFIG.usarFirestore) {
            escucharMensajesPush();
            inicializarFirebase().catch(err => console.warn("Firebase:", err.message));
        }

        if (CONFIG.usarEstadoJSON) {
            try {
                iniciarEstadoCliente({ modo: "index" });
            } catch (e) {
                console.warn("estado-cliente no arrancó:", e);
            }
        }

        try {
            const mod = await import("./map.js");
            if (mod && typeof mod.pintarZonasBaseVerde === "function") {
                await mod.pintarZonasBaseVerde();
            }
        } catch (e) {
            console.warn("No se pudieron pintar las zonas base:", e);
        }

    } catch (error) {
        console.error("Error en iniciar():", error);
    }
}

//======================================================
// Botón "Consultar alerta meteorológica"
//======================================================
function configurarBotonConsulta() {
    const btn = document.getElementById("btn-test-alerta");
    if (!btn) return;
    btn.addEventListener("click", () => consultarEstadoAlerta());
}

async function consultarEstadoAlerta() {
    try {
        const { getFirestore, collection, query, orderBy, limit, getDocs } =
            await import("https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js");
        const { obtenerApp } = await import("./firebase-app.js");

        const db = getFirestore(obtenerApp());
        const coleccion = (window.__APP_CONFIG__ || {}).coleccion || "mensajes_push";
        const ref = collection(db, coleccion);
        const q = query(ref, orderBy("fecha", "desc"), limit(1));
        const snapshot = await getDocs(q);

        const DURACION_ALERTA_MS = 15 * 60 * 1000;

        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            const data = doc.data();
            const esAlerta = data.tipo === "alerta" ||
                (data.nivel && data.nivel !== "normal" && data.nivel !== "vigilancia");

            if (esAlerta) {
                const timestampInicio = data.timestampInicio || null;
                const fechaDoc = data.fecha?.toMillis?.() || null;
                let tiempoRef = timestampInicio || fechaDoc;

                if (tiempoRef) {
                    const transcurrido = Date.now() - tiempoRef;
                    if (transcurrido < DURACION_ALERTA_MS) {
                        mostrarAlertaCompleta({
                            nivel:           data.nivel || "roja",
                            titulo:          data.titulo || "⚡ ALERTA DE TORMENTA ELÉCTRICA",
                            mensaje:         data.cuerpo || "",
                            distrito:        data.distrito || "",
                            intensidad:      data.intensidad || "",
                            lat:             (typeof data.lat === "number") ? data.lat : null,
                            lng:             (typeof data.lng === "number") ? data.lng : null,
                            duracionMin:     data.duracionMin || 15,
                            timestampInicio: timestampInicio,
                            sectorOriginal:  data.sectorOriginal || null,
                            inicio:          data.inicio || null,
                            fin:             data.fin || null,
                            origen:          data.origen || null
                        });
                        return;
                    }
                }
            }
        }

        mostrarAlertaLibre();

    } catch (e) {
        console.warn("app.js: error consultando estado de alerta", e);
        mostrarAlertaLibre();
    }
}

configurarBotonConsulta();

//======================================================

iniciar();
