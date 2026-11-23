// Registro interno del operador de Keraunos. No activa/desactiva el scraper,
// no afecta las alertas públicas ni reemplaza sistema/estado_modo (StrikeGuard).
// Solo indica lo que el operador registró y la frescura declarada de estado.json.
import { obtenerFirestore, obtenerAuth } from "./firebase-app.js";
import { esAdministrador } from "./auth.js";
import {
    doc, onSnapshot, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const PLAZO_DATOS_MS = 15 * 60 * 1000;  // Umbral visual configurable; no prueba salud del scraper.
const REF_COLECCION = "sistema";
const REF_DOC = "keraunos_control";
const FORMATO = new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "medium" });

function hora(ms) { return Number.isFinite(ms) ? FORMATO.format(new Date(ms)) : "Sin dato"; }
function desdeServidor(snap) {
    return !snap.metadata.fromCache && !snap.metadata.hasPendingWrites;
}
function fechaMs(v) {
    if (v && typeof v.toMillis === "function") return v.toMillis();
    if (typeof v === "number" && Number.isFinite(v)) return v;
    return NaN;
}

export function iniciarContingenciaAdmin() {
    const root = document.getElementById("cc-control");
    if (!root) return () => {};
    const $ = id => document.getElementById(id);
    const db = obtenerFirestore();
    const ref = doc(db, REF_COLECCION, REF_DOC);
    const btnManual = $("cc-activar-manual");
    const btnAuto = $("cc-activar-auto");
    const modal = $("cc-modal");
    const btnConfirma = $("cc-confirmar");
    const btnCancela = $("cc-cancelar");
    const detalles = $("cc-resumen");
    const aviso = $("cc-aviso");
    const estado = {
        vivo: true, servidor: false, documento: false,
        modo: null, actualizadoMs: NaN, comprobacionMs: NaN,
        fuenteMs: NaN, fuenteComprobadaMs: NaN, fuenteError: null,
        procesando: false, proximoModo: null
    };

    if (window.matchMedia("(max-width: 650px)").matches) root.open = false;
    const sidebar = document.getElementById("sidebar");
    const onExpandir = () => sidebar?.classList.toggle("cc-expandido", root.open);
    root.addEventListener("toggle", onExpandir);
    onExpandir();

    function pintar() {
        if (!estado.vivo) return;
        const actualizadoReciente = Number.isFinite(estado.fuenteMs)
            && Number.isFinite(estado.fuenteComprobadaMs)
            && estado.fuenteMs <= Date.now() + 60_000
            && Date.now() - estado.fuenteMs <= PLAZO_DATOS_MS;
        const modoConocido = estado.servidor && estado.documento &&
            ["automatico", "manual"].includes(estado.modo);
        const modoVisible = !modoConocido ? "desconocido"
            : estado.modo === "manual" ? "manual"
            : actualizadoReciente ? "automatico" : "desconocido";
        document.querySelectorAll("#cc-control .cc-estado").forEach(el => {
            el.classList.toggle("activo", el.dataset.estado === modoVisible);
        });
        const textoModo = modoVisible === "manual" ? "🟠 Manual"
            : modoVisible === "automatico" ? "🟢 Automático" : "⚪ Desconocido";
        $("cc-titulo-modo").textContent = textoModo;

        if (!estado.servidor) {
            detalles.textContent = "Estado desconocido: no hay confirmación del servidor Firestore.";
        } else if (!estado.documento) {
            detalles.textContent = "Registro no configurado. El operador puede registrar su intervención sin modificar las alertas.";
        } else if (estado.modo === "manual") {
            detalles.textContent = "Intervención manual registrada por el operador. El scraper y las alertas públicas funcionan con la lógica original.";
        } else if (estado.modo === "automatico" && !actualizadoReciente) {
            detalles.textContent = "Retorno automático registrado, pero estado.json está ausente o desactualizado. El funcionamiento real del scraper no está confirmado.";
        } else {
            detalles.textContent = "Retorno automático registrado. estado.json es reciente, pero esta comprobación no garantiza la salud del scraper.";
        }
        $("cc-firestore").textContent = estado.servidor
            ? `Registro Firestore: comprobado ${hora(estado.comprobacionMs)}`
            : "Registro Firestore: sin verificación reciente";
        $("cc-actualizado").textContent = `Último registro del operador: ${hora(estado.actualizadoMs)}`;
        $("cc-fuente").textContent = Number.isFinite(estado.fuenteMs)
            ? `estado.json: actualización declarada ${hora(estado.fuenteMs)} · leído ${hora(estado.fuenteComprobadaMs)}${actualizadoReciente ? "" : " · DESACTUALIZADO"}`
            : `estado.json: ${estado.fuenteError || "aún no verificado"}`;
        // Aunque el modo sea desconocido, se puede forzar el manual si Firestore responde.
        btnManual.disabled = estado.procesando || !estado.servidor || estado.modo === "manual";
        btnAuto.disabled = estado.procesando || !estado.servidor || estado.modo === "automatico";
    }

    async function comprobarFuente() {
        const controlador = new AbortController();
        const cancelar = setTimeout(() => controlador.abort(), 8000);
        try {
            const r = await fetch(`./estado.json?verificar=${Date.now()}`, {
                cache: "no-store", signal: controlador.signal
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            const ms = Date.parse(data.actualizado || "");
            estado.fuenteMs = Number.isFinite(ms) ? ms : NaN;
            estado.fuenteError = Number.isFinite(ms) ? null : "sin fecha 'actualizado' válida";
            estado.fuenteComprobadaMs = Date.now();
        } catch (e) {
            estado.fuenteMs = NaN;
            estado.fuenteComprobadaMs = NaN;
            estado.fuenteError = `sin conexión/verificación (${e.name === "AbortError" ? "tiempo agotado" : e.message})`;
        } finally { clearTimeout(cancelar); pintar(); }
    }

    const desuscribir = onSnapshot(ref, { includeMetadataChanges: true }, snap => {
        estado.servidor = desdeServidor(snap);
        estado.documento = snap.exists();
        estado.modo = snap.exists() ? snap.data().modo : null;
        estado.actualizadoMs = snap.exists() ? fechaMs(snap.data().actualizado) : NaN;
        estado.comprobacionMs = estado.servidor ? Date.now() : NaN;
        pintar();
    }, err => {
        console.warn("Control Keraunos no disponible:", err);
        estado.servidor = false;
        pintar();
    });

    async function solicitarCambio(nuevoModo) {
        if (estado.procesando || !estado.servidor) return;
        const usuario = obtenerAuth().currentUser;
        if (!esAdministrador(usuario)) { estado.servidor = false; pintar(); return; }
        if (!["automatico", "manual"].includes(nuevoModo)) return;
        estado.proximoModo = nuevoModo;
        if (aviso) aviso.textContent = "";
        $("cc-modal-titulo").textContent = nuevoModo === "manual"
            ? "¿Registrar intervención manual de Keraunos?"
            : "¿Registrar retorno al modo automático?";
        $("cc-modal-mensaje").textContent = nuevoModo === "manual"
            ? "Confirma que el operador asumirá la emisión manual por una falla comprobada. Esto es solo un registro interno: NO detiene el scraper, NO cambia el mapa ni publica ninguna alerta. ¿Registrar el evento?"
            : "Confirma que se cancelaron las alertas manuales y el scraper vuelve a operar correctamente. Esto es solo un registro interno: NO activa procesos ni altera las alertas. ¿Registrar el retorno?";
        modal.showModal();
    }

    async function confirmarCambio() {
        const nuevoModo = estado.proximoModo;
        if (!nuevoModo || estado.procesando) return;
        estado.procesando = true;
        btnConfirma.disabled = true;
        btnConfirma.textContent = "Guardando…";
        pintar();
        try {
            const usuario = obtenerAuth().currentUser;
            if (!esAdministrador(usuario)) throw new Error("Sesión administrativa no válida.");
            // El Promise de setDoc solo termina cuando el backend confirma la escritura.
            // No hacer una segunda lectura obligatoria: podía producir un falso error
            // pese a una escritura confirmada, en especial con cambios concurrentes.
            await setDoc(ref, {
                modo: nuevoModo,
                actualizado: serverTimestamp(),
                actualizadoPor: usuario.uid,
                origenCambio: "registro-operador"
            }, { merge: true });
            if (!estado.vivo) return;
            estado.servidor = true;
            estado.documento = true;
            estado.modo = nuevoModo;
            // La marca exacta del servidor llegará mediante onSnapshot.
            estado.comprobacionMs = Date.now();
            estado.proximoModo = null;
            modal.close();
            if (aviso) {
                aviso.textContent = `✅ Registro ${nuevoModo === "manual" ? "MANUAL" : "AUTOMÁTICO"} guardado y confirmado por Firestore.`;
                aviso.dataset.tipo = "exito";
            }
        } catch (e) {
            console.error("Cambio de modo:", e);
            const detalle = e.code ? `${e.code}: ${e.message}` : e.message;
            $("cc-modal-mensaje").textContent = "No se pudo guardar el registro: " + detalle + ". Comprueba la conexión y los permisos de Firestore, luego reintenta.";
            // Un error de escritura NO demuestra que la lectura de Firestore falló.
            // Mantener el modal abierto y permitir reintentar con el mismo modo.
        } finally {
            estado.procesando = false;
            btnConfirma.disabled = false;
            btnConfirma.textContent = "Confirmar";
            pintar();
        }
    }
    const onManual = () => solicitarCambio("manual");
    const onAuto = () => solicitarCambio("automatico");
    const onConfirma = () => confirmarCambio();
    const onCancelar = () => { estado.proximoModo = null; modal.close(); };
    btnManual.addEventListener("click", onManual);
    btnAuto.addEventListener("click", onAuto);
    btnConfirma.addEventListener("click", onConfirma);
    btnCancela.addEventListener("click", onCancelar);
    const intervalo = setInterval(comprobarFuente, 60_000);
    comprobarFuente();
    return () => {
        estado.vivo = false;
        root.removeEventListener("toggle", onExpandir);
        sidebar?.classList.remove("cc-expandido");
        desuscribir();
        clearInterval(intervalo);
        btnManual.removeEventListener("click", onManual);
        btnAuto.removeEventListener("click", onAuto);
        btnConfirma.removeEventListener("click", onConfirma);
        btnCancela.removeEventListener("click", onCancelar);
        if (modal.open) modal.close();
    };
}
