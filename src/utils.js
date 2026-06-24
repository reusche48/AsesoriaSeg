/**
 * Utilidades compartidas del sistema.
 * Importar desde cualquier módulo: import { esc, formatDate, formatMoney } from '../utils.js';
 */

/** Escapa HTML para prevenir XSS */
export function esc(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

/** Formatea una fecha ISO a formato legible en español */
export function formatDate(str) {
    if (!str) return '-';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(str) ? new Date(str + 'T00:00:00') : new Date(str);
    if (isNaN(d)) return str;
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Formatea una fecha ISO con hora */
export function formatDateTime(str) {
    if (!str) return '-';
    const d = new Date(str);
    if (isNaN(d)) return str;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

/** Formatea número como moneda en soles */
export function formatMoney(value) {
    return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Modal de confirmación reutilizable.
 * @param {string} mensaje - Texto de confirmación
 * @param {string} [tipo='danger'] - 'danger' | 'warning'
 * @returns {Promise<boolean>}
 */
export function confirmarEliminacion(mensaje = '¿Está seguro de que desea eliminar este registro? Esta acción no se puede deshacer.') {
    return new Promise((resolve) => {
        const prev = document.querySelector('.confirm-overlay');
        if (prev) prev.remove();

        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:8px;padding:1.5rem;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
                <h3 style="margin:0 0 0.75rem;color:#c62828;font-size:1rem;">⚠️ Confirmar eliminación</h3>
                <p style="margin:0 0 1.25rem;color:#333;font-size:0.95rem;">${esc(mensaje)}</p>
                <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
                    <button id="confirm-cancel" class="btn btn-secondary">Cancelar</button>
                    <button id="confirm-ok" class="btn btn-danger" style="background:#c62828;color:#fff;border:none;padding:0.45rem 1.1rem;border-radius:4px;cursor:pointer;font-weight:600;">Eliminar</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#confirm-ok').addEventListener('click', () => { overlay.remove(); resolve(true); });
        overlay.querySelector('#confirm-cancel').addEventListener('click', () => { overlay.remove(); resolve(false); });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
    });
}

/**
 * Exporta un array de objetos a un archivo Excel (.xlsx) usando SheetJS (window.XLSX).
 * @param {Array<Object>} data - Filas a exportar
 * @param {string} filename - Nombre del archivo sin extensión
 * @param {string} [sheetName='Datos'] - Nombre de la hoja
 */
export function exportToExcel(data, filename, sheetName = 'Datos') {
    if (!window.XLSX) { alert('La librería de exportación no está disponible. Recargue la página.'); return; }
    if (!data || data.length === 0) { alert('No hay datos para exportar.'); return; }
    const ws = window.XLSX.utils.json_to_sheet(data);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
    window.XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * Muestra indicador de progreso en un input de archivo mientras sube.
 * @param {HTMLInputElement} fileInput
 * @param {Function} onUrl - callback(url) cuando termina
 * @param {Function} uploadFileFn - función uploadFile de storage.js
 */
export async function handleFileUpload(fileInput, onUrl, uploadFileFn) {
    const file = fileInput.files[0];
    if (!file) { onUrl(null); return; }

    const preview = fileInput.nextElementSibling || fileInput.parentElement.querySelector('[id$="-preview"]');
    const originalText = preview ? preview.innerHTML : '';

    if (preview) preview.innerHTML = '<span style="color:#1565c0;">⏳ Subiendo...</span>';
    fileInput.disabled = true;

    try {
        const url = await uploadFileFn(file);
        if (preview) preview.innerHTML = `<span style="color:#2e7d32;">✅ ${esc(file.name)}</span>`;
        onUrl(url);
    } catch (err) {
        if (preview) preview.innerHTML = `<span style="color:#c62828;">❌ Error al subir</span>`;
        alert('Error al subir archivo: ' + err.message);
        fileInput.value = '';
        onUrl(null);
    } finally {
        fileInput.disabled = false;
    }
}
