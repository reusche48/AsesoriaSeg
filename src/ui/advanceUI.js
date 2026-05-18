import { clientRepository } from '../repositories/clientRepository.js';
import { advanceRepository } from '../repositories/advanceRepository.js';
import { createAdvance, updateAdvance, deleteAdvance } from '../services/advanceService.js';
import { openFileViewer, auditLinkHtml } from '../app.js';
import { isAdmin } from '../auth.js';
import { openFormModal, closeFormModal, showModalFieldErrors, clearModalErrors } from './modalHelper.js';

let selectedClientId = null;
let evidenciaDataUrl = null;

export function renderAdvanceSection(container) {
    selectedClientId = null;
    const clients = clientRepository.getAll();
    const clientOpts = clients.map(c => `<option value="${esc(c.id)}">${esc(c.nombreCompleto)} ${esc(c.apellidosCompletos)} - ${esc(c.dni)}</option>`).join('');

    container.innerHTML = `
        <div class="section">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                <h2 class="section-title" style="margin:0;">Adelantos</h2>
                <button type="button" class="btn btn-primary" id="btn-add-adv">➕ Registrar Adelanto</button>
            </div>
            <div class="form-group" style="margin-top:0.75rem;">
                <select id="adv-filter-cliente" style="width:100%;padding:0.5rem;border:1px solid #ccc;border-radius:4px;">
                    <option value="">-- Todos los clientes --</option>
                    ${clientOpts}
                </select>
            </div>
            <div id="advance-total" style="font-weight:700;margin:0.5rem 0;"></div>
            <div id="advance-list" class="mt-1"></div>
        </div>
    `;

    container.querySelector('#btn-add-adv').addEventListener('click', () => openAdvForm(container, null));
    container.querySelector('#adv-filter-cliente').addEventListener('change', (e) => { selectedClientId = e.target.value || null; refreshList(container); });
    refreshList(container);
}

function openAdvForm(container, adv) {
    evidenciaDataUrl = adv?.evidencia || null;
    const clients = clientRepository.getAll();
    const clientOpts = `<option value="">-- Seleccione --</option>` + clients.map(c =>
        `<option value="${esc(c.id)}" ${(adv?.clienteId || selectedClientId) === c.id ? 'selected' : ''}>${esc(c.nombreCompleto)} ${esc(c.apellidosCompletos)}</option>`).join('');
    const today = new Date().toISOString().split('T')[0];

    openFormModal({
        title: adv ? 'Editar Adelanto' : 'Registrar Adelanto',
        html: `
            <div class="form-row">
                <div class="form-group" data-field="clienteId"><label>Cliente *</label><select name="clienteId" required>${clientOpts}</select><div class="error-message" data-error="clienteId"></div></div>
                <div class="form-group" data-field="fecha"><label>Fecha *</label><input type="date" name="fecha" value="${adv?.fecha || today}" required><div class="error-message" data-error="fecha"></div></div>
            </div>
            <div class="form-row">
                <div class="form-group" data-field="monto"><label>Monto *</label><input type="number" name="monto" step="0.01" min="0.01" value="${adv?.monto || ''}" required><div class="error-message" data-error="monto"></div></div>
                <div class="form-group"><label>Moneda</label><select name="moneda" id="modal-moneda"><option value="PEN" ${(!adv || adv?.moneda === 'PEN') ? 'selected' : ''}>Soles (PEN)</option><option value="USD" ${adv?.moneda === 'USD' ? 'selected' : ''}>Dólares (USD)</option></select></div>
            </div>
            <div class="form-row" id="modal-tc-row" style="${adv?.moneda === 'USD' ? '' : 'display:none;'}">
                <div class="form-group" data-field="tipoCambio"><label>Tipo de Cambio *</label><input type="number" name="tipoCambio" step="0.001" value="${adv?.tipoCambio || ''}"><div class="error-message" data-error="tipoCambio"></div></div>
            </div>
            <div class="form-group" data-field="concepto"><label>Concepto *</label><input type="text" name="concepto" value="${esc(adv?.concepto || '')}" required><div class="error-message" data-error="concepto"></div></div>
            <div class="form-group"><label>Observaciones</label><textarea name="observaciones" rows="2">${esc(adv?.observaciones || '')}</textarea></div>
            <div class="form-group"><label>Evidencia</label><input type="file" id="modal-evidencia" accept="image/*,.pdf"><div id="modal-ev-preview">${evidenciaDataUrl ? '📎 Archivo existente' : ''}</div></div>
        `,
        submitLabel: adv ? 'Guardar Cambios' : 'Registrar Adelanto',
        onSubmit: (form) => {
            clearModalErrors();
            const fd = new FormData(form);
            const data = {
                clienteId: fd.get('clienteId'), fecha: fd.get('fecha'), monto: fd.get('monto'),
                moneda: fd.get('moneda'), tipoCambio: fd.get('tipoCambio'),
                concepto: fd.get('concepto'), observaciones: fd.get('observaciones'), evidencia: evidenciaDataUrl,
            };
            const result = adv ? updateAdvance(adv.id, data) : createAdvance(data);
            if (result.success) { closeFormModal(); refreshList(container); }
            else if (result.errors) { showModalFieldErrors(result.errors); }
        },
        onOpen: (overlay) => {
            overlay.querySelector('#modal-moneda').addEventListener('change', (e) => {
                overlay.querySelector('#modal-tc-row').style.display = e.target.value === 'USD' ? '' : 'none';
            });
            const fileInput = overlay.querySelector('#modal-evidencia');
            fileInput.addEventListener('change', () => {
                const file = fileInput.files[0];
                if (file) { const r = new FileReader(); r.onload = () => { evidenciaDataUrl = r.result; }; r.readAsDataURL(file); }
            });
        },
    });
}

