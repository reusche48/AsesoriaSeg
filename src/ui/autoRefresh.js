import { loadCollections } from '../storage.js';

/**
 * Auto-refresco compartido entre secciones: mientras se ve una sección, recarga
 * del servidor las colecciones indicadas cada cierto tiempo y, si detecta cambios
 * (de otro dispositivo), re-pinta. Un solo timer activo a la vez.
 */
let timer = null;

export function stopAutoRefresh() {
    if (timer) { clearInterval(timer); timer = null; }
}

/**
 * @param {string} sectionHash - ej. '#vuelta' (se detiene al salir de la sección)
 * @param {string[]} collections - colecciones a recargar
 * @param {() => string} signatureFn - huella de los datos relevantes
 * @param {() => void} onChange - re-pintado si cambió la huella
 * @param {number} intervalMs
 */
export function startAutoRefresh(sectionHash, collections, signatureFn, onChange, intervalMs = 8000) {
    stopAutoRefresh();
    let last = signatureFn();
    timer = setInterval(async () => {
        if (!location.hash.startsWith(sectionHash)) { stopAutoRefresh(); return; } // salió de la sección
        if (document.querySelector('.form-modal-overlay')) return;                 // no interrumpir si hay un modal
        try { await loadCollections(collections); } catch (e) { return; }
        const sig = signatureFn();
        if (sig !== last) { last = sig; onChange(); }
    }, intervalMs);
}
