// js/estado-cliente.js
// ============================================================
// Puente estado.json ↔ sistema de alertas (v11)
// ------------------------------------------------------------
// v11 (2026-10):
//   - FIX 1: migrarHistorial() marca cambio=true al renombrar claves.
//   - FIX 2: migrarHistorial() fusiona claves colisionadas sin perder datos.
//   - FIX 3: cargarHistorial() valida que historial sea un objeto.
//   - FIX 4: claveAlerta() salta alertas sin timestampInicio válido.
//   - FIX 5: ciclo() tiene lock (cliente.enCurso) para evitar concurrencia.
//   - FIX 7: detenerEstadoCliente() limpia el listener de visibilitychange.
//   - FIX 8: INTERVALO_MS se recalcula dentro de iniciarEstadoCliente().
//   - FIX 9: resetearHistorial() detiene el intervalo para evitar fugas.
// ============================================================

import { mostrarAlertaCompleta, mostrarAlertaLibre, quitarAlerta, marcarArranqueListo } from "./alertas.js";

const ESTADO_URL    = "./estado.json";
const APP_CONFIG    = window.__APP_CONFIG__ || { modo: "index" };
const STORAGE_KEY   = "keraunos_estado_cliente_v2";
const MAX_HISTORIAL = 200;

const cliente = {
    modo: null,
    intervaloId: null,
    historial: {},
    zonasVistas: new Set(),
    cargado: false,
    enCurso: false,              // FIX 5: lock para evitar ciclos concurrentes
    visibilityHandler: null      // FIX 7: guardar referencia para limpiar
};

let primeraCarga = true;

// ------------------------------------------------------------
// FIX 8: el intervalo se calcula dinámicamente según cliente.modo
// ------------------------------------------------------------
function calcularIntervaloMs() {
    const modo = cliente.modo || (window.__APP_CONFIG__ || {}).modo || "index";
    return modo === "keraunos" ? 10_000 : 30_000;
}

function cargarHistorial() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { historial: {}, zonas: [] };
        const parsed = JSON.parse(raw);
        // FIX 3: validar que historial sea un objeto plano
        const historial = (parsed.historial && typeof parsed.historial === "object" && !Array.isArray(parsed.historial))
            ? parsed.historial : {};
        const zonas = Array.isArray(parsed.zonas) ? parsed.zonas : [];
        return { historial, zonas };
    } catch { return { historial: {}, zonas: [] }; }
}

function guardarHistorial(historial, zonas) {
    try {
        const claves = Object.keys(historial);
        if (claves.length > MAX_HISTORIAL) {
            const recortadas = claves.slice(-MAX_HISTORIAL);
            const nuevo = {};
            recortadas.forEach(k => nuevo[k] = historial[k]);
            historial = nuevo;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            historial,
            zonas: Array.from(zonas)
        }));
    } catch {}
}

// MIGRACIÓN: Reemplaza "Botadero Este" por "Oficinas Mina" en el historial viejo
// FIX 1 y FIX 2: marcar cambio al renombrar claves y fusionar colisiones sin perder datos.
function migrarHistorial() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        if (!raw.includes("Botadero Este")) return;

        const parsed = JSON.parse(raw);
        let cambio = false;

        // FIX 1 y FIX 2: fusionar de forma segura.
        // Si una clave renombrada choca con una existente, nos quedamos con la
        // de timestampInicio más reciente (la más nueva).
        const nuevoHistorial = {};
        for (const [claveOriginal, valor] of Object.entries(parsed.historial || {})) {
            const claveNueva = claveOriginal.replace(/Botadero Este/g, "Oficinas Mina");
            const valorNuevo = { ...valor };
            if (valorNuevo.distrito && valorNuevo.distrito.includes("Botadero Este")) {
                valorNuevo.distrito = valorNuevo.distrito.replace(/Botadero Este/g, "Oficinas Mina");
            }
            if (claveNueva !== claveOriginal) cambio = true;

            const existente = nuevoHistorial[claveNueva];
            if (existente) {
                // Colisión: quedarse con la más reciente por timestampInicio
                const tsNuevo = Number(valorNuevo.timestampInicio) || 0;
                const tsExistente = Number(existente.timestampInicio) || 0;
                if (tsNuevo > tsExistente) {
                    nuevoHistorial[claveNueva] = valorNuevo;
                    cambio = true;
                }
            } else {
                nuevoHistorial[claveNueva] = valorNuevo;
            }
        }

        const nuevasZonas = (parsed.zonas || []).map(z => {
            if (typeof z === "string" && z.includes("Botadero Este")) {
                cambio = true;
                return z.replace(/Botadero Este/g, "Oficinas Mina");
            }
            return z;
        });

        if (cambio) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                historial: nuevoHistorial,
                zonas: nuevasZonas
            }));
            console.log("[estado-cliente] Migración de Botadero Este → Oficinas Mina completada.");
        }
    } catch (e) {
        console.warn("Error migrando historial:", e);
    }
}

// FIX 4: devuelve null si la alerta no tiene timestampInicio válido
function claveAlerta(a) {
    const distrito = a.distrito;
    const ts = a.timestampInicio;
    if (!distrito || typeof ts !== "number" || !isFinite(ts) || ts <= 0) return null;
    return `${distrito}::${ts}`;
}

