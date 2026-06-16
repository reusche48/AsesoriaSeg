import { getEventsWithDeadline, addClaimEvent, getClaimsWithoutActivity } from '../services/claimEventService.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { openFileViewer } from '../app.js';
import { openFormModal, closeFormModal, showModalAlert, clearModalErrors } from './modalHelper.js';

export function renderAlertsSection(container) {
    const events = getEventsWithDeadline();
    const inactive = getClaimsWithoutActivity();

    const countVenc = events.filter(e => e.estadoAlerta === 'Vencido' || e.estadoAlerta === 'Vence hoy').length;
    const countInact = inactive.filter(i => i.nivelAlerta === 'Critico' || i.nivelAlerta === 'Sin eventos').length;

    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">⚠️ Alertas</h2>
            <div class="tab-bar" style="display:flex;gap:8px;margin-bottom:1rem;border-bottom:2px solid #1f2937;padding-bottom:0;">
                <button class="tab-btn active" data-tab="vencimientos" style="padding:0.5rem 1.1rem;border:none;border-radius:6px 6px 0 0;background:#7c3aed;color:#fff;font-weight:600;font-size:0.9rem;cursor:pointer;">
                    Vencimientos de Plazos
                    ${countVenc > 0 ? `<span style="background:#ef4444;color:#fff;border-radius:10px;padding:1px 7px;font-size:0.75rem;margin-left:6px;">${countVenc}</span>` : ''}
                </button>
                <button class="tab-btn" data-tab="inactividad" style="padding:0.5rem 1.1rem;border:none;border-radius:6px 6px 0 0;background:#1f2937;color:#9ca3af;font-weight:600;font-size:0.9rem;cursor:pointer;">
                    Reclamos sin Actividad
                    ${inactive.length > 0 ? `<span style="background:${countInact > 0 ? '#ef4444' : '#f59e0b'};color:#fff;border-radius:10px;padding:1px 7px;font-size:0.75rem;margin-left:6px;">${inactive.length}</span>` : ''}
                </button>
            </div>
            <div id="tab-content-vencimientos"></div>
            <div id="tab-content-inactividad" style="display:none;"></div>
        </div>
    `;

    renderVencimientos(container, events);
    renderInactividad(container, inactive);

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

        const followupBtn = !ev.respondido
            ? `<button type="button" class="btn-icon primary followup-btn" data-id="${esc(ev.id)}" data-reclamo="${esc(ev.reclamoId)}" title="Registrar seguimiento">➕</button>`
            : `<span style="color:#10b981;" title="Ya tiene respuesta">✅</span>`;

        return `<tr>
            <td>${esc(clientLabel)}</td>
            <td>${esc(bankLabel)}</td>
            <td>${esc(ev.descripcion)}</td>
            <td>${formatDate(ev.fecha)}</td>
            <td>${ev.diasEspera} ${tipoLabel}</td>
            <td>${formatDate(ev.fechaVencimiento)}</td>
            <td style="${diasStyle}">${diasLabel}</td>
            <td style="${estadoStyle}">${esc(ev.estadoAlerta)}</td>
            <td>${followupBtn}</td>
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
            openFollowupModal(container, btn.getAttribute('data-id'), btn.getAttribute('data-reclamo'));
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
                <button type="button" class="btn btn-primary registrar-evento-btn"
                    style="padding:0.3rem 0.7rem;font-size:0.8rem;white-space:nowrap;"
                    data-claim="${esc(item.id)}"
                    title="Registrar nuevo evento para este reclamo">
                    + Evento
                </button>
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

    content.querySelectorAll('.registrar-evento-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            openNuevoEventoModal(container, btn.getAttribute('data-claim'));
        });
    });
}

// ──────────────────────────────────────────────
// Modales
// ──────────────────────────────────────────────
function openFollowupModal(container, eventoOrigenId, reclamoId) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const defaultDateTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

    openFormModal({
        title: 'Registrar Seguimiento',
        html: `
            <div class="form-row">
                <div class="form-group" data-field="fecha">
                    <label>Fecha y hora *</label>
                    <input type="datetime-local" id="modal-followup-fecha" value="${defaultDateTime}" required>
                    <div class="error-message" data-error="fecha"></div>
                </div>
                <div class="form-group" data-field="descripcion">
                    <label>Descripción *</label>
                    <select id="modal-followup-descripcion" required>
                        <option value="Avance del reclamo" selected>Avance del reclamo</option>
                        <option value="Documentación enviada">Documentación enviada</option>
                        <option value="Reclamo observado">Reclamo observado</option>
                        <option value="Reclamo indemnizado">Reclamo indemnizado</option>
                        <option value="Reclamo rechazado">Reclamo rechazado</option>
                    </select>
                    <div class="error-message" data-error="descripcion"></div>
                </div>
            </div>
            <div class="form-group" data-field="observacion">
                <label>Observación *</label>
                <textarea id="modal-followup-observacion" rows="3" required placeholder="Describa la respuesta o avance..."></textarea>
                <div class="error-message" data-error="observacion"></div>
            </div>`,
        submitLabel: 'Registrar',
        onSubmit: (form) => {
            clearModalErrors();
            const result = addClaimEvent(
                reclamoId,
                form.querySelector('#modal-followup-fecha').value,
                form.querySelector('#modal-followup-descripcion').value,
                form.querySelector('#modal-followup-observacion').value,
                null, null, null, eventoOrigenId
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

function openNuevoEventoModal(container, reclamoId) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const defaultDateTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

    openFormModal({
        title: 'Registrar Nuevo Evento',
        html: `
            <div class="form-row">
                <div class="form-group" data-field="fecha">
                    <label>Fecha y hora *</label>
                    <input type="datetime-local" id="modal-evento-fecha" value="${defaultDateTime}" required>
                    <div class="error-message" data-error="fecha"></div>
                </div>
                <div class="form-group" data-field="descripcion">
                    <label>Descripción *</label>
                    <select id="modal-evento-descripcion" required>
                        <option value="Reclamo presentado">Reclamo presentado</option>
                        <option value="Avance del reclamo" selected>Avance del reclamo</option>
                        <option value="Documentación enviada">Documentación enviada</option>
                        <option value="Reclamo observado">Reclamo observado</option>
                        <option value="Reclamo indemnizado">Reclamo indemnizado</option>
                        <option value="Reclamo rechazado">Reclamo rechazado</option>
                    </select>
                    <div class="error-message" data-error="descripcion"></div>
                </div>
            </div>
            <div class="form-group" data-field="observacion">
                <label>Observación *</label>
                <textarea id="modal-evento-observacion" rows="3" required placeholder="Detalle el estado actual del reclamo..."></textarea>
                <div class="error-message" data-error="observacion"></div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Días de espera (opcional)</label>
                    <input type="number" id="modal-evento-dias" min="1" max="365" placeholder="Ej: 15">
                </div>
                <div class="form-group">
                    <label>Tipo días</label>
                    <select id="modal-evento-tipodias">
                        <option value="naturales">Naturales</option>
                        <option value="laborables">Laborables</option>
                    </select>
                </div>
            </div>`,
        submitLabel: 'Registrar Evento',
        onSubmit: (form) => {
            clearModalErrors();
            const dias = parseInt(form.querySelector('#modal-evento-dias').value) || null;
            const result = addClaimEvent(
                reclamoId,
                form.querySelector('#modal-evento-fecha').value,
                form.querySelector('#modal-evento-descripcion').value,
                form.querySelector('#modal-evento-observacion').value,
                null,
                dias,
                dias ? form.querySelector('#modal-evento-tipodias').value : null,
                null
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
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
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
