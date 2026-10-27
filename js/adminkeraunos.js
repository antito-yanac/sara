// ============================================================
//  adminkeraunos.js — Lógica del panel manual
//  Replica la estructura de estado.json que genera monitor.js
//  pero alimentado manualmente por el usuario.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getDatabase, ref, set, get, update, remove, onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import {
    FIREBASE_CONFIG, PATHS,
    SECTORES_ESPERADOS, MAPA_ZONAS, COORDENADAS_ZONAS,
    NIVELES, TZ_OFFSET_MIN, DURACION_DEFAULT_MIN
} from "./config2.js";

// ------------------------------------------------------------
//  Init Firebase
// ------------------------------------------------------------
const app = initializeApp(FIREBASE_CONFIG);
const db  = getDatabase(app);
const refComando  = ref(db, PATHS.COMANDO);
const refSnapshot = ref(db, PATHS.SNAPSHOT);

// ------------------------------------------------------------
//  Estado local
// ------------------------------------------------------------
const borrador = {};   // { zonaClave: { nivel, duracionMin } }
let snapshotActual = null;

// ------------------------------------------------------------
//  Utilidades de fecha (idénticas a monitor.js)
// ------------------------------------------------------------
const pad = (n) => String(n).padStart(2, "0");

/** Devuelve "YYYY-MM-DD HH:MM:SS" en hora Perú (UTC-5) */
function fechaPeru(date = new Date()) {
    const ms = date.getTime() + TZ_OFFSET_MIN * 60000;
    const d  = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
           `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** Suma N minutos a una fecha "YYYY-MM-DD HH:MM:SS" (hora Perú) */
function sumarMinutos(fechaStr, minutos) {
    const [f, h] = fechaStr.split(" ");
    const [Y, M, D] = f.split("-").map(Number);
    const [H, Mi, S] = h.split(":").map(Number);
    const utcMs = Date.UTC(Y, M - 1, D, H, Mi, S) - TZ_OFFSET_MIN * 60000;
    const fin = new Date(utcMs + minutos * 60000);
    return fechaPeru(fin);
}

/** Formatea "HH:MM:SS" restante hasta `finStr` (o "—") */
function restanteHasta(finStr) {
    if (!finStr) return "—";
    const [f, h] = finStr.split(" ");
    const [Y, M, D] = f.split("-").map(Number);
    const [H, Mi, S] = h.split(":").map(Number);
    const finMs  = Date.UTC(Y, M - 1, D, H, Mi, S) - TZ_OFFSET_MIN * 60000;
    const ahoraMs = Date.now() + TZ_OFFSET_MIN * 60000;
    const diff = finMs - (Date.now());
    if (diff <= 0) return "00:00";
    const seg = Math.floor(diff / 1000);
    return `${pad(Math.floor(seg / 3600))}:${pad(Math.floor((seg % 3600) / 60))}:${pad(seg % 60)}`;
}

// ------------------------------------------------------------
//  Estructura de estado (idéntica a guardarJSON de monitor.js)
// ------------------------------------------------------------
function construirEstado(sectores) {
    // 1) Estado global = nivel máximo
    let estadoGlobal = "VERDE", max = 0;
    for (const s of sectores) {
        if (s.nivelNumero > max) { max = s.nivelNumero; estadoGlobal = s.nivel; }
    }

    // 2) Alertas derivadas (sectores con nivel != VERDE)
    const alertas = [];
    for (const s of sectores) {
        if (s.nivel === "VERDE") continue;
        const zona = buscarZonaPorNombre(s.nombre);
        if (!zona) continue;
        const coords = COORDENADAS_ZONAS[zona] || {};

        // duracionMin = fin - inicio (en minutos)
        let duracionMin = DURACION_DEFAULT_MIN;
        let timestampInicio = Date.now();
        if (s.inicio && s.fin) {
            duracionMin = Math.max(1, Math.round(
                (parseFechaPeru(s.fin) - parseFechaPeru(s.inicio)) / 60000
            ));
            timestampInicio = parseFechaPeru(s.inicio);
        }

        alertas.push({
            sectorOriginal: s.nombre,
            nivelScraper:   s.nivel,
            nivel:          s.nivel.toLowerCase(),
            distrito:       zona,
            lat:            coords.lat ?? null,
            lng:            coords.lng ?? null,
            duracionMin,
            timestampInicio,
            inicio:         s.inicio || null,
            fin:            s.fin    || null,
            color:          s.color,
            emoji:          s.emoji,
            titulo:  `⚡ ALERTA ${s.nivel} — ${s.nombre}`,
            mensaje: `Actividad eléctrica detectada en ${s.nombre} (${zona}). ` +
                     `Nivel ${s.nivel}.` +
                     (s.inicio ? ` Inicio: ${s.inicio}.` : "") +
                     (s.fin    ? ` Fin previsto: ${s.fin}.` : "")
        });
    }

    return {
        actualizado:        new Date().toISOString(),
        estadoGlobal,
        estadoGlobalNumero: NIVELES[estadoGlobal].numero,
        totalSectores:      sectores.length,
        resumen: {
            roja:     sectores.filter(s => s.nivel === "ROJA").length,
            naranja:  sectores.filter(s => s.nivel === "NARANJA").length,
            amarilla: sectores.filter(s => s.nivel === "AMARILLA").length,
            verde:    sectores.filter(s => s.nivel === "VERDE").length
        },
        sectores: sectores.map(s => ({
            nombre: s.nombre, nivel: s.nivel, nivelNumero: s.nivelNumero,
            color: s.color, inicio: s.inicio, fin: s.fin
        })),
        alertas
    };
}

function buscarZonaPorNombre(nombre) {
    for (const clave of Object.keys(MAPA_ZONAS)) {
        if (nombre.includes(clave)) return MAPA_ZONAS[clave];
    }
    return null;
}

function parseFechaPeru(str) {
    const [f, h] = str.split(" ");
    const [Y, M, D] = f.split("-").map(Number);
    const [H, Mi, S] = h.split(":").map(Number);
    return Date.UTC(Y, M - 1, D, H, Mi, S) - TZ_OFFSET_MIN * 60000;
}

// ------------------------------------------------------------
//  Render de tarjetas
// ------------------------------------------------------------
function renderTarjetas() {
    const cont = document.getElementById("pa-na-lista");
    cont.innerHTML = "";

    SECTORES_ESPERADOS.forEach((nombre) => {
        const b = borrador[nombre] || { nivel: "VERDE", duracionMin: DURACION_DEFAULT_MIN };
        const nivelInfo = NIVELES[b.nivel];

        const card = document.createElement("div");
        card.className = "pa-na-card";
        if (b.nivel !== "VERDE") card.classList.add("pa-activa-" + nivelInfo.clase);
        card.dataset.zona = nombre;

        card.innerHTML = `
            <div class="pa-na-row1">
                <div class="pa-na-check ${b.nivel !== "VERDE" ? "pa-on" : ""}">
                    ${b.nivel !== "VERDE" ? "✓" : ""}
                </div>
                <div class="pa-na-nombre" title="${nombre}">${nombre}</div>
            </div>
            <div class="pa-na-row2">
                <div class="pa-pill-group">
                    ${["AMARILLA","NARANJA","ROJA"].map(k => {
                        const n = NIVELES[k];
                        const sel = b.nivel === k ? `pa-sel-${n.clase}` : "";
                        return `<button type="button" class="pa-pill ${sel}" data-nivel="${k}">
                            ${n.emoji} ${n.label}
                        </button>`;
                    }).join("")}
                    <button type="button" class="pa-pill ${b.nivel === "VERDE" ? "pa-sel-verde" : ""}"
                            data-nivel="VERDE">⚪ Sin</button>
                </div>
                <div class="pa-duracion-wrap ${b.nivel === "VERDE" ? "pa-disabled" : ""}">
                    <input type="number" min="1" max="1440" value="${b.duracionMin}"
                           data-rol="duracion" ${b.nivel === "VERDE" ? "disabled" : ""}>
                    <span>min</span>
                </div>
            </div>
        `;

        // Eventos
        card.querySelectorAll(".pa-pill").forEach(btn => {
            btn.addEventListener("click", () => {
                const nivel = btn.dataset.nivel;
                borrador[nombre] = {
                    nivel,
                    duracionMin: (borrador[nombre]?.duracionMin) || DURACION_DEFAULT_MIN
                };
                renderTarjetas();
                actualizarResumen();
            });
        });

        const inputDur = card.querySelector('input[data-rol="duracion"]');
        if (inputDur) {
            inputDur.addEventListener("input", (e) => {
                const v = Math.max(1, Math.min(1440, parseInt(e.target.value, 10) || DURACION_DEFAULT_MIN));
                borrador[nombre] = { ...borrador[nombre], duracionMin: v };
                actualizarResumen();
            });
        }

        cont.appendChild(card);
    });
}

// ------------------------------------------------------------
//  Resumen en vivo (antes de enviar)
// ------------------------------------------------------------
function actualizarResumen() {
    const elegidos = SECTORES_ESPERADOS
        .map(n => ({ nombre: n, ...(borrador[n] || { nivel: "VERDE", duracionMin: DURACION_DEFAULT_MIN }) }))
        .filter(x => x.nivel !== "VERDE");

    const resumenEl = document.getElementById("pa-resumen");
    const btnEnviar  = document.getElementById("pa-btn-enviar");

    if (!elegidos.length) {
        resumenEl.classList.remove("pa-visible");
        btnEnviar.disabled = true;
        return;
    }
    resumenEl.classList.add("pa-visible");
    btnEnviar.disabled = false;

    const cnt = { roja: 0, naranja: 0, amarilla: 0 };
    elegidos.forEach(e => { cnt[NIVELES[e.nivel].clase]++; });

    let globalNivel = "VERDE", globalNum = 0;
    elegidos.forEach(e => {
        if (NIVELES[e.nivel].numero > globalNum) {
            globalNum = NIVELES[e.nivel].numero;
            globalNivel = e.nivel;
        }
    });

    const g = NIVELES[globalNivel];
    resumenEl.innerHTML = `
        <strong>📊 Resumen (${elegidos.length} sector${elegidos.length > 1 ? "es" : ""})</strong><br>
        Global: ${g.emoji} <strong>${g.label}</strong> ·
        🔴 ${cnt.roja} · 🟠 ${cnt.naranja} · 🟡 ${cnt.amarilla}
    `;
}

// ------------------------------------------------------------
//  Sección "Alertas activas" (lee /comando)
// ------------------------------------------------------------
function renderAlertasActivas(comando) {
    const activas = Object.entries(comando || {})
        .filter(([, v]) => v && v.activo && v.nivel && v.nivel !== "VERDE");

    const sec = document.getElementById("pa-aa-section");
    const lista = document.getElementById("pa-aa-lista");
    const count = document.getElementById("pa-aa-count");

    if (!activas.length) {
        sec.style.display = "none";
        return;
    }
    sec.style.display = "block";
    count.textContent = `(${activas.length})`;
    lista.innerHTML = "";

    activas.forEach(([zona, v]) => {
        const info = NIVELES[v.nivel];
        const finStr = v.timestampLanzado
            ? sumarMinutos(fechaPeru(new Date(v.timestampLanzado)), v.duracionMin)
            : null;

        const item = document.createElement("div");
        item.className = "pa-aa-item pa-nivel-" + info.clase;
        item.innerHTML = `
            <div class="pa-aa-icono">${info.emoji}</div>
            <div class="pa-aa-info">
                <div class="pa-aa-nombre">${zona}</div>
                <div class="pa-aa-meta">
                    <span>${info.label}</span>
                    <span>· vence ${finStr || "—"}</span>
                    <span class="pa-aa-restante">${restanteHasta(finStr)}</span>
                </div>
            </div>
            <button type="button" class="pa-aa-btn-liberar" data-zona="${zona}">
                Liberar
            </button>
        `;
        item.querySelector(".pa-aa-btn-liberar").addEventListener("click", () => liberarZona(zona));
        lista.appendChild(item);
    });
}

// ------------------------------------------------------------
//  Acciones
// ------------------------------------------------------------
async function liberarZona(zona) {
    confirmar(
        "Liberar alerta",
        `¿Liberar la alerta de <strong>${zona}</strong>?`,
        async () => {
            await set(ref(db, `${PATHS.COMANDO}/${zona}`), { activo: false });
            await escribirStatus(`✅ Alerta liberada: ${zona}`);
        }
    );
}

async function liberarTodas() {
    confirmar(
        "Liberar todas",
        `¿Liberar <strong>todas</strong> las alertas activas?`,
        async () => {
            const updates = {};
            SECTORES_ESPERADOS.forEach(z => { updates[z] = { activo: false }; });
            await update(refComando, updates);
            await escribirStatus("✅ Todas las alertas liberadas");
        }
    );
}

async function enviarAlertas() {
    const elegidos = SECTORES_ESPERADOS.filter(n => borrador[n] && borrador[n].nivel !== "VERDE");
    if (!elegidos.length) return;

    confirmar(
        "Enviar alertas",
        `¿Enviar <strong>${elegidos.length}</strong> alerta(s)?<br><br>` +
        elegidos.map(n => {
            const b = borrador[n];
            return `• ${NIVELES[b.nivel].emoji} <strong>${n}</strong> — ${b.duracionMin} min`;
        }).join("<br>"),
        async () => {
            const ahora = Date.now();
            const updates = {};
            SECTORES_ESPERADOS.forEach(z => {
                const b = borrador[z];
                if (b && b.nivel !== "VERDE") {
                    updates[z] = {
                        nivel: b.nivel,
                        duracionMin: b.duracionMin,
                        timestampLanzado: ahora,
                        activo: true
                    };
                } else {
                    updates[z] = { activo: false };
                }
            });
            await update(refComando, updates);
            await escribirStatus("✅ Alertas enviadas a Firebase");
        }
    );
}

async function resetearTodo() {
    confirmar(
        "Resetear a VERDE",
        `¿Poner <strong>todos</strong> los sectores en VERDE y liberar alertas?`,
        async () => {
            const updates = {};
            SECTORES_ESPERADOS.forEach(z => { updates[z] = { activo: false, nivel: "VERDE" }; });
            await update(refComando, updates);
            borrador.length = 0;
            SECTORES_ESPERADOS.forEach(z => delete borrador[z]);
            renderTarjetas();
            actualizarResumen();
            await escribirStatus("✅ Todo reseteado a VERDE");
        }
    );
}

// ------------------------------------------------------------
//  Construye snapshot y lo publica en /estadoSnapshot
//  (se ejecuta cada vez que cambia /comando)
// ------------------------------------------------------------
async function publicarSnapshot(comando) {
    const ahora = Date.now();
    const sectores = SECTORES_ESPERADOS.map(nombre => {
        const cmd = comando?.[nombre];
        let nivel = "VERDE", inicio = null, fin = null;

        if (cmd && cmd.activo && cmd.nivel && cmd.nivel !== "VERDE") {
            nivel = cmd.nivel;
            inicio = fechaPeru(new Date(cmd.timestampLanzado || ahora));
            fin = sumarMinutos(inicio, cmd.duracionMin || DURACION_DEFAULT_MIN);
        }

        const info = NIVELES[nivel];
        return {
            nombre,
            nivel,
            nivelNumero: info.numero,
            color:       info.color,
            inicio,
            fin
        };
    });

    const estado = construirEstado(sectores);
    await set(refSnapshot, estado);
    snapshotActual = estado;
    renderAlertasActivas(comando);
    return estado;
}

// ------------------------------------------------------------
//  Suscripción en tiempo real a /comando
// ------------------------------------------------------------
onValue(refComando, async (snap) => {
    const comando = snap.val() || {};
    try {
        await publicarSnapshot(comando);
        await escribirStatus("✅ Sincronizado con Firebase", "ok");
        setEstadoConexion(true);
    } catch (e) {
        await escribirStatus("⚠️ Error publicando snapshot: " + e.message, "err");
        setEstadoConexion(false);
    }
}, (error) => {
    setEstadoConexion(false);
    escribirStatus("❌ Error Firebase: " + error.message, "err");
});

// ------------------------------------------------------------
//  UI helpers
// ------------------------------------------------------------
function setEstadoConexion(ok) {
    const dot = document.getElementById("pa-fb-dot");
    const txt = document.getElementById("pa-fb-text");
    dot.className = "pa-dot " + (ok ? "pa-ok" : "pa-err");
    txt.textContent = ok ? "Conectado a Firebase RTDB" : "Sin conexión a Firebase";
}

function escribirStatus(msg, tipo = "ok") {
    const el = document.getElementById("status-bar");
    el.textContent = msg;
    el.className = "status-bar status-" + tipo;
    clearTimeout(escribirStatus._t);
    escribirStatus._t = setTimeout(() => {
        el.textContent = "";
        el.className = "status-bar";
    }, 5000);
}

// ------------------------------------------------------------
//  Modal de confirmación
// ------------------------------------------------------------
function confirmar(titulo, mensajeHtml, onAceptar) {
    const modal = document.getElementById("modal-confirm");
    document.getElementById("modal-titulo").textContent = titulo;
    document.getElementById("modal-mensaje").innerHTML = mensajeHtml;
    document.getElementById("modal-icon").textContent = "❓";

    const cerrar = () => modal.classList.remove("modal-visible");
    modal.classList.add("modal-visible");

    const btnA = document.getElementById("modal-btn-aceptar");
    const btnC = document.getElementById("modal-btn-cancelar");
    const nuevoA = btnA.cloneNode(true);
    const nuevoC = btnC.cloneNode(true);
    btnA.replaceWith(nuevoA);
    btnC.replaceWith(nuevoC);

    nuevoC.addEventListener("click", cerrar);
    nuevoA.addEventListener("click", async () => {
        cerrar();
        try { await onAceptar(); }
        catch (e) { escribirStatus("❌ Error: " + e.message, "err"); }
    });
}

// ------------------------------------------------------------
//  Arranque
// ------------------------------------------------------------
document.getElementById("pa-btn-enviar").addEventListener("click", enviarAlertas);
document.getElementById("pa-btn-liberar-todas").addEventListener("click", liberarTodas);
document.getElementById("pa-btn-reset").addEventListener("click", resetearTodo);

// Tick cada segundo para refrescar contadores de restante
setInterval(() => {
    get(refComando).then(s => renderAlertasActivas(s.val() || {}));
}, 1000);

renderTarjetas();
actualizarResumen();