async function leerEstado() {
    const url = `${ESTADO_URL}?t=${Date.now()}`;
    const res = await fetch(url, {
        cache: "no-store",
        headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
}

async function ciclo() {
    // FIX 5: lock de reentrancia
    if (cliente.enCurso) {
        console.log("[estado-cliente] ciclo() ya en curso, se omite esta llamada.");
        return;
    }
    cliente.enCurso = true;

    try {
        let data;
        try {
            data = await leerEstado();
        } catch (e) {
            console.warn("estado-cliente: no se pudo leer estado.json:", e.message);
            if (primeraCarga) {
                primeraCarga = false;
                marcarArranqueListo("estado-cliente");
            }
            return;
        }

        const alertas = Array.isArray(data.alertas) ? data.alertas : [];
        const { historial, zonas } = cargarHistorial();
        const zonasVistas = new Set(zonas);
        const distritosActuales = new Set();

        // FASE 1 — Procesar alertas del scraper
        for (const a of alertas) {
            if (a.nivel !== "amarilla" && a.nivel !== "naranja" && a.nivel !== "roja") continue;
            if (!a.distrito) continue;

            const origenAlerta = a.origen || "keraunos";
            if (origenAlerta === "manual") continue;

            // FIX 4: saltar alertas sin timestampInicio válido
            const clave = claveAlerta(a);
            if (!clave) {
                console.warn("[estado-cliente] alerta sin timestampInicio válido, se omite:", a.distrito);
                continue;
            }

            distritosActuales.add(a.distrito);

            const anterior = historial[clave];
            const cambioNivel = anterior && anterior.nivel !== a.nivel;
            const cambioTimestamp = anterior && anterior.timestampInicio !== a.timestampInicio;
            const cambioDuracion = anterior && anterior.duracionMin !== a.duracionMin;
            const esNueva = primeraCarga || !anterior || cambioNivel || cambioTimestamp || cambioDuracion;

            if (esNueva) {
                historial[clave] = {
                    nivel: a.nivel,
                    timestampInicio: a.timestampInicio,
                    duracionMin: a.duracionMin,
                    distrito: a.distrito
                };
                zonasVistas.add(a.distrito);

                try {
                    await mostrarAlertaCompleta({
                        tipo:            "alerta",
                        nivel:           a.nivel,
                        titulo:          a.titulo,
                        mensaje:         a.mensaje,
                        distrito:        a.distrito,
                        lat:             a.lat,
                        lng:             a.lng,
                        duracionMin:     a.duracionMin,
                        timestampInicio: a.timestampInicio,
                        sectorOriginal:  a.sectorOriginal,
                        inicio:          a.inicio,
                        fin:             a.fin,
                        origen:          "scraper"
                    });
                } catch (e) {
                    console.error("estado-cliente: error mostrando alerta:", e);
                }
            }
        }

        // FASE 2 — Alertas resueltas
        const distritosResueltos = [];
        for (const d of zonasVistas) {
            if (!distritosActuales.has(d)) distritosResueltos.push(d);
        }

        for (const distrito of distritosResueltos) {
            zonasVistas.delete(distrito);
            try { await quitarAlerta(distrito); }
            catch (e) { console.error("estado-cliente: error quitando:", e); }
        }

        // FASE 3 — Si no hay zonas activas, mostrar libre (solo la primera vez)
        if (distritosActuales.size === 0 && zonasVistas.size === 0 && !cliente.cargado) {
            try { await mostrarAlertaLibre(); } catch {}
            cliente.cargado = true;
        }

        if (primeraCarga) {
            primeraCarga = false;
            marcarArranqueListo("estado-cliente");
        }

        guardarHistorial(historial, zonasVistas);
    } finally {
        cliente.enCurso = false;
    }
}

export function iniciarEstadoCliente(opciones = {}) {
    if (cliente.intervaloId !== null) return;

    const cfg = window.__APP_CONFIG__ || { usarEstadoJSON: true };

    if (!cfg.usarEstadoJSON) {
        console.log("[estado-cliente] desactivado en esta página (usarEstadoJSON=false)");
        marcarArranqueListo("estado-cliente");
        return;
    }

    // FIX 8: asignar modo ANTES de calcular el intervalo
    cliente.modo = opciones.modo || "index";
    const intervaloMs = calcularIntervaloMs();
    console.log(`estado-cliente: iniciado en modo "${cliente.modo}" (${intervaloMs / 1000}s)`);

    migrarHistorial();

    primeraCarga = true;
    ciclo();
    cliente.intervaloId = setInterval(ciclo, intervaloMs);

    // FIX 7: guardar referencia del handler para poder limpiarlo
    if (cliente.visibilityHandler) {
        document.removeEventListener("visibilitychange", cliente.visibilityHandler);
    }
    cliente.visibilityHandler = () => {
        if (document.visibilityState === "visible") {
            console.log("[estado-cliente] Pestaña visible: forzando sincronización inmediata.");
            ciclo();
            import("./map.js").then(mod => {
                if (mod && typeof mod.invalidateSize === "function") mod.invalidateSize();
            }).catch(() => {});
        }
    };
    document.addEventListener("visibilitychange", cliente.visibilityHandler);
}

export function detenerEstadoCliente() {
    if (cliente.intervaloId !== null) {
        clearInterval(cliente.intervaloId);
        cliente.intervaloId = null;
    }
    // FIX 7: limpiar el listener de visibilitychange
    if (cliente.visibilityHandler) {
        document.removeEventListener("visibilitychange", cliente.visibilityHandler);
        cliente.visibilityHandler = null;
    }
}

export function resetearHistorial() {
    try {
        // FIX 9: detener el intervalo para evitar que siga corriendo con estado inconsistente
        detenerEstadoCliente();
        localStorage.removeItem(STORAGE_KEY);
        cliente.historial = {};
        cliente.zonasVistas = new Set();
        cliente.cargado = false;
        cliente.enCurso = false;
        primeraCarga = true;
        console.log("estado-cliente: historial reseteado y cliente detenido.");
    } catch {}
}
