// js/mensajes-globales.js
import { obtenerFirestore, obtenerAuth } from "./firebase-app.js";
import { collection, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const db = obtenerFirestore();
const auth = obtenerAuth();

export function escucharMensajesGlobales() {
    // Verificamos que el usuario esté logueado (aunque sea anónimo) antes de escuchar
    auth.onAuthStateChanged((user) => {
        if (!user) return; // Si no hay sesión, no escuchamos

        console.log("👂 Escuchando mensajes globales...");
        const q = query(collection(db, "mensajes_globales"), orderBy("fecha", "desc"), limit(1));
        
        onSnapshot(q, (snap) => {
            if (snap.empty) return;
            
            const doc = snap.docs[0];
            const data = doc.data();
            
            // Evitar que el mismo mensaje se muestre múltiples veces en la misma sesión
            const ultimoId = sessionStorage.getItem("ultimo_msg_id");
            if (ultimoId === doc.id) return;
            sessionStorage.setItem("ultimo_msg_id", doc.id);

            mostrarModalMensaje(data.titulo, data.cuerpo);
        }, (error) => {
            console.error("❌ Error escuchando mensajes globales:", error);
        });
    });
}

function mostrarModalMensaje(titulo, cuerpo) {
    if (document.getElementById("modal-global-msg")) return;

    const modal = document.createElement("div");
    modal.id = "modal-global-msg";
    modal.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.8);
        display: flex; align-items: center; justify-content: center;
        z-index: 99999; padding: 20px; font-family: sans-serif;
    `;

    modal.innerHTML = `
        <div style="background: #fff; border-radius: 12px; padding: 20px; max-width: 400px; width: 100%; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <h2 style="margin-top: 0; color: #e74c3c;">📢 ${titulo}</h2>
            <p style="font-size: 16px; color: #333; line-height: 1.5;">${cuerpo}</p>
            <button id="btn-entendido-msg" style="margin-top: 15px; width: 100%; padding: 12px; background: #e74c3c; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer;">
                Entendido
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("btn-entendido-msg").addEventListener("click", () => {
        modal.remove();
    });

    setTimeout(() => {
        if (document.getElementById("modal-global-msg")) {
            modal.remove();
        }
    }, 5000);
}