function refreshList(container) {
    const listDiv = container.querySelector('#advance-list');
    const totalDiv = container.querySelector('#advance-total');
    let advances = advanceRepository.getAll();
    if (selectedClientId) advances = advances.filter(a => a.clienteId === selectedClientId);
    advances.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const total = advances.reduce((sum, a) => sum + (Number(a.montoSoles) || 0), 0);
    totalDiv.textContent = advances.length > 0 ? `Total adelantos: S/ ${fmtMoney(total)}` : '';

    if (advances.length === 0) { listDiv.innerHTML = '<div class="empty-state">No hay adelantos registrados.</div>'; return; }

    const rows = advances.map(a => {
        const client = clientRepository.getById(a.clienteId);
        const clientName = client ? `${client.nombreCompleto} ${client.apellidosCompletos}` : '-';
        const monedaLabel = a.moneda === 'USD' ? 'USD' : 'PEN';
        const montoSolesLabel = a.moneda === 'USD' ? `S/ ${fmtMoney(Number(a.montoSoles))}` : '';
        const evBtn = a.evidencia ? `<button type="button" class="btn-icon view-ev-btn" data-ev="${esc(a.id)}" title="Ver evidencia">📎</button>` : '-';
        const actions = isAdmin() ? `<button type="button" class="btn-icon primary edit-adv-btn" data-id="${esc(a.id)}" title="Editar">✏️</button>
            <button type="button" class="btn-icon danger delete-adv-btn" data-id="${esc(a.id)}" data-name="${esc(a.concepto)}" title="Eliminar">🗑️</button>` : '';
        return `<tr>
            <td>${fmtDate(a.fecha)}</td><td>${esc(clientName)}</td><td>${esc(a.concepto)}</td>
            <td style="text-align:right;font-weight:600;">${monedaLabel} ${fmtMoney(Number(a.monto))}</td>
            <td style="text-align:right;">${montoSolesLabel}</td><td>${evBtn}</td><td>${auditLinkHtml(a)}</td>
            ${isAdmin() ? `<td class="actions">${actions}</td>` : ''}
        </tr>`;
    }).join('');

    listDiv.innerHTML = `<table class="data-table"><thead><tr>
        <th>Fecha</th><th>Cliente</th><th>Concepto</th><th>Monto</th><th>En Soles</th><th>Evidencia</th><th>Registro</th>
        ${isAdmin() ? '<th>Acciones</th>' : ''}
    </tr></thead><tbody>${rows}</tbody></table>`;

    listDiv.querySelectorAll('.view-ev-btn').forEach(btn => btn.addEventListener('click', () => {
        const adv = advances.find(a => a.id === btn.getAttribute('data-ev'));
        if (adv?.evidencia) openFileViewer(adv.evidencia, adv.evidencia.startsWith('data:application/pdf') ? 'PDF' : '');
    }));
    listDiv.querySelectorAll('.edit-adv-btn').forEach(btn => btn.addEventListener('click', () => {
        const adv = advances.find(a => a.id === btn.getAttribute('data-id')); if (adv) openAdvForm(container, adv);
    }));
    listDiv.querySelectorAll('.delete-adv-btn').forEach(btn => btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-name');
        if (confirm(`¿Eliminar adelanto "${name}"?`)) { const r = deleteAdvance(btn.getAttribute('data-id')); if (r.success) refreshList(container); else alert(r.message); }
    }));
}

function fmtMoney(v) { return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(s) { if (!s) return ''; const d = new Date(s + 'T00:00:00'); return isNaN(d) ? s : d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' }); }
function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
