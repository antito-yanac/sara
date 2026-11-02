// js/adminkeraunos-config.js
// ============================================================
// Configuración de adminkeraunos.html (Editor estado.json).
// Se carga ANTES del módulo inline.
// ============================================================
window.__APP_CONFIG__ = {
    modo: "keraunos",
    zonasFile: "./zonas2.json",
    origenFiltro: "scraper",
    usarFirestore: true,
    usarEstadoJSON: true,
    coleccion: "mensajes_keraunos"   // ✅ adminkeraunos.html alimenta a index.html
};
console.log("[config] adminkeraunos.html → colección mensajes_keraunos");
