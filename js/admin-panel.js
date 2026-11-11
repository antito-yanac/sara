// js/admin-panel.js
// ============================================================
// Lógica del Panel de Administración (Admin.html)
// ============================================================

import { obtenerAuth, obtenerFirestore } from "./firebase-app.js";
import { ADMIN_EMAIL, COLECCIONES } from "./firebase-config.js";
import { 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { 
    collection, 
    query, 
    orderBy, 
    limit, 
    onSnapshot, 
    doc, 
    updateDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

// Inicializar Firebase
const auth = obtenerAuth();
const db = obtenerFirestore();

// Variables globales
let mapa = null;
let markersAlerta = {}; // Guardar referencias a los marcadores en el mapa
let alertasActuales = new Set(); // Para no duplicar tarjetas
let alertasCache = [];            // Alertas visibles (pendiente + atendida)
let asignacionesPorEmergencia = {}; // asignaciones_sos activas por emergenciaId

// Elementos del DOM
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginError = document.getElementById("login-error");
const btnLogin = document.getElementById("btn-login");
const btnLogout = document.getElementById("btn-logout");
const listaUsuarios = document.getElementById("usuarios-lista");
const contenedorAlertas = document.getElementById("alertas-container");
const emptyAlertas = document.getElementById("empty-alertas");

// ======================================================
// 1. AUTENTICACIÓN (Solo ADMIN_EMAIL puede entrar)
// ======================================================
btnLogin.addEventListener("click", async () => {
    const email = loginEmail.value.trim();
    const pass = loginPassword.value;
    
    if (!email || !pass) {
        mostrarError("Completa todos los campos");
        return;
    }

    btnLogin.disabled = true;
    btnLogin.textContent = "Ingresando...";

    try {
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        
        // Verificar que sea el administrador
        if (cred.user.email !== ADMIN_EMAIL) {
            await signOut(auth);
            throw new Error("No tienes permisos de administrador.");
        }
    } catch (e) {
        console.error("Error login:", e);
        let msg = "Credenciales incorrectas.";
        if (e.message.includes("permissions")) msg = e.message;
        if (e.code === "auth/invalid-credential") msg = "Correo o contraseña incorrectos.";
        mostrarError(msg);
        btnLogin.disabled = false;
        btnLogin.textContent = "Ingresar";
    }
});

// Escuchar estado de sesión
onAuthStateChanged(auth, (user) => {
    if (user && user.email === ADMIN_EMAIL) {
        // Usuario correcto
        loginScreen.style.display = "none";
        appScreen.style.display = "flex";
        iniciarPanel();
    } else {
        // No logueado o no es admin
        loginScreen.style.display = "flex";
        appScreen.style.display = "none";
        btnLogin.disabled = false;
        btnLogin.textContent = "Ingresar";
    }
});

btnLogout.addEventListener("click", () => {
    signOut(auth);
});

function mostrarError(msg) {
    loginError.textContent = msg;
    loginError.style.display = "block";
}

// ======================================================
// 2. INICIAR PANEL (Mapa + Listeners)
// ======================================================
function iniciarPanel() {
    if (mapa) return; // Evitar doble inicialización

    // Inicializar Mapa Leaflet (Centro en Antamina aproximado)
    mapa = L.map('map').setView([-9.55, -77.04], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapa);

    // Iniciar listeners
    escucharUsuarios();
    escucharAlertas();
}

// ======================================================
// 3. ESCUCHAR USUARIOS (Sidebar)
// ======================================================
function escucharUsuarios() {
    const q = query(collection(db, COLECCIONES.USUARIOS), orderBy("nombre", "asc"));
    
    onSnapshot(q, (snap) => {
        listaUsuarios.innerHTML = "";
        if (snap.empty) {
            listaUsuarios.innerHTML = "<div style='padding:15px;color:#888'>No hay usuarios registrados</div>";
            return;
        }

        snap.forEach(docSnap => {
            const u = docSnap.data();
            const div = document.createElement("div");
            div.className = `user-card ${u.estado === 'inactivo' ? 'inactivo' : ''}`;
            
            div.innerHTML = `
                <strong>${u.nombre}</strong>
                <span>🪪 ${u.dni} | 📱 ${u.celular}</span>
                <span>🏢 ${u.empresa || 'Sin empresa'}</span>
                <span style="font-size:11px">ID: ${docSnap.id}</span>
                <button class="btn-toggle" data-id="${docSnap.id}" data-estado="${u.estado}">
                    ${u.estado === 'activo' ? '⛔ Desactivar' : '✅ Activar'}
                </button>
            `;
            listaUsuarios.appendChild(div);
        });

        // Eventos de los botones
        document.querySelectorAll(".btn-toggle").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const id = e.target.dataset.id;
                const estadoActual = e.target.dataset.estado;
                const nuevoEstado = estadoActual === 'activo' ? 'inactivo' : 'activo';
                
                e.target.disabled = true;
                e.target.textContent = "...";
                
                try {
                    await updateDoc(doc(db, COLECCIONES.USUARIOS, id), {
                        estado: nuevoEstado
                    });
                } catch (error) {
                    alert("Error al cambiar estado: " + error.message);
                    e.target.disabled = false;
                    e.target.textContent = "Reintentar";
                }
            });
        });
    });
}

