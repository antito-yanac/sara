// js/panico.js
// ============================================================
// Inyecta el HTML del botón SOS nuevo (#sos-wrap, #sos-btn,
// #sos-modal, #sos-registro-card) y precarga el GPS en caché.
// v6:
//   - Elimina el flujo viejo (#btn-panico, #panico-overlay,
//     panico_solicitudes, WhatsApp viejo).
//   - Mantiene precapturarGPS para que boton-panico.js
//     encuentre el caché listo al presionar SOS.
//   - El envío y el WhatsApp ahora viven en boton-panico.js.
// ============================================================

const GPS_CACHE_KEY        = "keraunos_gps_cache";
const GPS_PRECAPTURA_MS    = 8 * 1000;

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

function inyectarEstructura() {
    if (document.getElementById("sos-wrap")) return; // ya existe

    const sosHtml = `
    <div id="sos-wrap">

      <div id="sos-registro-card" class="sos-card" hidden>
        <h3>📝 Regístrate para usar el botón SOS</h3>
        <p class="sos-sub">Solo necesitas completar estos datos una vez.</p>

        <form id="sos-form-registro" autocomplete="off">
          <label>Nombre completo
            <input type="text" name="nombre" required minlength="3" maxlength="80">
          </label>

          <label>DNI (8 dígitos)
            <input type="text" name="dni" required inputmode="numeric"
                   pattern="[0-9]{8}" maxlength="8">
          </label>

          <label>Celular (9 dígitos)
            <input type="text" name="celular" required inputmode="numeric"
                   pattern="[0-9]{9}" maxlength="9">
          </label>

          <label>Empresa
            <input type="text" name="empresa" required maxlength="80">
          </label>

          <label class="sos-check">
            <input type="checkbox" name="aceptoTerminos" required>
            Autorizo el uso de mis datos para emergencias.
          </label>

          <div id="sos-form-error" class="sos-error" hidden></div>

          <button type="submit" class="sos-btn-primario">
            Guardar y continuar
          </button>
          <button type="button" id="sos-btn-cancelar-registro" class="sos-btn-secundario" style="margin-top: 8px;">
            Cancelar
          </button>
        </form>
      </div>

      <button id="sos-btn" class="sos-btn" aria-label="Botón de pánico">
        <span class="sos-btn-icon">🆘</span>
        <span class="sos-btn-text">SOS</span>
      </button>

      <div id="sos-modal" class="sos-modal" hidden>
        <div class="sos-modal-content">
          <h3 id="sos-modal-title">✅ Alerta enviada</h3>
          <p id="sos-modal-msg">Tu alerta fue enviada, te contactaremos.</p>

          <div id="sos-cancel-wrap" hidden>
            <p>Puedes cancelarla en
              <strong id="sos-cancel-count">30</strong>s si fue por error.
            </p>
            <button id="sos-cancel-btn" class="sos-btn-secundario">
              Cancelar alerta
            </button>
          </div>

          <button id="sos-modal-close" class="sos-btn-primario">
            Cerrar
          </button>
        </div>
      </div>

    </div>`;

    const sosCont = document.createElement("div");
    sosCont.innerHTML = sosHtml;
    document.body.appendChild(sosCont.firstElementChild);
}

function init() {
    inyectarEstructura();
    setTimeout(precapturarGPS, 2000);
    setInterval(precapturarGPS, 2 * 60 * 1000);
    console.log("🆘 panico.js inicializado (solo SOS nuevo + GPS cache)");
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
