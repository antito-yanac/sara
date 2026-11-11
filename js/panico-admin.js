// js/panico-admin.js
// ============================================================
// Listener de solicitudes de pánico en admin.html
// v2: usa la colección privada `panico_solicitudes`.
// ============================================================

import { getFirestore, collection, onSnapshot,
         doc, updateDoc, serverTimestamp }
    from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { obtenerFirestore, obtenerApp } from "./firebase-app.js";
import { mostrarToast } from "./notifications.js";

const COLECCION_LEGADO = "panico_solicitudes"; // botón viejo (js/panico.js)
const COLECCION_SOS    = "panic_alerts";       // botón SOS registrado (js/boton-panico.js)

const MAX_TARJETAS = 30;
const documentos = new Map();
//------------------fin--------------------

let contenedor = null;

function asegurarContenedor() {
    if (document.getElementById("panico-admin-contenedor")) {
        contenedor = document.getElementById("panico-admin-contenedor");
        return contenedor;
    }
    contenedor = document.createElement("div");
    contenedor.id = "panico-admin-contenedor";
    document.body.appendChild(contenedor);
    return contenedor;
}

function crearTarjeta(doc) {
    const id = `panico-card-${doc.coleccion}-${doc.id}`;
    if (document.getElementById(id)) return;

    const card = document.createElement("div");
    card.id = id;
    card.className = doc.atendida ? "panico-card panico-card-atendida" : "panico-card";

    const fechaTxt = fechaTexto(doc.fechaMs);
    const precTxt = doc.precision ? ` (±${Math.round(doc.precision)}m)` : "";
    const mapsUrl = (doc.lat != null && doc.lng != null)
        ? `https://www.google.com/maps?q=${doc.lat},${doc.lng}`
        : null;

    card.innerHTML = `
        <div class="panico-card-header">
            <span class="panico-card-icono">🆘</span>
            <div>
                <div class="panico-card-sub">SOLICITUD DE AYUDA${doc.coleccion === COLECCION_SOS ? " · SOS REGISTRADO" : ""}</div>
                <div class="panico-card-hora">${escapeHtml(fechaTxt)}</div>
            </div>
            <button class="panico-card-cerrar" aria-label="Cerrar">×</button>
        </div>
        <div class="panico-card-body">
            <p><strong>🪪 DNI:</strong> ${escapeHtml(data.dni || "(no indicado)")}</p>
            <p><strong>📱 Teléfono:</strong> ${escapeHtml(doc.telefono)}</p>
            <p><strong>📝 Datos:</strong> ${escapeHtml(doc.descripcion)}</p>
            ${(doc.lat != null && doc.lng != null) ? `
                <p><strong>📍 Ubicación:</strong> ${doc.lat.toFixed(6)}, ${doc.lng.toFixed(6)}${escapeHtml(precTxt)}</p>
            ` : `
                <p><strong>📍 Ubicación:</strong> no disponible${doc.sinUbicacion ? " (GPS sin señal)" : ""}</p>
            `}
        </div>
          <div class="panico-card-acciones">
            ${mapsUrl ? `<a href="${mapsUrl}" target="_blank" class="panico-card-btn-mapa">📍 Ver en mapa</a>` : ""}
            ${doc.atendida ? `
                <button class="panico-card-btn-atender" disabled>✓ Atendido</button>
                <button class="panico-card-btn-finalizar">✔ SOS finalizado</button>
            ` : `
                <button class="panico-card-btn-atender">✓ Marcar como atendido</button>
            `}
        </div>
    `;

    card.querySelector(".panico-card-cerrar").addEventListener("click", () => {
        card.remove();
    });

    card.querySelector(".panico-card-btn-atender").addEventListener("click", async () => {
        try {
            const db = getFirestore(obtenerApp());
            if (doc.coleccion === COLECCION_SOS) {
                await updateDoc(doc(db, COLECCION_SOS, doc.id), {
                    estado: "atendida",
                    atendidaEn: serverTimestamp()
                });
            } else {
                await updateDoc(doc(db, COLECCION_LEGADO, doc.id), {
                    atendido: true,
                    atendidoEn: serverTimestamp()
                });
            }
         mostrarToast("✅ Atendido", "La solicitud fue marcada como atendida.", "exito", false);
            const n = documentos.get(doc.clave);
            if (n) n.atendida = true;
            renderizar(); // repinta la tarjeta en VERDE con el botón "SOS finalizado"
        } catch (e) {
            console.error("panico-admin: error marcando atendido", e);
            mostrarToast("⚠️ Error", "No se pudo marcar como atendido.", "alerta", true);
        }
    });
card.querySelector(".panico-card-btn-finalizar")?.addEventListener("click", async () => {
        const btn = card.querySelector(".panico-card-btn-finalizar");
        btn.disabled = true;
        btn.textContent = "...";
        try {
            const db = dbLegacy();
            if (doc.coleccion === COLECCION_SOS) {
                await updateDoc(doc(db, COLECCION_SOS, doc.id), {
                    estado: "finalizada",
                    finalizadaEn: serverTimestamp()
                });
            } else {
                await updateDoc(doc(db, COLECCION_LEGADO, doc.id), {
                    finalizado: true,
                    finalizadaEn: serverTimestamp()
                });
            }
            documentos.delete(doc.clave);
            renderizar(); // recién aquí desaparece la tarjeta verde
        } catch (e) {
            console.error("panico-admin: error finalizando", e);
            mostrarToast("⚠️ Error", "No se pudo finalizar la alerta.", "alerta", true);
            btn.disabled = false;
            btn.textContent = "✔ SOS finalizado";
        }
    });
    asegurarContenedor().appendChild(card);
}

