// js/ambulancia-app.js
// ============================================================
// MÓDULO UNIDAD DE AMBULANCIA (ambulancia.html)
// v1:
//   - La tripulación registra su unidad (queda PENDIENTE hasta
//     que el administrador la autorice en administrador.html).
//   - Panel: estado operativo, publicación de GPS cada 2 min y
//     asignaciones activas con línea de tiempo.
//   - Tipos de ambulancia según MINSA: Tipo I, II y III.
//   - El vínculo tripulación-unidad queda en el campo authUid
//     del documento (solo ese dispositivo puede mover el GPS).
// ============================================================

import { obtenerAuth, obtenerFirestore } from "./firebase-app.js";
import { asegurarSesionAnonima } from "./auth-anonima.js";
import {
    doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection,
    onSnapshot, query, where, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const COL_AMB  = "ambulancias";
const COL_ASIG = "asignaciones_sos";

const TIPOS = ["Tipo I (transporte básico)", "Tipo II (transporte intermedio)", "Tipo III (unidad de cuidados intensivos móvil)"];
const ESTADOS_UNIDAD = [
    "Disponible en base", "Disponible en desplazamiento", "Asignada a emergencia",
    "En atención del paciente", "En traslado al centro médico", "En mantenimiento", "Fuera de servicio"
];
const RESULTADOS = ["Atendido en sitio", "Trasladado a centro médico", "Cancelado (falsa alarma)"];
const ESTADOS_ACTIVOS = ["asignada", "aceptada", "en_camino", "en_lugar"];
const LS_UNIDAD = "sara_amb_unidad";

const db = obtenerFirestore();

let uid = null;
let unidad = null;   // { id, ...datos }
let unsubUnidad = null, unsubSOS = null, unsubAsig = null, gpsTimer = null;
const app = document.getElementById("amb-app");

/* ---------------- utilidades ---------------- */

function esc(t) {
    return String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function hora(ms) {
    return ms ? new Date(ms).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "--:--";
}
function haceMin(ts) {
    if (!ts) return "sin GPS";
    const m = Math.round((Date.now() - ts) / 60000);
    return m <= 0 ? "ahora" : `hace ${m} min`;
}

/* ---------------- arranque ---------------- */

init();
async function init() {
    try {
        const user = await asegurarSesionAnonima();
        uid = user.uid;
        const guardado = localStorage.getItem(LS_UNIDAD);
        if (guardado) {
            const snap = await getDoc(doc(db, COL_AMB, guardado));
            if (snap.exists()) {
                unidad = { id: snap.id, ...snap.data() };
                if (unidad.authUid !== uid) { unidad = null; localStorage.removeItem(LS_UNIDAD); }
                    else { resolverAccesoAmb(); return; }
            }
        }
        renderRegistro();
    } catch (e) {
        app.innerHTML = `<div class="rec-card">Error de conexión: ${esc(e.message)}</div>`;
    }
}

/** Si el admin autoriza la unidad mientras espera, entra al panel. */
function escucharUnidad() {
    if (unsubUnidad) unsubUnidad();
    unsubUnidad = onSnapshot(doc(db, COL_AMB, unidad.id), (s) => {
        if (!s.exists()) return;
    const antes = unidad?.estadoDoc;
        unidad = { id: s.id, ...s.data() };
        if (unidad.estadoDoc !== antes) {
            limpiarTodo();
            resolverAccesoAmb();
        }
    });
}

function limpiarTodo() {
    if (unsubUnidad) { unsubUnidad(); unsubUnidad = null; }
    if (unsubSOS) { unsubSOS(); unsubSOS = null; }
    if (unsubAsig) { unsubAsig(); unsubAsig = null; }
    
    if (gpsTimer) { clearInterval(gpsTimer); gpsTimer = null; }
}

/* ---------------- 1. REGISTRO DE UNIDAD ---------------- */

function renderRegistro() {
    app.innerHTML = `
        <h1 class="rec-titulo">🚑 Registro de Ambulancia</h1>
        <p class="rec-subtitulo">SARA · La unidad quedará pendiente hasta ser validada por el administrador.</p>
        <form class="rec-card" id="form-amb">
            <div class="rec-fila2">
                <div class="rec-campo"><label>Código interno *</label><input id="a-codigo" required placeholder="Ej: AMB-01"></div>
                <div class="rec-campo"><label>Placa *</label><input id="a-placa" required></div>
            </div>
            <div class="rec-fila2">
                <div class="rec-campo"><label>Tipo de ambulancia *</label><select id="a-tipo">${TIPOS.map(t => `<option>${t}</option>`).join("")}</select></div>
                <div class="rec-campo"><label>Empresa operadora *</label><input id="a-empresa" required></div>
            </div>
            <div class="rec-fila2">
                <div class="rec-campo"><label>Conductor *</label><input id="a-conductor" required></div>
                <div class="rec-campo"><label>Personal médico asignado</label><input id="a-personal" placeholder="Nombres / cargo"></div>
            </div>
            <div class="rec-fila2">
                <div class="rec-campo"><label>Número de contacto *</label><input id="a-contacto" required maxlength="9" inputmode="numeric"></div>
                <div class="rec-campo"><label>Base de operaciones *</label><input id="a-base" required></div>
            </div>
            <div class="rec-fila2">
                <div class="rec-campo"><label>Capacidad de pacientes</label><input id="a-capacidad" type="number" min="1" placeholder="Ej: 2"></div>
                <div class="rec-campo"><label>Vigencia documentación</label><input id="a-vigencia" type="date"></div>
            </div>
            <div class="rec-campo"><label>Equipamiento médico</label><textarea id="a-equip" rows="2" placeholder="Oxígeno, DESA, camilla…"></textarea></div>
            <button class="rec-btn grande verde" type="submit">Registrar unidad</button>
        </form>
    `;
    document.getElementById("form-amb").addEventListener("submit", registrar);
}

async function registrar(ev) {
    ev.preventDefault();
    const v = (id) => document.getElementById(id).value.trim();
    const contacto = v("a-contacto");
    if (!/^[0-9]{9}$/.test(contacto)) return alert("El contacto debe tener 9 dígitos.");
    const btn = ev.target.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "Enviando…";
    try {
        await setDoc(doc(db, COL_AMB, uid), {   // ID del documento = authUid
            authUid: uid,                       // vínculo tripulación-unidad
            codigo: v("a-codigo"),
            placa: v("a-placa"),
            tipo: v("a-tipo"),
            empresa: v("a-empresa"),
            conductor: v("a-conductor"),
            personal: v("a-personal") || "",
            contacto,
            base: v("a-base"),
            capacidad: v("a-capacidad") || "",
            vigenciaDoc: v("a-vigencia") || "",
            equipamiento: v("a-equip") || "",
            estado: "Disponible en base",
            estadoDoc: "pendiente",             // autorización del admin
            ubicacion: null,
            gpsTs: null,
            fechaMs: Date.now()
        });
        localStorage.setItem(LS_UNIDAD, uid);
        unidad = { id: uid, estado: "pendiente", estadoDoc: "pendiente" };
        renderEspera();
    } catch (e) {
        alert("No se pudo registrar: " + e.message);
        btn.disabled = false; btn.textContent = "Registrar unidad";
    }
}

/* ---------------- 2. ESPERA ---------------- */

function renderEspera() {
    app.innerHTML = `
        <h1 class="rec-titulo">⏳ Unidad registrada</h1>
        <div class="rec-card rec-datos">
            <p>La unidad <b>${esc(unidad?.codigo || "")}</b> está <span class="rec-badge pendiente">PENDIENTE</span> de validación.</p>
            <p>El administrador debe autorizarla desde el panel <b>Gestión de Recursos de Emergencia</b>. Esta pantalla se activará sola; mantén la página abierta.</p>
        </div>
    `;
    escucharUnidad();
}
/* ---- 2b. ACCESO SEGÚN VIGENCIA (14 días) ---- */

function resolverAccesoAmb() {
    if (unidad.estadoDoc === "autorizado") {
        if (unidad.autorizadoHasta && unidad.autorizadoHasta > Date.now()) { renderPanel(); return; }
        renderVencidoAmb(); return;
    }
    if (unidad.estadoDoc === "rechazado") { renderRechazadoAmb(); return; }
    renderEspera();
}

function renderVencidoAmb() {
    app.innerHTML = `
        <h1 class="rec-titulo">📅 Vigencia vencida</h1>
        <div class="rec-card rec-datos">
            <p>La unidad <b>${esc(unidad.codigo)}</b> tiene la autorización vencida desde el
            <b>${new Date(unidad.autorizadoHasta || Date.now()).toLocaleDateString("es-PE")}</b>
            (vigencia de 14 días por rotación 7 día + 7 noche).</p>
            <p>Solicita la renovación; el administrador la aprueba desde el panel
            <b>Gestión de Recursos de Emergencia</b>.</p>
            <button class="rec-btn grande" id="btn-renovar-amb">🔄 Solicitar renovación</button>
        </div>
    `;
    document.getElementById("btn-renovar-amb").addEventListener("click", async (e) => {
        e.target.disabled = true; e.target.textContent = "Enviando…";
        try {
            await updateDoc(doc(db, COL_AMB, unidad.id), { estadoDoc: "pendiente", fechaMs: Date.now() });
            renderEspera();
        } catch (err) {
            alert("No se pudo solicitar: " + err.message);
            e.target.disabled = false; e.target.textContent = "🔄 Solicitar renovación";
        }
    });
}

function renderRechazadoAmb() {
    app.innerHTML = `
        <h1 class="rec-titulo">⛔ Acceso denegado</h1>
        <div class="rec-card rec-datos">
            <p>La unidad <b>${esc(unidad.codigo)}</b> fue <span class="rec-badge rechazado">RECHAZADA</span> por el administrador.</p>
            <p>Si crees que es un error, coordina con el administrador de SARA.</p>
        </div>
    `;
}
/* ---------------- 3. PANEL DE LA UNIDAD ---------------- */

function renderPanel() {
    app.innerHTML = `
        <h1 class="rec-titulo">🚑 ${esc(unidad.codigo)}</h1>
        <p class="rec-subtitulo">${esc(unidad.tipo)} · ${esc(unidad.empresa)} · Base: ${esc(unidad.base)}</p>

        <div class="rec-card">
            <div class="rec-campo">
                <label>Estado operativo</label>
                <select id="amb-estado" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--rec-borde);background:var(--rec-panel2);color:var(--rec-texto)">
                    ${ESTADOS_UNIDAD.map(e => `<option ${e === unidad.estado ? "selected" : ""}>${e}</option>`).join("")}
                </select>
            </div>
            <div class="rec-datos">
                <span class="lbl">Conductor:</span> ${esc(unidad.conductor)} ·
                <span class="lbl">Contacto:</span> ${esc(unidad.contacto)}<br>
                <span class="lbl">Personal:</span> ${esc(unidad.personal || "—")} ·
                <span class="lbl">Capacidad:</span> ${esc(unidad.capacidad || "—")}<br>
                <span class="lbl">Último GPS:</span> ${haceMin(unidad.gpsTs)}
            </div>
        </div>

        <h2 class="rec-titulo" style="font-size:16px">🆘 Emergencias pendientes</h2>
        <div id="amb-sos"><div class="rec-card rec-vacio">Cargando…</div></div>
        <h2 class="rec-titulo" style="font-size:16px">🗺️ Mapa de emergencias</h2>
        <div id="amb-mapa" class="rec-mapa"></div>
        <h2 class="rec-titulo" style="font-size:16px">📋 Asignaciones de la unidad</h2>
        <div id="amb-asig"><div class="rec-card rec-vacio">Sin asignaciones activas</div></div>
    `;

    document.getElementById("amb-estado").addEventListener("change", async (e) => {
        try {
            await updateDoc(doc(db, COL_AMB, unidad.id), { estado: e.target.value, fechaMs: Date.now() });
            unidad.estado = e.target.value;
        } catch (err) { alert("No se pudo cambiar el estado: " + err.message); }
    });

    initMapaAmb();
    escucharUnidad();
    publicarGPS();
    gpsTimer = setInterval(publicarGPS, 2 * 60 * 1000);
    escucharAsignaciones();
    escucharSOSAmb();
}

function publicarGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
            await updateDoc(doc(db, COL_AMB, unidad.id), {
                ubicacion: {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    precision: pos.coords.accuracy ?? null,
                    ts: Date.now()
                },
                gpsTs: Date.now(),
                fechaMs: Date.now()
            });
            unidad.gpsTs = Date.now();
            unidad.ubicacion = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        } catch { /* offline o sin permiso: reintenta en 2 min */ }
    }, () => { }, { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 });
}

