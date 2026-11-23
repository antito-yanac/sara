// js/keraunos-config.js
// ============================================================
// Configuración de index.html (modo Keraunos / scraper).
// Se carga ANTES de app.js.
// v13:
//   - Colección exclusiva para Keraunos (mensajes_keraunos).
//   - Escucha Firestore en tiempo real (scraper v12 + manuales).
//   - Mantiene estado.json como respaldo (usarEstadoJSON: true).
// ============================================================
window.__APP_CONFIG__ = {
    modo: "keraunos",
    zonasFile: "./zonas2.json",
    origenFiltro: "scraper",      // Acepta scraper + manuales (ver mensajes.js)
    usarFirestore: true,          // ✅ Escucha Firestore en tiempo real
    usarEstadoJSON: true,         // ✅ Mantiene estado.json como respaldo
    coleccion: "mensajes_keraunos" // ✅ Colección exclusiva para Keraunos
};
console.log("[config] index.html en modo KERAUNOS, colección: mensajes_keraunos");
