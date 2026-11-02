// js/version-check.js  —  v2 (simplificado)
// ============================================================
//  AUTO-ACTUALIZACIÓN AGRESIVA — un solo archivo de versión
//  ------------------------------------------------------------
//  ÚNICO PUNTO DE CAMBIO: `version.json` (campo "build").
//  No hay que tocar los HTML ni el Service Worker.
//
//  PROBLEMA QUE RESUELVE
//  GitHub Pages sirve TODO con `cache-control: max-age=600` y con
//  un CDN (Fastly) delante. El navegador guarda además los módulos
//  ES en su "module map". Una pestaña abierta horas se queda con el
//  JS viejo aunque el servidor ya tenga el nuevo.
//
//  CÓMO FUNCIONA
//   1. Guarda en localStorage el build que la pestaña está usando
//      ("sara_build_actual").
//   2. Pide `version.json` SIEMPRE con cache:"no-store" + ?t=único
//      (rompe también la caché del CDN).
//   3. Si el build remoto es distinto -> recarga con
//      ?v=<build>&_r=<timestamp> (URL nueva = cero caché).
//   4. Revisa cada 45 s y además al volver a la pestaña
//      (visibilitychange), al recuperar red (online), al salir de la
//      bfcache (pageshow persisted) y al recuperar el foco (focus).
//   5. Si el documento vino de la caché (transferSize 0), revalida
//      al instante.
//
//  SEGURIDAD
//   - Antes de recargar, guarda el build nuevo en localStorage: al
//     volver, local == remoto y NO se recarga otra vez (sin bucles).
//   - No recarga si la pestaña está oculta.
//   - Si version.json falla, no hace nada (no rompe la app).
// ============================================================

(function () {
    "use strict";

    var INTERVALO_MS = 45 * 1000;
    var CLAVE_LOCAL = "sara_build_actual";
    var CLAVE_SESION = "sara_build_recargado";

    var recargando = false;

    // ---------------------------------------------------------
    //  Build que esta pestaña está usando
    // ---------------------------------------------------------
    function buildLocal() {
        try { return localStorage.getItem(CLAVE_LOCAL) || ""; } catch (e) { return ""; }
    }

    function guardarBuildLocal(b) {
        try { localStorage.setItem(CLAVE_LOCAL, b); } catch (e) {}
    }

    // ---------------------------------------------------------
    //  Build publicado en el servidor (siempre sin caché)
    // ---------------------------------------------------------
    function consultarBuildRemoto() {
        if (typeof fetch !== "function") return Promise.resolve(null);

        return fetch("./version.json?t=" + Date.now(), {
            cache: "no-store",
            headers: {
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache"
            }
        }).then(function (r) {
            if (!r.ok) return null;
            return r.json();
        }).then(function (j) {
            return (j && j.build) ? String(j.build).trim() : null;
        }).catch(function () { return null; });
    }

    // ---------------------------------------------------------
    //  Recarga forzada con URL única
    // ---------------------------------------------------------
    function recargarConBuild(build) {
        if (recargando) return;
        recargando = true;

        // Guardamos ANTES de recargar: evita bucles.
        guardarBuildLocal(build);
        try { sessionStorage.setItem(CLAVE_SESION, build); } catch (e) {}

        var destino;
        try {
            var u = new URL(window.location.href);
            u.searchParams.set("v", build);
            u.searchParams.set("_r", String(Date.now()));
            destino = u.toString();
        } catch (e) {
            destino = window.location.pathname + "?v=" + encodeURIComponent(build) + "&_r=" + Date.now();
        }

        console.log("[version] build nuevo (" + build + "). Recargando…");
        window.location.replace(destino);
    }

    // ---------------------------------------------------------
    //  Comprobación principal
    // ---------------------------------------------------------
    function comprobar() {
        if (recargando) return;

        consultarBuildRemoto().then(function (remoto) {
            if (!remoto) return;

            var local = buildLocal();

            // Primera visita en este navegador: solo memorizamos.
            if (!local) {
                guardarBuildLocal(remoto);
                console.log("[version] build inicial memorizado: " + remoto);
                return;
            }

            if (remoto === local) return;

            // Guarda extra anti-bucle (por si localStorage falla)
            var yaRecargado = null;
            try { yaRecargado = sessionStorage.getItem(CLAVE_SESION); } catch (e) {}
            if (yaRecargado === remoto) {
                guardarBuildLocal(remoto);
                console.warn("[version] ya se recargó para " + remoto +
                             "; se actualiza el registro sin volver a recargar.");
                return;
            }

            if (document.visibilityState === "hidden") {
                console.log("[version] build nuevo detectado; se recargará al volver a la pestaña.");
                return;
            }

            recargarConBuild(remoto);
        });
    }

    // ---------------------------------------------------------
    //  ¿Esta carga vino de la caché del navegador?
    // ---------------------------------------------------------
    function vinoDeCache() {
        try {
            var nav = performance.getEntriesByType("navigation")[0];
            if (nav && nav.transferSize === 0 && nav.decodedBodySize > 0) return true;
        } catch (e) {}
        return false;
    }

    // ---------------------------------------------------------
    //  Service Worker: se registra SIEMPRE (network-first)
    // ---------------------------------------------------------
    function registrarSW() {
        try {
            if (!("serviceWorker" in navigator)) return;
            navigator.serviceWorker
                .register("./firebase-messaging-sw.js", { scope: "./" })
                .then(function (reg) {
                    if (reg && typeof reg.update === "function") reg.update().catch(function () {});
                })
                .catch(function (e) {
                    console.warn("[version] Service Worker no registrado:", e && e.message);
                });
        } catch (e) {}
    }

    function pedirActualizacionSW() {
        try {
            if (!("serviceWorker" in navigator)) return;
            navigator.serviceWorker.getRegistration().then(function (reg) {
                if (reg && typeof reg.update === "function") reg.update().catch(function () {});
            }).catch(function () {});
        } catch (e) {}
    }

    // ---------------------------------------------------------
    //  Arranque
    // ---------------------------------------------------------
    function iniciar() {
        registrarSW();

        setTimeout(comprobar, 1500);

        if (vinoDeCache()) {
            console.log("[version] la página se sirvió de la caché; revalidando…");
            setTimeout(comprobar, 300);
        }

        setInterval(function () {
            if (document.visibilityState === "visible") comprobar();
        }, INTERVALO_MS);

        document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "visible") {
                comprobar();
                pedirActualizacionSW();
            }
        });

        window.addEventListener("online", comprobar);

        window.addEventListener("pageshow", function (ev) {
            if (ev.persisted) comprobar();
        });

        window.addEventListener("focus", comprobar);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciar);
    } else {
        iniciar();
    }

    // Para depurar desde la consola
    window.__saraVersion = {
        comprobar: comprobar,
        build: buildLocal,
        olvidar: function () { try { localStorage.removeItem(CLAVE_LOCAL); } catch (e) {} }
    };
})();