/* ---- Asignaciones de esta unidad ---- */

function escucharAsignaciones() {
    if (unsubAsig) unsubAsig();
    const q = query(collection(db, COL_ASIG), where("ambulanciaId", "==", unidad.id), limit(10));
    unsubAsig = onSnapshot(q, (snap) => {
        const cont = document.getElementById("amb-asig");
        if (!cont) return;
        const activas = [];
        snap.forEach(d => { if (ESTADOS_ACTIVOS.includes(d.data().estado)) activas.push({ id: d.id, ...d.data() }); });
        if (activas.length === 0) {
            cont.innerHTML = `<div class="rec-card rec-vacio">Sin asignaciones activas</div>`;
            return;
        }
        cont.innerHTML = activas.map(asigCardHTML).join("");
        cont.querySelectorAll("[data-avanzar]").forEach(b =>
            b.addEventListener("click", () => avanzar(b.dataset.avanzar, b.dataset.estado)));
    }, (err) => console.warn("ambulancia: error escuchando asignaciones", err));
}

function timelineHTML(a) {
    const pasos = [["aceptada", "Aceptada"], ["en_camino", "En camino"], ["en_lugar", "En el lugar"], ["finalizada", "Finalizada"]];
    const idx = a.estado === "asignada" ? -1 : pasos.findIndex(p => p[0] === a.estado);
    return `<div class="rec-timeline">${pasos.map((p, i) =>
        `<span class="rec-paso ${i <= idx ? "hecho" : ""}">${p[1]}</span>`).join("")}</div>`;
}