function escapeHtml(txt) {
    return String(txt)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function millisDeFecha(d) {
    if (typeof d.fechaMs === "number") return d.fechaMs;
    if (d.timestamp?.toMillis) return d.timestamp.toMillis();
    if (d.fecha?.toMillis) return d.fecha.toMillis();
    if (d.cancelableHasta?.toMillis) return d.cancelableHasta.toMillis();
    return 0;
}

function normalizarSOS(id, d) {
    const ub = d.ubicacion || {};
    const parts = [];
    if (d.nombre)  parts.push(`👤 ${d.nombre}`);
    if (d.empresa) parts.push(`🏢 ${d.empresa}`);
    if (d.equipo && d.equipo !== "desconocido") parts.push(`📱 ${d.equipo}`);
    return {
        clave:      `${COLECCION_SOS}:${id}`,
        coleccion:  COLECCION_SOS,
        id,
        dni:        d.dni || "(no indicado)",
        telefono:   d.celular || "(no indicado)",
        descripcion: parts.length ? parts.join(" · ") : "(usuario registrado SOS)",
        lat:        typeof ub.lat === "number" ? ub.lat : null,
        lng:        typeof ub.lng === "number" ? ub.lng : null,
        precision:  typeof ub.precision === "number" ? ub.precision : null,
        sinUbicacion: d.ubicacionEstado === "no-disponible",
        atendida:   d.estado === "atendida",
        finalizada: d.estado === "finalizada" || d.estado === "cancelada",
        fechaMs:    millisDeFecha(d)
    };
}

function normalizarLegado(id, d) {
    return {
        clave:      `${COLECCION_LEGADO}:${id}`,
        coleccion:  COLECCION_LEGADO,
        id,
        dni:        d.dni || "(no indicado)",
        telefono:   d.telefono || "(no indicado)",
        descripcion: d.descripcion || "(sin descripción)",
        lat:        typeof d.lat === "number" ? d.lat : null,
        lng:        typeof d.lng === "number" ? d.lng : null,
        precision:  typeof d.accuracy === "number" ? d.accuracy : null,
        sinUbicacion: false,
         atendida:   d.atendido === true,
        finalizada: d.finalizado === true,
        fechaMs:    millisDeFecha(d)
    };
}

function renderizar() {
    const contenedor = asegurarContenedor();
    [...contenedor.querySelectorAll(".panico-card")].forEach(el => el.remove());

    const vivos = [...documentos.values()]
        .filter(d => !d.finalizada)
        .sort((a, b) => (b.fechaMs || 0) - (a.fechaMs || 0))
        .slice(0, MAX_TARJETAS);

    vivos.forEach(crearTarjeta);
}

function iniciarListener(coleccion, normalizar) {
    try {
        const db = getFirestore(obtenerApp());
        const ref = collection(db, coleccion);

        // Sin orderBy: evita índices compuestos y no excluye docs sin el campo fechaMs.
        onSnapshot(ref, (snapshot) => {
            snapshot.docChanges().forEach((cambio) => {
                const clave = `${coleccion}:${cambio.doc.id}`;
                if (cambio.type === "removed") {
                    documentos.delete(clave);
                    return;
                }
                const n = normalizar(cambio.doc.id, d);
                if (n.finalizada) {
                    documentos.delete(clave);
                } else {
                    documentos.set(clave, n);
                }
            });
            renderizar();
        }, (error) => {
            console.warn(`panico-admin: error listener ${coleccion}`, error);
        });

        console.log(`🆘 panico-admin: escuchando ${coleccion}`);
    } catch (e) {
        console.warn(`panico-admin: no se pudo iniciar ${coleccion}`, e);
    }
}

function init() {
    asegurarContenedor();
    iniciarListener(COLECCION_SOS, normalizarSOS);
    iniciarListener(COLECCION_LEGADO, normalizarLegado);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
