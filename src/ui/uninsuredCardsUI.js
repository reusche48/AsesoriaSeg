import { getUninsuredCards, assignInsurance } from '../services/cardService.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { cardRepository } from '../repositories/cardRepository.js';
import { insuranceRepository } from '../repositories/insuranceRepository.js';
import { auditLinkHtml } from '../app.js';
import { openFormModal, closeFormModal, showModalAlert } from './modalHelper.js';
import { uploadFile } from '../storage.js';

export function renderUninsuredCardsSection(container) {
    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">🔍 Tarjetas Sin Seguro</h2>
            <div id="uninsured-list-content"></div>
        </div>
    `;
    refreshList(container);
}

function refreshList(container) {
    const el = container.querySelector('#uninsured-list-content');
    const cards = getUninsuredCards();

    if (cards.length === 0) {
        el.innerHTML = '<div class="empty-state">Todas las tarjetas tienen seguro asignado. ✅</div>';
        return;
    }

    const rows = cards.map(c => {
        const client = clientRepository.getById(c.clienteId);
        const bank = bankRepository.getById(c.bancoId);
        const clientName = client ? `${esc(client.nombreCompleto)} ${esc(client.apellidosCompletos)}` : '-';
        return `<tr>
            <td>${clientName}</td>
            <td>${bank ? esc(bank.nombre) : '-'}</td>
            <td>${esc(c.numero || '-')}</td>
            <td>${esc(c.numeroCuenta || '-')}</td>
            <td>${esc(c.numeroCCI || '-')}</td>
            <td>${esc(c.moneda || '-')}</td>
            <td><span style="color:red;font-weight:bold;">Sin seguro</span></td>
            <td>${auditLinkHtml(c)}</td>
            <td class="actions">
                <button type="button" class="btn-icon primary assign-ins-btn" data-id="${esc(c.id)}" data-bank="${esc(c.bancoId)}" title="Asignar Seguro">🛡️</button>
            </td>
        </tr>`;
    }).join('');

    el.innerHTML = `<p style="margin-bottom:0.5rem;color:#666;">Se encontraron <strong>${cards.length}</strong> tarjeta(s) sin seguro.</p>
        <table class="data-table"><thead><tr><th>Cliente</th><th>Banco</th><th>N° Tarjeta</th><th>N° Cuenta</th><th>CCI</th><th>Moneda</th><th>Seguro</th><th>Registro</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table>`;

    el.querySelectorAll('.assign-ins-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const cardId = btn.getAttribute('data-id');
            const bankId = btn.getAttribute('data-bank');
            openAssignModal(container, cardId, bankId);
        });
    });
}

function openAssignModal(container, cardId, bankId) {
    const insurances = insuranceRepository.findByBankId(bankId);
    const bank = bankRepository.getById(bankId);
    const bankName = bank ? bank.nombre : '';
    let evidenciaDataUrl = null;

    if (insurances.length === 0) {
        alert(`No hay seguros registrados para el banco "${bankName}". Registre un seguro primero.`);
        return;
    }

    const opts = insurances.map(i => `<option value="${esc(i.id)}">${esc(i.nombre)}</option>`).join('');

    openFormModal({
        title: `Asignar Seguro - ${esc(bankName)}`,
        html: `
            <div class="form-group">
                <label>Seleccione el seguro *</label>
                <select name="seguroId" required>
                    <option value="">-- Seleccione --</option>
                    ${opts}
                </select>
            </div>
            <div class="form-group">
                <label>Evidencia del Seguro *</label>
                <input type="file" id="modal-ev-assign" accept="image/*,.pdf">
                <div id="modal-ev-assign-preview" style="font-size:0.85rem;margin-top:0.3rem;"></div>
            </div>
            <p style="font-size:0.85rem;color:#666;margin-top:0.5rem;">
                ⚡ Al asignar seguro, todas las tarjetas del mismo cliente y banco se asegurarán automáticamente.
            </p>
        `,
        submitLabel: 'Asignar Seguro',
        onSubmit: (form) => {
            const seguroId = new FormData(form).get('seguroId');
            if (!seguroId) { showModalAlert('Seleccione un seguro.', 'danger'); return; }
            if (!evidenciaDataUrl) { showModalAlert('La evidencia del seguro es obligatoria.', 'danger'); return; }
            const result = assignInsurance(cardId, seguroId, evidenciaDataUrl, true);
            if (result.success) {
                closeFormModal();
                refreshList(container);
            } else {
                showModalAlert(result.errors?.[0]?.message || 'Error al asignar seguro.', 'danger');
            }
        },
        onOpen: (overlay) => {
            const fileInput = overlay.querySelector('#modal-ev-assign');
            fileInput.addEventListener('change', () => {
                const file = fileInput.files[0];
                if (file) {
                    uploadFile(file).then(url => {
                        evidenciaDataUrl = url;
                        overlay.querySelector('#modal-ev-assign-preview').textContent = '📎 ' + file.name;
                    }).catch(err => alert('Error al subir archivo: ' + err.message));
                }
            });
        },
    });
}

function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