function asigCardHTML(a) {
    const hay = typeof a.lat === "number" && typeof a.lng === "number";
    let acciones = "";
    if (a.estado === "asignada") acciones = `<button class="rec-btn verde" data-avanzar="${a.id}" data-estado="aceptada">✅ Aceptar</button>`;
    if (a.estado === "aceptada") acciones = `<button class="rec-btn naranja" data-avanzar="${a.id}" data-estado="en_camino">🚑 Salir de base</button>`;
    if (a.estado === "en_camino") acciones = `<button class="rec-btn" data-avanzar="${a.id}" data-estado="en_lugar">📍 Llegamos al lugar</button>`;
    if (a.estado === "en_lugar") acciones = `
        <select id="amb-resultado" class="rec-campo" style="flex:1">
            ${RESULTADOS.map(r => `<option>${r}</option>`).join("")}
        </select>
        <button class="rec-btn verde" data-avanzar="${a.id}" data-estado="finalizada">✅ Finalizar</button>`;
    return `
        <div class="rec-card rec-sos verde rec-datos">
            <b>🆘 ${esc(a.nombre)}</b> · <span class="lbl">hora SOS:</span> ${hora(a.fechaMs)}<br>
            <span class="lbl">Rescatista:</span> ${esc(a.rescatistaNombre || "—")}<br>
            <span class="lbl">Ubicación:</span> ${hay ? `${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}` : "no disponible"}<br>
            ${timelineHTML(a)}
            <div class="rec-acciones">
                ${hay ? `<a class="rec-btn gris" style="text-decoration:none;text-align:center" target="_blank" href="https://www.google.com/maps?q=${a.lat},${a.lng}">📍 Navegar</a>` : ""}
                ${acciones}
            </div>
        </div>
    `;
}

