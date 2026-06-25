import { addClaimEvent } from '../services/claimEventService.js';
import { uploadFile } from '../storage.js';
import { openFormModal, closeFormModal, showModalAlert } from './modalHelper.js';

/**
 * Modal para registrar un evento asociado a un PASO del trámite (Guía).
 * Pre-rellena días/tipo desde el paso; al guardar pasa stepId para la transición.
 *
 * @param {object} opts
 * @param {string} opts.claimId
 * @param {object} opts.paso - paso del reclamo (claimStep) con nombre, tipoPaso, diasEspera, tipoDias
 * @param {function} [opts.onDone] - callback tras registrar
 */
export function openStepEventModal({ claimId, paso, onDone }) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const defaultDateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const esInfo = paso.tipoPaso === 'informativo';
    let evidenceUrl = null;
    let uploading = false;

    const plazoHtml = esInfo ? '' : `
        <div class="form-row">
            <div class="form-group">
                <label>Días de espera para respuesta</label>
                <input type="number" id="se-dias" min="1" step="1" value="${paso.diasEspera || ''}" placeholder="Ej: 15">
            </div>
            <div class="form-group">
                <label>Tipo de días</label>
                <select id="se-tipodias">
                    <option value="naturales" ${paso.tipoDias !== 'laborables' ? 'selected' : ''}>Naturales</option>
                    <option value="laborables" ${paso.tipoDias === 'laborables' ? 'selected' : ''}>Laborables (L-V)</option>
                </select>
            </div>
        </div>`;

    openFormModal({
        title: `Registrar paso: ${paso.nombre}`,
        submitLabel: 'Registrar',
        html: `
            <div class="form-row">
                <div class="form-group" data-field="fecha">
                    <label>Fecha y hora *</label>
                    <input type="datetime-local" id="se-fecha" value="${defaultDateTime}" required>
                    <div class="error-message" data-error="fecha"></div>
                </div>
            </div>
            <div class="form-group" data-field="observacion">
                <label>Observación / detalle *</label>
                <textarea id="se-obs" rows="3" required placeholder="Qué se hizo / qué respondió el banco...">${esc(paso.descripcion || '')}</textarea>
                <div class="error-message" data-error="observacion"></div>
            </div>
            <div class="form-group">
                <label>Evidencia (PDF, JPG, PNG — opcional)</label>
                <input type="file" id="se-evidencia" accept=".pdf,.jpg,.jpeg,.png,.webp">
                <div id="se-evidencia-status" style="font-size:0.82rem;margin-top:4px;min-height:1.2em;color:#9ca3af;"></div>
            </div>
            ${plazoHtml}
            ${esInfo ? '<p style="color:#9ca3af;font-size:0.82rem;">Paso informativo: no espera respuesta, se marcará como completado.</p>' : ''}
        `,
        onOpen: (overlay) => {
            const input = overlay.querySelector('#se-evidencia');
            const status = overlay.querySelector('#se-evidencia-status');
            input.addEventListener('change', () => {
                const file = input.files[0];
                if (!file) { evidenceUrl = null; status.textContent = ''; return; }
                uploading = true; status.textContent = '⏳ Subiendo archivo...'; status.style.color = '#f59e0b';
                uploadFile(file).then(url => {
                    evidenceUrl = url; uploading = false;
                    status.textContent = '✓ Archivo subido'; status.style.color = '#10b981';
                }).catch(() => {
                    evidenceUrl = null; uploading = false; input.value = '';
                    status.textContent = 'Error al subir el archivo.'; status.style.color = '#ef4444';
                });
            });
        },
        onSubmit: (form) => {
            if (uploading) { showModalAlert('Espere a que termine de subir la evidencia.', 'error'); return; }
            const fecha = form.querySelector('#se-fecha').value;
            const obs = form.querySelector('#se-obs').value;
            const diasStr = esInfo ? '' : form.querySelector('#se-dias').value;
            const dias = diasStr ? parseInt(diasStr) : null;
            const tipoDias = dias ? form.querySelector('#se-tipodias').value : null;
            const result = addClaimEvent(claimId, fecha, paso.nombre, obs, evidenceUrl, dias, tipoDias, null, paso.id);
            if (result.success) {
                closeFormModal();
                if (onDone) onDone();
            } else {
                const overlay = document.querySelector('.form-modal-overlay');
                (result.errors || []).forEach(e => {
                    const el = overlay?.querySelector(`[data-error="${e.field}"]`);
                    if (el) el.textContent = e.message;
                });
            }
        },
    });
}

function esc(str) { const d = document.createElement('div'); d.textContent = str ?? ''; return d.innerHTML; }
