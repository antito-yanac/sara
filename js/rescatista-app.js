// js/rescatista-app.js
// ============================================================
// MÓDULO PERSONAL DE RESCATE (rescatista.html)
// v1:
//   - Registro del rescatista (queda PENDIENTE hasta que el
//     administrador lo autorice en administrador.html).
//   - Panel operativo: emergencias SOS pendientes (panic_alerts
//     estado='pendiente'), distancia desde su última ubicación,
//     botón TOMAR, línea de tiempo (aceptada -> en_camino ->
//     en_lugar -> finalizada) y publicación de GPS cada 2 min.
//   - Reglas: documento rescatistas/{authUid}, creado por uno
//     mismo con estado 'pendiente'. Solo el admin lo autoriza.
// ============================================================

import { obtenerAuth, obtenerFirestore } from "./firebase-app.js";
import { asegurarSesionAnonima } from "./auth-anonima.js";
import { obtenerDeviceId } from "./device-id.js";
import {
    collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
    onSnapshot, query, where, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const COL_RES  = "rescatistas";
const COL_SOS  = "panic_alerts";
const COL_ASIG = "asignaciones_sos";

const CARGOS = ["Paramédico", "Médico", "Brigadista", "Rescatista", "Enfermero(a)", "Técnico en emergencias"];
const ESPECIALIDADES = ["Primeros auxilios", "Rescate en altura", "Espacios confinados", "Rescate vehicular", "Rescate acuático", "Materiales peligrosos", "Socorrista"];
const TURNOS = ["Día", "Noche", "Mañana", "Tarde", "24x24", "Rotativo"];
const DISPONIBILIDADES = ["Disponible", "Atendiendo emergencia", "En traslado", "Fuera de servicio", "Fuera de turno"];
const RESULTADOS = ["Atendido en sitio", "Trasladado a centro médico", "Cancelado (falsa alarma)"];
const ESTADOS_ACTIVOS = ["asignada", "aceptada", "en_camino", "en_lugar"];

const auth = obtenerAuth();
const db = obtenerFirestore();

let uid = null;
let deviceId = null;
let perfil = null;
let unsubPerfil = null, unsubSOS = null, unsubAsig = null;
let gpsTimer = null;
const app = document.getElementById("resc-app");

/* ---------------- utilidades ---------------- */

function esc(t) {
    return String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function hora(ms) {
    return ms ? new Date(ms).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "--:--";
}
function fechaTexto(ms) {
    return ms ? new Date(ms).toLocaleString("es-PE") : "—";
}
function haversineKm(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
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
        deviceId = obtenerDeviceId();
        const snap = await getDoc(doc(db, COL_RES, uid));
        if (snap.exists()) {
            perfil = { id: snap.id, ...snap.data() };
            if (perfil.estado === "autorizado") renderPanel();
            else renderEspera();
        } else {
            renderRegistro();
        }
    } catch (e) {
        app.innerHTML = `<div class="rec-card">Error de conexión con Firebase: ${esc(e.message)}</div>`;
    }
}

/** Escucha su propio documento: si el admin lo autoriza, entra al panel. */
function escucharPerfil() {
    if (unsubPerfil) unsubPerfil();
    unsubPerfil = onSnapshot(doc(db, COL_RES, uid), (s) => {
        if (!s.exists()) return;
        const antes = perfil?.estado;
        perfil = { id: s.id, ...s.data() };
        if (perfil.estado === "autorizado" && antes !== "autorizado") {
            limpiarTodo();
            renderPanel();
        }
    });
}

function limpiarTodo() {
    if (unsubPerfil) { unsubPerfil(); unsubPerfil = null; }
    if (unsubSOS) { unsubSOS(); unsubSOS = null; }
    if (unsubAsig) { unsubAsig(); unsubAsig = null; }
    if (gpsTimer) { clearInterval(gpsTimer); gpsTimer = null; }
}

/* ---------------- 1. REGISTRO ---------------- */

function renderRegistro() {
    app.innerHTML = `
        <h1 class="rec-titulo">🚨 Registro — Personal de Rescate</h1>
        <p class="rec-subtitulo">SARA · Antamina. Tus datos serán validados por el administrador antes de activarte.</p>
        <form class="rec-card" id="form-res">
            <div class="rec-fila2">
                <div class="rec-campo"><label>Nombres y apellidos *</label><input id="f-nombres" required></div>
                <div class="rec-campo"><label>DNI (8 dígitos) *</label><input id="f-dni" required maxlength="8" inputmode="numeric"></div>
            </div>
            <div class="rec-fila2">
                <div class="rec-campo"><label>Código de trabajador</label><input id="f-codigo" placeholder="Recomendado"></div>
                <div class="rec-campo"><label>Empresa contratista *</label><input id="f-empresa" required></div>
            </div>
            <div class="rec-fila2">
                <div class="rec-campo"><label>Cargo *</label><select id="f-cargo">${CARGOS.map(c => `<option>${c}</option>`).join("")}</select></div>
                <div class="rec-campo"><label>Número celular *</label><input id="f-celular" required maxlength="9" inputmode="numeric"></div>
            </div>
            <div class="rec-fila2">
                <div class="rec-campo"><label>Especialidad *</label><select id="f-espec">${ESPECIALIDADES.map(c => `<option>${c}</option>`).join("")}</select></div>
                <div class="rec-campo"><label>Base o puesto asignado *</label><input id="f-base" required></div>
            </div>
            <div class="rec-fila2">
                <div class="rec-campo"><label>Certificaciones</label><input id="f-cert" placeholder="Ej: ISTE, Reyes Romero…"></div>
                <div class="rec-campo"><label>Vencimiento de certificación</label><input id="f-certven" type="date"></div>
            </div>
            <div class="rec-campo"><label>Turno *</label><select id="f-turno">${TURNOS.map(c => `<option>${c}</option>`).join("")}</select></div>
            <div class="rec-campo">
                <label style="display:flex;gap:8px;align-items:flex-start;color:var(--rec-texto)">
                    <input type="checkbox" id="f-terms" required style="width:auto;margin-top:3px">
                    <span>Declaro que mis datos son reales y autorizo su uso para la gestión de emergencias (Ley 29733). *</span>
                </label>
            </div>
            <button class="rec-btn grande verde" type="submit">Solicitar autorización</button>
        </form>
    `;
    document.getElementById("form-res").addEventListener("submit", registrar);
}

async function registrar(ev) {
    ev.preventDefault();
    const v = (id) => document.getElementById(id).value.trim();
    const dni = v("f-dni"), cel = v("f-celular");
    if (!/^[0-9]{8}$/.test(dni)) return alert("El DNI debe tener 8 dígitos.");
    if (!/^[0-9]{9}$/.test(cel)) return alert("El celular debe tener 9 dígitos.");
    if (!document.getElementById("f-terms").checked) return;

    const btn = ev.target.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "Enviando…";

    try {
        await setDoc(doc(db, COL_RES, uid), {
            authUid: uid,
            deviceId,
            nombres: v("f-nombres"),
            dni,
            codigoTrabajador: v("f-codigo") || "",
            empresa: v("f-empresa"),
            cargo: v("f-cargo"),
            celular: cel,
            especialidad: v("f-espec"),
            certificaciones: v("f-cert") || "",
            certVencimiento: v("f-certven") || "",
            base: v("f-base"),
            turno: v("f-turno"),
            disponibilidad: "Disponible",
            estado: "pendiente",
            ubicacion: null,
            fechaMs: Date.now()
        });
        renderEspera();
    } catch (e) {
        alert("No se pudo registrar: " + e.message);
        btn.disabled = false; btn.textContent = "Solicitar autorización";
    }
}

/* ---------------- 2. ESPERA DE AUTORIZACIÓN ---------------- */

function renderEspera() {
    app.innerHTML = `
        <h1 class="rec-titulo">⏳ Solicitud enviada</h1>
        <div class="rec-card rec-datos">
            <p>Tu registro quedó <span class="rec-badge pendiente">PENDIENTE</span>.</p>
            <p>El administrador debe autorizarte desde el panel <b>Gestión de Recursos de Emergencia</b>. Esta pantalla se activará sola cuando eso ocurra; mantén la página abierta.</p>
        </div>
    `;
    escucharPerfil();
}

/* ---------------- 3. PANEL OPERATIVO ---------------- */

function renderPanel() {
    app.innerHTML = `
        <h1 class="rec-titulo">🚨 Panel de Rescate</h1>
        <p class="rec-subtitulo">SARA · Gestión de Emergencias</p>

        <div class="rec-card" id="resc-cabecera"></div>
        <h2 class="rec-titulo" style="font-size:16px">🗺️ Mapa de emergencias</h2>
        <div id="resc-mapa" class="rec-mapa"></div>
        <h2 class="rec-titulo" style="font-size:16px">🆘 Emergencias pendientes</h2>
        <div id="resc-sos"></div>
        <h2 class="rec-titulo" style="font-size:16px">📋 Mi asignación</h2>
        <div id="resc-asig"><div class="rec-card rec-vacio">Sin asignaciones activas</div></div>
    `;

    pintarCabecera();
    initMapaResc();
    escucharPerfil();          // mantiene el panel sincronizado
    publicarGPS();
    gpsTimer = setInterval(publicarGPS, 2 * 60 * 1000);
    escucharSOS();
    escucharMisAsignaciones();
}

function pintarCabecera() {
    const sel = document.getElementById("resc-cabecera");
    sel.innerHTML = `
        <div class="rec-datos">
            <b>${esc(perfil.nombres)}</b> · ${esc(perfil.cargo)} · ${esc(perfil.empresa)}<br>
            <span class="lbl">Especialidad:</span> ${esc(perfil.especialidad)} ·
            <span class="lbl">Base:</span> ${esc(perfil.base)} ·
            <span class="lbl">Turno:</span> ${esc(perfil.turno)}<br>
            <span class="lbl">Última ubicación:</span> ${haceMin(perfil.ubicacion?.ts)}
        </div>
        <div class="rec-acciones">
            <select id="resc-disp" class="rec-campo" style="flex:1;padding:10px">
                ${DISPONIBILIDADES.map(d => `<option ${d === perfil.disponibilidad ? "selected" : ""}>${d}</option>`).join("")}
            </select>
        </div>
    `;
    document.getElementById("resc-disp").addEventListener("change", async (e) => {
        try {
            await updateDoc(doc(db, COL_RES, uid), { disponibilidad: e.target.value, fechaMs: Date.now() });
            perfil.disponibilidad = e.target.value;
        } catch (err) { alert("No se pudo cambiar disponibilidad: " + err.message); }
    });
}

/** Publica su ubicación en su documento (para central y distancias). */
function publicarGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
            await updateDoc(doc(db, COL_RES, uid), {
                ubicacion: {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    precision: pos.coords.accuracy ?? null,
                    ts: Date.now()
                },
                fechaMs: Date.now()
            });
            perfil.ubicacion = { lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy, ts: Date.now() };
        } catch { /* sin permiso o offline: se reintenta en 2 min */ }
    }, () => { }, { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 });
}
/* ---- Mapa Leaflet ---- */
let mapaResc = null, capasResc = null;

