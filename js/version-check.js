// js/version-check.js
// ============================================================
//  Auto-actualización agresiva (sin que el usuario pulse F5)
//  ------------------------------------------------------------
//  PROBLEMA QUE RESUELVE
//  GitHub Pages sirve TODO con `cache-control: max-age=600`
//  (10 minutos) y con un CDN (Fastly) delante. El navegador, además,
//  guarda los módulos ES en su propio "module map" y en disco. Si
//  una pestaña queda abierta horas, se queda con el JS viejo aunque
//  el servidor ya tenga el nuevo. De ahí que hubiera que refrescar
//  a mano para ver una alerta.
//
//  QUÉ HACE ESTE ARCHIVO (3 capas)
//   1. Compara el build de la página (meta sara-build) con
//      version.json, pedido SIEMPRE con cache:"no-store".
//      Si difieren -> recarga con una URL nueva (?v=build), lo que
//      garantiza HTML fresco y, por tanto, JS fresco.
//   2. Revisa cada 45 s, y ADEMÁS al volver a la pestaña
//      (visibilitychange), al recuperar red (online) y al salir de
//      la bfcache (pageshow persisted).
//   3. Si el documento vino de la caché (transferSize 0 en la
//      navegación), fuerza una revalidación inmediata.
//
//  SEGURIDAD
//   - Nunca recarga dos veces por el mismo build (sessionStorage):
//     imposible entrar en bucle si alguien olvida subir el meta.
//   - No recarga si la pestaña está oculta: espera a que se vea.
//   - Si version.json falla, no hace nada (no rompe la app).
// ============================================================

(function () {
    "use strict";

    var INTERVALO_MS = 45 * 1000;      // revisión periódica
    var CLAVE_SESION = "sara_build_recargado";
    var CLAVE_BUILD = "sara_build_visto";

    var recargando = false;
    var temporizador = null;

    // ---------------------------------------------------------
    //  Build de la página actual (lo pone el HTML en un meta)
    // ---------------------------------------------------------
    function buildDeLaPagina() {
        var m = document.querySelector('meta[name="sara-build"]');
        return m ? String(m.getAttribute("content") || "").trim() : "";
    }

    // ---------------------------------------------------------
    //  Preguntar al servidor cuál es el build actual
    //  cache:"no-store" salta la caché HTTP y la del CDN.
    // ---------------------------------------------------------
    function consultarBuildRemoto() {
        var url = "./version.json?t=" + Date.now();
        if (typeof fetch !== "function") return Promise.resolve(null);

        return fetch(url, {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache" }
        }).then(function (r) {
            if (!r.ok) return null;
            return r.json();
        }).then(function (j) {
            return (j && j.build) ? String(j.build) : null;
        }).catch(function () { return null; });
    }

    // ---------------------------------------------------------
    //  Recarga forzada: URL nueva => entrada de caché nueva
    // ---------------------------------------------------------
    function recargarConBuild(build) {
        if (recargando) return;
        recargando = true;

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

        var local = buildDeLaPagina();
        if (!local) return;   // página sin meta: no intervenimos

        consultarBuildRemoto().then(function (remoto) {
            if (!remoto) return;
            if (remoto === local) {
                try { sessionStorage.setItem(CLAVE_BUILD, remoto); } catch (e) {}
                return;
            }

            // ¿Ya recargamos para este build en esta sesión?
            var yaRecargado = null;
            try { yaRecargado = sessionStorage.getItem(CLAVE_SESION); } catch (e) {}
            if (yaRecargado === remoto) {
                // El HTML sigue viejo aunque recargamos: alguien olvidó
                // subir <meta name="sara-build">. No entramos en bucle.
                console.warn("[version] version.json=" + remoto +
                             " pero la página dice " + local +
                             ". Actualiza el meta sara-build en el HTML.");
                return;
            }

            // Si la pestaña está oculta, esperamos a que se vea
            if (document.visibilityState === "hidden") {
                console.log("[version] build nuevo detectado; se recargará al volver a la pestaña.");
                return;
            }

            recargarConBuild(remoto);
        });
    }

    // ---------------------------------------------------------
    //  ¿La página vino de la caché del navegador?
    // ---------------------------------------------------------
    function vinoDeCache() {
        try {
            var nav = performance.getEntriesByType("navigation")[0];
            if (nav) {
                // transferSize 0 y decodedBodySize > 0 => servida de caché
                if (nav.transferSize === 0 && nav.decodedBodySize > 0) return true;
            }
        } catch (e) {}
        return false;
    }

    // ---------------------------------------------------------
    //  Arranque
    // ---------------------------------------------------------
    function iniciar() {
        // Service Worker siempre activo (network-first)
        registrarSW();

        // Primera comprobación: casi inmediata, pero sin bloquear el render
        setTimeout(comprobar, 1500);

        // Si esta carga salió de la caché, revalidamos ya
        if (vinoDeCache()) {
            console.log("[version] la página se sirvió de la caché; revalidando…");
            setTimeout(comprobar, 300);
        }

        // Revisión periódica
        temporizador = setInterval(function () {
            if (document.visibilityState === "visible") comprobar();
        }, INTERVALO_MS);

        // Al volver a la pestaña: comprobar de inmediato
        document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "visible") {
                comprobar();
                // Y pedir al service worker que busque versión nueva
                pedirActualizacionSW();
            }
        });

        // Al recuperar conexión
        window.addEventListener("online", comprobar);

        // Al salir de la bfcache (atrás/adelante)
        window.addEventListener("pageshow", function (ev) {
            if (ev.persisted) comprobar();
        });

        // Al recuperar el foco de la ventana
        window.addEventListener("focus", comprobar);
    }

    // ---------------------------------------------------------
    //  Registrar el Service Worker SIEMPRE (no solo cuando el
    //  usuario acepta notificaciones). Es lo que activa la
    //  estrategia network-first para HTML/JS/CSS en todos los
    //  navegadores, incluso si nunca conceden permiso de push.
    // ---------------------------------------------------------
    function registrarSW() {
        try {
            if (!("serviceWorker" in navigator)) return;
            navigator.serviceWorker.register("./firebase-messaging-sw.js", { scope: "./" })
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

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciar);
    } else {
        iniciar();
    }

    // Expuesto para depurar desde la consola
    window.__saraVersion = { comprobar: comprobar, build: buildDeLaPagina };
})();
