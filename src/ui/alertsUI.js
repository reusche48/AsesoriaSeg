import { getEventsWithDeadline, addClaimEvent } from '../services/claimEventService.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { openFileViewer } from '../app.js';
import { openFormModal, closeFormModal, showModalAlert, clearModalErrors } from './modalHelper.js';

/**
 * Módulo UI para alertas de vencimiento de eventos con plazo.
 */

export function renderAlertsSection(container) {
    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">Alertas de Vencimiento</h2>
            <div id="alerts-list-content"></div>
        </div>
    `;

    refreshAlertsList(container);
}

function refreshAlertsList(container) {
    const content = container.querySelector('#alerts-list-content');
    const events = getEventsWithDeadline();

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

        const estadoStyle = ev.estadoAlerta === 'Vencido' ? 'color:red;font-weight:bold;' :
                            ev.estadoAlerta === 'Vence hoy' ? 'color:#e65100;font-weight:bold;' :
                            ev.estadoAlerta === 'Respondido' ? 'color:#2e7d32;font-weight:bold;' :
                            'color:#1565c0;font-weight:bold;';

        const diasLabel = ev.diasRestantes < 0
            ? `${Math.abs(ev.diasRestantes)} días vencido`
            : ev.diasRestantes === 0 ? 'Hoy' : `${ev.diasRestantes} días`;

        const diasStyle = ev.diasRestantes < 0 ? 'color:red;font-weight:bold;' :
                          ev.diasRestantes <= 3 ? 'color:orange;font-weight:bold;' : '';

        const tipoLabel = ev.tipoDias === 'laborables' ? 'Lab.' : 'Nat.';

        const followupBtn = !ev.respondido
            ? `<button type="button" class="btn-icon primary followup-btn" data-id="${esc(ev.id)}" data-reclamo="${esc(ev.reclamoId)}" title="Registrar seguimiento">➕</button>`
            : `<span style="color:green;" title="Ya tiene respuesta">✅</span>`;

        return `
            <tr>
                <td>${esc(clientLabel)}</td>
                <td>${esc(bankLabel)}</td>
                <td>${esc(ev.descripcion)}</td>
                <td>${formatDate(ev.fecha)}</td>
                <td>${ev.diasEspera} ${tipoLabel}</td>
                <td>${formatDate(ev.fechaVencimiento)}</td>
                <td style="${diasStyle}">${diasLabel}</td>
                <td style="${estadoStyle}">${esc(ev.estadoAlerta)}</td>
                <td>${followupBtn}</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Cliente</th>
                    <th>Banco</th>
                    <th>Evento</th>
                    <th>Fecha Evento</th>
                    <th>Plazo</th>
                    <th>Vencimiento</th>
                    <th>Días Rest.</th>
                    <th>Estado</th>
                    <th>Acción</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    content.querySelectorAll('.followup-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            openFollowupModal(container, btn.getAttribute('data-id'), btn.getAttribute('data-reclamo'));
        });
    });
}

function openFollowupModal(container, eventoOrigenId, reclamoId) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const defaultDateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const html = `
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
        <div class="form-row">
            <div class="form-group" data-field="observacion">
                <label>Observación *</label>
                <textarea id="modal-followup-observacion" rows="3" required placeholder="Describa la respuesta o avance..."></textarea>
                <div class="error-message" data-error="observacion"></div>
            </div>
        </div>
    `;

    openFormModal({
        title: 'Registrar Seguimiento',
        html,
        submitLabel: 'Registrar',
        onSubmit: (form) => {
            clearModalErrors();
            const fecha = form.querySelector('#modal-followup-fecha').value;
            const descripcion = form.querySelector('#modal-followup-descripcion').value;
            const observacion = form.querySelector('#modal-followup-observacion').value;

            const result = addClaimEvent(reclamoId, fecha, descripcion, observacion, null, null, null, eventoOrigenId);

            if (result.success) {
                closeFormModal();
                refreshAlertsList(container);
            } else {
                const overlay = document.querySelector('.form-modal-overlay');
                if (overlay) {
                    for (const err of result.errors) {
                        const el = overlay.querySelector(`[data-error="${err.field}"]`);
                        if (el) el.textContent = err.message;
                    }
                }
            }
        }
    });
}

function esc(str) {
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
