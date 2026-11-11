// js/recursos-admin.js
// ============================================================
// GESTIÓN DE RECURSOS DE EMERGENCIA (panel administrador.html)
// v1 — se inyecta como overlay con 3 pestañas:
//   1) RESCATISTAS: autorizar / rechazar / desactivar personal.
//   2) AMBULANCIAS: autorizar unidades registradas + alta manual.
//   3) CENTRAL SOS: emergencias pendientes (panic_alerts),
//      asignar rescatista + ambulancia y seguir la atención.
// Seguridad:
//   - El rescatista/ambulancia se registra y queda 'pendiente';
//     SOLO el admin lo autoriza (campo estado/estadoDoc).
//   - Se guarda asignadoPor en cada asignación hecha por central.
// ============================================================

import { obtenerFirestore, obtenerApp } from "./firebase-app.js";
import { mostrarToast } from "./notifications.js";
import {
    collection, doc, getDoc, addDoc, updateDoc, onSnapshot,
    query, where, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const db = obtenerFirestore(obtenerApp());

const COL_RES  = "rescatistas";
const COL_AMB  = "ambulancias";
const COL_SOS  = "panic_alerts";
const COL_ASIG = "asignaciones_sos";

const ESTADOS_ACTIVOS = ["asignada", "aceptada", "en_camino", "en_lugar"];

const rescatistas = new Map();
const ambulancias = new Map();
const sosPendientes = new Map();
const asignaciones = new Map();

let sosSeleccionada = null;

/* ---------------- utilidades ---------------- */

function esc(t) {
    return String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function haceMin(ts) {
    if (!ts) return "sin GPS";
    const m = Math.round((Date.now() - ts) / 60000);
    return m <= 0 ? "ahora" : `hace ${m} min`;
}
function hora(ms) {
    return ms ? new Date(ms).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "--:--";
}

/* ---------------- inyección del overlay ---------------- */

function inyectar() {
    const lanza = document.createElement("button");
    lanza.id = "rec-lanzador";
    lanza.textContent = "🚑 Recursos de Emergencia";
    lanza.addEventListener("click", () => document.getElementById("rec-overlay").classList.add("rec-visible"));
    document.body.appendChild(lanza);

    const overlay = document.createElement("div");
    overlay.id = "rec-overlay";
    overlay.innerHTML = `
        <div id="rec-panel">
            <header>
                <h3>🚑 Gestión de Recursos de Emergencia</h3>
                <button id="rec-cerrar" title="Cerrar">×</button>
            </header>
            <div id="rec-tabs">
                <button data-tab="resc" class="rec-activo">Rescatistas</button>
                <button data-tab="amb">Ambulancias</button>
                <button data-tab="sos">Central SOS</button>
            </div>
            <div class="rec-tab rec-activo" id="tab-resc"></div>
            <div class="rec-tab" id="tab-amb"></div>
            <div class="rec-tab" id="tab-sos"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector("#rec-cerrar").addEventListener("click", () => overlay.classList.remove("rec-visible"));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.remove("rec-visible"); });
    overlay.querySelectorAll("#rec-tabs button").forEach(b =>
        b.addEventListener("click", () => {
            overlay.querySelectorAll("#rec-tabs button").forEach(x => x.classList.remove("rec-activo"));
            overlay.querySelectorAll(".rec-tab").forEach(x => x.classList.remove("rec-activo"));
            b.classList.add("rec-activo");
            document.getElementById("tab-" + b.dataset.tab).classList.add("rec-activo");
        }));

    escucharTodo();
}

/* ---------------- listeners Firestore ---------------- */

function escucharTodo() {
    onSnapshot(collection(db, COL_RES), (snap) => {
        rescatistas.clear();
        snap.forEach(d => rescatistas.set(d.id, { id: d.id, ...d.data() }));
        pintarRescatistas(); pintarCentral();
    }, e => console.warn("recursos: rescatistas", e));

    onSnapshot(collection(db, COL_AMB), (snap) => {
        ambulancias.clear();
        snap.forEach(d => ambulancias.set(d.id, { id: d.id, ...d.data() }));
        pintarAmbulancias(); pintarCentral();
    }, e => console.warn("recursos: ambulancias", e));

    onSnapshot(query(collection(db, COL_SOS), where("estado", "==", "pendiente"), limit(30)), (snap) => {
        sosPendientes.clear();
        snap.forEach(d => sosPendientes.set(d.id, { id: d.id, ...d.data() }));
        pintarCentral();
    }, e => console.warn("recursos: SOS", e));

    onSnapshot(query(collection(db, COL_ASIG), where("estado", "in", ESTADOS_ACTIVOS), limit(30)), (snap) => {
        asignaciones.clear();
        snap.forEach(d => asignaciones.set(d.id, { id: d.id, ...d.data() }));
        pintarCentral();
    }, e => console.warn("recursos: asignaciones", e));
}

/* ---------------- pestaña 1: RESCATISTAS ---------------- */

function pintarRescatistas() {
    const cont = document.getElementById("tab-resc");
    if (!cont) return;
    if (rescatistas.size === 0) {
        cont.innerHTML = `<div class="rec-vacio">Sin rescatistas registrados todavía.</div>`;
        return;
    }
    const filas = [...rescatistas.values()].sort((a, b) => (a.estado === "pendiente" ? -1 : 1) - (b.estado === "pendiente" ? -1 : 1))
        .map(r => `
        <tr>
            <td><b>${esc(r.nombres)}</b><br><span style="color:var(--rec-muted)">${esc(r.cargo)} · ${esc(r.empresa)}</span></td>
            <td>${esc(r.especialidad)}<br><span style="color:var(--rec-muted)">Base: ${esc(r.base)} · ${esc(r.turno)}</span></td>
            <td>${esc(r.celular)}<br><span style="color:var(--rec-muted)">Cert.: ${esc(r.certificaciones || "—")} ${r.certVencimiento ? "(vence " + esc(r.certVencimiento) + ")" : ""}</span></td>
            <td><span class="rec-badge ${r.disponibilidad === "Disponible" ? "disponible" : (r.disponibilidad || "").startsWith("Fuera") ? "fuera" : "ocupado"}">${esc(r.disponibilidad)}</span><br>
                <span style="color:var(--rec-muted)">GPS ${haceMin(r.ubicacion?.ts)}</span></td>
            <td>
                <span class="rec-badge ${esc(r.estado)}">${esc(r.estado)}</span><br>
                ${r.estado === "pendiente" ? `
                    <button class="rec-btn verde" data-res-ok="${r.id}" style="margin-top:6px">Autorizar</button>
                    <button class="rec-btn rojo" data-res-no="${r.id}" style="margin-top:6px">Rechazar</button>
                ` : r.estado === "autorizado" ? `
                    <button class="rec-btn gris" data-res-no="${r.id}" style="margin-top:6px">Desactivar</button>
                ` : `
                    <button class="rec-btn verde" data-res-ok="${r.id}" style="margin-top:6px">Reactivar</button>
                `}
            </td>
        </tr>`).join("");
    cont.innerHTML = `
        <table class="rec-tabla">
            <thead><tr><th>Rescatista</th><th>Perfil</th><th>Contacto</th><th>Operativo</th><th>Autorización</th></tr></thead>
            <tbody>${filas}</tbody>
        </table>`;
    cont.querySelectorAll("[data-res-ok]").forEach(b => b.addEventListener("click", () => setEstadoRescatista(b.dataset.resOk, "autorizado")));
    cont.querySelectorAll("[data-res-no]").forEach(b => b.addEventListener("click", () => setEstadoRescatista(b.dataset.resNo, "rechazado")));
}

async function setEstadoRescatista(id, estado) {
    try {
        await updateDoc(doc(db, COL_RES, id), { estado, fechaMs: Date.now() });
        mostrarToast("✅ Listo", `Rescatista: ${estado}.`, "exito", false);
    } catch (e) {
        mostrarToast("⚠️ Error", e.message, "alerta", true);
    }
}

/* ---------------- pestaña 2: AMBULANCIAS ---------------- */

function pintarAmbulancias() {
    const cont = document.getElementById("tab-amb");
    if (!cont) return;
    const filas = [...ambulancias.values()].map(a => `
        <tr>
            <td><b>${esc(a.codigo)}</b><br><span style="color:var(--rec-muted)">${esc(a.placa)}</span></td>
            <td>${esc(a.tipo)}<br><span style="color:var(--rec-muted)">${esc(a.empresa)}</span></td>
            <td>${esc(a.conductor)}<br><span style="color:var(--rec-muted)">${esc(a.contacto)} · Base: ${esc(a.base)}</span></td>
            <td><span class="rec-badge ${(a.estado || "").startsWith("Disponible") ? "disponible" : (a.estado || "").startsWith("Fuera") || a.estado === "En mantenimiento" ? "fuera" : "ocupado"}">${esc(a.estado)}</span><br>
                <span style="color:var(--rec-muted)">GPS ${haceMin(a.gpsTs)}</span></td>
            <td>
                <span class="rec-badge ${esc(a.estadoDoc)}">${esc(a.estadoDoc)}</span><br>
                ${a.estadoDoc === "pendiente" ? `
                    <button class="rec-btn verde" data-amb-ok="${a.id}" style="margin-top:6px">Autorizar</button>
                    <button class="rec-btn rojo" data-amb-no="${a.id}" style="margin-top:6px">Rechazar</button>
                ` : a.estadoDoc === "autorizado" ? `
                    <button class="rec-btn gris" data-amb-no="${a.id}" style="margin-top:6px">Suspender</button>
                ` : `
                    <button class="rec-btn verde" data-amb-ok="${a.id}" style="margin-top:6px">Reactivar</button>
                `}
            </td>
        </tr>`).join("");
    cont.innerHTML = `
        <table class="rec-tabla">
            <thead><tr><th>Unidad</th><th>Tipo / Empresa</th><th>Tripulación</th><th>Operativo</th><th>Autorización</th></tr></thead>
            <tbody>${filas || `<tr><td colspan="5" class="rec-vacio">Sin ambulancias registradas. La tripulación se registra en <b>ambulancia.html</b> y queda pendiente aquí.</td></tr>`}</tbody>
        </table>`;
    cont.querySelectorAll("[data-amb-ok]").forEach(b => b.addEventListener("click", () => setEstadoAmbulancia(b.dataset.ambOk, "autorizado")));
    cont.querySelectorAll("[data-amb-no]").forEach(b => b.addEventListener("click", () => setEstadoAmbulancia(b.dataset.ambNo, "rechazado")));
}

async function setEstadoAmbulancia(id, estadoDoc) {
    try {
        await updateDoc(doc(db, COL_AMB, id), { estadoDoc, fechaMs: Date.now() });
        mostrarToast("✅ Listo", `Unidad: ${estadoDoc}.`, "exito", false);
    } catch (e) {
        mostrarToast("⚠️ Error", e.message, "alerta", true);
    }
}

/* ---------------- pestaña 3: CENTRAL SOS ---------------- */

function pintarCentral() {
    const cont = document.getElementById("tab-sos");
    if (!cont) return;

    const pendientes = [...sosPendientes.values()].sort((a, b) => (b.fechaMs || 0) - (a.fechaMs || 0));
    const listaPend = pendientes.length === 0
        ? `<div class="rec-vacio">No hay emergencias pendientes</div>`
        : pendientes.map(s => {
            const hay = s.ubicacion && typeof s.ubicacion.lat === "number";
            return `
            <label class="rec-card rec-datos rec-sos" style="display:block;cursor:pointer">
                <input type="radio" name="sos-sel" value="${s.id}" ${sosSeleccionada === s.id ? "checked" : ""} style="margin-right:8px">
                <b>🆘 ${esc(s.nombre)}</b> · ${hora(s.fechaMs)} · ${hay ? `${s.ubicacion.lat.toFixed(5)}, ${s.ubicacion.lng.toFixed(5)}` : "sin ubicación"}
                <br><span style="color:var(--rec-muted)">${esc(s.empresa || "")} · ${esc(s.celular || "")}</span>
            </label>`;
        }).join("");

    const rescatistasOk = [...rescatistas.values()].filter(r => r.estado === "autorizado");
    const ambulanciasOk = [...ambulancias.values()].filter(a => a.estadoDoc === "autorizado");

    const activas = [...asignaciones.values()].sort((a, b) => (b.fechaMs || 0) - (a.fechaMs || 0));
    const listaActivas = activas.length === 0
        ? `<div class="rec-vacio">Sin atenciones en curso</div>`
        : activas.map(a => `
            <div class="rec-card rec-datos rec-sos verde">
                <b>${esc(a.rescatistaNombre || "—")}</b> → 🆘 ${esc(a.nombre)} · ${hora(a.fechaMs)}<br>
                <span style="color:var(--rec-muted)">Ambulancia: ${esc(a.ambulanciaCodigo || "sin asignar")} · estado:</span>
                <span class="rec-badge ocupado">${esc(a.estado)}</span>
                <div class="rec-acciones">
                    <button class="rec-btn rojo" data-cerrar="${a.id}">Forzar cierre</button>
                </div>
            </div>`).join("");

    cont.innerHTML = `
        <div class="rec-datos"><b>1. Emergencia pendiente</b> (selecciona una)</div>
        ${listaPend}
        <div class="rec-selects">
            <div class="rec-campo">
                <label>2. Rescatista autorizado</label>
                <select id="sos-resc">
                    <option value="">— seleccionar —</option>
                    ${rescatistasOk.map(r => `<option value="${r.id}" ${r.disponibilidad !== "Disponible" ? "disabled" : ""}>${esc(r.nombres)} · ${esc(r.especialidad)} (${esc(r.disponibilidad)})</option>`).join("")}
                </select>
            </div>
            <div class="rec-campo">
                <label>3. Ambulancia disponible</label>
                <select id="sos-amb">
                    <option value="">— sin ambulancia —</option>
                    ${ambulanciasOk.map(a => `<option value="${a.id}" ${(a.estado || "").startsWith("Disponible") ? "" : "disabled"}>${esc(a.codigo)} · ${esc(a.base)}</option>`).join("")}
                </select>
            </div>
        </div>
        <button class="rec-btn rojo" id="sos-asignar" ${pendientes.length ? "" : "disabled"}>🚨 Asignar equipo a la emergencia</button>

        <h2 class="rec-titulo" style="font-size:15px;margin-top:16px">📋 Atenciones en curso</h2>
        ${listaActivas}
    `;

    cont.querySelectorAll('input[name="sos-sel"]').forEach(r =>
        r.addEventListener("change", () => { sosSeleccionada = r.value; }));
    cont.querySelector("#sos-asignar").addEventListener("click", asignar);
    cont.querySelectorAll("[data-cerrar]").forEach(b =>
        b.addEventListener("click", () => forzarCierre(b.dataset.cerrar)));
}

async function asignar() {
    if (!sosSeleccionada) return alert("Selecciona una emergencia pendiente.");
    const rescId = document.getElementById("sos-resc").value;
    if (!rescId) return alert("Selecciona un rescatista autorizado.");
    const ambId = document.getElementById("sos-amb").value;

    const r = rescatistas.get(rescId);
    const a = ambId ? ambulancias.get(ambId) : null;
    const s = sosPendientes.get(sosSeleccionada);

    // Evitar doble asignación de la misma emergencia
    const ya = [...asignaciones.values()].some(x => x.emergenciaId === sosSeleccionada);
    if (ya) return alert("Esta emergencia ya tiene una asignación activa.");

    try {
        await addDoc(collection(db, COL_ASIG), {
            emergenciaId: s.id,
            nombre: s.nombre || "Usuario registrado",
            empresa: s.empresa || "",
            dni: s.dni || "",
            celular: s.celular || "",
            lat: s.ubicacion?.lat ?? null,
            lng: s.ubicacion?.lng ?? null,
            precision: s.ubicacion?.precision ?? null,
            rescatistaUid: r.id,
            rescatistaDeviceId: r.deviceId || "",
            rescatistaNombre: r.nombres,
            ambulanciaId: a ? a.id : null,
            ambAuthUid: a ? (a.authUid || "") : null,
            ambulanciaCodigo: a ? a.codigo : "",
            estado: "asignada",
            asignadoPor: "central",
            fechaMs: Date.now()
        });
        mostrarToast("🚨 Asignado", `${r.nombres} atenderá la emergencia.`, "exito", false);
        sosSeleccionada = null;
    } catch (e) {
        mostrarToast("⚠️ Error", e.message, "alerta", true);
    }
}

async function forzarCierre(id) {
    if (!confirm("¿Cerrar esta atención?")) return;
    try {
        await updateDoc(doc(db, COL_ASIG, id), {
            estado: "finalizada",
            resultado: "Cerrado por central",
            finEn: serverTimestamp()
        });
        mostrarToast("✅ Cerrada", "Atención finalizada por central.", "exito", false);
    } catch (e) {
        mostrarToast("⚠️ Error", e.message, "alerta", true);
    }
}

/* ---------------- arranque ---------------- */

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inyectar);
} else {
    inyectar();
}
