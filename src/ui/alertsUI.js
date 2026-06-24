import { getEventsWithDeadline, addClaimEvent, getClaimsWithoutActivity } from '../services/claimEventService.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { openFormModal, closeFormModal, clearModalErrors } from './modalHelper.js';
import { uploadFile } from '../storage.js';
import { setEventPreselectClaim } from './claimEventUI.js';

/** Navega a la sección Eventos mostrando todos los eventos del reclamo. */
function verHistorialEnEventos(claimId) {
    setEventPreselectClaim(claimId);
    window.location.hash = '#eventos';
}

// Holds evidence URL between file upload and form submit
let _alertEvidenceUrl = null;
// Filtro de cliente activo en la sección Alertas (se conserva entre re-renders)
let alertClientFilter = '';

/** Nombre completo del cliente de un reclamo (objeto claim). */
function clientNameForClaim(claim) {
    if (!claim) return '';
    const incident = incidentRepository.getById(claim.siniestroId);
    const client = incident ? clientRepository.getById(incident.clienteId) : null;
    return client ? `${client.nombreCompleto} ${client.apellidosCompletos}` : '';
}

/** Nombre del cliente a partir del id de reclamo. */
function clientNameForClaimId(claimId) {
    return clientNameForClaim(claimRepository.getById(claimId));
}

/** ¿El nombre coincide con el filtro de cliente actual? (vacío = todos) */
function matchesClientFilter(name) {
    const f = alertClientFilter.trim().toLowerCase();
    if (!f) return true;
    return (name || '').toLowerCase().includes(f);
}

