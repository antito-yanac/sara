/*
 * Comprobación de navegación desde administrador.html. No es autorización:
 * GitHub Pages sirve los archivos públicamente y Firestore debe validar permisos.
 * Exige un pase efímero y de un solo uso generado por el Centro de Control.
 */
(function () {
  "use strict";
  const panel = document.currentScript?.dataset.panel;
  const match = /^#cc=([a-f0-9-]{16,64})$/i.exec(location.hash);
  let admitido = false;
  try {
    if (match && (panel === "strikeguard" || panel === "keraunos")) {
      const llave = "sara:paso-central:" + match[1];
      const dato = localStorage.getItem(llave);
      localStorage.removeItem(llave); // Pase de un solo uso, también al fallar.
      if (dato) {
        const pase = JSON.parse(dato);
        const edad = Date.now() - Number(pase.creado);
        admitido = pase.panel === panel && edad >= 0 && edad <= 60_000;
      }
    }
  } catch (e) {
    console.warn("Acceso desde la central no verificable:", e);
  }
  if (!admitido) {
    location.replace("./administrador.html");
    return;
  }
  // Quitar el pase de la barra de direcciones; no se puede usar otra vez.
  history.replaceState(history.state, "", location.pathname + location.search);
  window.__SARA_ENTRADA_CENTRAL__ = true;
})();
