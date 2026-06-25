import { getActiveClient, setActiveClient } from '../state/clientContext.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import {
    getPaymentStatusForClient, getPaymentsForClient, registerPayment, deletePayment, PERIODICIDADES,
} from '../services/paymentService.js';
import { uploadFile } from '../storage.js';
import { openFileViewer, auditLinkHtml } from '../app.js';
import { openFormModal, closeFormModal, showModalAlert } from './modalHelper.js';
import { confirmarEliminacion } from '../utils.js';

const ESTADO_CFG = {
    al_dia:   { color: '#10b981', label: '✓ Al día' },
    vencido:  { color: '#ef4444', label: '⚠️ Vencido' },
    sin_pago: { color: '#f59e0b', label: '◷ Sin pago registrado' },
};

export function renderPaymentSection(container) {
    const active = getActiveClient();
    if (!active) { renderPicker(container); return; }
    renderForClient(container, active);
}

function renderPicker(container) {
    const clients = clientRepository.getAll();
    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">💳 Pagos del Seguro</h2>
            <p style="color:#9ca3af;">Selecciona un cliente para ver y registrar los pagos de su seguro por banco.</p>
            <div class="form-group" style="max-width:420px;">
                <label for="pay-client">Cliente</label>
                <input type="text" id="pay-client" list="pay-client-list" autocomplete="off" placeholder="Escribe nombre o DNI...">
                <datalist id="pay-client-list">
                    ${clients.map(c => `<option value="${esc(c.nombreCompleto)} ${esc(c.apellidosCompletos)} — ${esc(c.dni)}" data-id="${esc(c.id)}"></option>`).join('')}
                </datalist>
            </div>
        </div>`;
    const input = container.querySelector('#pay-client');
    input.addEventListener('change', () => {
        const opt = [...container.querySelectorAll('#pay-client-list option')].find(o => o.value === input.value);
        const id = opt?.getAttribute('data-id');
        if (id) { setActiveClient(id); renderPaymentSection(container); }
    });
}

function renderForClient(container, client) {
    const status = getPaymentStatusForClient(client.id);
    const pagos = getPaymentsForClient(client.id);

    const statusHtml = status.length === 0
        ? '<div class="empty-state">Este cliente no tiene tarjetas con seguro asignado.</div>'
        : status.map(s => {
            const cfg = ESTADO_CFG[s.estado] || ESTADO_CFG.sin_pago;
            const detalle = s.estado === 'sin_pago'
                ? 'Nunca se registró un pago'
                : `Último: ${formatDate(s.ultimoPago)} (${s.periodicidad}) · Próximo: ${formatDate(s.proximoVence)}${s.estado === 'vencido' ? ` · vencido hace ${Math.abs(s.dias)} día(s)` : ` · en ${s.dias} día(s)`}`;
            return `<div style="display:flex;justify-content:space-between;align-items:center;gap:0.75rem;background:#111827;border:1px solid #1f2937;border-radius:8px;padding:0.75rem 1rem;flex-wrap:wrap;">
                <div>
                    <strong style="color:#f1f5f9;">🏦 ${esc(s.bancoNombre)}</strong>
                    <div style="font-size:0.8rem;color:#9ca3af;">${esc(detalle)}</div>
                </div>
                <div style="display:flex;align-items:center;gap:0.75rem;">
                    <span style="color:${cfg.color};font-weight:700;font-size:0.85rem;white-space:nowrap;">${cfg.label}</span>
                    <button type="button" class="btn btn-primary pay-add-btn" data-banco="${esc(s.bancoId)}" style="padding:0.3rem 0.7rem;font-size:0.8rem;">+ Registrar pago</button>
                </div>
            </div>`;
        }).join('');

    const histRows = pagos.map(p => {
        const banco = bankRepository.getById(p.bancoId)?.nombre || '—';
        const evid = p.evidencia
            ? `<button type="button" class="btn-icon pay-view-btn" data-file="${esc(p.evidencia)}" title="Ver evidencia">📎</button>`
            : '-';
        const monto = p.monto != null ? `${p.moneda || 'PEN'} ${Number(p.monto).toFixed(2)}` : '-';
        return `<tr>
            <td>${formatDate(p.fecha)}</td>
            <td>${esc(banco)}</td>
            <td>${esc(p.periodicidad)}</td>
            <td>${esc(monto)}</td>
            <td>${evid}</td>
            <td>${auditLinkHtml(p)}</td>
            <td class="actions"><button type="button" class="btn-icon danger pay-del-btn" data-id="${esc(p.id)}" title="Eliminar">🗑️</button></td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <div class="section">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                <h2 class="section-title" style="margin:0;">💳 Pagos del Seguro: ${esc(client.nombreCompleto)} ${esc(client.apellidosCompletos)}</h2>
                <button type="button" class="btn btn-secondary" id="pay-cambiar">Cambiar cliente</button>
            </div>
            <h3 style="color:#cbd5e1;font-size:0.95rem;margin:1rem 0 0.5rem;">Estado por banco</h3>
            <div style="display:flex;flex-direction:column;gap:0.5rem;">${statusHtml}</div>
            <h3 style="color:#cbd5e1;font-size:0.95rem;margin:1.25rem 0 0.5rem;">Historial de pagos</h3>
            ${pagos.length ? `<table class="data-table"><thead><tr><th>Fecha</th><th>Banco</th><th>Periodicidad</th><th>Monto</th><th>Evidencia</th><th>Registro</th><th>Acciones</th></tr></thead><tbody>${histRows}</tbody></table>` : '<div class="empty-state">Sin pagos registrados.</div>'}
        </div>`;

    container.querySelector('#pay-cambiar').addEventListener('click', () => { setActiveClient(null); renderPaymentSection(container); });
    container.querySelectorAll('.pay-add-btn').forEach(btn => {
        btn.addEventListener('click', () => openPaymentModal(container, client.id, btn.getAttribute('data-banco')));
    });
    container.querySelectorAll('.pay-view-btn').forEach(btn => {
        btn.addEventListener('click', () => { const f = btn.getAttribute('data-file'); if (f) openFileViewer(f); });
    });
    container.querySelectorAll('.pay-del-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (await confirmarEliminacion('¿Eliminar este pago?')) { deletePayment(btn.getAttribute('data-id')); renderPaymentSection(container); }
        });
    });
}

function openPaymentModal(container, clientId, bancoId) {
    const banco = bankRepository.getById(bancoId)?.nombre || '';
    const hoy = new Date().toISOString().split('T')[0];
    let evidenceUrl = null, uploading = false;

    openFormModal({
        title: `Registrar pago — ${banco}`,
        submitLabel: 'Registrar pago',
        html: `
            <div class="form-row">
                <div class="form-group" data-field="fecha">
                    <label>Fecha del pago *</label>
                    <input type="date" id="pay-fecha" value="${hoy}" required>
                    <div class="error-message" data-error="fecha"></div>
                </div>
                <div class="form-group">
                    <label>Periodicidad</label>
                    <select id="pay-periodicidad">
                        ${PERIODICIDADES.map(p => `<option value="${p.value}">${p.label}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Monto (opcional)</label>
                    <input type="number" id="pay-monto" min="0" step="0.01" placeholder="Ej: 15.00">
                </div>
                <div class="form-group">
                    <label>Moneda</label>
                    <select id="pay-moneda"><option value="PEN">PEN (S/)</option><option value="USD">USD ($)</option></select>
                </div>
            </div>
            <div class="form-group">
                <label>Evidencia del pago (imagen/PDF)</label>
                <input type="file" id="pay-evidencia" accept=".pdf,.jpg,.jpeg,.png,.webp">
                <div id="pay-evidencia-status" style="font-size:0.82rem;margin-top:4px;min-height:1.2em;color:#9ca3af;"></div>
            </div>
            <div class="form-group">
                <label>Observaciones</label>
                <textarea id="pay-obs" rows="2" placeholder="Opcional..."></textarea>
            </div>`,
        onOpen: (overlay) => {
            const input = overlay.querySelector('#pay-evidencia');
            const status = overlay.querySelector('#pay-evidencia-status');
            input.addEventListener('change', () => {
                const file = input.files[0];
                if (!file) { evidenceUrl = null; status.textContent = ''; return; }
                uploading = true; status.textContent = '⏳ Subiendo archivo...'; status.style.color = '#f59e0b';
                uploadFile(file).then(url => {
                    evidenceUrl = url; uploading = false; status.textContent = '✓ Archivo subido'; status.style.color = '#10b981';
                }).catch(() => { evidenceUrl = null; uploading = false; input.value = ''; status.textContent = 'Error al subir.'; status.style.color = '#ef4444'; });
            });
        },
        onSubmit: (form) => {
            if (uploading) { showModalAlert('Espere a que termine de subir la evidencia.', 'error'); return; }
            const result = registerPayment({
                clienteId: clientId, bancoId,
                fecha: form.querySelector('#pay-fecha').value,
                periodicidad: form.querySelector('#pay-periodicidad').value,
                monto: form.querySelector('#pay-monto').value,
                moneda: form.querySelector('#pay-moneda').value,
                evidencia: evidenceUrl,
                observaciones: form.querySelector('#pay-obs').value,
            });
            if (result.success) { closeFormModal(); renderPaymentSection(container); }
            else { showModalAlert(result.error, 'error'); }
        },
    });
}

function esc(str) { const d = document.createElement('div'); d.textContent = str ?? ''; return d.innerHTML; }
function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
}
