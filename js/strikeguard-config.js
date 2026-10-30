// js/strikeguard-config.js
// ============================================================
// Configuración de strikeguard.html (modo StrikeGuard).
// Se carga ANTES de app.js.
// ============================================================
window.__APP_CONFIG__ = {
    modo: "manual",
    zonasFile: "./zonas_strikeguard.json", // 3 zonas propias
    origenFiltro: "manual",
    usarFirestore: true,
    usarEstadoJSON: false,
    coleccion: "mensajes_strikeguard" // ✅ Colección exclusiva para StrikeGuard
};
console.log("[config] strikeguard.html en modo STRIKEGUARD, colección: mensajes_strikeguard");
