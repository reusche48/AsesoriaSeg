/**
 * Helper para mostrar formularios en popup modal.
 * Uso: openFormModal({ title, html, onSubmit, onOpen })
 */

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
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeFormModal();
    });

    // Submit
    const form = overlay.querySelector('#form-modal-form');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (onSubmit) onSubmit(form, overlay);
    });

    // Callback post-open
    if (onOpen) onOpen(overlay);

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
