import { addClaimEvent, getClaimEvents, getLatestEvents, updateClaimEvent } from '../services/claimEventService.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { openFileViewer, auditLinkHtml } from '../app.js';
import { openFormModal, closeFormModal, showModalAlert, clearModalErrors } from './modalHelper.js';
import { uploadFile } from '../storage.js';

let selectedEventEvidenceDataUrl = null;

export function renderClaimEventSection(container) {
    selectedEventEvidenceDataUrl = null;

    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">Eventos de Reclamos</h2>
            <div class="form-row" style="align-items:flex-end;margin-bottom:1rem;">
                <div class="form-group" style="flex:1;">
                    <label for="event-claim-search">Buscar reclamo (4+ letras)</label>
                    <div class="autocomplete-wrapper">
                        <input type="text" id="event-claim-search" placeholder="Escriba cliente o banco..." autocomplete="off">
                        <input type="hidden" id="event-claim-id">
                        <div id="event-claim-results" class="autocomplete-results"></div>
                    </div>
                </div>
                <div class="form-group" style="flex:0 0 auto;">
                    <button type="button" class="btn btn-primary" id="event-add-btn">➕ Agregar Evento</button>
                </div>
            </div>
            <div id="event-list-content"></div>
        </div>
    `;

    setupClaimAutocomplete(container);
    container.querySelector('#event-add-btn').addEventListener('click', () => openEventModal(container, null));
    showLatestEvents(container);
}

function buildClaimLabel(claim) {
    const incident = incidentRepository.getById(claim.siniestroId);
    const client = incident ? clientRepository.getById(incident.clienteId) : null;
    const bank = bankRepository.getById(claim.bancoId);
    const clientLabel = client ? `${client.nombreCompleto} ${client.apellidosCompletos}` : 'Desconocido';
    const bankLabel = bank ? bank.nombre : 'Desconocido';
    return { clientLabel, bankLabel, text: `${formatDate(claim.fecha)} — ${clientLabel} — ${bankLabel} — [${claim.estado || 'Pendiente'}]` };
}

function setupClaimAutocomplete(container) {
    const searchInput = container.querySelector('#event-claim-search');
    const hiddenInput = container.querySelector('#event-claim-id');
    const resultsDiv = container.querySelector('#event-claim-results');

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        hiddenInput.value = '';
        if (query.length < 4) { resultsDiv.innerHTML = ''; resultsDiv.classList.remove('open'); return; }

        const claims = claimRepository.getAll();
        const matches = [];
        for (const claim of claims) {
            const info = buildClaimLabel(claim);
            if (info.clientLabel.toLowerCase().includes(query) || info.bankLabel.toLowerCase().includes(query)) {
                matches.push({ claim, label: info.text });
            }
        }

        if (matches.length === 0) {
            resultsDiv.innerHTML = '<div class="autocomplete-item no-result">Sin resultados</div>';
            resultsDiv.classList.add('open');
            return;
        }

        resultsDiv.innerHTML = matches.map(m =>
            `<div class="autocomplete-item" data-id="${escapeHtml(m.claim.id)}">${escapeHtml(m.label)}</div>`
        ).join('');
        resultsDiv.classList.add('open');

        resultsDiv.querySelectorAll('.autocomplete-item[data-id]').forEach(item => {
            item.addEventListener('click', () => {
                hiddenInput.value = item.getAttribute('data-id');
                searchInput.value = item.textContent;
                resultsDiv.innerHTML = '';
                resultsDiv.classList.remove('open');
                refreshEventList(container, hiddenInput.value);
            });
        });
    });

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
            resultsDiv.innerHTML = '';
            resultsDiv.classList.remove('open');
        }
    });
}

/**
 * Abre modal para crear/editar evento.
 */
function openEventModal(container, eventObj) {
    const editing = !!eventObj;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const defaultDateTime = editing && eventObj.fecha
        ? eventObj.fecha.substring(0, 16)
        : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

    // Pre-seleccionar reclamo
    let claimSearchValue = '';
    let claimIdValue = '';
    if (editing && eventObj.reclamoId) {
        const claim = claimRepository.getById(eventObj.reclamoId);
        if (claim) {
            const info = buildClaimLabel(claim);
            claimSearchValue = info.text;
            claimIdValue = claim.id;
        }
    } else {
        // Usar el reclamo seleccionado en el filtro principal
        const mainClaimId = container.querySelector('#event-claim-id')?.value;
        if (mainClaimId) {
            const claim = claimRepository.getById(mainClaimId);
            if (claim) {
                const info = buildClaimLabel(claim);
                claimSearchValue = info.text;
                claimIdValue = claim.id;
            }
        }
    }

    const descOptions = ['Reclamo presentado','Documentación enviada','En revisión','Reclamo observado','Avance del reclamo','Reclamo indemnizado','Reclamo rechazado'];

    const html = `
        <div class="form-row">
            <div class="form-group" data-field="reclamoId">
                <label>Reclamo *</label>
                <div class="autocomplete-wrapper">
                    <input type="text" id="modal-event-claim-search" placeholder="Escriba 4+ letras..." autocomplete="off" value="${escapeHtml(claimSearchValue)}">
                    <input type="hidden" id="modal-event-claim-id" value="${escapeHtml(claimIdValue)}">
                    <div id="modal-event-claim-results" class="autocomplete-results"></div>
                </div>
                <div class="error-message" data-error="reclamoId"></div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group" data-field="fecha">
                <label>Fecha y hora *</label>
                <input type="datetime-local" id="modal-event-fecha" value="${defaultDateTime}" required>
                <div class="error-message" data-error="fecha"></div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group" data-field="descripcion">
                <label>Descripción *</label>
                <select id="modal-event-descripcion" required>
                    <option value="">-- Seleccione --</option>
                    ${descOptions.map(d => `<option value="${d}" ${editing && eventObj.descripcion === d ? 'selected' : ''}>${d}</option>`).join('')}
                </select>
                <div class="error-message" data-error="descripcion"></div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group" data-field="observacion">
                <label>Observación *</label>
                <textarea id="modal-event-observacion" rows="3" required placeholder="Describa en detalle...">${editing ? escapeHtml(eventObj.observacion || '') : ''}</textarea>
                <div class="error-message" data-error="observacion"></div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Evidencia (archivo opcional)</label>
                <input type="file" id="modal-event-evidence">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Días de espera para respuesta</label>
                <input type="number" id="modal-event-dias-espera" min="1" step="1" placeholder="Ej: 30 (opcional)" value="${editing && eventObj.diasEspera ? eventObj.diasEspera : ''}">
            </div>
            <div class="form-group">
                <label>Tipo de días</label>
                <select id="modal-event-tipo-dias">
                    <option value="naturales" ${editing && eventObj.tipoDias === 'naturales' ? 'selected' : ''}>Días naturales</option>
                    <option value="laborables" ${editing && eventObj.tipoDias === 'laborables' ? 'selected' : ''}>Días laborables (L-V)</option>
                </select>
            </div>
        </div>
    `;

    selectedEventEvidenceDataUrl = editing ? (eventObj.evidencia || null) : null;

    openFormModal({
        title: editing ? 'Editar Evento' : 'Nuevo Evento',
        html,
        submitLabel: editing ? 'Guardar Cambios' : 'Registrar',
        onOpen: (overlay) => {
            // Autocomplete dentro del modal
            const searchInput = overlay.querySelector('#modal-event-claim-search');
            const hiddenInput = overlay.querySelector('#modal-event-claim-id');
            const resultsDiv = overlay.querySelector('#modal-event-claim-results');

            searchInput.addEventListener('input', () => {
                const query = searchInput.value.trim().toLowerCase();
                hiddenInput.value = '';
                if (query.length < 4) { resultsDiv.innerHTML = ''; resultsDiv.classList.remove('open'); return; }

                const claims = claimRepository.getAll();
                const matches = [];
                for (const claim of claims) {
                    const info = buildClaimLabel(claim);
                    if (info.clientLabel.toLowerCase().includes(query) || info.bankLabel.toLowerCase().includes(query)) {
                        matches.push({ claim, label: info.text });
                    }
                }
                if (matches.length === 0) {
                    resultsDiv.innerHTML = '<div class="autocomplete-item no-result">Sin resultados</div>';
                    resultsDiv.classList.add('open');
                    return;
                }
                resultsDiv.innerHTML = matches.map(m =>
                    `<div class="autocomplete-item" data-id="${escapeHtml(m.claim.id)}">${escapeHtml(m.label)}</div>`
                ).join('');
                resultsDiv.classList.add('open');
                resultsDiv.querySelectorAll('.autocomplete-item[data-id]').forEach(item => {
                    item.addEventListener('click', () => {
                        hiddenInput.value = item.getAttribute('data-id');
                        searchInput.value = item.textContent;
                        resultsDiv.innerHTML = '';
                        resultsDiv.classList.remove('open');
                    });
                });
            });

            // Evidence file
            const evidenceInput = overlay.querySelector('#modal-event-evidence');
            evidenceInput.addEventListener('change', () => {
                const file = evidenceInput.files[0];
                if (file) {
                    uploadFile(file).then(url => { selectedEventEvidenceDataUrl = url; }).catch(err => alert('Error al subir archivo: ' + err.message));
                } else {
                    selectedEventEvidenceDataUrl = null;
                }
            });
        },
        onSubmit: (form) => {
            clearModalErrors();
            const claimId = form.querySelector('#modal-event-claim-id').value;
            const fecha = form.querySelector('#modal-event-fecha').value;
            const descripcion = form.querySelector('#modal-event-descripcion').value;
            const observacion = form.querySelector('#modal-event-observacion').value;
            const diasEsperaStr = form.querySelector('#modal-event-dias-espera').value;
            const diasEspera = diasEsperaStr ? parseInt(diasEsperaStr) : null;
            const tipoDias = form.querySelector('#modal-event-tipo-dias').value;

            let result;
            if (editing) {
                result = updateClaimEvent(eventObj.id, { reclamoId: claimId, fecha, descripcion, observacion, evidencia: selectedEventEvidenceDataUrl, diasEspera, tipoDias });
            } else {
                result = addClaimEvent(claimId, fecha, descripcion, observacion, selectedEventEvidenceDataUrl, diasEspera, tipoDias, null);
            }

            if (result.success) {
                closeFormModal();
                const mainClaimId = container.querySelector('#event-claim-id')?.value;
                if (mainClaimId) {
                    refreshEventList(container, mainClaimId);
                } else {
                    showLatestEvents(container);
                }
            } else {
                showModalFieldErrors(result.errors);
            }
        }
    });
}

function showLatestEvents(container) {
    const events = getLatestEvents(10);
    renderEventTable(container, events, true);
}

function refreshEventList(container, claimId) {
    if (!claimId) { showLatestEvents(container); return; }
    const events = getClaimEvents(claimId);
    renderEventTable(container, events, false);
}

function renderEventTable(container, events, showClaimInfo) {
    const listContent = container.querySelector('#event-list-content');
    if (events.length === 0) {
        listContent.innerHTML = '<div class="empty-state">No hay eventos registrados.</div>';
        return;
    }

    const headerExtra = showClaimInfo ? '<th>Reclamo</th>' : '';
    const rows = events.map(ev => {
        const fechaObj = new Date(ev.fecha);
        const fechaStr = fechaObj.toLocaleDateString('es-PE') + ' ' + fechaObj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

        let claimCell = '';
        if (showClaimInfo) {
            const claim = claimRepository.getById(ev.reclamoId);
            if (claim) {
                const info = buildClaimLabel(claim);
                claimCell = `<td>${escapeHtml(info.clientLabel)} — ${escapeHtml(info.bankLabel)}</td>`;
            } else {
                claimCell = '<td>-</td>';
            }
        }

        const evidenciaBtn = ev.evidencia
            ? `<button type="button" class="btn-icon view-evidence-btn" title="Ver evidencia" data-file="${escapeHtml(ev.evidencia)}">📎</button>`
            : '-';

        return `
            <tr>
                ${claimCell}
                <td>${escapeHtml(fechaStr)}</td>
                <td>${escapeHtml(ev.descripcion)}</td>
                <td>${escapeHtml(ev.observacion || '')}</td>
                <td>${evidenciaBtn}</td>
                <td>${auditLinkHtml(ev)}</td>
                <td class="actions">
                    <button type="button" class="btn-icon primary edit-event-btn" data-id="${escapeHtml(ev.id)}" title="Editar">✏️</button>
                </td>
            </tr>
        `;
    }).join('');

    listContent.innerHTML = `
        <table class="data-table">
            <thead><tr>${headerExtra}<th>Fecha y Hora</th><th>Descripción</th><th>Observación</th><th>Evidencia</th><th>Registro</th><th>Acciones</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    listContent.querySelectorAll('.view-evidence-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const file = btn.getAttribute('data-file');
            if (file) openFileViewer(file);
        });
    });

    listContent.querySelectorAll('.edit-event-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const allEvents = getLatestEvents(999);
            const ev = allEvents.find(e => e.id === btn.getAttribute('data-id'));
            if (ev) openEventModal(container, ev);
        });
    });
}

function showModalFieldErrors(errors) {
    const overlay = document.querySelector('.form-modal-overlay');
    if (!overlay) return;
    for (const err of errors) {
        const el = overlay.querySelector(`[data-error="${err.field}"]`);
        if (el) el.textContent = err.message;
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
}
