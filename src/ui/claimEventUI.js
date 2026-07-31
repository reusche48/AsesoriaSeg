import { addClaimEvent, getClaimEvents, getLatestEvents, updateClaimEvent, deleteClaimEvent, parseArchivos } from '../services/claimEventService.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { claimEventRepository } from '../repositories/claimEventRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { claimStepRepository } from '../repositories/claimStepRepository.js';
import { openFileViewer, auditLinkHtml } from '../app.js';
import { openFormModal, closeFormModal, showModalAlert, clearModalErrors } from './modalHelper.js';
import { uploadFile } from '../storage.js';
import { handleFileUpload, exportToExcel, confirmarEliminacion } from '../utils.js';
import { getActiveClientId } from '../state/clientContext.js';

let selectedEventEvidenceDataUrl = null;
let selectedEventEvidenceName = null;
let eventEvidenceUploading = false;
let selectedEventArchivos = [];
let eventArchivosUploading = false;
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

const FOCUS_EVENT_KEY = 'eventos_focus_event';
/**
 * Fija un evento para que al entrar a la sección Eventos se abra directamente
 * en el modal de edición (ej: al tocar un evento desde la Guía).
 * @param {string} eventId
 */
export function setEventPreselectEvent(eventId) {
    try {
        if (eventId) sessionStorage.setItem(FOCUS_EVENT_KEY, eventId);
        else sessionStorage.removeItem(FOCUS_EVENT_KEY);
    } catch (e) { /* ignore */ }
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
            // Si además viene un evento enfocado (click desde la Guía), abrirlo en edición.
            let focusEventId = null;
            try { focusEventId = sessionStorage.getItem(FOCUS_EVENT_KEY); sessionStorage.removeItem(FOCUS_EVENT_KEY); } catch (e) { /* ignore */ }
            if (focusEventId) {
                const ev = claimEventRepository.getById(focusEventId);
                if (ev) openEventModal(container, ev);
            }
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
export function openEventModal(container, eventObj, opts = {}) {
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
                <label>Archivos adjuntos (varios — opcional)</label>
                <div id="modal-event-archivos-list" style="font-size:0.82rem;margin-bottom:4px;"></div>
                <input type="file" id="modal-event-archivos" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.zip">
                <div id="modal-event-archivos-status" style="font-size:0.82rem;margin-top:4px;min-height:1.2em;color:#9ca3af;"></div>
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
        ${editing ? `<div style="margin-top:0.6rem;border-top:1px solid #1f2937;padding-top:0.6rem;">
            <button type="button" id="modal-event-delete" style="background:#7f1d1d;color:#fff;border:none;border-radius:6px;padding:0.45rem 0.9rem;cursor:pointer;font-size:0.85rem;">🗑️ Eliminar este evento</button>
        </div>` : ''}
    `;

    selectedEventEvidenceDataUrl = editing ? (eventObj.evidencia || null) : null;
    selectedEventEvidenceName = editing ? (eventObj.evidenciaNombre || null) : null;
    selectedEventArchivos = editing ? parseArchivos(eventObj.archivos) : []; // [{u, n}]
    eventArchivosUploading = false;

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
                    const evNom = selectedEventEvidenceName || (String(selectedEventEvidenceDataUrl || '').split('?')[0].split('/').pop()) || 'Evidencia adjunta';
                    const evNomCorto = evNom.length > 40 ? evNom.slice(0, 40) + '…' : evNom;
                    evStatus.innerHTML = `<div style="display:flex;align-items:center;gap:8px;">
                        ${miniaturaEvento(selectedEventEvidenceDataUrl)}
                        <span style="color:#10b981;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(evNom)}">✓ ${escapeHtml(evNomCorto)}</span>
                        <a href="#" id="ev-ver" style="color:#7c3aed;white-space:nowrap;">Ver</a>
                        <a href="#" id="ev-quitar" style="color:#ef4444;white-space:nowrap;">Quitar</a>
                    </div>`;
                    evStatus.querySelector('#ev-ver').addEventListener('click', (e) => {
                        e.preventDefault();
                        openFileViewer(selectedEventEvidenceDataUrl);
                    });
                    evStatus.querySelector('#ev-quitar').addEventListener('click', async (e) => {
                        e.preventDefault();
                        if (!await confirmarEliminacion('¿Quitar esta evidencia del evento? Se aplicará al Guardar Cambios.', { titulo: '🗑️ Quitar evidencia', confirmLabel: 'Quitar' })) return;
                        selectedEventEvidenceDataUrl = null;
                        selectedEventEvidenceName = null;
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
                    selectedEventEvidenceName = file.name;
                } catch (err) {
                    selectedEventEvidenceDataUrl = null;
                    selectedEventEvidenceName = null;
                    evidenceInput.value = '';
                    eventEvidenceUploading = false;
                    evStatus.innerHTML = `<span style="color:#ef4444;">Error al subir: ${escapeHtml(err.message || 'inténtelo de nuevo')}</span>`;
                    return;
                }
                eventEvidenceUploading = false;
                renderEvStatus();
            });

            // Archivos adjuntos (varios): muestra los actuales (ver/quitar) y permite agregar más.
            const archInput = overlay.querySelector('#modal-event-archivos');
            const archList = overlay.querySelector('#modal-event-archivos-list');
            const archStatus = overlay.querySelector('#modal-event-archivos-status');
            function renderArchivos() {
                if (!selectedEventArchivos.length) {
                    archList.innerHTML = '<span style="color:#9ca3af;">Sin archivos adjuntos.</span>';
                    return;
                }
                archList.innerHTML = selectedEventArchivos.map((a, i) => {
                    const nombre = a.n || 'archivo';
                    const nombreCorto = nombre.length > 42 ? nombre.slice(0, 42) + '…' : nombre;
                    return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;">
                    <span class="arch-ver" data-idx="${i}" title="Ver archivo" style="cursor:pointer;flex:0 0 auto;line-height:0;">${miniaturaEvento(a.u)}</span>
                    <span class="arch-ver" data-idx="${i}" title="${escapeHtml(nombre)}" style="color:#10b981;flex:1;min-width:0;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📎 ${escapeHtml(nombreCorto)}</span>
                    <a href="#" class="arch-ver" data-idx="${i}" style="color:#7c3aed;">Ver</a>
                    <a href="#" class="arch-quitar" data-idx="${i}" style="color:#ef4444;">Quitar</a>
                </div>`;
                }).join('');
                archList.querySelectorAll('.arch-ver').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); openFileViewer(selectedEventArchivos[Number(a.getAttribute('data-idx'))].u); }));
                archList.querySelectorAll('.arch-quitar').forEach(a => a.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const idx = Number(a.getAttribute('data-idx'));
                    const nom = selectedEventArchivos[idx]?.n || 'este archivo';
                    if (!await confirmarEliminacion(`¿Quitar "${nom}"? Se aplicará al Guardar Cambios.`, { titulo: '🗑️ Quitar archivo', confirmLabel: 'Quitar' })) return;
                    selectedEventArchivos.splice(idx, 1);
                    renderArchivos();
                }));
            }
            renderArchivos();
            archInput.addEventListener('change', () => {
                const files = Array.from(archInput.files || []);
                if (!files.length) return;
                eventArchivosUploading = true;
                archStatus.style.color = '#f59e0b';
                archStatus.textContent = `⏳ Subiendo ${files.length} archivo(s)...`;
                Promise.all(files.map(f => uploadFile(f).then(url => url ? { u: url, n: f.name } : null))).then(subidos => {
                    const ok = subidos.filter(Boolean);
                    selectedEventArchivos.push(...ok);
                    eventArchivosUploading = false;
                    archInput.value = '';
                    archStatus.style.color = '#10b981';
                    archStatus.textContent = `✓ ${ok.length} archivo(s) agregado(s)`;
                    renderArchivos();
                }).catch(() => {
                    eventArchivosUploading = false; archInput.value = '';
                    archStatus.style.color = '#ef4444';
                    archStatus.textContent = 'Error al subir uno de los archivos. Inténtalo de nuevo.';
                });
            });

            // Eliminar evento (solo al editar)
            const delBtn = overlay.querySelector('#modal-event-delete');
            if (delBtn) delBtn.addEventListener('click', async () => {
                if (!await confirmarEliminacion('¿Eliminar este evento? Esta acción no se puede deshacer.', { titulo: '🗑️ Eliminar evento' })) return;
                deleteClaimEvent(eventObj.id);
                closeFormModal();
                if (opts.onDone) { opts.onDone(); return; }
                const mc = container.querySelector('#event-claim-id')?.value;
                if (mc) refreshEventList(container, mc); else showLatestEvents(container);
            });
        },
        onSubmit: (form) => {
            clearModalErrors();
            if (eventEvidenceUploading || eventArchivosUploading) {
                showModalAlert('Espere a que terminen de subir los archivos antes de guardar.', 'error');
                return;
            }
            const claimId = form.querySelector('#modal-event-claim-id').value;
            const fecha = form.querySelector('#modal-event-fecha').value;
            const descripcion = form.querySelector('#modal-event-descripcion').value;
            const observacion = form.querySelector('#modal-event-observacion').value;
            const diasEsperaStr = form.querySelector('#modal-event-dias-espera').value;
            const diasEspera = diasEsperaStr ? parseInt(diasEsperaStr) : null;
            const tipoDias = form.querySelector('#modal-event-tipo-dias').value;

            const evidenciaPayload = selectedEventEvidenceDataUrl ? { u: selectedEventEvidenceDataUrl, n: selectedEventEvidenceName } : null;
            let result;
            if (editing) {
                result = updateClaimEvent(eventObj.id, { reclamoId: claimId, fecha, descripcion, observacion, evidencia: evidenciaPayload, archivos: selectedEventArchivos, diasEspera, tipoDias });
            } else {
                result = addClaimEvent(claimId, fecha, descripcion, observacion, evidenciaPayload, diasEspera, tipoDias, null, null, selectedEventArchivos);
            }

            if (result.success) {
                closeFormModal();
                if (opts.onDone) { opts.onDone(); return; }
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
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const ev = getLatestEvents(9999).find(e => e.id === id);
            const fechaTxt = ev ? new Date(ev.fecha).toLocaleDateString('es-PE') : '';
            const label = ev ? `"${ev.descripcion || 'evento'}" (${fechaTxt})` : 'este evento';
            if (!await confirmarEliminacion(`¿Eliminar ${label}? La eliminación quedará registrada en auditoría (quién y cuándo). Esta acción no se puede deshacer.`, { titulo: '🗑️ Eliminar evento' })) return;
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

/** Miniatura de un archivo: imagen real si es foto, ícono 📄 si es PDF/otro. */
function miniaturaEvento(url) {
    if (!url) return '';
    const clean = String(url).split('?')[0].split('#')[0].toLowerCase();
    const esImg = /\.(jpg|jpeg|png|webp|gif)$/.test(clean);
    const base = 'width:44px;height:44px;border-radius:6px;border:1px solid #334155;flex:0 0 auto;';
    return esImg
        ? `<img src="${escapeHtml(url)}" alt="archivo" style="${base}object-fit:cover;background:#fff;">`
        : `<span style="${base}display:inline-flex;align-items:center;justify-content:center;font-size:1.2rem;background:#111827;">📄</span>`;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
}
