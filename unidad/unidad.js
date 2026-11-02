import { db, ensureAuth, serverTimestamp } from "../shared/firebase-init.js";
import { collection, doc, updateDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { distanciaKm, formatearDistancia } from "../shared/geo.js";

// ID de la unidad simulada para el demo
const MI_UNIDAD_ID = "AMB-01"; 
const MI_UNIDAD_NOMBRE = "Ambulancia 01";

const headerEl = document.getElementById('header');
const statusEl = document.getElementById('status');
const alertaBox = document.getElementById('alertaBox');
const alertaInfo = document.getElementById('alertaInfo');
const btnAceptar = document.getElementById('btnAceptar');
const btnRechazar = document.getElementById('btnRechazar');

let miLat = null, miLng = null;
let alertaActual = null;
let map, markerUnidad, markerAlerta;

// 1. Iniciar Mapa
function initMap() {
  map = L.map('map').setView([-9.5421, -77.0532], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  markerUnidad = L.marker([0,0]).addTo(map).bindPopup(MI_UNIDAD_NOMBRE);
}

// 2. Auth y GPS
ensureAuth().then(user => {
  headerEl.textContent = `${MI_UNIDAD_NOMBRE} - Conectada`;
  initMap();
  
  navigator.geolocation.watchPosition((pos) => {
    miLat = pos.coords.latitude;
    miLng = pos.coords.longitude;
    markerUnidad.setLatLng([miLat, miLng]);
    map.setView([miLat, miLng]);
    evaluarAlertas();
  }, null, { enableHighAccuracy: true });
});

// 3. Escuchar alertas en tiempo real
let alertasGlobales = [];
function escucharAlertas() {
  const q = query(collection(db, "alertas_sos"), where("estado", "==", "ALERTA_ENVIADA"));
  onSnapshot(q, (snapshot) => {
    alertasGlobales = [];
    snapshot.forEach(doc => alertasGlobales.push({ id: doc.id, ...doc.data() }));
    evaluarAlertas();
  });
}

// 4. Evaluar cuál es la más cercana
function evaluarAlertas() {
  if (!miLat || alertasGlobales.length === 0) {
    alertaBox.style.display = 'none';
    return;
  }

  let masCercana = null;
  let distMin = Infinity;

  alertasGlobales.forEach(alerta => {
    const d = distanciaKm(miLat, miLng, alerta.lat, alerta.lng);
    if (d < distMin) { distMin = d; masCercana = alerta; }
  });

  if (masCercana) {
    alertaActual = masCercana;
    alertaBox.style.display = 'block';
    alertaInfo.innerHTML = `Alerta ID: ${masCercana.id}<br>Distancia: <b>${formatearDistancia(distMin)}</b>`;
    
    if (!markerAlerta) {
      markerAlerta = L.circleMarker([masCercana.lat, masCercana.lng], {color: 'red', radius: 10}).addTo(map);
    } else {
      markerAlerta.setLatLng([masCercana.lat, masCercana.lng]);
    }
  } else {
    alertaBox.style.display = 'none';
  }
}

// 5. Aceptar Alerta
btnAceptar.addEventListener('click', async () => {
  if (!alertaActual) return;
  btnAceptar.disabled = true;
  try {
    await updateDoc(doc(db, "alertas_sos", alertaActual.id), {
      estado: "ACEPTADA_EN_CAMINO",
      unidad_asignada: MI_UNIDAD_ID
    });
    alertaBox.style.display = 'none';
    statusEl.innerHTML = `<b>✅ Alerta ${alertaActual.id} aceptada.</b><br>Yendo a la ubicación...`;
  } catch (e) {
    alert("Error al aceptar. Puede que otra unidad la haya tomado.");
    btnAceptar.disabled = false;
  }
});

btnRechazar.addEventListener('click', () => {
  alertaBox.style.display = 'none'; // Solo la oculta localmente en el demo
});

// Iniciar escucha
ensureAuth().then(() => escucharAlertas());