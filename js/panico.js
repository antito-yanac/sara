// js/panico.js
// ============================================================
// Botón de pánico + modal + envío a colección privada + WhatsApp
// v5: Usa obtenerFirestore() con persistencia local.
// ============================================================

import { mostrarToast } from "./notifications.js";
import { collection, addDoc, serverTimestamp }
    from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { getAuth, signInAnonymously }
    from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { obtenerApp, obtenerFirestore } from "./firebase-app.js";

const COLECCION_PANICO = "panico_solicitudes";

const CALLMEBOT_PHONE  = "+51954125058";
const CALLMEBOT_APIKEY = "9034887";

const GPS_CACHE_KEY        = "keraunos_gps_cache";
const GPS_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const GPS_FRESH_TIMEOUT_MS = 15 * 1000;
const GPS_PRECAPTURA_MS    = 8 * 1000;

let gpsActual = null;
let gpsError = null;
let watchId = null;
let modalAbierto = false;
let enviando = false;
let intervalConfirm = null;

function guardarGPSCache(pos) {
    try {
        localStorage.setItem(GPS_CACHE_KEY, JSON.stringify({
            lat: pos.lat,
            lng: pos.lng,
            accuracy: pos.accuracy,
            ts: Date.now()
        }));
    } catch (e) {}
}

function leerGPSCache() {
    try {
        const raw = localStorage.getItem(GPS_CACHE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || typeof data.lat !== "number" || typeof data.lng !== "number") return null;
        if (!data.ts || (Date.now() - data.ts) > GPS_CACHE_MAX_AGE_MS) return null;
        return data;
    } catch { return null; }
}

function pedirGPS(timeoutMs, altaPrecision) {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("no-soportado"));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy
            }),
            (err) => reject(err),
            {
                enableHighAccuracy: altaPrecision,
                timeout: timeoutMs,
                maximumAge: GPS_CACHE_MAX_AGE_MS
            }
        );
    });
}

function precapturarGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            guardarGPSCache({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy
            });
            console.log("panico: GPS pre-capturado");
        },
        () => {},
        { enableHighAccuracy: false, timeout: GPS_PRECAPTURA_MS, maximumAge: 120000 }
    );
}

async function capturarGPSRapido() {
    gpsError = null;

    const cache = leerGPSCache();
    if (cache) {
        gpsActual = { lat: cache.lat, lng: cache.lng, accuracy: cache.accuracy };
        actualizarTextoGPS();
    }

    try {
        const fresh = await pedirGPS(GPS_FRESH_TIMEOUT_MS, false);
        gpsActual = fresh;
        guardarGPSCache(fresh);
        actualizarTextoGPS();
    } catch (e) {
        if (!gpsActual) {
            try {
                const fresh2 = await pedirGPS(GPS_FRESH_TIMEOUT_MS, true);
                gpsActual = fresh2;
                guardarGPSCache(fresh2);
                actualizarTextoGPS();
            } catch (e2) {
                gpsError = traducirErrorGPS(e2);
                actualizarTextoGPS();
            }
        }
    }

    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(
        (pos) => {
            gpsActual = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy
            };
            guardarGPSCache(gpsActual);
            gpsError = null;
            actualizarTextoGPS();
        },
        () => {},
        { enableHighAccuracy: false, maximumAge: 60000, timeout: 30000 }
    );
}

function traducirErrorGPS(err) {
    if (!err) return "Error desconocido";
    switch (err.code) {
        case 1: return "Permiso de ubicación denegado";
        case 2: return "Ubicación no disponible. Verifica el GPS";
        case 3: return "Tiempo de espera agotado";
        default: return err.message || "Error desconocido";
    }
}

function actualizarTextoGPS() {
    const el = document.getElementById("panico-gps-texto");
    const cont = document.getElementById("panico-gps");
    if (!el || !cont) return;

    if (gpsActual) {
        el.textContent = `📍 ${gpsActual.lat.toFixed(6)}, ${gpsActual.lng.toFixed(6)}` +
                         (gpsActual.accuracy ? ` (±${Math.round(gpsActual.accuracy)}m)` : "");
        cont.classList.add("panico-gps-ok");
        cont.classList.remove("panico-gps-error");
    } else if (gpsError) {
        el.textContent = `⚠️ ${gpsError}`;
        cont.classList.add("panico-gps-error");
        cont.classList.remove("panico-gps-ok");
    } else {
        el.textContent = "Capturando ubicación...";
        cont.classList.remove("panico-gps-ok", "panico-gps-error");
    }
}

function detenerGPS() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
}

async function asegurarSesion() {
    const auth = getAuth(obtenerApp());
    if (auth.currentUser) return auth.currentUser;
    const cred = await signInAnonymously(auth);
    console.log("panico: sesión anónima creada:", cred.user.uid);
    return cred.user;
}

