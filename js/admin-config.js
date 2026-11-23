// js/admin-config.js
// ============================================================
// Configuración de admin.html (Panel de Alertas — StrikeGuard).
// Se carga ANTES de admin.js.
// ============================================================
window.__APP_CONFIG__ = {
    modo: "manual",
    zonasFile: "./zonas.json",
    origenFiltro: "manual",
    usarFirestore: true,
    usarEstadoJSON: false,
    coleccion: "mensajes_strikeguard"   // ✅ admin.html alimenta a strikeguard.html
};
console.log("[config] admin.html → colección mensajes_strikeguard");
