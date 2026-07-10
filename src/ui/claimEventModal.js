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
    // Cada elemento: { id, file, name, url, status: 'subiendo'|'ok'|'error', isImage, objectUrl }
    let archivosAdjuntos = [];
    let archivoSeq = 0;

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
        title: `Registrar: ${paso.nombre}`,
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
            <div class="form-group">
                <label>Archivos adjuntos (varios — opcional)</label>
                <input type="file" id="se-archivos" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.zip">
                <div id="se-archivos-status" style="font-size:0.82rem;margin-top:4px;min-height:1.2em;color:#9ca3af;"></div>
                <div id="se-archivos-list" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;"></div>
                <div style="font-size:0.75rem;color:#6b7280;margin-top:2px;">Los archivos que enviaste (aparte de la evidencia). Puedes elegirlos uno por uno o varios a la vez — se van sumando a la lista.</div>
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

            // Archivos adjuntos (varios): se van SUMANDO a la lista con cada selección
            // (uno por uno o varios a la vez), en vez de reemplazar lo ya elegido.
            const inputArch = overlay.querySelector('#se-archivos');
            const statusArch = overlay.querySelector('#se-archivos-status');
            const listArch = overlay.querySelector('#se-archivos-list');

            const updateArchivosStatus = () => {
                const total = archivosAdjuntos.length;
                if (!total) { statusArch.textContent = ''; return; }
                const subiendo = archivosAdjuntos.filter(a => a.status === 'subiendo').length;
                const error = archivosAdjuntos.filter(a => a.status === 'error').length;
                if (subiendo) {
                    statusArch.style.color = '#f59e0b';
                    statusArch.textContent = `⏳ Subiendo ${subiendo} de ${total}...`;
                } else if (error) {
                    statusArch.style.color = '#ef4444';
                    statusArch.textContent = `⚠️ ${error} archivo(s) con error. Quítalos con la × o vuelve a intentar.`;
                } else {
                    statusArch.style.color = '#10b981';
                    statusArch.textContent = `✓ ${total} archivo(s) listo(s).`;
                }
            };

            const renderArchivosList = () => {
                listArch.innerHTML = archivosAdjuntos.map((a, i) => {
                    const ext = (a.name.split('.').pop() || '?').toUpperCase();
                    const thumb = a.objectUrl
                        ? `<img src="${a.objectUrl}" style="width:100%;height:100%;object-fit:cover;display:block;">`
                        : `<div style="font-size:0.65rem;font-weight:700;color:#9ca3af;">${esc(ext)}</div>`;
                    const badge = a.status === 'subiendo' ? '⏳' : a.status === 'error' ? '⚠️' : '✓';
                    const badgeColor = a.status === 'subiendo' ? '#f59e0b' : a.status === 'error' ? '#ef4444' : '#10b981';
                    return `
                    <div style="width:76px;">
                        <div style="position:relative;width:72px;height:72px;border:1px solid #334155;border-radius:8px;overflow:hidden;background:#0f172a;display:flex;align-items:center;justify-content:center;">
                            ${thumb}
                            <button type="button" class="se-arch-del" data-idx="${i}" title="Quitar archivo" style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;background:#7f1d1d;color:#fff;border:none;cursor:pointer;font-size:0.7rem;line-height:1;padding:0;">×</button>
                            <span style="position:absolute;bottom:2px;left:2px;font-size:0.75rem;color:${badgeColor};">${badge}</span>
                        </div>
                        <div style="font-size:0.65rem;color:#9ca3af;margin-top:2px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(a.name)}">${esc(a.name)}</div>
                    </div>`;
                }).join('');
                listArch.querySelectorAll('.se-arch-del').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const idx = parseInt(btn.getAttribute('data-idx'), 10);
                        const [removed] = archivosAdjuntos.splice(idx, 1);
                        if (removed?.objectUrl) URL.revokeObjectURL(removed.objectUrl);
                        renderArchivosList();
                        updateArchivosStatus();
                    });
                });
            };

            inputArch.addEventListener('change', () => {
                const files = Array.from(inputArch.files || []);
                inputArch.value = ''; // permite elegir de otra carpeta (o el mismo archivo) sin perder lo ya adjuntado
                files.forEach(file => {
                    const entry = {
                        id: ++archivoSeq,
                        file,
                        name: file.name,
                        url: null,
                        status: 'subiendo',
                        objectUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
                    };
                    archivosAdjuntos.push(entry);
                    uploadFile(file).then(url => {
                        if (!archivosAdjuntos.includes(entry)) return; // se quitó mientras subía
                        entry.url = url;
                        entry.status = 'ok';
                        renderArchivosList();
                        updateArchivosStatus();
                    }).catch(() => {
                        if (!archivosAdjuntos.includes(entry)) return;
                        entry.status = 'error';
                        renderArchivosList();
                        updateArchivosStatus();
                    });
                });
                renderArchivosList();
                updateArchivosStatus();
            });
        },
        onSubmit: (form) => {
            if (uploading || archivosAdjuntos.some(a => a.status === 'subiendo')) {
                showModalAlert('Espere a que terminen de subir los archivos.', 'error'); return;
            }
            if (archivosAdjuntos.some(a => a.status === 'error')) {
                showModalAlert('Hay archivos con error. Quítalos con la × antes de registrar.', 'error'); return;
            }
            const archivosUrls = archivosAdjuntos.filter(a => a.status === 'ok' && a.url).map(a => a.url);
            const fecha = form.querySelector('#se-fecha').value;
            const obs = form.querySelector('#se-obs').value;
            const diasStr = esInfo ? '' : form.querySelector('#se-dias').value;
            const dias = diasStr ? parseInt(diasStr) : null;
            const tipoDias = dias ? form.querySelector('#se-tipodias').value : null;
            const result = addClaimEvent(claimId, fecha, paso.nombre, obs, evidenceUrl, dias, tipoDias, null, paso.id, archivosUrls);
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
