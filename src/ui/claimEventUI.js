import { addClaimEvent, getClaimEvents, getLatestEvents, updateClaimEvent, deleteClaimEvent } from '../services/claimEventService.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { claimEventRepository } from '../repositories/claimEventRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { claimStepRepository } from '../repositories/claimStepRepository.js';
import { openFileViewer, auditLinkHtml } from '../app.js';
import { openFormModal, closeFormModal, showModalAlert, clearModalErrors } from './modalHelper.js';
import { uploadFile } from '../storage.js';
import { handleFileUpload, exportToExcel } from '../utils.js';
import { getActiveClientId } from '../state/clientContext.js';

let selectedEventEvidenceDataUrl = null;
let eventEvidenceUploading = false;
let eventFilterDesde = null;
let eventFilterHasta = null;

const FOCUS_KEY = 'eventos_focus_claim';

/**
 * Fija un reclamo para que al entrar a la sección Eventos se muestren
 * directamente sus eventos. Se guarda en sessionStorage (no en una variable
 * que se consume en el primer render) para ser robusto ante doble render.
 * @param {string} claimId
 */
export function setEventPreselectClaim(claimId) {
    try {
        if (claimId) sessionStorage.setItem(FOCUS_KEY, claimId);
        else sessionStorage.removeItem(FOCUS_KEY);
    } catch (e) { /* ignore */ }
}

/** Limpia el reclamo enfocado (al salir de Eventos o al filtrar manualmente). */
export function clearEventFocusClaim() {
    try { sessionStorage.removeItem(FOCUS_KEY); } catch (e) { /* ignore */ }
}