async function avanzar(id, nuevoEstado) {
    try {
        const campos = { estado: nuevoEstado };
        if (nuevoEstado === "aceptada") { campos.aceptadaEn = serverTimestamp(); await updateDoc(doc(db, COL_AMB, unidad.id), { estado: "Asignada a emergencia", fechaMs: Date.now() }); }
        if (nuevoEstado === "en_camino") campos.salidaEn = serverTimestamp();
        if (nuevoEstado === "en_lugar") { campos.llegadaEn = serverTimestamp(); await updateDoc(doc(db, COL_AMB, unidad.id), { estado: "En atención del paciente", fechaMs: Date.now() }); }
        if (nuevoEstado === "finalizada") {
            campos.finEn = serverTimestamp();
            campos.resultado = document.getElementById("amb-resultado")?.value || "Atendido en sitio";
            await updateDoc(doc(db, COL_AMB, unidad.id), { estado: "Disponible en base", fechaMs: Date.now() });
        }
    await updateDoc(doc(db, COL_ASIG, id), campos);
        if (nuevoEstado === "finalizada") {
            const asig = await getDoc(doc(db, COL_ASIG, id));
            const emgId = asig.exists() ? asig.data().emergenciaId : null;
            if (emgId) await updateDoc(doc(db, "panic_alerts", emgId), {
                estado: "finalizada",
                finalizadaPor: `Ambulancia: ${unidad.codigo}`,
                finalizadaEn: serverTimestamp()
            });
        }
    } catch (e) {
        alert("No se pudo actualizar: " + e.message);
    }
}
/* ---- SOS pendientes + mapa (v1.1) ---- */