export function renderAlertsSection(container) {
    const allEvents = getEventsWithDeadline();
    const allInactive = getClaimsWithoutActivity();

    // Lista de clientes con alertas, para sugerencias del buscador
    const nombresSet = new Set();
    allEvents.forEach(e => { const n = clientNameForClaimId(e.reclamoId); if (n) nombresSet.add(n); });
    allInactive.forEach(i => { const n = clientNameForClaim(i); if (n) nombresSet.add(n); });
    const sugerencias = [...nombresSet].sort();

    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">⚠️ Alertas</h2>
            <div style="display:flex;gap:0.5rem;align-items:flex-end;flex-wrap:wrap;margin-bottom:1rem;">
                <div class="form-group" style="flex:1;min-width:240px;margin:0;">
                    <label for="alert-client-search">Buscar por cliente</label>
                    <input type="text" id="alert-client-search" list="alert-client-list" autocomplete="off"
                        placeholder="Escriba un cliente para filtrar (vacío = todos)" value="${esc(alertClientFilter)}">
                    <datalist id="alert-client-list">
                        ${sugerencias.map(n => `<option value="${esc(n)}"></option>`).join('')}
                    </datalist>
                </div>
                <button type="button" class="btn btn-secondary" id="alert-clear-filter" title="Limpiar filtro">✖ Limpiar</button>
            </div>
            <div id="alert-filter-hint" style="font-size:0.82rem;color:#9ca3af;margin-bottom:0.75rem;"></div>
            <div class="tab-bar" style="display:flex;gap:8px;margin-bottom:1rem;border-bottom:2px solid #1f2937;padding-bottom:0;">
                <button class="tab-btn active" data-tab="vencimientos" style="padding:0.5rem 1.1rem;border:none;border-radius:6px 6px 0 0;background:#7c3aed;color:#fff;font-weight:600;font-size:0.9rem;cursor:pointer;">
                    Vencimientos de Plazos <span id="tab-badge-venc"></span>
                </button>
                <button class="tab-btn" data-tab="inactividad" style="padding:0.5rem 1.1rem;border:none;border-radius:6px 6px 0 0;background:#1f2937;color:#9ca3af;font-weight:600;font-size:0.9rem;cursor:pointer;">
                    Reclamos sin Actividad <span id="tab-badge-inact"></span>
                </button>
            </div>
            <div id="tab-content-vencimientos"></div>
            <div id="tab-content-inactividad" style="display:none;"></div>
        </div>
    `;

    function applyFilterAndRender() {
        const events = allEvents.filter(e => matchesClientFilter(clientNameForClaimId(e.reclamoId)));
        const inactive = allInactive.filter(i => matchesClientFilter(clientNameForClaim(i)));

        renderVencimientos(container, events);
        renderInactividad(container, inactive);

        // Badges de las pestañas
        const countVenc = events.filter(e => e.estadoAlerta === 'Vencido' || e.estadoAlerta === 'Vence hoy').length;
        const countInact = inactive.filter(i => i.nivelAlerta === 'Critico' || i.nivelAlerta === 'Sin eventos').length;
        const badgeVenc = container.querySelector('#tab-badge-venc');
        const badgeInact = container.querySelector('#tab-badge-inact');
        badgeVenc.innerHTML = countVenc > 0
            ? `<span style="background:#ef4444;color:#fff;border-radius:10px;padding:1px 7px;font-size:0.75rem;margin-left:6px;">${countVenc}</span>` : '';
        badgeInact.innerHTML = inactive.length > 0
            ? `<span style="background:${countInact > 0 ? '#ef4444' : '#f59e0b'};color:#fff;border-radius:10px;padding:1px 7px;font-size:0.75rem;margin-left:6px;">${inactive.length}</span>` : '';

        // Hint del filtro
        const hint = container.querySelector('#alert-filter-hint');
        hint.innerHTML = alertClientFilter.trim()
            ? `Filtrando por <strong style="color:#f1f5f9;">"${esc(alertClientFilter.trim())}"</strong> — ${events.length} vencimiento(s) y ${inactive.length} reclamo(s) sin actividad.`
            : '';
    }

    // Buscador de cliente
    const searchInput = container.querySelector('#alert-client-search');
    searchInput.addEventListener('input', () => {
        alertClientFilter = searchInput.value;
        applyFilterAndRender();
    });
    container.querySelector('#alert-clear-filter').addEventListener('click', () => {
        alertClientFilter = '';
        searchInput.value = '';
        applyFilterAndRender();
        searchInput.focus();
    });

    // Pestañas
    container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');
            container.querySelectorAll('.tab-btn').forEach(b => {
                const isActive = b === btn;
                b.style.background = isActive ? '#7c3aed' : '#1f2937';
                b.style.color = isActive ? '#fff' : '#9ca3af';
                b.classList.toggle('active', isActive);
            });
            container.querySelectorAll('[id^="tab-content-"]').forEach(el => {
                el.style.display = el.id === `tab-content-${tab}` ? '' : 'none';
            });
        });
    });

    applyFilterAndRender();
}

// ──────────────────────────────────────────────
// Tab 1: Vencimientos de plazos
// ──────────────────────────────────────────────
function renderVencimientos(container, events) {
    const content = container.querySelector('#tab-content-vencimientos');

    if (events.length === 0) {
        content.innerHTML = '<div class="empty-state">No hay eventos con plazo de vencimiento registrados.</div>';
        return;
    }

    const rows = events.map(ev => {
        const claim = claimRepository.getById(ev.reclamoId);
        let clientLabel = '-', bankLabel = '-';
        if (claim) {
            const incident = incidentRepository.getById(claim.siniestroId);
            const client = incident ? clientRepository.getById(incident.clienteId) : null;
            const bank = bankRepository.getById(claim.bancoId);
            clientLabel = client ? `${client.nombreCompleto} ${client.apellidosCompletos}` : '-';
            bankLabel = bank ? bank.nombre : '-';
        }

        const estadoStyle = ev.estadoAlerta === 'Vencido'     ? 'color:#ef4444;font-weight:700;' :
                            ev.estadoAlerta === 'Vence hoy'   ? 'color:#f59e0b;font-weight:700;' :
                            ev.estadoAlerta === 'Respondido'  ? 'color:#10b981;font-weight:700;' :
                                                                'color:#3b82f6;font-weight:700;';

        const diasLabel = ev.diasRestantes < 0
            ? `${Math.abs(ev.diasRestantes)} días vencido`
            : ev.diasRestantes === 0 ? 'Hoy' : `${ev.diasRestantes} días`;

        const diasStyle = ev.diasRestantes < 0 ? 'color:#ef4444;font-weight:700;' :
                          ev.diasRestantes <= 3 ? 'color:#f59e0b;font-weight:700;' : '';

        const tipoLabel = ev.tipoDias === 'laborables' ? 'Lab.' : 'Nat.';

        const accionCell = !ev.respondido
            ? `<div style="display:flex;gap:4px;align-items:center;">
                   <button type="button" class="btn btn-secondary ver-historial-venc-btn"
                       style="padding:0.25rem 0.6rem;font-size:0.78rem;white-space:nowrap;"
                       data-claim="${esc(ev.reclamoId)}"
                       data-client="${esc(clientLabel)}"
                       data-bank="${esc(bankLabel)}"
                       title="Ver todos los eventos de este reclamo">Ver Historial</button>
                   <button type="button" class="btn btn-primary followup-btn"
                       style="padding:0.25rem 0.6rem;font-size:0.78rem;white-space:nowrap;"
                       data-id="${esc(ev.id)}"
                       data-reclamo="${esc(ev.reclamoId)}"
                       title="Registrar seguimiento de este evento">+ Seguimiento</button>
               </div>`
            : `<span style="color:#10b981;" title="Ya tiene respuesta">✅ Respondido</span>`;

        return `<tr>
            <td>${esc(clientLabel)}</td>
            <td>${esc(bankLabel)}</td>
            <td>${esc(ev.descripcion)}</td>
            <td>${formatDate(ev.fecha)}</td>
            <td>${ev.diasEspera} ${tipoLabel}</td>
            <td>${formatDate(ev.fechaVencimiento)}</td>
            <td style="${diasStyle}">${diasLabel}</td>
            <td style="${estadoStyle}">${esc(ev.estadoAlerta)}</td>
            <td>${accionCell}</td>
        </tr>`;
    }).join('');

    content.innerHTML = `
        <table class="data-table">
            <thead><tr>
                <th>Cliente</th><th>Banco</th><th>Evento</th><th>Fecha Evento</th>
                <th>Plazo</th><th>Vencimiento</th><th>Días Rest.</th><th>Estado</th><th>Acción</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>`;

    content.querySelectorAll('.followup-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            openClaimEventFormModal(container, btn.getAttribute('data-reclamo'), btn.getAttribute('data-id'));
        });
    });

    content.querySelectorAll('.ver-historial-venc-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            verHistorialEnEventos(btn.getAttribute('data-claim'));
        });
    });
}

// ──────────────────────────────────────────────
// Tab 2: Reclamos sin actividad reciente
// ──────────────────────────────────────────────
function renderInactividad(container, items) {
    const content = container.querySelector('#tab-content-inactividad');

    if (items.length === 0) {
        content.innerHTML = '<div class="empty-state" style="padding:2rem;">✅ Todos los reclamos tienen actividad reciente. ¡Buen trabajo!</div>';
        return;
    }

    const nivelCfg = {
        'Sin eventos': { color: '#ef4444', bg: '#fee2e2', label: 'Sin eventos' },
        'Critico':     { color: '#dc2626', bg: '#fee2e2', label: '🔴 Crítico'  },
        'Urgente':     { color: '#d97706', bg: '#fef3c7', label: '🟠 Urgente'  },
        'Atencion':    { color: '#ca8a04', bg: '#fefce8', label: '🟡 Atención' },
    };

    const rows = items.map(item => {
        const incident = incidentRepository.getById(item.siniestroId);
        const client = incident ? clientRepository.getById(incident.clienteId) : null;
        const bank = bankRepository.getById(item.bancoId);
        const clientLabel = client ? `${client.nombreCompleto} ${client.apellidosCompletos}` : '-';
        const bankLabel = bank ? bank.nombre : '-';

        const cfg = nivelCfg[item.nivelAlerta] || nivelCfg['Atencion'];
        const badge = `<span style="background:${cfg.bg};color:${cfg.color};border-radius:99px;padding:2px 10px;font-size:0.78rem;font-weight:700;white-space:nowrap;">${cfg.label}</span>`;

        const diasText = item.nivelAlerta === 'Sin eventos'
            ? `${item.diasSinActividad}d desde reclamo`
            : `${item.diasSinActividad} días`;
        const diasStyle = item.diasSinActividad >= 30 ? 'color:#ef4444;font-weight:700;' :
                          item.diasSinActividad >= 15 ? 'color:#f59e0b;font-weight:700;' : '';

        const ultimaAct = item.ultimaActividad ? formatDateTime(item.ultimaActividad) : '—';
        const estadoStyle = item.estado === 'Pendiente' ? 'color:#f59e0b;' : 'color:#3b82f6;';

        return `<tr>
            <td>${esc(clientLabel)}</td>
            <td>${esc(bankLabel)}</td>
            <td style="${estadoStyle}">${esc(item.estado || 'Pendiente')}</td>
            <td>${formatDate(item.fecha)}</td>
            <td style="${diasStyle}">${diasText}</td>
            <td>${ultimaAct}</td>
            <td>${item.totalEventos}</td>
            <td>${badge}</td>
            <td>
                <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
                    <button type="button" class="btn btn-secondary ver-historial-btn"
                        style="padding:0.3rem 0.65rem;font-size:0.78rem;white-space:nowrap;"
                        data-claim="${esc(item.id)}"
                        data-client="${esc(clientLabel)}"
                        data-bank="${esc(bankLabel)}"
                        title="Ver todos los eventos de este reclamo">
                        Ver Historial
                    </button>
                    <button type="button" class="btn btn-primary registrar-evento-btn"
                        style="padding:0.3rem 0.65rem;font-size:0.78rem;white-space:nowrap;"
                        data-claim="${esc(item.id)}"
                        title="Registrar nuevo evento para este reclamo">
                        + Evento
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    content.innerHTML = `
        <div style="margin-bottom:0.75rem;font-size:0.85rem;color:#9ca3af;">
            Reclamos activos sin actividad: <strong style="color:#f1f5f9;">${items.length}</strong> —
            Críticos: <strong style="color:#ef4444;">${items.filter(i => i.nivelAlerta === 'Critico' || i.nivelAlerta === 'Sin eventos').length}</strong> |
            Urgentes: <strong style="color:#f59e0b;">${items.filter(i => i.nivelAlerta === 'Urgente').length}</strong> |
            En atención: <strong style="color:#ca8a04;">${items.filter(i => i.nivelAlerta === 'Atencion').length}</strong>
        </div>
        <table class="data-table">
            <thead><tr>
                <th>Cliente</th><th>Banco</th><th>Estado</th><th>Fecha Reclamo</th>
                <th>Sin actividad</th><th>Última actividad</th><th>Eventos</th><th>Nivel</th><th>Acción</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>`;

    content.querySelectorAll('.ver-historial-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            verHistorialEnEventos(btn.getAttribute('data-claim'));
        });
    });

    content.querySelectorAll('.registrar-evento-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            openClaimEventFormModal(container, btn.getAttribute('data-claim'), null);
        });
    });
}

