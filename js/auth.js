// js/auth.js
//
// Autenticación con Firebase Auth (correo + contraseña).
// Protege el panel admin.html: solo un usuario autenticado puede
// ver el formulario y enviar mensajes.
//
// El usuario/contraseña se crea UNA VEZ desde Firebase Console
// (Authentication -> Users -> Add user). Puedes cambiarlo cuando
// quieras desde ahí, sin tocar el código.

import {
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

// La instancia de Auth sale SIEMPRE de firebase-app.js (única fuente,
// con setPersistence ya aplicado: la sesión admin sobrevive al cerrar
// el navegador).
import { obtenerAuth as obtenerAuthFirebase } from "./firebase-app.js";
import { ADMIN_EMAIL } from "./firebase-config.js";

function obtenerAuth() {
    return obtenerAuthFirebase();
}

/**
 * Inicia sesión con correo y contraseña.
 * Lanza un error si las credenciales son inválidas (lo maneja quien llama).
 */
export function iniciarSesion(email, password) {
    return signInWithEmailAndPassword(obtenerAuth(), email, password);
}

/**
 * Cierra la sesión actual.
 */
export function cerrarSesion() {
    return signOut(obtenerAuth());
}

/**
 * Escucha cambios en el estado de sesión.
 * callback(user) recibe el objeto de usuario si hay sesión, o null si no.
 */
export function observarSesion(callback) {
    return onAuthStateChanged(obtenerAuth(), callback);
}

/**
 * Traduce los códigos de error de Firebase Auth a mensajes en español.
 */
export function traducirErrorAuth(codigo) {
    const mensajes = {
        "auth/invalid-email": "Correo inválido.",
        "auth/user-disabled": "Este usuario está deshabilitado.",
        "auth/user-not-found": "Usuario o contraseña incorrectos.",
        "auth/wrong-password": "Usuario o contraseña incorrectos.",
        "auth/invalid-credential": "Usuario o contraseña incorrectos.",
        "auth/too-many-requests": "Demasiados intentos. Intenta más tarde.",
        "auth/network-request-failed": "Error de red. Verifica tu conexión.",
        "auth/configuration-not-found": "Debes habilitar 'Authentication' en Firebase Console (ver guía)."
    };
    return mensajes[codigo] || "No se pudo iniciar sesión. Intenta de nuevo.";
}

/** Coincide con isAdmin() de las reglas Firestore existentes.
 *  No acepta cuentas anónimas ni otorga privilegios por datos editables.
 *  La seguridad de escrituras depende también de reglas Firestore.
 */
export function esAdministrador(user) {
    return !!user && !user.isAnonymous &&
        typeof user.email === "string" &&
        user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}
