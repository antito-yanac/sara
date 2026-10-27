// ============================================================
//  adminkeraunos.js — Editor manual de estado.json
//  Cada zona tiene 3 niveles (amarilla/naranja/roja) con su
//  propia duración. Solo un nivel activo por zona a la vez.
// ============================================================

// ------------------------------------------------------------
//  Constantes
// ------------------------------------------------------------
const ESTADO_URL    = "./estado.json";
const TZ_OFFSET_MIN = -300;  // Perú UTC-5
const DURACION_DEF  = 15;

const NIVELES = {
    ROJA:     { numero: 3, color: "#FA5858", clase: "roja",     emoji: "🔴", label: "Roja" },
    NARANJA:  { numero: 2, color: "#FF8C00", clase: "naranja",  emoji: "🟠", label: "Naranja" },
    AMARILLA: { numero: 1, color: "#FFD400", clase: "amarilla", emoji: "🟡", label: "Amarilla" },
    VERDE:    { numero: 0, color: "#2ECC71", clase: "verde",    emoji: "🟢", label: "Verde" }
};

// Los 3 niveles que se pueden activar (el VERDE es el "apagado")
const NIVELES_ACTIVABLES = ["AMARILLA", "NARANJA", "ROJA"];

// Zonas fijas con sus nombres EXACTOS
const ZONAS = [
    {
        id: "campamento",
        nombreCorto: "Campamento Yanacancha",
        nombre: "Campamento Yanacancha - (Nuevo Campamento, Descarga Norte Presa Relaves, Polishing Pond, Garita Laguna Huallacocha, Garita plataforma km 114, Tailing Dam Norte - Punto Y, Garita Portón Principal, Grifo Yanacancha)",
        zona: "Zona 1 - Campamentos",
        lat: -9.5822364, lng: -77.0223100
    },
    {
        id: "oficinas",
        nombreCorto: "Oficinas Mina",
        nombre: "Oficinas Mina - (Grifo 4448, Punto E, Ingreso Laguna Seca, Nasa, Oficinas Mina, Concentradora, Plataforma Pre PM, Presa Relaves, Plataforma de Armado)",
        zona: "Zona 2 - Oficinas Mina",
        lat: -9.5718388, lng: -77.0447182
    },
    {
        id: "tucush",
        nombreCorto: "Tucush",
        nombre: "Tucush - (CTC Tucush, Truck Shop, Rosita de Oro, Taller eléctrico Mina, Polvorines 1 y 2, Botadero Tucush, Espaldón de Presa)",
        zona: "Zona 3 - Tucush",
        lat: -9.5263487, lng: -77.0485794
    },
    {
        id: "tajo",
        nombreCorto: "Tajo",
        nombre: "Tajo - (Fase 7-8-9-10, Rampa Sur, Quebrada Antamina, Chancadora primaria)",
        zona: "Zona 4 - Tajo",
        lat: -9.5416465, lng: -77.0707659
    }
];

// ------------------------------------------------------------
//  Borrador editable:
//  { zonaId: { AMARILLA: {activo, min}, NARANJA: {activo, min}, ROJA: {activo, min} } }
// ------------------------------------------------------------
const borrador = {};

function initBorrador() {
    ZONAS.forEach(z => {
        borrador[z.id] = {};
        NIVELES_ACTIVABLES.forEach(n => {
            borrador[z.id][n] = { activo: false, min: DURACION_DEF };
        });
    });
}
initBorrador();

// ------------------------------------------------------------
//  Utilidades de fecha (formato Perú YYYY-MM-DD HH:MM:SS)
// ------------------------------------------------------------
const pad = (n) => String(n).padStart(2, "0");

