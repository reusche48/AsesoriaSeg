/**
 * Helper para mostrar formularios en popup modal.
 * Uso: openFormModal({ title, html, onSubmit, onOpen })
 */
import { confirmarEliminacion } from '../utils.js';

/**
 * Abre un modal con formulario.
 * @param {object} opts
 * @param {string} opts.title - Título del modal
 * @param {string} opts.html - HTML del formulario (sin <form> wrapper)
 * @param {function} opts.onSubmit - Callback(formElement) al enviar
 * @param {function} [opts.onOpen] - Callback(overlayElement) después de abrir (para bindings)
 * @param {string} [opts.submitLabel] - Texto del botón submit (default: 'Guardar')
 * @returns {HTMLElement} overlay element
 */
export function openFormModal({ title, html, onSubmit, onOpen, submitLabel }) {
    closeFormModal(); // Cerrar anterior si existe

    const overlay = document.createElement('div');
    overlay.className = 'form-modal-overlay';
    overlay.innerHTML = `
        <div class="form-modal">
            <div class="form-modal-header">
                <h3>${title}</h3>
                <button type="button" class="form-modal-close" aria-label="Cerrar">&times;</button>
            </div>
            <form id="form-modal-form" novalidate>
                <div class="form-modal-body">${html}</div>
                <div id="form-modal-alert"></div>
                <div class="form-modal-footer">
                    <button type="submit" class="btn btn-primary">${submitLabel || 'Guardar'}</button>
                    <button type="button" class="btn btn-secondary form-modal-cancel-btn">Cancelar</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(overlay);

    // Cerrar con X o Cancelar
    overlay.querySelector('.form-modal-close').addEventListener('click', () => closeFormModal());
    overlay.querySelector('.form-modal-cancel-btn').addEventListener('click', () => closeFormModal());

    // Submit
    const form = overlay.querySelector('#form-modal-form');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (onSubmit) onSubmit(form, overlay);
    });

    // Callback post-open (puede rellenar campos)
    if (onOpen) onOpen(overlay);

    // Estado inicial del formulario (después de onOpen). Sirve para no cerrar por error
    // al hacer clic afuera cuando el usuario ya escribió algo: si hay cambios, se pregunta.
    const serialize = (f) => [...f.querySelectorAll('input, textarea, select')]
        .filter(el => el.type !== 'file')
        .map(el => (el.type === 'checkbox' || el.type === 'radio') ? (el.checked ? '1' : '0') : el.value)
        .join('');
    const initialState = serialize(form);
    const hayCambios = () => serialize(form) !== initialState
        || [...form.querySelectorAll('input[type="file"]')].some(fi => fi.files && fi.files.length > 0);
    overlay.addEventListener('click', async (e) => {
        if (e.target !== overlay) return; // clic dentro del modal: ignorar
        if (hayCambios()) {
            const cerrar = await confirmarEliminacion(
                'Se perderá lo que escribiste. ¿Cerrar sin guardar?',
                { titulo: '⚠️ Cerrar sin guardar', confirmLabel: 'Cerrar sin guardar', confirmColor: '#b45309' }
            );
            if (cerrar) closeFormModal();
        } else {
            closeFormModal();
        }
    });

    return overlay;
}

/**
 * Cierra el modal de formulario actual.
 */
export function closeFormModal() {
    const existing = document.querySelector('.form-modal-overlay');
    if (existing) existing.remove();
}

/**
 * Muestra alerta dentro del modal.
 */
export function showModalAlert(message, type) {
    const el = document.querySelector('#form-modal-alert');
    if (el) el.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
}

/**
 * Muestra errores de campo dentro del modal.
 */
export function showModalFieldErrors(errors) {
    const overlay = document.querySelector('.form-modal-overlay');
    if (!overlay) return;
    for (const err of errors) {
        const el = overlay.querySelector(`[data-error="${err.field}"]`);
        if (el) el.textContent = err.message;
    }
}

/**
 * Limpia errores del modal.
 */
export function clearModalErrors() {
    const overlay = document.querySelector('.form-modal-overlay');
    if (!overlay) return;
    overlay.querySelectorAll('.error-message').forEach(el => { el.textContent = ''; });
    const alert = document.querySelector('#form-modal-alert');
    if (alert) alert.innerHTML = '';
}
