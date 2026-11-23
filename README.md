## ⚡ SARA · Keraunos | Sistema de Alerta y Respuesta Antamina

> Plataforma web de vigilancia meteorológica en tiempo real y sistema de respuesta ante emergencias (SOS), diseñada para operar en entornos industriales con alta disponibilidad y precisión geoespacial.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)
![Estado](https://img.shields.io/badge/Estado-Activo-success?style=for-the-badge)

---

## 📖 Índice

- [Descripción](#-descripción)
- [Características Principales](#-características-principales)
- [Tecnologías Utilizadas](#-tecnologías-utilizadas)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Requisitos Previos](#-requisitos-previos)
- [Instalación y Configuración](#-instalación-y-configuración)
- [Flujo de Uso](#-flujo-de-uso)
- [Versionado y Caché](#-versionado-y-caché)
- [Despliegue (Deploy)](#-despliegue-deploy)
- [Contribuir](#-contribuir)
- [Licencia](#-licencia)

---

## 📝 Descripción

**SARA (Sistema de Alerta y Respuesta Antamina)**, en su módulo **Keraunos**, es una aplicación web progresiva (PWA) diseñada para monitorear condiciones meteorológicas críticas (como tormentas eléctricas) en tiempo real.

El sistema combina un mapa interactivo con zonas de vigilancia, notificaciones push en tiempo real a través de Firebase Cloud Messaging y un **módulo de pánico (SOS)** que permite a los usuarios reportar emergencias enviando su ubicación GPS precisa, DNI y datos de contacto directamente a la base de datos y canales de respuesta rápida.

---

## ✨ Características Principales

- 🗺️ **Mapa Interactivo en Tiempo Real**: Visualización de zonas de vigilancia y alertas meteorológicas usando Leaflet.js.
- 🆘 **Botón de Pánico (SOS)**: Captura de geolocalización (con caché y mecanismos de respaldo), validación de DNI (8 dígitos) y teléfono (9 dígitos), y registro inmediato en Firestore.
- 🔔 **Notificaciones Push**: Alertas en tiempo real sobre cambios en el estado meteorológico (niveles amarillo, naranja y rojo).
- 📱 **Progressive Web App (PWA)**: Instalable en dispositivos móviles, con Service Worker para funcionamiento offline parcial y caché de recursos.
- 🔐 **Doble Modo de Operación**:
  - *Modo Keraunos*: Interfaz principal de vigilancia y recepción de alertas (`index.html`).
  - *Modo Manual (StrikeGuard)*: Vista y panel de administración para gestión directa de alertas.
- 🚑 **Recursos de emergencia**: Panel de administración de recursos y apps para ambulancias y rescatistas.
- 🔄 **Sincronización en la Nube**: Integración con Firebase (Firestore, Authentication y Cloud Messaging).

---

## 🛠️ Tecnologías Utilizadas

| Categoría | Tecnologías |
|-----------|-------------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (ES6+ Modules) |
| **Mapas** | Leaflet.js |
| **Backend / BaaS** | Firebase (Firestore, Auth, Cloud Messaging) — SDK 12.17.0 |
| **Monitor (scraper)** | Node.js (Axios, Cheerio) — corre fuera del sitio y publica `estado.json` |
| **DevOps / CI/CD** | GitHub Actions, GitHub Pages |
| **Estándares** | Web App Manifest, Service Workers |

---

## 📁 Estructura del Proyecto

```text
sara/
├── .github/workflows/       # CI/CD: publicación en GitHub Pages
├── css/                     # Hojas de estilo (alertas, pánico, SOS, recursos, paneles admin)
├── js/                      # Lógica modularizada (ES Modules)
│   ├── app.js               # Punto de entrada y gestión de modos (keraunos/manual)
│   ├── *-config.js          # Configuración por página (modo, zonas, colección Firestore)
│   ├── map.js               # Mapa Leaflet y pintado de zonas
│   ├── alertas.js           # Estado y temporizadores de alertas
│   ├── mensajes.js          # Mensajes/alertas en tiempo real (Firestore)
│   ├── estado-cliente.js    # Lectura periódica de estado.json (respaldo)
│   ├── firebase-config.js   # Configuración del cliente de Firebase (solo datos)
│   ├── firebase-app.js      # Inicialización de Firebase (app, auth, firestore)
│   ├── auth*.js             # Autenticación (admin con correo / anónima)
│   ├── panico.js            # Inyecta el botón SOS y precarga el GPS
│   ├── boton-panico.js      # Lógica del SOS: envío a Firestore y WhatsApp
│   ├── sos-ui.js            # Interfaz y registro de usuario del SOS
│   ├── notifications.js     # Firebase Cloud Messaging y sonido de alerta
│   ├── version-check.js     # Auto-actualización según version.json
│   ├── pwa-install.js       # Instalación de la PWA
│   └── admin*.js, recursos-admin.js, ambulancia-app.js, rescatista-app.js
├── sounds/                  # Audio de notificación
├── index.html               # Vigilancia principal (Keraunos)
├── strikeguard.html         # Vista en modo manual (StrikeGuard)
├── admin.html               # Panel de alertas (StrikeGuard)
├── adminkeraunos.html       # Editor manual de estado.json
├── administrador.html       # Administración de recursos de emergencia
├── ambulancia.html          # App de unidades de ambulancia
├── rescatista.html          # App de rescatistas
├── estado.json              # Estado publicado por el monitor / editor
├── zonas.json, zonas2.json  # Polígonos de zonas (StrikeGuard / Keraunos)
├── version.json             # Build activo (dispara la auto-actualización)
├── bump-build.sh            # Sube la versión de compilación
├── firebase-messaging-sw.js # Service Worker: push + caché
├── manifest.webmanifest     # Configuración de la PWA
└── config.js                # Configuración del monitor Node (no la usa el sitio)
```

---

## 📋 Requisitos Previos

Antes de comenzar, asegúrate de tener:

- [Git](https://git-scm.com/)
- Una cuenta de [Firebase](https://console.firebase.google.com/) con un proyecto activo.
- Conocimientos básicos de configuración de Firestore y Cloud Messaging.
- [Node.js](https://nodejs.org/) (v16 o superior) **solo** si vas a ejecutar el monitor/scraper de Keraunos.

---

## 💻 Instalación y Configuración

El sitio es estático: no necesita `npm install` para funcionar.

1. **Clonar el repositorio**:
```bash
   git clone https://github.com/antito-yanac/sara.git
   cd sara
```

2. **Configurar Firebase**:
   - En la consola de Firebase crea un proyecto y habilita **Firestore**, **Authentication** y **Cloud Messaging**.
   - Copia tus credenciales en `js/firebase-config.js`:
```javascript
     export const firebaseConfig = {
       apiKey: "TU_API_KEY",
       authDomain: "TU_PROYECTO.firebaseapp.com",
       projectId: "TU_PROYECTO",
       storageBucket: "TU_PROYECTO.firebasestorage.app",
       messagingSenderId: "TU_SENDER_ID",
       appId: "TU_APP_ID"
     };
```
   - Copia **los mismos valores** en `firebase-messaging-sw.js`, que lleva su propia copia de la configuración.

3. **Reglas de Firestore**:
   Las reglas se incluyen en `firestore.rules`. Se han restringido las escrituras de `/sistema` y la creación de mensajes oficiales al operador administrador, conservando las reglas originales del resto de colecciones. **Estas reglas no se publican automáticamente con GitHub Pages**: prueba con Firebase Emulator Suite antes de aplicarlas en Firebase Console o con la CLI. Consulta `CONTINGENCIA_Y_DESPLIEGUE.md` y la guía de entrega.

   **Compatibilidad del scraper externo:** la publicación de `estado.json` en GitHub
   permanece independiente de Firestore Rules. Si el scraper escribe también en Firestore
   con Firebase Admin SDK o una biblioteca de servidor autorizada mediante IAM, las
   restricciones para usuarios web no afectan a ese proceso. Si utiliza el SDK web/cliente
   autenticado con una cuenta común, SÍ podría verse restringido. El código del scraper
   no está incluido aquí y debe verificarse por separado antes de publicar reglas.
   Véase `COMPATIBILIDAD_SCRAPER.md` en la raíz de la entrega.

4. **Ejecutar en desarrollo**:
   Usa una extensión como "Live Server" en VS Code o un servidor local simple:
```bash
   npx http-server -p 8080
```

---

## 🎯 Flujo de Uso

1. **Vigilancia**: Al abrir `index.html`, el sistema carga el mapa y pinta las zonas de operación. Escucha en segundo plano las alertas nuevas desde Firestore y, como respaldo, lee `estado.json`.
2. **Activación de SOS**:
   - El usuario presiona el botón de pánico.
   - El sistema verifica que el usuario esté registrado.
   - Captura la ubicación GPS (con caché local para rapidez).
   - Envía los datos a Firestore y prepara un enlace de WhatsApp para respuesta inmediata.
3. **Recepción de Alertas**: Los paneles de administración emiten alertas manuales que aparecen en los clientes conectados mediante notificaciones push y cambios visuales en el mapa.

---

## 🔄 Versionado y Caché

- `version.json` contiene el **build** activo. Cada página lo consulta periódicamente (`js/version-check.js`) y se recarga sola cuando cambia.
- `firebase-messaging-sw.js` mantiene la caché: HTML, `version.json` y `estado.json` se piden siempre a la red; JS, CSS e imágenes se sirven desde caché y se refrescan en segundo plano.
- Para publicar una nueva versión:
```bash
   ./bump-build.sh 20261120-1
   git add -A && git commit -m "build: 20261120-1" && git push
```
  El script actualiza `version.json`, los parámetros `?v=` de los recursos locales y `BUILD_SW` del Service Worker.

---

## 🚀 Despliegue (Deploy)

El sitio se publica automáticamente en **GitHub Pages** con **GitHub Actions** (`.github/workflows/deploy.yml`) en cada `push` a `main`, o manualmente desde la pestaña *Actions* (`workflow_dispatch`).

---

## 🤝 Contribuir

Las contribuciones son fundamentales para mejorar la seguridad y eficiencia del sistema. Sigue estos pasos:

1. Haz un **Fork** del proyecto.
2. Crea una rama para tu funcionalidad (`git checkout -b feature/mejora-gps`).
3. Realiza tus cambios y haz commit (`git commit -m 'Add: mejora en la precisión del GPS'`).
4. Sube los cambios a tu rama (`git push origin feature/mejora-gps`).
5. Abre un **Pull Request** detallando los cambios realizados.

---

## 📄 Licencia

Este proyecto está bajo la licencia **ISC**. Consulta el archivo `LICENSE.md` para más detalles.

---

## 👤 Autor

**Desarrollado para Antamina**  
Mantenimiento y desarrollo por: [@antito-yanac](https://github.com/antito-yanac)

> ⚠️ **Importante**: Este sistema maneja datos de ubicación y personales. Asegúrate de cumplir con las políticas de privacidad y protección de datos locales al implementarlo en producción.

---

⭐ *Si este proyecto te resulta útil, ¡no olvides darle una estrella en GitHub!*
