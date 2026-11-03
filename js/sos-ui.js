// js/sos-ui.js
// Une la UI (HTML) con la lógica de registro y botón SOS.
import { asegurarSesionAnonima } from "./auth-anonima.js";
import { registrarUsuario, leerUsuarioActual, yaEstaRegistrado } from "./registro-usuario.js";
import { dispararPanico, cancelarAlerta, vaciarColaOffline } from "./boton-panico.js";

let alertaActualId = null;
let cancelTimer = null;

async function init() {
    // 1) Aseguramos sesión anónima
    try { await asegurarSesionAnonima(); }
    catch (e) { console.error("sos-ui: no se pudo iniciar sesión anónima:", e); return; }

    // 2) ¿Ya está registrado?
    const usuario = await leerUsuarioActual();
    const registrado = !!usuario;

    const card = document.getElementById("sos-registro-card");
    if (!registrado) card.hidden = false;

    // 3) Vaciar cola offline al cargar
    vaciarColaOffline().catch(() => {});

    // 4) Form de registro
    document.getElementById("sos-form-registro").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const datos = {
            nombre: fd.get("nombre"),
            dni: fd.get("dni"),
            celular: fd.get("celular"),
            empresa: fd.get("empresa"),
            aceptoTerminos: fd.get("aceptoTerminos") === "on"
        };
        const errEl = document.getElementById("sos-form-error");
        errEl.hidden = true;

        const res = await registrarUsuario(datos);
        if (!res.ok) {
            errEl.textContent = res.error;
            errEl.hidden = false;
            return;
        }
        card.hidden = true;
    });

    // 5) Botón SOS
    document.getElementById("sos-btn").addEventListener("click", async () => {
        const btn = document.getElementById("sos-btn");
        if (btn.classList.contains("estado-enviado")) return;

        const usuarioActual = await leerUsuarioActual();
        if (!usuarioActual) {
            card.hidden = false;
            return;
        }

        btn.disabled = true;
        const res = await dispararPanico();
        btn.disabled = false;

        if (!res.ok) {
            alert(res.error || "No se pudo enviar la alerta.");
            return;
        }

        btn.classList.add("estado-enviado");
        btn.querySelector(".sos-btn-text").textContent = "✅";

        alertaActualId = res.alertId || null;
        mostrarModalConfirmacion(res.encolada);
    });

    // 6) Modal: cancelar
    document.getElementById("sos-cancel-btn").addEventListener("click", async () => {
        if (!alertaActualId) return;
        await cancelarAlerta(alertaActualId);
        cerrarModal();
        alert("Alerta cancelada.");
    });

    // 7) Modal: cerrar
    document.getElementById("sos-modal-close").addEventListener("click", cerrarModal);
}

function mostrarModalConfirmacion(encolada) {
    const modal = document.getElementById("sos-modal");
    const msg = document.getElementById("sos-modal-msg");
    const cancelWrap = document.getElementById("sos-cancel-wrap");
    msg.textContent = encolada
        ? "Sin conexión. La alerta se enviará automáticamente al recuperar señal."
        : "Tu alerta fue enviada, te contactaremos.";

    modal.hidden = false;

    if (encolada || !alertaActualId) {
        cancelWrap.hidden = true;
        return;
    }
    cancelWrap.hidden = false;
    let restante = 30;
    document.getElementById("sos-cancel-count").textContent = restante;
    if (cancelTimer) clearInterval(cancelTimer);
    cancelTimer = setInterval(() => {
        restante--;
        const el = document.getElementById("sos-cancel-count");
        if (el) el.textContent = restante;
        if (restante <= 0) {
            clearInterval(cancelTimer);
            cancelTimer = null;
            cancelWrap.hidden = true;
        }
    }, 1000);
}

function cerrarModal() {
    document.getElementById("sos-modal").hidden = true;
    if (cancelTimer) { clearInterval(cancelTimer); cancelTimer = null; }
}

init();