function inyectarEstructura() {
    if (document.getElementById("btn-panico")) return;

    const btn = document.createElement("button");
    btn.id = "btn-panico";
    btn.title = "Solicitar ayuda";
    btn.setAttribute("aria-label", "Solicitar ayuda");
    btn.innerHTML = `<span class="panico-btn-emoji">🆘</span>`;

    const btnUbic = document.getElementById("btn-ubicacion");
    if (btnUbic && btnUbic.parentNode) {
        btnUbic.parentNode.insertBefore(btn, btnUbic.nextSibling);
    } else {
        document.body.appendChild(btn);
    }

    const modalHtml = `
    <div id="panico-overlay" class="panico-overlay">
        <div class="panico-modal">
            <button class="panico-cerrar" id="panico-btn-cerrar" aria-label="Cerrar">×</button>
            <h2 class="panico-titulo">🆘 Solicitar ayuda</h2>
            <p class="panico-subtitulo">Completa los datos. Tu ubicación se capturará automáticamente.</p>

            <div class="panico-campo">
                <label for="panico-dni">🪪 DNI (8 dígitos)</label>
                <input type="tel" inputmode="numeric" pattern="[0-9]*"
                       id="panico-dni" maxlength="8" autocomplete="off"
                       placeholder="12345678">
            </div>

            <div class="panico-campo">
                <label for="panico-telefono">📱 Teléfono / Celular (9 dígitos)</label>
                <input type="tel" inputmode="numeric" pattern="[0-9]*"
                       id="panico-telefono" maxlength="9" autocomplete="off"
                       placeholder="987654321">
            </div>

            <div class="panico-campo">
                <label for="panico-descripcion">📝 Descripción (opcional)</label>
                <textarea id="panico-descripcion"
                          placeholder="Describe brevemente tu situación..."
                          maxlength="300" rows="3"></textarea>
            </div>

            <div class="panico-gps" id="panico-gps">
                <span class="panico-gps-icono">📍</span>
                <span class="panico-gps-texto" id="panico-gps-texto">Capturando ubicación...</span>
            </div>

            <button class="panico-btn-enviar" id="panico-btn-enviar">
                🆘 ENVIAR SOLICITUD
            </button>

            <p class="panico-nota">Tu solicitud será atendida por el equipo de vigilancia.</p>
        </div>
    </div>`;

    const cont = document.createElement("div");
    cont.innerHTML = modalHtml;
    document.body.appendChild(cont.firstElementChild);

    btn.addEventListener("click", abrirModal);
    document.getElementById("panico-btn-cerrar").addEventListener("click", cerrarModal);
    document.getElementById("panico-overlay").addEventListener("click", (e) => {
        if (e.target.id === "panico-overlay") cerrarModal();
    });
    document.getElementById("panico-btn-enviar").addEventListener("click", enviarSolicitud);

    document.getElementById("panico-dni").addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/\D/g, "").slice(0, 8);
    });
    document.getElementById("panico-telefono").addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/\D/g, "").slice(0, 9);
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modalAbierto) cerrarModal();
    });
}

function abrirModal() {
    inyectarEstructura();
    document.getElementById("panico-overlay").classList.add("panico-visible");
    modalAbierto = true;

    const btn = document.getElementById("panico-btn-enviar");
    btn.disabled = false;
    btn.innerHTML = "🆘 ENVIAR SOLICITUD";

    document.getElementById("panico-dni").focus();
    capturarGPSRapido();
}

function cerrarModal() {
    const overlay = document.getElementById("panico-overlay");
    if (overlay) overlay.classList.remove("panico-visible");
    modalAbierto = false;
    detenerGPS();
}

