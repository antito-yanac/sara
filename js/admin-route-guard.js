// Protección de interfaz: no se carga el panel antes de verificar la sesión.
// No sustituye las reglas Firestore; GitHub Pages no ofrece autenticación HTTP.
import { observarSesion, esAdministrador } from "./auth.js";

export function protegerPanelAdmin(cargarPanel) {
    if (window.__SARA_ENTRADA_CENTRAL__ !== true) {
        window.location.replace("./administrador.html");
        return () => {};
    }
    let secuencia = 0;
    let cargado = false;
    return observarSesion(async user => {
        const turno = ++secuencia;
        if (!esAdministrador(user)) {
            const destino = window.location.pathname.toLowerCase().includes("adminkeraunos")
                ? "keraunos" : "strikeguard";
            window.location.replace("./administrador.html?destino=" + destino);
            return;
        }
        if (cargado) return;
        cargado = true;
        try {
            await cargarPanel();
            if (turno !== secuencia) {
                window.location.replace("./administrador.html");
            }
        } catch (e) {
            console.error("Error al iniciar panel:", e);
            cargado = false;
            const aviso = document.getElementById("login-container");
            if (aviso) aviso.textContent = "No se pudo abrir el panel. Comprueba la conexión y recarga.";
        }
    });
}
