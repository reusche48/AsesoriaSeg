/**
 * Estado global de "cliente activo".
 * Única fuente de verdad: el id del cliente seleccionado, persistido en
 * sessionStorage (sobrevive recargas dentro de la pestaña, no se comparte
 * entre pestañas ni queda pegado tras cerrar sesión).
 * Guarda solo el id; el objeto se resuelve fresco desde el repositorio.
 */
import { clientRepository } from '../repositories/clientRepository.js';

const KEY = 'active_client_id';
const subscribers = new Set();

/** @returns {string|null} id del cliente activo o null */
export function getActiveClientId() {
    try { return sessionStorage.getItem(KEY) || null; } catch (e) { return null; }
}

/** @returns {object|null} objeto cliente activo (resuelto fresco) o null */
export function getActiveClient() {
    const id = getActiveClientId();
    return id ? (clientRepository.getById(id) || null) : null;
}

/** Fija el cliente activo. Si id es vacío, lo limpia. */
export function setActiveClient(id) {
    if (!id) { clearActiveClient(); return; }
    try { sessionStorage.setItem(KEY, id); } catch (e) { /* ignore */ }
    notify();
}

/** Limpia el cliente activo. */
export function clearActiveClient() {
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    notify();
}

/**
 * Suscribe una función a los cambios del cliente activo.
 * @param {(client: object|null) => void} fn
 * @returns {() => void} función para desuscribir
 */
export function onActiveClientChange(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
}

function notify() {
    const c = getActiveClient();
    subscribers.forEach(fn => { try { fn(c); } catch (e) { /* ignore */ } });
}