function fechaPeru(date = new Date()) {
    const ms = date.getTime() + TZ_OFFSET_MIN * 60000;
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
           `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function sumarMinutos(fechaStr, minutos) {
    const [f, h] = fechaStr.split(" ");
    const [Y, M, D] = f.split("-").map(Number);
    const [H, Mi, S] = h.split(":").map(Number);
    const utcMs = Date.UTC(Y, M - 1, D, H, Mi, S) - TZ_OFFSET_MIN * 60000;
    const fin = new Date(utcMs + minutos * 60000);
    return fechaPeru(fin);
}

function parseFechaPeru(str) {
    if (!str) return NaN;
    const [f, h] = str.split(" ");
    const [Y, M, D] = f.split("-").map(Number);
    const [H, Mi, S] = h.split(":").map(Number);
    return Date.UTC(Y, M - 1, D, H, Mi, S) - TZ_OFFSET_MIN * 60000;
}

/** Devuelve el nivel activo de una zona o "VERDE" */
function nivelActivoDeZona(zonaId) {
    for (const n of NIVELES_ACTIVABLES) {
        if (borrador[zonaId][n].activo) return n;
    }
    return "VERDE";
}

/** Devuelve la duración del nivel activo de una zona (o 0) */
function duracionDeZona(zonaId) {
    for (const n of NIVELES_ACTIVABLES) {
        if (borrador[zonaId][n].activo) return borrador[zonaId][n].min;
    }
    return 0;
}

// ------------------------------------------------------------
//  Construcción del estado.json (idéntica a guardarJSON de monitor.js)
// ------------------------------------------------------------
function construirEstado() {
    const ahora = fechaPeru();

    const sectores = ZONAS.map(z => {
        const nivel = nivelActivoDeZona(z.id);
        const info = NIVELES[nivel];

        let inicio = ahora;
        let fin = null;

        if (nivel !== "VERDE") {
            const min = duracionDeZona(z.id);
            fin = sumarMinutos(inicio, min);
        }

        return {
            nombre: z.nombre,
            nivel,
            nivelNumero: info.numero,
            color: info.color,
            inicio,
            fin
        };
    });

    // Estado global (nivel máximo)
    let estadoGlobal = "VERDE", max = 0;
    for (const s of sectores) {
        if (s.nivelNumero > max) { max = s.nivelNumero; estadoGlobal = s.nivel; }
    }

    // Alertas derivadas
    const alertas = [];
    for (const s of sectores) {
        if (s.nivel === "VERDE") continue;
        const z = ZONAS.find(x => x.nombre === s.nombre);
        if (!z) continue;

        const info = NIVELES[s.nivel];
        const timestampInicio = parseFechaPeru(s.inicio);
        const duracionMin = Math.max(1, Math.round((parseFechaPeru(s.fin) - timestampInicio) / 60000));

        alertas.push({
            sectorOriginal: s.nombre,
            nivelScraper:   s.nivel,
            nivel:          s.nivel.toLowerCase(),
            distrito:       z.zona,
            lat:            z.lat,
            lng:            z.lng,
            duracionMin,
            timestampInicio,
            inicio:         s.inicio,
            fin:            s.fin,
            color:          s.color,
            emoji:          info.emoji,
            titulo:  `⚡ ALERTA ${s.nivel} — ${z.zona}`,
            mensaje: `Actividad eléctrica detectada en ${z.zona}. Nivel ${s.nivel}. ` +
                     `Inicio: ${s.inicio}. Fin previsto: ${s.fin}.`
        });
    }

    // Resumen
    const resumen = {
        roja:     sectores.filter(s => s.nivel === "ROJA").length,
        naranja:  sectores.filter(s => s.nivel === "NARANJA").length,
        amarilla: sectores.filter(s => s.nivel === "AMARILLA").length,
        verde:    sectores.filter(s => s.nivel === "VERDE").length
    };

    return {
        actualizado: new Date().toISOString(),
        estadoGlobal,
        estadoGlobalNumero: NIVELES[estadoGlobal].numero,
        totalSectores: sectores.length,
        resumen,
        sectores,
        alertas
    };
}

// ------------------------------------------------------------
//  Render de zonas (cada zona con sus 3 niveles)
// ------------------------------------------------------------
function renderZonas() {
    const cont = document.getElementById("pa-zonas-lista");
    cont.innerHTML = "";

    ZONAS.forEach(z => {
        const nivelActivo = nivelActivoDeZona(z.id);
        const infoActivo = NIVELES[nivelActivo];

        const card = document.createElement("div");
        card.className = "pa-zona-card";
        if (nivelActivo !== "VERDE") card.classList.add("pa-zona-" + infoActivo.clase);

        card.innerHTML = `
            <div class="pa-zona-header">
                <div class="pa-zona-titulo">${escapeHtml(z.nombreCorto)}</div>
                <div class="pa-zona-estado ${nivelActivo !== "VERDE" ? "pa-estado-" + infoActivo.clase : ""}">
                    ${infoActivo.emoji} ${infoActivo.label}
                </div>
            </div>
            <div class="pa-zona-niveles">
                ${NIVELES_ACTIVABLES.map(n => {
                    const info = NIVELES[n];
                    const cfg = borrador[z.id][n];
                    return `
                        <div class="pa-nivel-row ${cfg.activo ? "pa-nivel-activo pa-nivel-" + info.clase : ""}"
                             data-zona="${z.id}" data-nivel="${n}">
                            <button type="button" class="pa-nivel-check ${cfg.activo ? "pa-on" : ""}"
                                    data-zona="${z.id}" data-nivel="${n}">
                                ${cfg.activo ? "✓" : ""}
                            </button>
                            <div class="pa-nivel-label">
                                ${info.emoji} ${info.label}
                            </div>
                            <div class="pa-nivel-min ${cfg.activo ? "" : "pa-disabled"}">
                                <input type="number" min="1" max="1440" value="${cfg.min}"
                                       data-zona="${z.id}" data-nivel="${n}" data-rol="min"
                                       ${cfg.activo ? "" : "disabled"}>
                                <span>min</span>
                            </div>
                        </div>
                    `;
                }).join("")}
            </div>
        `;

        // Evento: click en checkbox de nivel
        card.querySelectorAll(".pa-nivel-check").forEach(btn => {
            btn.addEventListener("click", () => {
                const zid = btn.dataset.zona;
                const nivel = btn.dataset.nivel;
                const cfg = borrador[zid][nivel];

                if (cfg.activo) {
                    // Desactivar
                    cfg.activo = false;
                } else {
                    // Activar: desactivar los otros niveles de la misma zona
                    NIVELES_ACTIVABLES.forEach(n => {
                        borrador[zid][n].activo = (n === nivel);
                    });
                }

                renderZonas();
                actualizarResumen();
            });
        });

        // Evento: input de minutos
        card.querySelectorAll('input[data-rol="min"]').forEach(inp => {
            inp.addEventListener("input", (e) => {
                const zid = inp.dataset.zona;
                const nivel = inp.dataset.nivel;
                const v = Math.max(1, Math.min(1440, parseInt(e.target.value, 10) || DURACION_DEF));
                borrador[zid][nivel].min = v;
                actualizarResumen();
            });
        });

        cont.appendChild(card);
    });
}

// ------------------------------------------------------------
//  Resumen en vivo
// ------------------------------------------------------------
function actualizarResumen() {
    const activas = [];
    ZONAS.forEach(z => {
        const nivel = nivelActivoDeZona(z.id);
        if (nivel !== "VERDE") {
            activas.push({
                zona: z.nombreCorto,
                nivel,
                min: duracionDeZona(z.id)
            });
        }
    });

    const el = document.getElementById("pa-resumen");

    if (!activas.length) {
        el.classList.remove("pa-visible");
        el.innerHTML = "";
        return;
    }

    el.classList.add("pa-visible");

    const cnt = { roja: 0, naranja: 0, amarilla: 0, verde: 0 };
    ZONAS.forEach(z => {
        cnt[NIVELES[nivelActivoDeZona(z.id)].clase]++;
    });

    let globalNivel = "VERDE", globalNum = 0;
    ZONAS.forEach(z => {
        const n = nivelActivoDeZona(z.id);
        if (NIVELES[n].numero > globalNum) {
            globalNum = NIVELES[n].numero;
            globalNivel = n;
        }
    });

    const g = NIVELES[globalNivel];

    const items = activas.map(a => {
        const info = NIVELES[a.nivel];
        return `<div>${info.emoji} <strong>${escapeHtml(a.zona)}</strong> · ${info.label} · ${a.min} min</div>`;
    }).join("");

    el.innerHTML = `
        <strong>📊 Resumen (${activas.length} zona${activas.length > 1 ? "s" : ""} activa${activas.length > 1 ? "s" : ""})</strong>
        <div style="margin-top:6px;">${items}</div>
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);">
            Global: ${g.emoji} <strong>${g.label}</strong> ·
            🔴 ${cnt.roja} · 🟠 ${cnt.naranja} · 🟡 ${cnt.amarilla} · 🟢 ${cnt.verde}
        </div>
    `;
}

// ------------------------------------------------------------
//  Acciones
// ------------------------------------------------------------
function resetearTodo() {
    confirmar(
        "Resetear a VERDE",
        `¿Desactivar TODOS los niveles y dejar las 4 zonas en VERDE?`,
        () => {
            ZONAS.forEach(z => {
                NIVELES_ACTIVABLES.forEach(n => {
                    borrador[z.id][n].activo = false;
                });
            });
            renderZonas();
            actualizarResumen();
            escribirStatus("✅ Todo reseteado a VERDE");
        }
    );
}

function descargarJSON() {
    const estado = construirEstado();
    const json = JSON.stringify(estado, null, 2);

    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "estado.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    escribirStatus("✅ estado.json descargado. Súbelo a GitHub Pages.");
}

async function copiarJSON() {
    const estado = construirEstado();
    const json = JSON.stringify(estado, null, 2);
    try {
        await navigator.clipboard.writeText(json);
        escribirStatus("✅ JSON copiado al portapapeles");
    } catch (e) {
        escribirStatus("❌ No se pudo copiar. Usa 'Descargar'.", "err");
    }
}

// ------------------------------------------------------------
//  Vista previa del JSON
// ------------------------------------------------------------
function togglePreview() {
    const campos = document.getElementById("pa-mi-campos");
    const toggle = document.getElementById("pa-mi-toggle");
    const visible = campos.style.display !== "none";

    if (visible) {
        campos.style.display = "none";
        toggle.textContent = "▸ 👁️ Vista previa del JSON (opcional)";
    } else {
        campos.style.display = "block";
        toggle.textContent = "▾ 👁️ Vista previa del JSON (opcional)";
        const estado = construirEstado();
        document.getElementById("pa-json-preview").textContent = JSON.stringify(estado, null, 2);
    }
}

// ------------------------------------------------------------
//  Cargar estado.json inicial (si existe)
// ------------------------------------------------------------
async function cargarEstado() {
    const dot = document.getElementById("pa-dot");
    const txt = document.getElementById("pa-carga-texto");

    try {
        const res = await fetch(`${ESTADO_URL}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();

        // Inicializar borrador desde el JSON existente
        ZONAS.forEach(z => {
            const sec = (data.sectores || []).find(s => s.nombre === z.nombre);
            if (sec && sec.nivel !== "VERDE") {
                const nivel = sec.nivel;
                if (NIVELES_ACTIVABLES.includes(nivel)) {
                    borrador[z.id][nivel].activo = true;
                    if (sec.inicio && sec.fin) {
                        const min = Math.max(1, Math.round(
                            (parseFechaPeru(sec.fin) - parseFechaPeru(sec.inicio)) / 60000
                        ));
                        borrador[z.id][nivel].min = min;
                    }
                }
            }
        });

        dot.className = "pa-dot pa-ok";
        txt.textContent = `estado.json cargado (${data.actualizado || "sin fecha"})`;
        escribirStatus("✅ estado.json cargado");
    } catch (e) {
        console.warn("No se pudo cargar estado.json:", e);
        dot.className = "pa-dot pa-err";
        txt.textContent = "estado.json no encontrado — se iniciará desde VERDE";
        escribirStatus("⚠️ No se cargó estado.json (se creará uno nuevo)", "warn");
    }

    renderZonas();
    actualizarResumen();
}