async function enviarSolicitud() {
    if (enviando) return;

    const btn = document.getElementById("panico-btn-enviar");
    const dniEl = document.getElementById("panico-dni");
    const telEl = document.getElementById("panico-telefono");
    const descEl = document.getElementById("panico-descripcion");

    const dni = (dniEl.value || "").trim();
    const telefono = (telEl.value || "").trim();
    const descripcion = (descEl.value || "").trim();

    if (!/^\d{8}$/.test(dni)) {
        mostrarToast("⚠️ DNI inválido", "El DNI debe tener exactamente 8 dígitos.", "alerta", true);
        dniEl.focus();
        return;
    }
    if (!/^\d{9}$/.test(telefono)) {
        mostrarToast("⚠️ Teléfono inválido", "El teléfono debe tener exactamente 9 dígitos.", "alerta", true);
        telEl.focus();
        return;
    }

    enviando = true;
    btn.disabled = true;
    btn.innerHTML = "⏳ Enviando...";

    try {
        if (!gpsActual) {
            btn.innerHTML = "⏳ Obteniendo ubicación...";
            const cache = leerGPSCache();
            if (cache) {
                gpsActual = { lat: cache.lat, lng: cache.lng, accuracy: cache.accuracy };
            } else {
                try {
                    gpsActual = await pedirGPS(20000, false);
                    guardarGPSCache(gpsActual);
                } catch (e) {
                    try {
                        gpsActual = await pedirGPS(15000, true);
                        guardarGPSCache(gpsActual);
                    } catch (e2) {
                        gpsError = traducirErrorGPS(e2);
                        mostrarToast("📍 Falta ubicación",
                            "No se pudo capturar tu ubicación. Verifica el GPS y los permisos.",
                            "alerta", true);
                        return;
                    }
                }
            }
            actualizarTextoGPS();
        }

        btn.innerHTML = "⏳ Conectando...";
        try {
            await asegurarSesion();
        } catch (e) {
            console.error("panico: error auth", e);
            mostrarToast("⚠️ Error de conexión",
                "No se pudo conectar con el servidor. Intenta de nuevo.",
                "alerta", true);
            return;
        }

        btn.innerHTML = "⏳ Enviando...";
        let okFirestore = false;
        try {
            const db = obtenerFirestore();
            const ref = collection(db, COLECCION_PANICO);
            const docRef = await addDoc(ref, {
                dni:         dni,
                telefono:    telefono,
                descripcion: descripcion,
                lat:         gpsActual.lat,
                lng:         gpsActual.lng,
                accuracy:    gpsActual.accuracy || null,
                fecha:       serverTimestamp(),
                fechaMs:     Date.now(),
                atendido:    false,
                origen:      "index.html"
            });
            console.log("panico: doc creado", docRef.id);
            okFirestore = true;
        } catch (e) {
            console.error("panico: error Firestore", e);
        }

        try {
            enviarWhatsApp(dni, telefono, descripcion, gpsActual.lat, gpsActual.lng);
        } catch (e) {
            console.warn("panico: WhatsApp falló", e);
        }

        if (okFirestore) {
            mostrarConfirmacionEnviada();
            cerrarModal();
            dniEl.value = "";
            telEl.value = "";
            descEl.value = "";
        } else {
            mostrarToast("⚠️ No se pudo enviar",
                "Revisa tu conexión. Si es urgente, llama al 911.",
                "alerta", true);
        }

    } catch (e) {
        console.error("panico: error inesperado", e);
        mostrarToast("⚠️ Error", "Ocurrió un problema. Intenta de nuevo.", "alerta", true);
    } finally {
        enviando = false;
        btn.disabled = false;
        btn.innerHTML = "🆘 ENVIAR SOLICITUD";
    }
}

function mostrarConfirmacionEnviada() {
    document.getElementById("panico-confirm")?.remove();
    if (intervalConfirm) {
        clearInterval(intervalConfirm);
        intervalConfirm = null;
    }

    const card = document.createElement("div");
    card.id = "panico-confirm";
    card.className = "panico-confirm";
    card.innerHTML = `
        <button class="panico-confirm-cerrar" aria-label="Cerrar">×</button>
        <div class="panico-confirm-header">
            <span class="panico-confirm-icono">✅</span>
            <div>
                <div class="panico-confirm-titulo">Ayuda enviada</div>
                <div class="panico-confirm-sub">Vigilancia ha sido notificada</div>
            </div>
        </div>
        <div class="panico-confirm-countdown">
            Se cerrará en <strong id="panico-confirm-seg">60</strong>s
        </div>
    `;
    document.body.appendChild(card);

    let restante = 60;
    const segEl = card.querySelector("#panico-confirm-seg");

    function cerrar() {
        if (intervalConfirm) {
            clearInterval(intervalConfirm);
            intervalConfirm = null;
        }
        card.classList.add("panico-confirm-out");
        setTimeout(() => card.remove(), 400);
    }

    intervalConfirm = setInterval(() => {
        restante--;
        if (segEl) segEl.textContent = String(restante);
        if (restante <= 0) cerrar();
    }, 1000);

    card.querySelector(".panico-confirm-cerrar").addEventListener("click", cerrar);
}

function enviarWhatsApp(dni, telefono, descripcion, lat, lng) {
    if (!CALLMEBOT_APIKEY || CALLMEBOT_APIKEY === "TU_API_KEY_AQUI") {
        console.warn("panico: CallMeBot no configurado. Se omite WhatsApp.");
        return;
    }

    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    const hora = new Date().toLocaleString("es-PE");

    const texto = [
        "🚨 SOLICITUD DE AYUDA 🚨",
        "",
        `🪪 DNI: ${dni}`,
        `📱 Teléfono: ${telefono}`,
        `📝 Descripción: ${descripcion || "(sin descripción)"}`,
        "",
        `📍 Ubicación: ${mapsUrl}`,
        `🌐 Coordenadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        `🕒 Hora: ${hora}`
    ].join("\n");

    const tel = CALLMEBOT_PHONE.replace("+", "");
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(tel)}&text=${encodeURIComponent(texto)}&apikey=${encodeURIComponent(CALLMEBOT_APIKEY)}`;

    const img = new Image();
    img.src = url;
    img.onload = () => console.log("panico: WhatsApp enviado (confirmado)");
    img.onerror = () => console.log("panico: WhatsApp enviado (sin confirmación visual)");
}

function init() {
    inyectarEstructura();
    setTimeout(precapturarGPS, 2000);
    setInterval(precapturarGPS, 2 * 60 * 1000);
    console.log("🆘 panico.js inicializado");
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