// ======================================================
// 4. ESCUCHAR ALERTAS (Panel derecho + Mapa)
// ======================================================
function escucharAlertas() {
    const q = query(
        collection(db, COLECCIONES.PANIC_ALERTS),
        orderBy("timestamp", "desc"),
        limit(20)
    );

    onSnapshot(q, (snap) => {
        const activas = [];
        snap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.estado !== "finalizada" && data.estado !== "cancelada") {
                activas.push({ id: docSnap.id, ...data });
            }
        });
        alertasCache = activas;
        refrescarAlertas();
    });

    // Seguimiento: quién tomó cada emergencia y en qué estado va
    const qa = query(
        collection(db, "asignaciones_sos"),
        where("estado", "in", ["asignada", "aceptada", "en_camino", "en_lugar"])
    );
    onSnapshot(qa, (snap) => {
        asignacionesPorEmergencia = {};
        snap.forEach(docSnap => {
            const a = docSnap.data();
            asignacionesPorEmergencia[a.emergenciaId] = a;
        });
        refrescarAlertas();
    });
}

function refrescarAlertas() {
    if (!mapa) return;
    contenedorAlertas.innerHTML = "";
    Object.values(markersAlerta).forEach(marker => mapa.removeLayer(marker));
    markersAlerta = {};

    if (alertasCache.length === 0) {
        contenedorAlertas.innerHTML = '<div class="empty-state">No hay alertas pendientes</div>';
        return;
    }
    alertasCache.forEach(a => {
        renderizarAlerta(a);
        ponerMarcadorEnMapa(a);
    });
}

function renderizarAlerta(a) {
    const card = document.createElement("div");
    const atendida = a.estado === "atendida";
    card.className = atendida ? "alerta-card alerta-atendida" : "alerta-card";

    let horaStr = "Desconocida";
    if (a.timestamp && typeof a.timestamp.toDate === "function") {
        horaStr = a.timestamp.toDate().toLocaleTimeString();
    }

    const lat = a.ubicacion?.lat;
    const lng = a.ubicacion?.lng;
    const hayUbicacion = lat != null && lng != null;

    // Línea de seguimiento: quién tomó la alerta y en qué va
    const asig = asignacionesPorEmergencia[a.id];
    let lineaAsig = "";
    if (asig) {
        const paso = { asignada: "asignada", aceptada: "aceptó el SOS", en_camino: "🚑 EN CAMINO al auxilio", en_lugar: "📍 atendiendo en el lugar" }[asig.estado] || asig.estado;
        lineaAsig = `<div style="margin:8px 0;padding:8px 10px;border-radius:8px;background:rgba(39,174,96,.12);border:1px solid #27ae60;font-size:13px">🚨 <b>${asig.rescatistaNombre || "Equipo de rescate"}</b> ${paso}` +
            (asig.ambulanciaCodigo ? ` · Ambulancia <b>${asig.ambulanciaCodigo}</b> en auxilio` : "") + `</div>`;
    }

    card.innerHTML = `
        <div class="alerta-header">
            <h4>🆘 ALERTA DE PÁNICO</h4>
            <span class="alerta-time">${horaStr}</span>
        </div>
        <div class="alerta-data">
            <b>Nombre:</b> ${a.nombre}<br>
            <b>DNI:</b> ${a.dni}<br>
            <b>Celular:</b> ${a.celular}<br>
            <b>Empresa:</b> ${a.empresa}<br>
            <b>Ubicación:</b> ${hayUbicacion ? 'Sí' : 'No disponible'}
        </div>
        ${lineaAsig}
        <div class="alerta-actions">
            <button class="btn-ubicar" ${!hayUbicacion ? 'disabled' : ''}>📍 Ver</button>
            ${atendida
                ? `<button class="btn-finalizar" data-id="${a.id}">✔ SOS finalizado</button>`
                : `<button class="btn-atender" data-id="${a.id}">✓ Atender</button>`}
        </div>
    `;

    if (hayUbicacion) {
        card.querySelector(".btn-ubicar").addEventListener("click", () => {
            mapa.flyTo([lat, lng], 16, { duration: 1.5 });
            if (markersAlerta[a.id]) markersAlerta[a.id].openPopup();
        });
    }

    card.querySelector(atendida ? ".btn-finalizar" : ".btn-atender").addEventListener("click", async (e) => {
        const btn = e.target;
        btn.disabled = true;
        btn.textContent = "...";
        try {
            if (atendida) {
                await updateDoc(doc(db, COLECCIONES.PANIC_ALERTS, a.id), {
                    estado: "finalizada",
                    finalizadaPor: ADMIN_EMAIL,
                    finalizadaEn: serverTimestamp()
                });
            } else {
                await updateDoc(doc(db, COLECCIONES.PANIC_ALERTS, a.id), {
                    estado: "atendida",
                    atendidaPor: ADMIN_EMAIL,
                    atendidaEn: serverTimestamp()
                });
            }
        } catch (error) {
            alert("Error: " + error.message);
            btn.disabled = false;
            btn.textContent = atendida ? "✔ SOS finalizado" : "✓ Atender";
        }
    });

    contenedorAlertas.appendChild(card);
}

function ponerMarcadorEnMapa(a) {
    const lat = a.ubicacion?.lat;
    const lng = a.ubicacion?.lng;
    if (lat == null || lng == null) return;

    // Rojo = pendiente, verde = atendida
    const color = (a.estado === "atendida") ? "#27ae60" : "#e74c3c";
    const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color:${color};width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px rgba(0,0,0,0.5);animation:pulse 1.5s infinite;"></div>
               <style>@keyframes pulse { 0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.7); } 70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(231, 76, 60, 0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(231, 76, 60, 0); } }</style>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    const marker = L.marker([lat, lng], { icon }).addTo(mapa);
    marker.bindPopup(`
        <b>🆘 ${a.nombre}</b><br>
        DNI: ${a.dni}<br>
        Celular: ${a.celular}<br>
        Empresa: ${a.empresa}
    `);

    markersAlerta[a.id] = marker;
}