// ------------------------------------------------------------
//  UI helpers
// ------------------------------------------------------------
function escribirStatus(msg, tipo = "ok") {
    const el = document.getElementById("status-bar");
    el.textContent = msg;
    el.className = "status-bar status-" + tipo;
    clearTimeout(escribirStatus._t);
    escribirStatus._t = setTimeout(() => {
        el.textContent = "";
        el.className = "status-bar";
    }, 6000);
}

function escapeHtml(txt) {
    return String(txt || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ------------------------------------------------------------
//  Modal de confirmación
// ------------------------------------------------------------
function confirmar(titulo, mensajeHtml, onAceptar) {
    const modal = document.getElementById("modal-confirm");
    document.getElementById("modal-titulo").textContent = titulo;
    document.getElementById("modal-mensaje").innerHTML = mensajeHtml;
    document.getElementById("modal-icon").textContent = "❓";
    modal.classList.add("modal-visible");

    const btnA = document.getElementById("modal-btn-aceptar");
    const btnC = document.getElementById("modal-btn-cancelar");
    const nuevoA = btnA.cloneNode(true);
    const nuevoC = btnC.cloneNode(true);
    btnA.replaceWith(nuevoA);
    btnC.replaceWith(nuevoC);

    const cerrar = () => modal.classList.remove("modal-visible");
    nuevoC.addEventListener("click", cerrar);
    nuevoA.addEventListener("click", () => {
        cerrar();
        try { onAceptar(); }
        catch (e) { escribirStatus("❌ Error: " + e.message, "err"); }
    });
}

// ------------------------------------------------------------
//  Arranque
// ------------------------------------------------------------
document.getElementById("pa-btn-descargar").addEventListener("click", descargarJSON);
document.getElementById("pa-btn-copiar").addEventListener("click", copiarJSON);
document.getElementById("pa-btn-reset").addEventListener("click", resetearTodo);
document.getElementById("pa-mi-toggle").addEventListener("click", togglePreview);

cargarEstado();
