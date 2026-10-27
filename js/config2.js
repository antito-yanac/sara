// ============================================================
//  config2.js — Configuración SOLO para adminkeraunos.html
//  (Monitor.js NO usa este archivo; él usa config.js)
//
//  ⚠️ Reemplaza los valores con los de tu proyecto Firebase.
//  Los encuentras en:
//     Firebase Console → ⚙️ Configuración del proyecto
//                     → Tus apps → SDK de Firebase → Config
// ============================================================

export const FIREBASE_CONFIG = {
    apiKey:            "AIzaSy...REEMPLAZA",
    authDomain:        "tu-proyecto.firebaseapp.com",
    databaseURL:       "https://tu-proyecto-default-rtdb.firebaseio.com",
    projectId:         "tu-proyecto",
    storageBucket:     "tu-proyecto.appspot.com",
    messagingSenderId: "000000000000",
    appId:             "1:000000000000:web:xxxxxxxxxxxx"
};

// Nodos en Realtime Database
export const PATHS = {
    COMANDO:  "comando",           // intención por sector
    SNAPSHOT: "estadoSnapshot"     // resultado final (mismo formato que estado.json)
};

// ============================================================
//  Datos fijos (espejo de config.js del monitor)
//  Mantener sincronizado con config.js
// ============================================================

export const SECTORES_ESPERADOS = [
    "Campamento Yanacancha",
    "Oficinas Mina",
    "Tucush",
    "Tajo"
];

export const MAPA_ZONAS = {
    "Campamento Yanacancha": "Zona 1 - Campamentos",
    "Oficinas Mina":         "Zona 2 - Oficinas Mina",
    "Tucush":                "Zona 3 - Tucush",
    "Tajo":                  "Zona 4 - Tajo"
};

export const COORDENADAS_ZONAS = {
    "Zona 1 - Campamentos":   { lat: -9.5822364, lng: -77.0223100 },
    "Zona 2 - Oficinas Mina": { lat: -9.5718388, lng: -77.0447182 },
    "Zona 3 - Tucush":        { lat: -9.5263487, lng: -77.0485794 },
    "Zona 4 - Tajo":          { lat: -9.5416465, lng: -77.0707659 }
};

// Mismo mapa de niveles que monitor.js (NO cambiar)
export const NIVELES = {
    ROJA:     { numero: 3, color: "#FA5858", clase: "roja",     emoji: "🔴", label: "Roja" },
    NARANJA:  { numero: 2, color: "#FF8C00", clase: "naranja",  emoji: "🟠", label: "Naranja" },
    AMARILLA: { numero: 1, color: "#FFD400", clase: "amarilla", emoji: "🟡", label: "Amarilla" },
    VERDE:    { numero: 0, color: "#2ECC71", clase: "verde",    emoji: "🟢", label: "Verde" }
};

// Zona horaria Perú (igual que monitor.js)
export const TZ_OFFSET_MIN = -300;

export const DURACION_DEFAULT_MIN = 15;