function escucharSOSAmb() {
    if (unsubSOS) unsubSOS();
    const q = query(collection(db, "panic_alerts"), where("estado", "==", "pendiente"), limit(30));
    unsubSOS = onSnapshot(q, (snap) => {
        const cont = document.getElementById("amb-sos");
        if (!cont) return;
        const pendientes = [];
        snap.forEach(d => pendientes.push({ id: d.id, ...d.data() }));
        if (pendientes.length === 0) {
            cont.innerHTML = `<div class="rec-card rec-vacio">No hay emergencias pendientes</div>`;
            actualizarMapaAmb([]);
            return;
        }
        cont.innerHTML = pendientes.map(sosAmbCardHTML).join("");
        actualizarMapaAmb(pendientes);
        cont.querySelectorAll("[data-tomar]").forEach(b =>
            b.addEventListener("click", () => tomarEmergenciaAmb(b.dataset.tomar)));
    }, (err) => console.warn("ambulancia: error escuchando SOS", err));
}

function sosAmbCardHTML(s) {
    const hay = s.ubicacion && typeof s.ubicacion.lat === "number";
    return `
        <div class="rec-card rec-sos rec-datos">
            <b>🆘 ${esc(s.nombre || "Usuario registrado")}</b> · <span class="lbl">hora:</span> ${hora(s.fechaMs)}<br>
            <span class="lbl">Empresa:</span> ${esc(s.empresa || "—")} ·
            <span class="lbl">Celular:</span> ${esc(s.celular || "—")}<br>
            <span class="lbl">Ubicación:</span> ${hay ? `${s.ubicacion.lat.toFixed(5)}, ${s.ubicacion.lng.toFixed(5)} (±${Math.round(s.ubicacion.precision || 0)}m)` : "no disponible"}
            <div class="rec-acciones">
                ${hay ? `<a class="rec-btn" style="text-decoration:none;text-align:center" target="_blank" href="https://www.google.com/maps?q=${s.ubicacion.lat},${s.ubicacion.lng}">📍 Ver mapa</a>` : ""}
                <button class="rec-btn rojo" data-tomar="${s.id}">🆘 Salir en auxilio</button>
            </div>
        </div>
    `;
}

