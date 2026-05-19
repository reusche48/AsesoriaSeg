import { addCard, updateCard, deleteCard } from '../services/cardService.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { cardRepository } from '../repositories/cardRepository.js';
import { insuranceRepository } from '../repositories/insuranceRepository.js';
import { auditLinkHtml, openFileViewer } from '../app.js';
import { openFormModal, closeFormModal, showModalFieldErrors, showModalAlert, clearModalErrors } from './modalHelper.js';
import { uploadFile } from '../storage.js';

let selectedClientId = null;
let evidenciaSeguroDataUrl = null;

export function renderCardSection(container) {
    const clients = clientRepository.getAll();
    selectedClientId = null;
    container.innerHTML = `
        <div class="section">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                <h2 class="section-title" style="margin:0;">Tarjetas</h2>
                <button type="button" class="btn btn-primary" id="btn-add-card">➕ Agregar Tarjeta</button>
            </div>
            <div class="form-group" style="margin-top:0.75rem;">
                <select id="card-filter-client" style="width:100%;padding:0.5rem;border:1px solid #ccc;border-radius:4px;">
                    <option value="">-- Seleccione cliente para ver tarjetas --</option>
                    ${clients.map(c => `<option value="${esc(c.id)}">${esc(c.nombreCompleto)} ${esc(c.apellidosCompletos)} (${esc(c.dni)})</option>`).join('')}
                </select>
            </div>
            <div id="card-list-content" class="mt-1"><div class="empty-state">Seleccione un cliente.</div></div>
        </div>
    `;
    container.querySelector('#btn-add-card').addEventListener('click', () => openCardForm(container, null));
    container.querySelector('#card-filter-client').addEventListener('change', (e) => {
        selectedClientId = e.target.value || null;
        refreshList(container);
    });
}

function openCardForm(container, card) {
    const clients = clientRepository.getAll();
    const banks = bankRepository.getAll();
    evidenciaSeguroDataUrl = card?.evidenciaSeguro || null;

    const clientOpts = `<option value="">-- Seleccione --</option>` + clients.map(c =>
        `<option value="${esc(c.id)}" ${card?.clienteId === c.id ? 'selected' : ''}>${esc(c.nombreCompleto)} ${esc(c.apellidosCompletos)}</option>`).join('');
    const bankOpts = `<option value="">-- Seleccione --</option>` + banks.map(b =>
        `<option value="${esc(b.id)}" ${card?.bancoId === b.id ? 'selected' : ''}>${esc(b.nombre)}</option>`).join('');

    openFormModal({
        title: card ? 'Editar Tarjeta' : 'Agregar Tarjeta',
        html: `
            <div class="form-row">
                <div class="form-group" data-field="clienteId"><label>Cliente *</label><select name="clienteId" required ${card ? 'disabled' : ''}>${clientOpts}</select><div class="error-message" data-error="clienteId"></div></div>
                <div class="form-group" data-field="bancoId"><label>Banco *</label><select name="bancoId" id="modal-bank-select" required>${bankOpts}</select><div class="error-message" data-error="bancoId"></div></div>
            </div>
            <div class="form-row">
                <div class="form-group" data-field="seguroId"><label>Seguro</label><select name="seguroId" id="modal-insurance-select"><option value="">-- Seleccione banco primero --</option></select><div class="error-message" data-error="seguroId"></div></div>
                <div class="form-group" data-field="numeroTarjeta"><label>N° Tarjeta *</label><input type="text" name="numeroTarjeta" value="${esc(card?.numero || '')}" required><div class="error-message" data-error="numeroTarjeta"></div></div>
            </div>
            <div id="modal-evidencia-row" class="form-row" style="display:${card?.seguroId ? '' : 'none'};">
                <div class="form-group" data-field="evidenciaSeguro">
                    <label>Evidencia del Seguro *</label>
                    <input type="file" id="modal-evidencia-seguro" accept="image/*,.pdf">
                    <div id="modal-ev-preview" style="font-size:0.85rem;margin-top:0.3rem;">${evidenciaSeguroDataUrl ? '📎 Archivo existente' : ''}</div>
                    <div class="error-message" data-error="evidenciaSeguro"></div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group" data-field="numeroCuenta"><label>N° Cuenta *</label><input type="text" name="numeroCuenta" value="${esc(card?.numeroCuenta || '')}" required><div class="error-message" data-error="numeroCuenta"></div></div>
                <div class="form-group" data-field="numeroCCI"><label>N° CCI</label><input type="text" name="numeroCCI" value="${esc(card?.numeroCCI || '')}" maxlength="20" placeholder="Código Interbancario"><div class="error-message" data-error="numeroCCI"></div></div>
            </div>
            <div class="form-row">
                <div class="form-group" data-field="moneda"><label>Moneda *</label><select name="moneda" required><option value="">-- Seleccione --</option><option value="PEN" ${card?.moneda === 'PEN' ? 'selected' : ''}>Soles (PEN)</option><option value="USD" ${card?.moneda === 'USD' ? 'selected' : ''}>Dólares (USD)</option></select><div class="error-message" data-error="moneda"></div></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Comentario</label><textarea name="comentario" rows="2">${esc(card?.comentario || '')}</textarea></div>
                <div class="form-group"><label>Estado</label><select name="activo"><option value="true" ${card?.activo !== false ? 'selected' : ''}>Activo</option><option value="false" ${card?.activo === false ? 'selected' : ''}>Desactivado</option></select></div>
            </div>
            ${card ? `<input type="hidden" name="clienteIdHidden" value="${esc(card.clienteId)}">` : ''}
        `,
        submitLabel: card ? 'Guardar Cambios' : 'Agregar Tarjeta',
        onSubmit: (form) => {
            clearModalErrors();
            const fd = new FormData(form);
            const seguroId = fd.get('seguroId');
            if (seguroId && !evidenciaSeguroDataUrl) {
                showModalAlert('La evidencia del seguro es obligatoria cuando se asigna un seguro.', 'danger');
                return;
            }
            const data = {
                clienteId: fd.get('clienteId') || fd.get('clienteIdHidden') || '',
                bancoId: fd.get('bancoId'), seguroId: seguroId,
                numeroTarjeta: fd.get('numeroTarjeta'), numeroCuenta: fd.get('numeroCuenta'),
                numeroCCI: fd.get('numeroCCI'), moneda: fd.get('moneda'), comentario: fd.get('comentario'),
                activo: fd.get('activo') === 'true',
                evidenciaSeguro: seguroId ? evidenciaSeguroDataUrl : null,
            };
            const result = card ? updateCard(card.id, data) : addCard(data);
            if (result.success) {
                closeFormModal();
                if (data.clienteId) { selectedClientId = data.clienteId; const sel = container.querySelector('#card-filter-client'); if (sel) sel.value = data.clienteId; }
                refreshList(container);
            } else { showModalFieldErrors(result.errors); }
        },
        onOpen: (overlay) => {
            const bankSel = overlay.querySelector('#modal-bank-select');
            const insSel = overlay.querySelector('#modal-insurance-select');
            const evRow = overlay.querySelector('#modal-evidencia-row');
            const fileInput = overlay.querySelector('#modal-evidencia-seguro');

            const toggleEvRow = () => {
                evRow.style.display = insSel.value ? '' : 'none';
            };

            const loadIns = (bankId) => {
                if (!bankId) { insSel.innerHTML = '<option value="">-- Seleccione banco primero --</option>'; toggleEvRow(); return; }
                const ins = insuranceRepository.findByBankId(bankId);
                insSel.innerHTML = `<option value="">Sin seguro</option>` + ins.map(i => `<option value="${esc(i.id)}" ${card?.seguroId === i.id ? 'selected' : ''}>${esc(i.nombre)}</option>`).join('');
                toggleEvRow();
            };
            bankSel.addEventListener('change', () => loadIns(bankSel.value));
            insSel.addEventListener('change', toggleEvRow);
            if (card?.bancoId) loadIns(card.bancoId);

            fileInput.addEventListener('change', () => {
                const file = fileInput.files[0];
                if (file) {
                    uploadFile(file).then(url => {
                        evidenciaSeguroDataUrl = url;
                        overlay.querySelector('#modal-ev-preview').textContent = '📎 ' + file.name;
                    }).catch(err => alert('Error al subir archivo: ' + err.message));
                }
            });
        },
    });
}

