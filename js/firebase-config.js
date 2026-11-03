// js/firebase-config.js
//
// Configuración de Firebase para Web (app web registrada en Firebase Console).
// appId web: 1:301615802026:web:d1a6cec0c1e21a71ad92d3

//export const firebaseConfig = {
//    apiKey: "AIzaSyDc5EUjoE5HjkVWnTGJwWSDraszijxBz1E",
 //   authDomain: "antitomessage.firebaseapp.com",
  //  projectId: "antitomessage",
   // storageBucket: "antitomessage.firebasestorage.app",
    //messagingSenderId: "301615802026",
    //appId: "1:301615802026:web:d1a6cec0c1e21a71ad92d3",
//    measurementId: "G-2NWGFM3L53"
//};

// Par de claves VAPID para FCM Web Push (generado en Firebase Console)
//export const vapidKey = "BL5zwoCQ_l-Z0b_HFo2gLW527S0pRrXu1S-u0Tpl8yPVtsPQfv89GH5snIjUUMz4y3YwRg-kf6hKlZIrqjbsEwQ";
//export const vapidKey = "BKVA6-Y4MxdANMJqII2QcWJCfTdDBwatRP49G7gpiFW1MvccWah-Vrp-dKa6rcz18E84Kjo8F71kNviq48Hkn70";

// js/firebase-config.js
// ============================================================
// Configuración e inicialización de Firebase
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

// 1. Tus credenciales reales de Firebase
export const firebaseConfig = {
    apiKey: "AIzaSyDc5EUjoE5HjkVWnTGJwWSDraszijxBz1E",
    authDomain: "antitomessage.firebaseapp.com",
    projectId: "antitomessage",
    storageBucket: "antitomessage.firebasestorage.app",
    messagingSenderId: "301615802026",
    appId: "1:301615802026:web:d1a6cec0c1e21a71ad92d3",
    measurementId: "G-2NWGFM3L53"
};

// 2. Clave VAPID para notificaciones Push (FCM)
export const vapidKey = "BKVA6-Y4MxdANMJqII2QcWJCfTdDBwatRP49G7gpiFW1MvccWah-Vrp-dKa6rcz18E84Kjo8F71kNviq48Hkn70";

// 3. Email del administrador (para las reglas de Firestore)
export const ADMIN_EMAIL = "coderjava.01@gmail.com";

// 4. Colecciones centralizadas
export const COLECCIONES = {
    USUARIOS:        "usuarios",
    DNI_REGISTRADOS: "dni_registrados",
    PANIC_ALERTS:    "panic_alerts"
};

// 5. Inicialización (Aseguramos que no se cree doble instancia)
let app, auth, db;

try {
    // Si ya existe una app inicializada en otro archivo, la reutilizamos
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    // Persistencia local: la sesión anónima sobrevive al cerrar el navegador
    setPersistence(auth, browserLocalPersistence).catch((e) => {
        console.warn("firebase-config: no se pudo fijar persistencia:", e);
    });
} catch (e) {
    // Si por alguna razón falla la inicialización (porque ya estaba creada)
    console.warn("Firebase ya estaba inicializado o falló:", e.message);
}

// Exportamos las instancias para usarlas directamente si es necesario
export { app, auth, db };
