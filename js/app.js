//======================================================
// App principal Antamina 2026
// v5: Eliminadas todas las referencias a lugares.json, 
//     lugares.kml, buscador y filtros.
//======================================================

import { crearMapa } from "./map.js";
import { inicializarFirebase } from "./notifications.js";
import { escucharMensajesPush } from "./mensajes.js";
import { mostrarAlertaCompleta, cerrarAlertaTotal, mostrarAlertaLibre } from "./alertas.js";
import { iniciarEstadoCliente } from "./estado-cliente.js";

// Leer configuración (o defaults si no existe)
const CONFIG = window.__APP_CONFIG__ || {
    modo: "manual",
    zonasFile: "./zonas.json",
    origenFiltro: "manual",
    usarFirestore: true,
    usarEstadoJSON: false
};

console.log(`[app] modo: ${CONFIG.modo} | zonas: ${CONFIG.zonasFile} | filtro: ${CONFIG.origenFiltro}`);

//======================================================
// Inicio
//======================================================

async function iniciar() {
    try {
        // ==================================================
        // MODO KERAUNOS (keraunos.html)
        // ==================================================
        if (CONFIG.modo === "keraunos") {
            console.log("[app] modo keraunos");

            crearMapa("map");

            // Pintar las 4 zonas de zonas2.json en verde
            try {
                const mod = await import("./map.js");
                if (mod && typeof mod.pintarZonasBaseVerde === "function") {
                    await mod.pintarZonasBaseVerde();
                }
            } catch (e) {
                console.warn("[app] No se pudieron pintar las zonas base:", e);
            }

            // Arrancar estado-cliente (lee estado.json cada 10s)
            try {
                iniciarEstadoCliente({ modo: "index" });
            } catch (e) {
                console.warn("[app] estado-cliente no arrancó:", e);
            }

            return;
        }

        // ==================================================
        // MODO MANUAL (index.html)
        // ==================================================
        crearMapa("map");

        // Firestore: solo si la config lo pide
        if (CONFIG.usarFirestore) {
            escucharMensajesPush();
            inicializarFirebase().catch(err => console.warn("Firebase:", err.message));
        }

        // estado.json: solo si la config lo pide
        if (CONFIG.usarEstadoJSON) {
            try {
                iniciarEstadoCliente({ modo: "index" });
            } catch (e) {
                console.warn("estado-cliente no arrancó:", e);
            }
        }

        // Pintar las zonas base (zonas.json, 3 zonas en modo manual)
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
        const ref = collection(db, "mensajes_push");
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
