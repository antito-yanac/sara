// js/admin-auth-gate.js
// ============================================================
// Portero de autenticación del panel de administración.
// - Verifica sesión con onAuthStateChanged.
// - Verifica que el usuario sea admin (email en lista blanca
//   o documento administradores/{uid} autorizado).
// - Solo entonces carga admin-panel.js y recursos-admin.js,
//   y crea el botón #rec-lanzador dinámicamente.
// ============================================================

import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut }
    from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { getFirestore, doc, getDoc }
    from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { obtenerApp } from "./firebase-app.js";

const auth = getAuth(obtenerApp());
const db   = getFirestore(obtenerApp());

const ADMIN_EMAILS = ["coderjava.01@gmail.com"]; // lista blanca

const loginScreen = document.getElementById("login-screen");
const appScreen   = document.getElementById("app-screen");
const errorEl     = document.getElementById("login-error");
const btnLogin    = document.getElementById("btn-login");

let modulosCargados = false;

function mostrarError(msg) {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.style.display = "block";
}

function ocultarError() {
    if (errorEl) errorEl.style.display = "none";
}

async function esAdmin(user) {
    if (!user) return false;
    // 1) Lista blanca por email (rápido)
    if (user.email && ADMIN_EMAILS.includes(user.email)) return true;
    // 2) Documento administradores/{uid} autorizado (más flexible)
    try {
        const snap = await getDoc(doc(db, "administradores", user.uid));
        return snap.exists() && snap.data().estado === "autorizado";
    } catch {
        return false;
    }
}

async function cargarModulosAdmin() {
    if (modulosCargados) return;
    modulosCargados = true;
    // Carga dinámica: solo ocurre si es admin
    await import("./admin-panel.js");
    await import("./recursos-admin.js");
}

function crearBotonLanzador() {
    // Si ya existe, no duplicar
    if (document.getElementById("rec-lanzador")) return;

    const btn = document.createElement("button");
    btn.id = "rec-lanzador";
    btn.textContent = "🚑 Recursos de Emergencia";
    // Estilo mínimo; si tienes CSS para #rec-lanzador, se aplica solo
    btn.style.cssText = `
        position: fixed;
        bottom: 16px;
        left: 16px;
        z-index: 1100;
        padding: 10px 14px;
        border: 0;
        border-radius: 8px;
        background: #e74c3c;
        color: #fff;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,.4);
    `;
    document.body.appendChild(btn);
}

// ---------- Flujo de login manual ----------
btnLogin?.addEventListener("click", async () => {
    ocultarError();
    const email = document.getElementById("login-email").value.trim();
    const pass  = document.getElementById("login-password").value;
    if (!email || !pass) return mostrarError("Completa correo y contraseña.");
    btnLogin.disabled = true;
    btnLogin.textContent = "Verificando…";
    try {
        await signInWithEmailAndPassword(auth, email, pass);
        // onAuthStateChanged hará el resto
    } catch (e) {
        const map = {
            "auth/invalid-credential": "Correo o contraseña incorrectos.",
            "auth/user-not-found": "No existe una cuenta con ese correo.",
            "auth/wrong-password": "Contraseña incorrecta.",
            "auth/too-many-requests": "Demasiados intentos. Espera un momento."
        };
        mostrarError(map[e.code] || "No se pudo ingresar: " + e.message);
    } finally {
        btnLogin.disabled = false;
        btnLogin.textContent = "Ingresar";
    }
});

// ---------- Logout ----------
document.getElementById("btn-logout")?.addEventListener("click", async () => {
    await signOut(auth);
});

// ---------- Portero principal ----------
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        // Sin sesión: login visible, app oculta, sin botón, sin módulos
        loginScreen.style.display = "flex";
        appScreen.style.display = "none";
        document.getElementById("rec-lanzador")?.remove();
        modulosCargados = false;
        return;
    }

    const admin = await esAdmin(user);
    if (!admin) {
        // Autenticado pero NO admin: fuera
        await signOut(auth);
        mostrarError("Esta cuenta no tiene permisos de administrador.");
        loginScreen.style.display = "flex";
        appScreen.style.display = "none";
        document.getElementById("rec-lanzador")?.remove();
        return;
    }

    // ✅ Admin confirmado: mostrar app, cargar módulos y crear botón
    loginScreen.style.display = "none";
    appScreen.style.display = "flex";
    await cargarModulosAdmin();
    crearBotonLanzador();
});
