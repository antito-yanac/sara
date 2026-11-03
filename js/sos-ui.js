// js/sos-ui.js
// ============================================================
// Une la UI (HTML) con la lógica de registro y botón SOS.
// v2:
//   - El registro solo se muestra la PRIMERA vez (o si falta).
//   - El botón SOS exige registro previo: si no hay, muestra el form.
//   - Corrige el cierre del modal de confirmación.
// ============================================================

import { asegurarSesionAnonima } from "./auth-anonima.js";
import { registrarUsuario, leerUsuarioActual } from "./registro-usuario.js";
import { dispararPanico, cancelarAlerta, vaciarColaOffline } from "./boton-panico.js";

let alertaActualId = null;
let cancelTimer = null;

async function init() {
    // 1) Sesión anónima
    try { await asegurarSesionAnonima(); }
    catch (e) { console.error("sos-ui: no se pudo iniciar sesión anónima:", e); return; }
    // --- NUEVA LÍNEA: Asegurar que el modal esté oculto al arrancar ---
    const modalEl = document.getElementById("sos-modal");
    if (modalEl) modalEl.hidden = true;

    // 2) ¿Ya está registrado? Solo mostrar el form si NO lo está.
    const usuario = await leerUsuarioActual();
    const card = document.getElementById("sos-registro-card");
    if (card) card.hidden = !!usuario;

    // 3) Vaciar cola offline
    vaciarColaOffline().catch(() => {});

    // 4) Form de registro
    const formReg = document.getElementById("sos-form-registro");
    if (formReg) {
        formReg.addEventListener("submit", async (ev) => {
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
            if (errEl) errEl.hidden = true;

            const res = await registrarUsuario(datos);
            if (!res.ok) {
                if (errEl) { errEl.textContent = res.error; errEl.hidden = false; }
                return;
            }
            if (card) card.hidden = true;
        });
    }

    // 5) Botón SOS (el grande)
    const btnSos = document.getElementById("sos-btn");
    if (btnSos) {
        btnSos.addEventListener("click", async () => {
            if (btnSos.classList.contains("estado-enviado")) return;

            // ⚠️ Exigir registro antes de disparar
            const usuarioActual = await leerUsuarioActual();
            if (!usuarioActual) {
                if (card) card.hidden = false;
                return;
            }

            btnSos.disabled = true;
            const res = await dispararPanico();
            btnSos.disabled = false;

            if (!res.ok) {
                alert(res.error || "No se pudo enviar la alerta.");
                return;
            }

            btnSos.classList.add("estado-enviado");
            const txt = btnSos.querySelector(".sos-btn-text");
            if (txt) txt.textContent = "✅";

            alertaActualId = res.alertId || null;
            mostrarModalConfirmacion(res.encolada);
        });
    }

    // 6) Modal: cancelar
    const btnCancel = document.getElementById("sos-cancel-btn");
    if (btnCancel) {
        btnCancel.addEventListener("click", async () => {
            if (!alertaActualId) return;
            await cancelarAlerta(alertaActualId);
            cerrarModal();
            alert("Alerta cancelada.");
        });
    }

    // 7) Modal: cerrar (✅ corregido: ahora sí oculta #sos-modal)
    const btnClose = document.getElementById("sos-modal-close");
    if (btnClose) btnClose.addEventListener("click", cerrarModal);
}

function mostrarModalConfirmacion(encolada) {
    const modal = document.getElementById("sos-modal");
    if (!modal) return;
    const msg = document.getElementById("sos-modal-msg");
    const cancelWrap = document.getElementById("sos-cancel-wrap");
    if (msg) msg.textContent = encolada
        ? "Sin conexión. La alerta se enviará automáticamente al recuperar señal."
        : "Tu alerta fue enviada, te contactaremos.";

    modal.hidden = false;
    modal.style.display = "flex";   // ✅ fuerza a mostrarlo

    if (encolada || !alertaActualId) {
        if (cancelWrap) cancelWrap.hidden = true;
        return;
    }
    if (cancelWrap) cancelWrap.hidden = false;
    let restante = 30;
    const cnt = document.getElementById("sos-cancel-count");
    if (cnt) cnt.textContent = restante;
    if (cancelTimer) clearInterval(cancelTimer);
    cancelTimer = setInterval(() => {
        restante--;
        const el = document.getElementById("sos-cancel-count");
        if (el) el.textContent = restante;
        if (restante <= 0) {
            clearInterval(cancelTimer);
            cancelTimer = null;
            if (cancelWrap) cancelWrap.hidden = true;
        }
    }, 1000);
}

function cerrarModal() {
    const m = document.getElementById("sos-modal");
    if (m) {
        m.hidden = true;
        m.style.display = "none";     // ✅ fuerza ocultar aunque el CSS tenga display: flex
    }
    if (cancelTimer) { clearInterval(cancelTimer); cancelTimer = null; }
}

init();