function initMapaResc() {
    if (mapaResc || typeof L === "undefined") return;
    mapaResc = L.map("resc-mapa").setView([-9.55, -77.04], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(mapaResc);
    capasResc = L.layerGroup().addTo(mapaResc);
}

function actualizarMapaResc(pendientes) {
    if (!mapaResc) return;
    capasResc.clearLayers();
    const puntos = [];
    pendientes.forEach(s => {
        if (s.ubicacion && typeof s.ubicacion.lat === "number") {
            const icono = L.divIcon({ className: "", html: `<div style="background:#e74c3c;width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 8px rgba(0,0,0,.5)"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
            L.marker([s.ubicacion.lat, s.ubicacion.lng], { icon: icono }).addTo(capasResc)
                .bindPopup(`<b>🆘 ${esc(s.nombre || "Usuario")}</b><br>${esc(s.empresa || "")} · ${hora(s.fechaMs)}<br><a target="_blank" href="https://www.google.com/maps?q=${s.ubicacion.lat},${s.ubicacion.lng}">Abrir en Google Maps</a>`);
            puntos.push([s.ubicacion.lat, s.ubicacion.lng]);
        }
    });
    if (perfil.ubicacion && typeof perfil.ubicacion.lat === "number") {
        const yo = L.divIcon({ className: "", html: `<div style="background:#3498db;width:14px;height:14px;border-radius:50%;border:3px solid #fff"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
        L.marker([perfil.ubicacion.lat, perfil.ubicacion.lng], { icon: yo }).addTo(capasResc).bindPopup("📍 Tu posición");
        puntos.push([perfil.ubicacion.lat, perfil.ubicacion.lng]);
    }
    if (puntos.length) mapaResc.fitBounds(puntos, { padding: [30, 30], maxZoom: 15 });
}
/* ---- SOS pendientes ---- */

function escucharSOS() {
    if (unsubSOS) unsubSOS();
    const q = query(collection(db, COL_SOS), where("estado", "==", "pendiente"), limit(30));
    unsubSOS = onSnapshot(q, (snap) => {
        const cont = document.getElementById("resc-sos");
        if (!cont) return;
        const pendientes = [];
        snap.forEach(d => pendientes.push({ id: d.id, ...d.data() }));
        if (pendientes.length === 0) {
            cont.innerHTML = `<div class="rec-card rec-vacio">No hay emergencias pendientes</div>`;
            actualizarMapaResc([]);
            return;
        }
        cont.innerHTML = pendientes.map(sosCardHTML).join("");
        actualizarMapaResc(pendientes);
        
        cont.querySelectorAll("[data-tomar]").forEach(b =>
            b.addEventListener("click", () => tomarEmergencia(b.dataset.tomar)));
    }, (err) => console.warn("rescatista: error escuchando SOS", err));
}

function sosCardHTML(s) {
    const hay = s.ubicacion && typeof s.ubicacion.lat === "number";
    let dist = "—";
    if (hay && perfil.ubicacion) {
        dist = haversineKm(perfil.ubicacion, s.ubicacion).toFixed(1) + " km de ti";
    }
    return `
        <div class="rec-card rec-sos rec-datos">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
                <b>🆘 ${esc(s.nombre || "Usuario registrado")}</b>
                <span class="rec-badge info">${esc(s.equipo || "")}</span>
            </div>
            <span class="lbl">Empresa:</span> ${esc(s.empresa || "—")} ·
            <span class="lbl">Hora:</span> ${hora(s.fechaMs)}<br>
            <span class="lbl">Ubicación:</span> ${hay ? `${s.ubicacion.lat.toFixed(5)}, ${s.ubicacion.lng.toFixed(5)} (±${Math.round(s.ubicacion.precision || 0)}m)` : "no disponible"} ·
            <span class="lbl">Distancia:</span> ${dist}
            <div class="rec-acciones">
                ${hay ? `<a class="rec-btn" style="text-decoration:none;text-align:center" target="_blank" href="https://www.google.com/maps?q=${s.ubicacion.lat},${s.ubicacion.lng}">📍 Ver mapa</a>` : ""}
                <button class="rec-btn rojo" data-tomar="${s.id}">🆘 Tomar emergencia</button>
            </div>
        </div>
    `;
}

async function tomarEmergencia(emergenciaId) {
    if (perfil.disponibilidad !== "Disponible") {
        return alert("Tu estado no es 'Disponible'. Cámbialo antes de tomar una emergencia.");
    }
    try {
        const q = query(collection(db, COL_ASIG), where("emergenciaId", "==", emergenciaId));
        const ya = await getDocs(q);
        const activa = ya.docs.map(d => ({ id: d.id, ...d.data() }))
            .find(a => ESTADOS_ACTIVOS.includes(a.estado));

        if (activa && activa.rescatistaUid) return alert("Otro rescatista ya tomó esta emergencia.");

        const sosDoc = await getDoc(doc(db, COL_SOS, emergenciaId));
        if (!sosDoc.exists()) return alert("La emergencia ya no existe.");
        const sos = sosDoc.data();

        if (activa) {
            // Ya hay ambulancia en camino: te unes a esa misma atención
            await updateDoc(doc(db, COL_ASIG, activa.id), {
                rescatistaUid: uid,
                rescatistaDeviceId: deviceId,
                rescatistaNombre: perfil.nombres,
                estado: "aceptada",
                aceptadaEn: serverTimestamp(),
                fechaMs: Date.now()
            });
        } else {
            await addDoc(collection(db, COL_ASIG), {
                emergenciaId,
                nombre: sos.nombre || "Usuario registrado",
                empresa: sos.empresa || "",
                dni: sos.dni || "",
                celular: sos.celular || "",
                lat: sos.ubicacion?.lat ?? null,
                lng: sos.ubicacion?.lng ?? null,
                precision: sos.ubicacion?.precision ?? null,
                rescatistaUid: uid,
                rescatistaDeviceId: deviceId,
                rescatistaNombre: perfil.nombres,
                ambulanciaId: null,
                ambAuthUid: null,
                ambulanciaCodigo: "",
                estado: "aceptada",
                aceptadaEn: serverTimestamp(),
                fechaMs: Date.now()
            });
        }
        await updateDoc(doc(db, COL_SOS, emergenciaId), {
            estado: "atendida",
            atendidaPor: `Rescatista: ${perfil.nombres}`,
            atendidaEn: serverTimestamp()
        });
        await updateDoc(doc(db, COL_RES, uid), { disponibilidad: "Atendiendo emergencia", fechaMs: Date.now() });
        perfil.disponibilidad = "Atendiendo emergencia";
        pintarCabecera();
    } catch (e) {
        alert("No se pudo tomar la emergencia: " + e.message);
    }
}

/* ---- Mi asignación (línea de tiempo) ---- */

function escucharMisAsignaciones() {
    if (unsubAsig) unsubAsig();
    const q = query(collection(db, COL_ASIG), where("rescatistaUid", "==", uid), limit(10));
    unsubAsig = onSnapshot(q, (snap) => {
        const cont = document.getElementById("resc-asig");
        if (!cont) return;
        const activas = [];
        snap.forEach(d => { if (ESTADOS_ACTIVOS.includes(d.data().estado)) activas.push({ id: d.id, ...d.data() }); });
        if (activas.length === 0) {
            cont.innerHTML = `<div class="rec-card rec-vacio">Sin asignaciones activas</div>`;
            return;
        }
        cont.innerHTML = activas.map(asigCardHTML).join("");
        cont.querySelectorAll("[data-avanzar]").forEach(b =>
            b.addEventListener("click", () => avanzarAsignacion(b.dataset.avanzar, b.dataset.estado)));
    }, (err) => console.warn("rescatista: error escuchando asignaciones", err));
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
    if (a.estado === "aceptada") acciones = `<button class="rec-btn naranja" data-avanzar="${a.id}" data-estado="en_camino">🚑 En camino</button>`;
    if (a.estado === "en_camino") acciones = `<button class="rec-btn" data-avanzar="${a.id}" data-estado="en_lugar">📍 Llegué al lugar</button>`;
    if (a.estado === "en_lugar") acciones = `
        <select id="resc-resultado" class="rec-campo" style="flex:1">
            ${RESULTADOS.map(r => `<option>${r}</option>`).join("")}
        </select>
        <button class="rec-btn verde" data-avanzar="${a.id}" data-estado="finalizada">✅ Finalizar</button>`;
    return `
        <div class="rec-card rec-sos verde rec-datos">
            <b>🆘 ${esc(a.nombre)}</b> · <span class="lbl">hora SOS:</span> ${hora(a.fechaMs)}<br>
            <span class="lbl">Ubicación:</span> ${hay ? `${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}` : "no disponible"} ·
            <span class="lbl">Ambulancia:</span> ${esc(a.ambulanciaCodigo || "sin asignar")}<br>
            ${timelineHTML(a)}
            <div class="rec-acciones">
                ${hay ? `<a class="rec-btn gris" style="text-decoration:none;text-align:center" target="_blank" href="https://www.google.com/maps?q=${a.lat},${a.lng}">📍 Mapa</a>` : ""}
                ${acciones}
            </div>
        </div>
    `;
}

async function avanzarAsignacion(id, nuevoEstado) {
    try {
        const campos = { estado: nuevoEstado };
        if (nuevoEstado === "aceptada") campos.aceptadaEn = serverTimestamp();
        if (nuevoEstado === "en_camino") campos.salidaEn = serverTimestamp();
        if (nuevoEstado === "en_lugar") campos.llegadaEn = serverTimestamp();
        if (nuevoEstado === "finalizada") {
            campos.finEn = serverTimestamp();
            campos.resultado = document.getElementById("resc-resultado")?.value || "Atendido en sitio";
        }
        await updateDoc(doc(db, COL_ASIG, id), campos);
        if (nuevoEstado === "finalizada") {
            const asig = await getDoc(doc(db, COL_ASIG, id));
            const emgId = asig.exists() ? asig.data().emergenciaId : null;
            if (emgId) await updateDoc(doc(db, COL_SOS, emgId), {
                estado: "finalizada",
                finalizadaPor: `Rescatista: ${perfil.nombres}`,
                finalizadaEn: serverTimestamp()
            });
            await updateDoc(doc(db, COL_RES, uid), { disponibilidad: "Disponible", fechaMs: Date.now() });
            
            perfil.disponibilidad = "Disponible";
            pintarCabecera();
        }
    } catch (e) {
        alert("No se pudo actualizar: " + e.message);
    }
}
