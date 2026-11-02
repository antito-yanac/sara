// js/index-config.js
// ============================================================
// Configuración de index.html (modo manual/StrikeGuard).
// Se carga ANTES de app.js.
// ============================================================
window.__APP_CONFIG__ = {
    modo: "manual",
    zonasFile: "./zonas.json",
    origenFiltro: "manual",       // Solo alertas con origen === "manual"
    usarFirestore: true,          // Escucha Firestore
    usarEstadoJSON: false,        // NO lee estado.json
    coleccion: "mensajes_push"    // ✅ Colección exclusiva para StrikeGuard
};
console.log("[config] index.html en modo MANUAL (StrikeGuard), colección: mensajes_push");