// ──────────────────────────────────────────────
// Modal de evento completo (Seguimiento y Nuevo Evento)
// eventoOrigenId != null → es un seguimiento de un vencimiento
// eventoOrigenId == null → es un evento nuevo
// ──────────────────────────────────────────────
function openClaimEventFormModal(container, reclamoId, eventoOrigenId) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const defaultDateTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    _alertEvidenceUrl = null;

    const isFollowup = !!eventoOrigenId;
    const title = isFollowup ? 'Registrar Seguimiento' : 'Registrar Evento';
    const descOptions = ['Reclamo presentado','Documentación enviada','En revisión','Reclamo observado','Avance del reclamo','Reclamo indemnizado','Reclamo rechazado'];
    const defaultDesc = isFollowup ? 'Avance del reclamo' : 'Reclamo presentado';

    const html = `
        <div class="form-row">
            <div class="form-group" data-field="fecha">
                <label>Fecha y hora *</label>
                <input type="datetime-local" id="modal-alerta-fecha" value="${defaultDateTime}" required>
                <div class="error-message" data-error="fecha"></div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group" data-field="descripcion">
                <label>Descripción *</label>
                <select id="modal-alerta-descripcion" required>
                    <option value="">-- Seleccione --</option>
                    ${descOptions.map(d => `<option value="${d}"${d === defaultDesc ? ' selected' : ''}>${d}</option>`).join('')}
                </select>
                <div class="error-message" data-error="descripcion"></div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group" data-field="observacion">
                <label>Observación *</label>
                <textarea id="modal-alerta-observacion" rows="3" required placeholder="Describa en detalle el estado o avance del reclamo..."></textarea>
                <div class="error-message" data-error="observacion"></div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Evidencia (archivo opcional)</label>
                <input type="file" id="modal-alerta-evidencia">
                <div id="modal-alerta-evidencia-status" style="font-size:0.8rem;color:#9ca3af;margin-top:4px;min-height:1.2em;"></div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Días de espera para respuesta</label>
                <input type="number" id="modal-alerta-dias" min="1" step="1" placeholder="Ej: 30 (opcional)">
            </div>
            <div class="form-group">
                <label>Tipo de días</label>
                <select id="modal-alerta-tipodias">
                    <option value="naturales">Días naturales</option>
                    <option value="laborables">Días laborables (L-V)</option>
                </select>
            </div>
        </div>`;

    openFormModal({
        title,
        html,
        submitLabel: 'Registrar',
        onOpen: (overlay) => {
            const evidenciaInput = overlay.querySelector('#modal-alerta-evidencia');
            const statusDiv = overlay.querySelector('#modal-alerta-evidencia-status');
            evidenciaInput.addEventListener('change', () => {
                const file = evidenciaInput.files[0];
                if (!file) { _alertEvidenceUrl = null; statusDiv.textContent = ''; return; }
                statusDiv.textContent = 'Subiendo archivo...';
                statusDiv.style.color = '#9ca3af';
                uploadFile(file)
                    .then(url => {
                        _alertEvidenceUrl = url;
                        statusDiv.textContent = '✓ Archivo subido correctamente';
                        statusDiv.style.color = '#10b981';
                    })
                    .catch(() => {
                        statusDiv.textContent = 'Error al subir el archivo.';
                        statusDiv.style.color = '#ef4444';
                        _alertEvidenceUrl = null;
                    });
            });
        },
        onSubmit: (form) => {
            clearModalErrors();
            const diasStr = form.querySelector('#modal-alerta-dias').value;
            const dias = diasStr ? parseInt(diasStr) : null;
            const result = addClaimEvent(
                reclamoId,
                form.querySelector('#modal-alerta-fecha').value,
                form.querySelector('#modal-alerta-descripcion').value,
                form.querySelector('#modal-alerta-observacion').value,
                _alertEvidenceUrl,
                dias,
                dias ? form.querySelector('#modal-alerta-tipodias').value : null,
                eventoOrigenId
            );
            if (result.success) {
                closeFormModal();
                renderAlertsSection(container);
            } else {
                const overlay = document.querySelector('.form-modal-overlay');
                if (overlay) result.errors.forEach(err => {
                    const el = overlay.querySelector(`[data-error="${err.field}"]`);
                    if (el) el.textContent = err.message;
                });
            }
        }
    });
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function esc(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}
