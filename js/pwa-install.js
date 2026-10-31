// js/pwa-install.js
// ============================================================
// Instalación de PWA universal (Chrome/Edge nativo, iOS manual)
// ============================================================

let deferredPrompt = null;

// Detectar si ya está instalada
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

// Detectar navegador
const userAgent = window.navigator.userAgent.toLowerCase();
const isIOS = /iphone|ipad|ipod/.test(userAgent);
const isSafari = /safari/.test(userAgent) && !/chrome|crios|fxios/.test(userAgent);

// 1. Crear el botón flotante
function crearBotonInstalar() {
    if (isStandalone) return; // Ya está instalada

    const btn = document.createElement("button");
    btn.id = "btn-instalar-pwa";
    btn.innerHTML = "📲 Instalar App";
    
    // Estilos del botón (puedes moverlos a tu CSS si prefieres)
    btn.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        z-index: 9000;
        background: #4285f4;
        color: white;
        border: none;
        border-radius: 24px;
        padding: 12px 20px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        display: none;
        align-items: center;
        gap: 8px;
        font-family: 'Segoe UI', sans-serif;
        transition: transform 0.2s;
    `;
    
    btn.addEventListener("mouseover", () => btn.style.transform = "scale(1.05)");
    btn.addEventListener("mouseout", () => btn.style.transform = "scale(1)");
    
    document.body.appendChild(btn);

    btn.addEventListener("click", () => {
        if (deferredPrompt) {
            // Chrome/Edge: Mostrar diálogo nativo
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('✅ Usuario aceptó instalar la PWA');
                    btn.style.display = "none";
                }
                deferredPrompt = null;
            });
        } else {
            // iOS u otros: Mostrar instrucciones manuales
            mostrarModalInstrucciones();
        }
    });

    return btn;
}

// 2. Modal de instrucciones manuales (para iOS)
function mostrarModalInstrucciones() {
    if (document.getElementById("pwa-modal")) return;

    const modal = document.createElement("div");
    modal.id = "pwa-modal";
    modal.style.cssText = `
        position: fixed; inset: 0; z-index: 10000;
        background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        padding: 20px; font-family: 'Segoe UI', sans-serif;
    `;
    
    let contenido = "";
    if (isIOS) {
        contenido = `
            <h3 style="color:#fff; margin-top:0;">Instalar en iPhone/iPad</h3>
            <p style="color:#ccc; font-size:14px; line-height:1.5;">
                Para instalar esta app en tu dispositivo:
            </p>
            <ol style="color:#fff; font-size:14px; line-height:1.8; padding-left:20px;">
                <li>Toca el botón <b>Compartir</b> <span style="font-size:18px;">⎋</span> (abajo en Safari).</li>
                <li>Desplázate y selecciona <b>Añadir a pantalla de inicio</b>.</li>
                <li>Toca <b>Añadir</b> en la esquina superior derecha.</li>
            </ol>
        `;
    } else {
        contenido = `
            <h3 style="color:#fff; margin-top:0;">Instalar la App</h3>
            <p style="color:#ccc; font-size:14px; line-height:1.5;">
                Tu navegador no soporta la instalación automática.<br><br>
                Busca la opción <b>"Instalar"</b> o <b>"Añadir a pantalla de inicio"</b> en el menú de tu navegador (los tres puntos <b>⋮</b>).
            </p>
        `;
    }

    modal.innerHTML = `
        <div style="background:#1c1c20; padding:24px; border-radius:16px; max-width:360px; width:100%; text-align:center; border:2px solid #4285f4; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
            ${contenido}
            <button id="pwa-modal-cerrar" style="margin-top:20px; width:100%; padding:12px; background:#4285f4; color:white; border:none; border-radius:8px; font-weight:bold; font-size:15px; cursor:pointer;">
                Entendido
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById("pwa-modal-cerrar").addEventListener("click", () => {
        modal.remove();
    });
}

// 3. Lógica principal
export function initPWAInstall() {
    if (isStandalone) {
        console.log("[PWA] La app ya está instalada (standalone).");
        return;
    }

    const btn = crearBotonInstalar();

    // Evento nativo para Chrome, Edge, Samsung Internet, etc.
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault(); // Evita el banner automático
        deferredPrompt = e;
        console.log("[PWA] Evento beforeinstallprompt capturado. Mostrando botón.");
        
        if (btn) {
            btn.style.display = "flex";
            // Ocultar el botón después de 30s si el usuario lo ignora
            setTimeout(() => {
                if (btn.style.display !== "none") btn.style.display = "none";
            }, 30000);
        }
    });

    // Si el usuario ya instaló la app desde el evento nativo
    window.addEventListener('appinstalled', (evt) => {
        console.log("[PWA] App instalada exitosamente.");
        if (btn) btn.style.display = "none";
        deferredPrompt = null;
    });

    // Para iOS y otros: Mostrar el botón después de un tiempo si no hay evento nativo
    setTimeout(() => {
        if (!deferredPrompt && btn && btn.style.display === "none") {
            console.log("[PWA] No hay evento nativo. Mostrando botón manual (iOS/otros).");
            btn.style.display = "flex";
        }
    }, 3000); // Esperar 3 segundos por si el evento nativo llega tarde
}