function refreshList(container) {
    const el = container.querySelector('#card-list-content');
    if (!selectedClientId) { el.innerHTML = '<div class="empty-state">Seleccione un cliente.</div>'; return; }
    const cards = cardRepository.findByClientId(selectedClientId);
    if (cards.length === 0) { el.innerHTML = '<div class="empty-state">No tiene tarjetas registradas.</div>'; return; }

    const rows = cards.map(c => {
        const bank = bankRepository.getById(c.bancoId);
        const ins = c.seguroId ? insuranceRepository.getById(c.seguroId) : null;
        const estado = c.activo !== false ? '<span style="color:green;font-weight:bold;">Activo</span>' : '<span style="color:red;font-weight:bold;">Desactivado</span>';
        const evBtn = c.evidenciaSeguro ? `<button type="button" class="btn-icon view-ev-btn" data-id="${esc(c.id)}" title="Ver evidencia">📎</button>` : '-';
        return `<tr>
            <td>${bank ? esc(bank.nombre) : '-'}</td><td>${ins ? esc(ins.nombre) : '<span style="color:red;font-weight:bold;">Sin seguro</span>'}</td>
            <td>${esc(c.numero || '-')}</td><td>${esc(c.numeroCuenta || '-')}</td><td>${esc(c.numeroCCI || '-')}</td><td>${esc(c.moneda || '-')}</td>
            <td>${evBtn}</td><td>${esc(c.comentario || '-')}</td><td>${estado}</td><td>${auditLinkHtml(c)}</td>
            <td class="actions">
                <button type="button" class="btn-icon primary edit-card-btn" data-id="${esc(c.id)}" title="Editar">✏️</button>
                <button type="button" class="btn-icon danger delete-card-btn" data-id="${esc(c.id)}" title="Eliminar">🗑️</button>
            </td>
        </tr>`;
    }).join('');

    el.innerHTML = `<table class="data-table"><thead><tr><th>Banco</th><th>Seguro</th><th>N° Tarjeta</th><th>N° Cuenta</th><th>CCI</th><th>Moneda</th><th>Evidencia</th><th>Comentario</th><th>Estado</th><th>Registro</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table>`;

    el.querySelectorAll('.view-ev-btn').forEach(b => b.addEventListener('click', () => {
        const c = cards.find(x => x.id === b.getAttribute('data-id'));
        if (c?.evidenciaSeguro) {
            const fmt = c.evidenciaSeguro.startsWith('data:application/pdf') ? 'PDF' : '';
            openFileViewer(c.evidenciaSeguro, fmt);
        }
    }));
    el.querySelectorAll('.edit-card-btn').forEach(b => b.addEventListener('click', () => { const c = cards.find(x => x.id === b.getAttribute('data-id')); if (c) openCardForm(container, c); }));
    el.querySelectorAll('.delete-card-btn').forEach(b => b.addEventListener('click', () => {
        if (confirm('¿Eliminar esta tarjeta?')) { const r = deleteCard(b.getAttribute('data-id')); if (r.success) refreshList(container); }
    }));
}

function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
