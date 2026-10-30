// js/keraunos-config.js
// ============================================================
// Configuración de keraunos.html (modo scraper + manual).
// Se carga ANTES de app.js.
// ============================================================
window.__APP_CONFIG__ = {
    modo: "keraunos",
    zonasFile: "./zonas2.json",
    origenFiltro: "scraper",      // Filtro preferente, pero mensajes.js aceptará manuales
    usarFirestore: true,          // ✅ ACTIVADO: escucha Firestore para alertas manuales
    usarEstadoJSON: true,         // SÍ lee estado.json
    coleccion: "mensajes_keraunos" // ✅ Colección exclusiva para Keraunos
};
console.log("[config] keraunos.html en modo KERAUNOS (scraper + manual), colección: mensajes_keraunos");