export function renderClaimEventSection(container) {
    selectedEventEvidenceDataUrl = null;
    eventFilterDesde = null;
    eventFilterHasta = null;

    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">Eventos de Reclamos</h2>
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:flex-end;margin-bottom:1rem;">
                <div class="form-group" style="flex:1;min-width:200px;margin:0;">
                    <label for="event-claim-search">Buscar reclamo (4+ letras)</label>
                    <div class="autocomplete-wrapper">
                        <input type="text" id="event-claim-search" placeholder="Escriba cliente o banco..." autocomplete="off">
                        <input type="hidden" id="event-claim-id">
                        <div id="event-claim-results" class="autocomplete-results"></div>
                    </div>
                </div>
                <div style="display:flex;gap:0.5rem;align-items:flex-end;flex-wrap:wrap;">
                    <div>
                        <label style="display:block;font-size:0.82rem;margin-bottom:0.2rem;">Desde</label>
                        <input type="date" id="event-filter-desde" style="padding:0.45rem;border:1px solid #ccc;border-radius:4px;">
                    </div>
                    <div>
                        <label style="display:block;font-size:0.82rem;margin-bottom:0.2rem;">Hasta</label>
                        <input type="date" id="event-filter-hasta" style="padding:0.45rem;border:1px solid #ccc;border-radius:4px;">
                    </div>
                    <button type="button" class="btn btn-secondary" id="event-filter-clear" title="Limpiar filtros">✖</button>
                    <button type="button" class="btn btn-secondary" id="event-export-btn">📊 Excel</button>
                    <button type="button" class="btn btn-primary" id="event-add-btn">➕ Agregar Evento</button>
                </div>
            </div>
            <div id="event-list-content"></div>
        </div>
    `;

    setupClaimAutocomplete(container);
    container.querySelector('#event-add-btn').addEventListener('click', () => openEventModal(container, null));
    container.querySelector('#event-export-btn').addEventListener('click', () => exportEvents(container));
    container.querySelector('#event-filter-desde').addEventListener('change', (e) => { eventFilterDesde = e.target.value || null; _refreshCurrentEventView(container); });
    container.querySelector('#event-filter-hasta').addEventListener('change', (e) => { eventFilterHasta = e.target.value || null; _refreshCurrentEventView(container); });
    container.querySelector('#event-filter-clear').addEventListener('click', () => {
        eventFilterDesde = null; eventFilterHasta = null;
        container.querySelector('#event-filter-desde').value = '';
        container.querySelector('#event-filter-hasta').value = '';
        // Limpiar también el reclamo enfocado para ver todos los eventos
        container.querySelector('#event-claim-search').value = '';
        container.querySelector('#event-claim-id').value = '';
        clearEventFocusClaim();
        showLatestEvents(container);
    });

    // Si se entró con un reclamo enfocado (ej: desde Alertas → Ver Historial).
    // Se lee de sessionStorage SIN limpiarlo aquí, para ser robusto ante doble render.
    let focusClaimId = null;
    try { focusClaimId = sessionStorage.getItem(FOCUS_KEY); } catch (e) { /* ignore */ }

    if (focusClaimId) {
        const claim = claimRepository.getById(focusClaimId);
        if (claim) {
            const info = buildClaimLabel(claim);
            container.querySelector('#event-claim-search').value = info.text;
            container.querySelector('#event-claim-id').value = claim.id;
            refreshEventList(container, claim.id);
        } else {
            showLatestEvents(container);
        }
    } else {
        // Si hay cliente activo global, mostrar los eventos de sus reclamos
        const activeClientId = getActiveClientId();
        if (activeClientId) {
            showEventsForClient(container, activeClientId);
        } else {
            showLatestEvents(container);
        }
    }
}

/** Muestra los eventos de todos los reclamos de un cliente. */
function showEventsForClient(container, clientId) {
    const incidentIds = new Set(
        incidentRepository.getAll().filter(i => i.clienteId === clientId).map(i => i.id)
    );
    const claimIds = new Set(
        claimRepository.getAll().filter(c => incidentIds.has(c.siniestroId)).map(c => c.id)
    );
    let events = claimEventRepository.getAll().filter(e => claimIds.has(e.reclamoId));
    events = applyDateFilter(events.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
    renderEventTable(container, events, true);
}

function _refreshCurrentEventView(container) {
    const claimId = container.querySelector('#event-claim-id')?.value;
    if (claimId) refreshEventList(container, claimId);
    else showLatestEvents(container);
}

/** Nombre del paso del trámite al que pertenece el evento (o "—" si no viene de un paso). */
function pasoLabel(ev) {
    if (!ev.stepId) return '—';
    const s = claimStepRepository.getById(ev.stepId);
    return s ? s.nombre : '—';
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
                setEventPreselectClaim(hiddenInput.value); // mantener el foco sincronizado con la selección manual
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
                <label>Evidencia (PDF, JPG, PNG — opcional)</label>
                <input type="file" id="modal-event-evidence" accept=".pdf,.jpg,.jpeg,.png,.webp">
                <div id="modal-event-evidence-status" style="font-size:0.82rem;margin-top:4px;min-height:1.3em;"></div>
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

            // Evidence file con feedback visual y opción de quitar
            const evidenceInput = overlay.querySelector('#modal-event-evidence');
            const evStatus = overlay.querySelector('#modal-event-evidence-status');

            function renderEvStatus() {
                if (eventEvidenceUploading) {
                    evStatus.innerHTML = '<span style="color:#f59e0b;">⏳ Subiendo archivo...</span>';
                    return;
                }
                if (selectedEventEvidenceDataUrl) {
                    evStatus.innerHTML = `<span style="color:#10b981;">✓ Evidencia adjunta</span>
                        <a href="#" id="ev-ver" style="color:#7c3aed;margin-left:8px;">Ver</a>
                        <a href="#" id="ev-quitar" style="color:#ef4444;margin-left:8px;">Quitar</a>`;
                    evStatus.querySelector('#ev-ver').addEventListener('click', (e) => {
                        e.preventDefault();
                        openFileViewer(selectedEventEvidenceDataUrl);
                    });
                    evStatus.querySelector('#ev-quitar').addEventListener('click', (e) => {
                        e.preventDefault();
                        selectedEventEvidenceDataUrl = null;
                        evidenceInput.value = '';
                        renderEvStatus();
                    });
                } else {
                    evStatus.innerHTML = '<span style="color:#9ca3af;">Sin evidencia</span>';
                }
            }
            renderEvStatus();

            evidenceInput.addEventListener('change', async () => {
                const file = evidenceInput.files[0];
                if (!file) { renderEvStatus(); return; }
                eventEvidenceUploading = true;
                renderEvStatus();
                try {
                    const url = await uploadFile(file);
                    selectedEventEvidenceDataUrl = url;
                } catch (err) {
                    selectedEventEvidenceDataUrl = null;
                    evidenceInput.value = '';
                    eventEvidenceUploading = false;
                    evStatus.innerHTML = `<span style="color:#ef4444;">Error al subir: ${escapeHtml(err.message || 'inténtelo de nuevo')}</span>`;
                    return;
                }
                eventEvidenceUploading = false;
                renderEvStatus();
            });
        },
        onSubmit: (form) => {
            clearModalErrors();
            if (eventEvidenceUploading) {
                showModalAlert('Espere a que termine de subir la evidencia antes de guardar.', 'error');
                return;
            }
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

function exportEvents(container) {
    const claimId = container.querySelector('#event-claim-id')?.value;
    let events = claimId ? getClaimEvents(claimId) : getLatestEvents(5000);
    events = applyDateFilter(events);

    const rows = events.map(ev => {
        const claim = claimRepository.getById(ev.reclamoId);
        const info = claim ? buildClaimLabel(claim) : { clientLabel: '-', bankLabel: '-' };
        const fechaObj = new Date(ev.fecha);
        const t = diasTranscurridos(ev.fecha);
        return {
            'Fecha': isNaN(fechaObj) ? ev.fecha : fechaObj.toLocaleDateString('es-PE') + ' ' + fechaObj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
            'Días transcurridos (naturales)': t ? t.naturales : '',
            'Días transcurridos (laborables)': t ? t.laborables : '',
            'Cliente': info.clientLabel,
            'Banco': info.bankLabel,
            'Paso': pasoLabel(ev),
            'Descripción': ev.descripcion || '',
            'Observación': ev.observacion || '',
            'Días de espera': ev.diasEspera || '',
            'Tipo de días': ev.tipoDias || '',
        };
    });

    const today = new Date().toISOString().split('T')[0];
    exportToExcel(rows, `Eventos_${today}`, 'Eventos');
}

function applyDateFilter(events) {
    let filtered = events;
    if (eventFilterDesde) filtered = filtered.filter(ev => ev.fecha >= eventFilterDesde);
    if (eventFilterHasta) {
        const hasta = eventFilterHasta + 'T23:59:59';
        filtered = filtered.filter(ev => ev.fecha <= hasta);
    }
    return filtered;
}

function showLatestEvents(container) {
    const events = applyDateFilter(getLatestEvents(200));
    renderEventTable(container, events, true);
}

function refreshEventList(container, claimId) {
    if (!claimId) { showLatestEvents(container); return; }
    const events = applyDateFilter(getClaimEvents(claimId));
    renderEventTable(container, events, false);
}

/**
 * Días transcurridos desde la fecha del evento hasta hoy.
 * @returns {{naturales:number, laborables:number}|null}
 */
function diasTranscurridos(fechaStr) {
    if (!fechaStr) return null;
    const ev = new Date(fechaStr);
    if (isNaN(ev)) return null;
    ev.setHours(0, 0, 0, 0);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const naturales = Math.floor((hoy - ev) / 86400000);
    if (naturales <= 0) return { naturales: Math.max(0, naturales), laborables: 0 };
    // Contar días laborables (lunes a viernes) en el rango (evento, hoy]
    let laborables = 0;
    const d = new Date(ev);
    for (let i = 0; i < naturales; i++) {
        d.setDate(d.getDate() + 1);
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) laborables++;
    }
    return { naturales, laborables };
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

        const t = diasTranscurridos(ev.fecha);
        const transcurridoCell = t
            ? `<span title="${t.naturales} días naturales / ${t.laborables} días laborables transcurridos">${t.naturales}/${t.laborables}</span>`
            : '-';

        return `
            <tr>
                ${claimCell}
                <td>${escapeHtml(pasoLabel(ev))}</td>
                <td>${escapeHtml(fechaStr)}</td>
                <td style="white-space:nowrap;">${transcurridoCell}</td>
                <td>${escapeHtml(ev.descripcion)}</td>
                <td>${escapeHtml(ev.observacion || '')}</td>
                <td>${evidenciaBtn}</td>
                <td>${auditLinkHtml(ev)}</td>
                <td class="actions">
                    <button type="button" class="btn-icon primary edit-event-btn" data-id="${escapeHtml(ev.id)}" title="Editar">✏️</button>
                    <button type="button" class="btn-icon danger delete-event-btn" data-id="${escapeHtml(ev.id)}" title="Eliminar">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');

    listContent.innerHTML = `
        <table class="data-table">
            <thead><tr>${headerExtra}<th>Paso</th><th>Fecha y Hora</th><th title="Días naturales / días laborables transcurridos desde el evento hasta hoy">Transcurrido<br><span style="font-weight:normal;font-size:0.7rem;color:#9ca3af;">nat./lab.</span></th><th>Descripción</th><th>Observación</th><th>Evidencia</th><th>Registro</th><th>Acciones</th></tr></thead>
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

    listContent.querySelectorAll('.delete-event-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const ev = getLatestEvents(9999).find(e => e.id === id);
            const fechaTxt = ev ? new Date(ev.fecha).toLocaleDateString('es-PE') : '';
            const label = ev ? `"${ev.descripcion || 'evento'}" (${fechaTxt})` : 'este evento';
            if (!confirm(`¿Eliminar ${label}?\n\nLa eliminación quedará registrada en auditoría (quién y cuándo). Esta acción no se puede deshacer.`)) return;
            deleteClaimEvent(id);
            const mainClaimId = container.querySelector('#event-claim-id')?.value;
            if (mainClaimId) refreshEventList(container, mainClaimId);
            else showLatestEvents(container);
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
    const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
}
