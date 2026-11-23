// Centro de Control: único punto de inicio de sesión administrativo.
// Los otros paneles exigen esta sesión; las reglas de Firestore son la barrera real.
import { iniciarSesion, cerrarSesion, observarSesion, esAdministrador, traducirErrorAuth } from "./auth.js";

const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const errorEl = document.getElementById("login-error");
const btnLogin = document.getElementById("btn-login");
const btnLogout = document.getElementById("btn-logout");
let panelModulo = null;
let recursosModulo = null;
let detenerContingencia = null;
let modulosCargados = false;
let secuencia = 0;

function error(mensaje) {
    if (!errorEl) return;
    errorEl.textContent = mensaje;
    errorEl.style.display = "block";
}
function limpiarError() {
    if (errorEl) errorEl.style.display = "none";
}
function ocultarCentral() {
    window.__SARA_ADMIN_AUTENTICADO = false;
    panelModulo?.detenerAdminPanel?.();
    recursosModulo?.detenerRecursosAdmin?.();
    modulosCargados = false;
    detenerContingencia?.();
    detenerContingencia = null;
    document.getElementById("rec-lanzador")?.remove();
    document.getElementById("rec-overlay")?.remove();
    loginScreen.style.display = "flex";
    appScreen.style.display = "none";
    btnLogin.disabled = false;
    btnLogin.textContent = "Ingresar";
}

async function iniciarModulos() {
    if (!panelModulo) panelModulo = await import("./admin-panel.js");
    if (!window.__SARA_ADMIN_AUTENTICADO) return;
    panelModulo.iniciarAdminPanel();
    if (!modulosCargados) {
        if (!recursosModulo) recursosModulo = await import("./recursos-admin.js");
        if (!window.__SARA_ADMIN_AUTENTICADO) return;
        recursosModulo.iniciarRecursosAdmin();
        modulosCargados = true;
    }
    if (!detenerContingencia) {
        const modulo = await import("./contingencia-admin.js");
        if (!window.__SARA_ADMIN_AUTENTICADO) return;
        detenerContingencia = modulo.iniciarContingenciaAdmin();
    }
}

btnLogin.addEventListener("click", async () => {
    limpiarError();
    const correo = document.getElementById("login-email").value.trim();
    const clave = document.getElementById("login-password").value;
    if (!correo || !clave) { error("Completa correo y contraseña."); return; }
    btnLogin.disabled = true;
    btnLogin.textContent = "Verificando…";
    try {
        const credencial = await iniciarSesion(correo, clave);
        document.getElementById("login-password").value = "";
        if (!esAdministrador(credencial.user)) error("Esta cuenta no tiene permisos de administrador.");
    } catch (e) {
        error(traducirErrorAuth(e.code));
    } finally {
        btnLogin.disabled = false;
        btnLogin.textContent = "Ingresar";
    }
});
btnLogout.addEventListener("click", async () => {
    try { await cerrarSesion(); }
    catch (e) { error("No se pudo cerrar sesión: " + e.message); }
});

observarSesion(async user => {
    const turno = ++secuencia;
    ocultarCentral();
    if (!user) { limpiarError(); return; }
    if (!esAdministrador(user)) {
        error("La cuenta actual no es administradora. Ingresa la cuenta del Centro de Control.");
        return; // No cerrar las sesiones de trabajadores o rescatistas.
    }
    limpiarError();
    window.__SARA_ADMIN_AUTENTICADO = true;
    loginScreen.style.display = "none";
    appScreen.style.display = "flex";
    try {
        await iniciarModulos();
        if (turno !== secuencia || !window.__SARA_ADMIN_AUTENTICADO) ocultarCentral();
    } catch (e) {
        console.error("Centro de Control:", e);
        if (turno === secuencia) {
            ocultarCentral();
            error("No se pudo iniciar el Centro de Control. Comprueba la conexión y recarga.");
        }
    }
});
