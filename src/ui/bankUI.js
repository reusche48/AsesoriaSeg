import { createBank, updateBank, deleteBank } from '../services/bankService.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { auditLinkHtml } from '../app.js';
import { openFormModal, closeFormModal, showModalFieldErrors, clearModalErrors } from './modalHelper.js';
import { confirmarEliminacion } from '../utils.js';

export function renderBankSection(container) {
    container.innerHTML = `
        <div class="section">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                <h2 class="section-title" style="margin:0;">Bancos</h2>
                <button type="button" class="btn btn-primary" id="btn-add-bank">➕ Agregar Banco</button>
            </div>
            <div id="bank-list-content" class="mt-1"></div>
        </div>
    `;
    container.querySelector('#btn-add-bank').addEventListener('click', () => openBankForm(container, null));
    refreshBankList(container);
}

function openBankForm(container, bank) {
    openFormModal({
        title: bank ? 'Editar Banco' : 'Registrar Banco',
        html: `
            <div class="form-group" data-field="nombre">
                <label>Nombre del banco *</label>
                <input type="text" name="nombre" value="${esc(bank?.nombre || '')}" required>
                <div class="error-message" data-error="nombre"></div>
            </div>
        `,
        submitLabel: bank ? 'Guardar Cambios' : 'Registrar Banco',
        onSubmit: (form) => {
            clearModalErrors();
            const nombre = form.querySelector('[name="nombre"]').value;
            const result = bank ? updateBank(bank.id, nombre) : createBank(nombre);
            if (result.success) { closeFormModal(); refreshBankList(container); }
            else { showModalFieldErrors(result.errors); }
        },
    });
}

function refreshBankList(container) {
    const listContent = container.querySelector('#bank-list-content');
    const banks = bankRepository.getAll();
    if (banks.length === 0) { listContent.innerHTML = '<div class="empty-state">No hay bancos registrados.</div>'; return; }

    const rows = banks.map(b => `<tr>
        <td>${esc(b.nombre)}</td><td>${auditLinkHtml(b)}</td>
        <td class="actions">
            <button type="button" class="btn-icon primary edit-bank-btn" data-id="${esc(b.id)}" title="Editar">✏️</button>
            <button type="button" class="btn-icon danger delete-bank-btn" data-id="${esc(b.id)}" data-name="${esc(b.nombre)}" title="Eliminar">🗑️</button>
        </td>
    </tr>`).join('');

    listContent.innerHTML = `<table class="data-table"><thead><tr><th>Nombre</th><th>Registro</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table>`;

    listContent.querySelectorAll('.edit-bank-btn').forEach(btn => {
        btn.addEventListener('click', () => { const b = banks.find(x => x.id === btn.getAttribute('data-id')); if (b) openBankForm(container, b); });
    });
    listContent.querySelectorAll('.delete-bank-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id'), name = btn.getAttribute('data-name');
            if (await confirmarEliminacion(`¿Eliminar banco "${name}"?`)) {
                const r = deleteBank(id);
                if (r.success) refreshBankList(container);
                else alert(r.message);
            }
        });
    });
}

function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
