##⚡ SARA · Keraunos | Sistema de Alerta y Respuesta Antamina

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
- 🆘 **Botón de Pánico (SOS)**: Captura automática de geolocalización (con caché y mecanismos de respaldo), validación de DNI (8 dígitos) y teléfono (9 dígitos), y registro inmediato en Firestore.
- 🔔 **Notificaciones Push**: Alertas en tiempo real sobre cambios en el estado meteorológico (Niveles: Vigilancia, Alerta).
- 📱 **Progressive Web App (PWA)**: Instalable en dispositivos móviles, con Service Workers para funcionamiento offline parcial y caché optimizado.
- 🔐 **Doble Modo de Operación**: 
  - *Modo Keraunos*: Interfaz principal de vigilancia y recepción de alertas.
  - *Modo Manual*: Panel de administración para gestión directa de alertas.
- 🔄 **Sincronización en la Nube**: Integración completa con Firebase (Firestore, Authentication, Hosting y Cloud Messaging).

---

## 🛠️ Tecnologías Utilizadas

| Categoría | Tecnologías |
|-----------|-------------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (ES6+ Modules) |
| **Mapas y Geodata** | Leaflet.js, `@tmcw/togeojson`, JSZip |
| **Backend / BaaS** | Firebase (Firestore, Auth, Cloud Messaging, Hosting) |
| **Utilidades** | Fuse.js (búsqueda), Axios, Cheerio |
| **DevOps / CI/CD** | GitHub Actions, Firebase CLI |
| **Estándares** | Web App Manifest, Service Workers |

---

## 📁 Estructura del Proyecto

```text
sara/
├── .github/workflows/       # Configuración de CI/CD para GitHub Pages
├── admin/                   # Estilos y lógica del panel de administración
├── css/                     # Hojas de estilo (alertas, pánico, SOS, notificaciones)
├── js/                      # Lógica principal modularizada
│   ├── app.js               # Punto de entrada y gestión de modos (keraunos/manual)
│   ├── map.js               # Inicialización y pintado de zonas en Leaflet
│   ├── panico.js            # Lógica del botón SOS, captura GPS y envío a Firestore
│   ├── notifications.js     # Configuración de Firebase Cloud Messaging
│   └── pwa-install.js       # Gestión de la instalación de la PWA
├── sounds/                  # Archivos de audio para alertas
├── firebase-config.js       # Configuración del cliente de Firebase
├── firebase.json            # Configuración de Firestore y Hosting
├── index.html               # Interfaz principal de vigilancia (Keraunos)
├── manifest.webmanifest     # Configuración de la PWA
└── package.json             # Dependencias del proyecto
```

---

## 📋 Requisitos Previos

Antes de comenzar, asegúrate de tener instalado:

- [Node.js](https://nodejs.org/) (v16 o superior)
- [Git](https://git-scm.com/)
- Una cuenta de [Firebase](https://console.firebase.google.com/) con un proyecto activo.
- Conocimientos básicos de configuración de Firestore y Firebase Hosting.

---

## 💻 Instalación y Configuración

1. **Clonar el repositorio**:
```bash
   git clone https://github.com/antito-yanac/sara.git
   cd sara
```

2. **Instalar dependencias**:
```bash
   npm install
```

3. **Configurar Firebase**:
   - Ve a la consola de Firebase y crea un proyecto.
   - Habilita **Firestore**, **Authentication** y **Cloud Messaging**.
   - Copia tus credenciales y actualiza el archivo `firebase-config.js` con tu configuración:
```javascript
     const firebaseConfig = {
       apiKey: "TU_API_KEY",
       authDomain: "TU_PROYECTO.firebaseapp.com",
       projectId: "TU_PROYECTO",
       storageBucket: "TU_PROYECTO.appspot.com",
       messagingSenderId: "TU_SENDER_ID",
       appId: "TU_APP_ID"
     };
```

4. **Configurar reglas de Firestore**:
   Asegúrate de que el archivo `firestore.rules` permita la escritura en la colección de pánico/alertas para usuarios autenticados o según la lógica de tu negocio.

5. **Ejecutar en desarrollo**:
   Puedes usar una extensión como "Live Server" en VS Code o un servidor local simple:
```bash
   npx http-server -p 8080
```

---

## 🎯 Flujo de Uso

1. **Vigilancia**: Al abrir `index.html`, el sistema carga el mapa y pinta las zonas de operación en verde (estado normal). Escucha en segundo plano cualquier alerta nueva desde Firestore.
2. **Activación de SOS**: 
   - El usuario presiona el botón de pánico.
   - El sistema verifica que el usuario esté registrado.
   - Solicita DNI, teléfono y descripción opcional.
   - Captura la ubicación GPS (con mecanismo de caché de 5 minutos para rapidez).
   - Envía los datos a Firestore y, opcionalmente, prepara un enlace de WhatsApp para respuesta inmediata.
3. **Recepción de Alertas**: El panel de administración puede emitir alertas manuales que aparecen instantáneamente en todos los clientes conectados mediante notificaciones push y cambios visuales en el mapa.

---

## 🚀 Despliegue (Deploy)

El proyecto está configurado para desplegarse automáticamente mediante **GitHub Actions** y **Firebase Hosting**.

1. Instala Firebase CLI globalmente:
```bash
   npm install -g firebase-tools
```
2. Inicia sesión en Firebase:
```bash
   firebase login
```
3. Despliega el proyecto:
```bash
   firebase deploy
```
> *Nota: El workflow de GitHub Actions (`.github/workflows/`) también puede estar configurado para desplegar en GitHub Pages como respaldo.*

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

Este proyecto está bajo la licencia **ISC**. Consulta el archivo `LICENSE` para más detalles.

---

## 👤 Autor

**Desarrollado para Antamina**  
Mantenimiento y desarrollo por: [@antito-yanac](https://github.com/antito-yanac)

> ⚠️ **Importante**: Este sistema maneja datos de ubicación y personales. Asegúrate de cumplir con las políticas de privacidad y protección de datos locales al implementarlo en producción.

---

⭐ *Si este proyecto te resulta útil, ¡no olvides darle una estrella en GitHub!*
