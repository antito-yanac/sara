# SARA — Centro de Control v3: alcance y despliegue seguro

## Alcance solicitado
- `administrador.html` es la **única entrada de navegación** a los dos paneles de emisión manual (`admin.html`, StrikeGuard; `adminkeraunos.html`, Keraunos).
- La cuenta de administrador es la misma en las tres páginas y se valida mediante `auth.js` (criterio compatible con las reglas Firestore compartidas: correo de administrador).
- Los enlaces desde la central entregan un **pase efímero de un solo uso** (60 segundos) que permite mostrar el panel en nueva pestaña. Escribir directamente `/sara/admin.html` o `/sara/adminkeraunos.html`, incluso con una sesión iniciada, redirige a la central. Actualizar un panel abierto también exige volver a entrar desde la central; es intencional.
- `/sara/admin/` y `/sara/adminkeraunos/` redirigen directamente a `/sara/administrador.html`.
- Los paneles emisores no reproducen las tarjetas flotantes de alertas para público. Su emisión, liberación de zonas y enrutador legado se conservan.
- El registro Automático / Manual / Desconocido es **solo información interna para el operador**. El cambio se confirma y registra con marca temporal del servidor en `sistema/keraunos_control`. La fecha de `estado.json` se consulta como dato indicativo, no como prueba absoluta del funcionamiento del scraper.
- Se **revirtieron íntegramente** desde el ZIP original los módulos públicos `js/app.js`, `js/alertas.js`, `js/estado-cliente.js`, `js/mensajes.js`. Se retiró el nuevo `js/keraunos-modo.js` de la v2. No se altera la lógica del scraper, ni su interpretación en las páginas públicas, ni la presentación original de `index.html` y `strikeguard.html`.

## ADVERTENCIA: seguridad en GitHub Pages
GitHub Pages es alojamiento estático: **no permite impedir desde el servidor la descarga del HTML o JS público**. El control de rutas aquí implementado es un guard de interfaz y no autentica en el servidor. La seguridad real depende de las reglas Firestore y de proteger las APIs de publicación (por ejemplo, tokens GitHub).

### Reglas Firestore integradas en esta entrega
Se incluye `firestore.rules`, con un cambio **acotado** respecto a las reglas enviadas por el usuario:

- `/sistema/{documento}`: únicamente `isAdmin()` puede crear, actualizar o borrar. Se mantiene la lectura pública salvo `sistema/keraunos_control`, reservado al administrador.
- `mensajes_strikeguard`, `mensajes_keraunos`, `mensajes_push`: solo `isAdmin()` puede crear mensajes oficiales y se conservan las validaciones originales de longitud y tipo. La lectura pública permanece habilitada.
- `mensajes_globales` y todas las demás colecciones mantienen sus reglas anteriores. Esto **no** significa que otras reglas sean seguras; existe una auditoría pendiente.

El emulador oficial de Firestore no pudo ejecutarse en el sandbox: se verificaron las condiciones con 9 pruebas locales, pero **falta la prueba real de Firebase Rules**. El conjunto de pruebas está en `../pruebas-firestore` al descomprimir el ZIP completo.

El scraper automatizado debe comprobarse antes de desplegar estas reglas: un proceso que publique mediante Firebase Web SDK con una sesión diferente del operador perdería permiso para crear mensajes oficiales. Un proceso que use Admin SDK autenticado a nivel de servidor no depende de estas reglas. **No publicar en producción sin verificar este punto**.

Este proyecto se publica mediante GitHub Pages. `firebase.json` se ha reducido a la referencia de Firestore; no contiene una configuración de Firebase Hosting. `.firebaserc` conserva el valor original, que podría no coincidir con el `projectId` de la web. Verifica manualmente el proyecto correcto antes de ejecutar cualquier despliegue de reglas.

## Pruebas previas a main
1. Abre `/sara/admin.html` y `/sara/adminkeraunos.html` directamente: deben redirigir a `/sara/administrador.html` antes de pintar el panel.
2. Inicia sesión en la central y pulsa StrikeGuard/Keraunos: deben abrirse en otra pestaña sin pedir contraseña nuevamente.
3. Recarga esa pestaña: debe volver a la central porque el pase se consumió.
4. Confirma/cancela el registro Manual/Automático: revisa que sea un **registro del operador**; ni las páginas públicas ni el scraper deben cambiar por ese documento.
5. Confirma que `admin.html` conserva el flujo **Forzar StrikeGuard → enviar manual → liberar** y Keraunos conserva su emisión manual sin interferencia.
6. Verifica sesión, roles y reglas con Firebase Emulator Suite; la prueba de navegador aislado no sustituye la validación real de Firestore.
