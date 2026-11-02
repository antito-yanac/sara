import { db, ensureAuth } from "../shared/firebase-init.js";
import { collection, query, onSnapshot, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const listaAlertas = document.getElementById('listaAlertas');
const listaUnidades = document.getElementById('listaUnidades');
let map;
const markers = {};

function initMap() {
  map = L.map('map').setView([-9.5421, -77.0532], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
}

ensureAuth().then(() => {
  initMap();
  
  // Escuchar Alertas
  const qAlertas = query(collection(db, "alertas_sos"), where("estado", "in", ["ALERTA_ENVIADA", "ACEPTADA_EN_CAMINO"]));
  onSnapshot(qAlertas, (snap) => {
    listaAlertas.innerHTML = '';
    if (snap.empty) listaAlertas.innerHTML = '<i>Sin alertas activas</i>';
    
    snap.forEach(doc => {
      const data = doc.data();
      
      // Actualizar UI
      const div = document.createElement('div');
      div.className = 'alerta-item';
      div.innerHTML = `<b>ID: ${doc.id}</b><br>Estado: ${data.estado}<br>Unidad: ${data.unidad_asignada || 'Ninguna'}`;
      listaAlertas.appendChild(div);

      // Actualizar Mapa
      if (!markers[doc.id]) {
        markers[doc.id] = L.circleMarker([data.lat, data.lng], {color: '#f00', radius: 12, fillOpacity: 0.7}).addTo(map);
      } else {
        markers[doc.id].setLatLng([data.lat, data.lng]);
      }
    });
  });

  // Escuchar Unidades (El conductor se registra cuando entra)
  onSnapshot(collection(db, "unidades_sos"), (snap) => {
    listaUnidades.innerHTML = '';
    snap.forEach(doc => {
      const data = doc.data();
      listaUnidades.innerHTML += `<div class="unidad-item"><b>${data.nombre}</b><br>Estado: ${data.estado}</div>`;
      if (data.lat && data.lng) {
         if (!markers[doc.id]) {
           markers[doc.id] = L.marker([data.lat, data.lng]).addTo(map).bindPopup(data.nombre);
         } else {
           markers[doc.id].setLatLng([data.lat, data.lng]);
         }
      }
    });
  });
});