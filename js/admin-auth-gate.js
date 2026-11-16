// js/admin-auth-gate.js
// ============================================================
// Portero de autenticación del panel de administración.
// - Verifica sesión con onAuthStateChanged.
// - Verifica que el usuario sea admin (email en lista blanca
//   o documento administradores/{uid} autorizado).
// - Solo entonces carga admin-panel.js y recursos-admin.js,
//   y marca window.__SARA_ADMIN_AUTENTICADO = true para que
//   recursos-admin.js pueda crear el botón #rec-lanzador.
// - Al cerrar sesión o si no es admin, elimina del DOM el
//   botón y el overlay, y oculta la app.
// ============================================================

import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut }
    from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { getFirestore, doc, getDoc }
    from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { obtenerApp } from "./firebase-app.js";

const auth = getAuth(obtenerApp());
const db   = getFirestore(obtenerApp());

// Lista blanca de emails admin (mantén la misma que usa admin-panel.js)
const ADMIN_EMAILS = ["coderjava.01@gmail.com"];

// Elementos del DOM
const loginScreen = document.getElementById("login-screen");
const appScreen   = document.getElementById("app-screen");
const errorEl     = document.getElementById("login-error");
const btnLogin    = document.getElementById("btn-login");
const btnLogout   = document.getElementById("btn-logout");

let modulosCargados = false;

/* ---------------- utilidades ---------------- */

function mostrarError(msg) {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.style.display = "block";
}

function ocultarError() {
    if (errorEl) errorEl.style.display = "none";
}

function limpiarUIAdmin() {
    // Eliminar cualquier rastro del panel de recursos
    document.getElementById("rec-lanzador")?.remove();
    document.getElementById("rec-overlay")?.remove();

    // Apagar flag de admin
    window.__SARA_ADMIN_AUTENTICADO = false;

    // Mostrar login, ocultar app
    if (loginScreen) loginScreen.style.display = "flex";
    if (appScreen)   appScreen.style.display = "none";

    // Resetear botón de login
    if (btnLogin) {
        btnLogin.disabled = false;
        btnLogin.textContent = "Ingresar";
    }
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

    // 1) Panel principal (mapa + alertas + usuarios)
    await import("./admin-panel.js");

    // 2) Recursos de emergencia (botón + overlay + listeners)
    const rec = await import("./recursos-admin.js");
    if (typeof rec.iniciarRecursosAdmin === "function") {
        rec.iniciarRecursosAdmin();
    }
}

/* ---------------- login manual ---------------- */

btnLogin?.addEventListener("click", async () => {
    ocultarError();
    const email = document.getElementById("login-email").value.trim();
    const pass  = document.getElementById("login-password").value;

    if (!email || !pass) {
        mostrarError("Completa correo y contraseña.");
        return;
    }

    btnLogin.disabled = true;
    btnLogin.textContent = "Verificando…";

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        // onAuthStateChanged hará el resto
    } catch (e) {
        const map = {
            "auth/invalid-credential": "Correo o contraseña incorrectos.",
            "auth/user-not-found":     "No existe una cuenta con ese correo.",
            "auth/wrong-password":     "Contraseña incorrecta.",
            "auth/too-many-requests":  "Demasiados intentos. Espera un momento."
        };
        mostrarError(map[e.code] || "No se pudo ingresar: " + e.message);
        btnLogin.disabled = false;
        btnLogin.textContent = "Ingresar";
    }
});

/* ---------------- logout ---------------- */

btnLogout?.addEventListener("click", async () => {
    await signOut(auth);
});

/* ---------------- portero principal ---------------- */

onAuthStateChanged(auth, async (user) => {
    // 1) Sin usuario -> login limpio
    if (!user) {
        limpiarUIAdmin();
        modulosCargados = false;
        return;
    }

    // 2) Usuario autenticado: verificar rol admin
    const admin = await esAdmin(user);

    if (!admin) {
        // Autenticado pero NO admin: cerrar sesión y volver al login
        await signOut(auth);
        mostrarError("Esta cuenta no tiene permisos de administrador.");
        limpiarUIAdmin();
        modulosCargados = false;
        return;
    }

    // 3) Admin confirmado
    window.__SARA_ADMIN_AUTENTICADO = true;
    ocultarError();
    if (loginScreen) loginScreen.style.display = "none";
    if (appScreen)   appScreen.style.display = "flex";

    // Cargar módulos y crear botón/overlay de recursos
    await cargarModulosAdmin();
});
