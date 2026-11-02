// js/router-config.js
import { obtenerFirestore } from "./firebase-app.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

export async function verificarRuta(paginaActual) {
    try {
        const db = obtenerFirestore();
        // Consultamos el documento de control en Firestore
        const snap = await getDoc(doc(db, "sistema", "config_pagina"));
        
        if (snap.exists()) {
            const vistaActiva = snap.data().vista; // "index" o "strikeguard"

            // Si estamos en index pero debe ir a strikeguard
            if (paginaActual === "index" && vistaActiva === "strikeguard") {
                window.location.replace("./strikeguard.html");
            } 
            // Si estamos en strikeguard pero debe ir a index
            else if (paginaActual === "strikeguard" && vistaActiva === "index") {
                window.location.replace("./index.html");
            }
        }
    } catch (e) {
        console.warn("[Router] No se pudo verificar la ruta en Firestore, usando página actual por defecto.", e);
    }
}