async function tomarEmergenciaAmb(emergenciaId) {
    if (!(unidad.estado || "").startsWith("Disponible")) {
        return alert("Tu unidad no está Disponible. Cambia el estado operativo primero.");
    }
    try {
        const q = query(collection(db, "asignaciones_sos"), where("emergenciaId", "==", emergenciaId));
        const ya = await getDocs(q);
        const activa = ya.docs.map(d => ({ id: d.id, ...d.data() }))
            .find(a => ["asignada", "aceptada", "en_camino", "en_lugar"].includes(a.estado));

        if (activa && activa.ambulanciaId) return alert("Otra unidad ya tomó esta emergencia.");

        const sosDoc = await getDoc(doc(db, "panic_alerts", emergenciaId));
        if (!sosDoc.exists()) return alert("La emergencia ya no existe.");
        const sos = sosDoc.data();

        if (activa) {
            // Ya hay rescatista: la unidad se une a esa misma atención
            await updateDoc(doc(db, "asignaciones_sos", activa.id), {
                ambulanciaId: unidad.id,
                ambAuthUid: uid,
                ambulanciaCodigo: unidad.codigo,
                estado: "aceptada",
                aceptadaEn: serverTimestamp(),
                fechaMs: Date.now()
            });
        } else {
            await addDoc(collection(db, "asignaciones_sos"), {
                emergenciaId,
                nombre: sos.nombre || "Usuario registrado",
                empresa: sos.empresa || "",
                dni: sos.dni || "",
                celular: sos.celular || "",
                lat: sos.ubicacion?.lat ?? null,
                lng: sos.ubicacion?.lng ?? null,
                precision: sos.ubicacion?.precision ?? null,
                rescatistaUid: null,
                rescatistaNombre: "",
                ambulanciaId: unidad.id,
                ambAuthUid: uid,
                ambulanciaCodigo: unidad.codigo,
                estado: "aceptada",
                aceptadaEn: serverTimestamp(),
                fechaMs: Date.now()
            });
        }
        await updateDoc(doc(db, "panic_alerts", emergenciaId), {
            estado: "atendida",
            atendidaPor: `Ambulancia: ${unidad.codigo}`,
            atendidaEn: serverTimestamp()
        });
        await updateDoc(doc(db, COL_AMB, unidad.id), { estado: "Asignada a emergencia", fechaMs: Date.now() });
        unidad.estado = "Asignada a emergencia";
    } catch (e) {
        alert("No se pudo tomar la emergencia: " + e.message);
    }
}

let mapaAmb = null, capasAmb = null;

function initMapaAmb() {
    if (mapaAmb || typeof L === "undefined") return;
    mapaAmb = L.map("amb-mapa").setView([-9.55, -77.04], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(mapaAmb);
    capasAmb = L.layerGroup().addTo(mapaAmb);
}

function actualizarMapaAmb(pendientes) {
    if (!mapaAmb) return;
    capasAmb.clearLayers();
    const puntos = [];
    pendientes.forEach(s => {
        if (s.ubicacion && typeof s.ubicacion.lat === "number") {
            const icono = L.divIcon({ className: "", html: `<div style="background:#e74c3c;width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 8px rgba(0,0,0,.5)"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
            L.marker([s.ubicacion.lat, s.ubicacion.lng], { icon: icono }).addTo(capasAmb)
                .bindPopup(`<b>🆘 ${esc(s.nombre || "Usuario")}</b><br>${esc(s.empresa || "")} · ${hora(s.fechaMs)}<br><a target="_blank" href="https://www.google.com/maps?q=${s.ubicacion.lat},${s.ubicacion.lng}">Abrir en Google Maps</a>`);
            puntos.push([s.ubicacion.lat, s.ubicacion.lng]);
        }
    });
    if (unidad.ubicacion && typeof unidad.ubicacion.lat === "number") {
        const yo = L.divIcon({ className: "", html: `<div style="background:#16a085;width:14px;height:14px;border-radius:50%;border:3px solid #fff"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
        L.marker([unidad.ubicacion.lat, unidad.ubicacion.lng], { icon: yo }).addTo(capasAmb).bindPopup(`🚑 ${esc(unidad.codigo)}`);
        puntos.push([unidad.ubicacion.lat, unidad.ubicacion.lng]);
    }
    if (puntos.length) mapaAmb.fitBounds(puntos, { padding: [30, 30], maxZoom: 15 });
}
