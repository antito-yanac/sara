import { db, auth, ensureAuth, serverTimestamp } from "../shared/firebase-init.js";
import { collection, addDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const btnSOS = document.getElementById('btnSOS');
const statusEl = document.getElementById('status');

let myUid = null;
let ultimaPos = null;
let alertaActivaId = null;
let intervalReporte = null;

// 1. Autenticación
ensureAuth().then(user => {
  myUid = user.uid;
  iniciarGPS();
}).catch(err => {
  statusEl.textContent = "Error de conexión: " + err.message;
});

// 2. GPS Continuo (guardando en memoria)
function iniciarGPS() {
  if (!navigator.geolocation) {
    statusEl.textContent = "Tu dispositivo no soporta GPS.";
    return;
  }
  navigator.geolocation.watchPosition(
    (pos) => {
      ultimaPos = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        precision: pos.coords.accuracy
      };
      if (!alertaActivaId) {
        btnSOS.disabled = false;
        btnSOS.textContent = "SOS";
        statusEl.textContent = `GPS listo (±${Math.round(ultimaPos.precision)}m). Presiona SOS si hay emergencia.`;
      }
    },
    (err) => {
      statusEl.textContent = "Activa los permisos de ubicación en tu navegador.";
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );
}

// 3. Presionar el botón SOS
btnSOS.addEventListener('click', async () => {
  if (!ultimaPos) return alert("Aún no hay GPS.");
  
  btnSOS.disabled = true;
  btnSOS.textContent = "ENVIANDO";
  statusEl.textContent = "Creando alerta en el servidor...";

  try {
    // Creamos el documento en Firestore
    const docRef = await addDoc(collection(db, "alertas_sos"), {
      estado: "ALERTA_ENVIADA",
      lat: ultimaPos.lat,
      lng: ultimaPos.lng,
      precision: ultimaPos.precision,
      usuario_id: myUid,
      unidad_asignada: null,
      ts_creacion: serverTimestamp(),
      ts_actualizacion: serverTimestamp()
    });

    alertaActivaId = docRef.id;
    btnSOS.textContent = "ALERTA ENVIADA";
    statusEl.textContent = "Esperando que una unidad acepte...";

    // Empezamos a enviar la ubicación cada 5 segundos (Watch)
    intervalReporte = setInterval(async () => {
      if (!alertaActivaId || !ultimaPos) return;
      await updateDoc(doc(db, "alertas_sos", alertaActivaId), {
        lat: ultimaPos.lat,
        lng: ultimaPos.lng,
        ts_actualizacion: serverTimestamp()
      });
    }, 5000);

  } catch (error) {
    console.error(error);
    statusEl.textContent = "Error al enviar: " + error.message;
    btnSOS.disabled = false;
    btnSOS.textContent = "SOS";
  }
});