import { createInsurance, updateInsurance, deleteInsurance } from '../services/insuranceService.js';
import { insuranceRepository } from '../repositories/insuranceRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { openFileViewer, auditLinkHtml } from '../app.js';
import { openFormModal, closeFormModal, showModalFieldErrors, clearModalErrors } from './modalHelper.js';

let polizaDataUrl = null;

export function renderInsuranceSection(container) {
    container.innerHTML = `
        <div class="section">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                <h2 class="section-title" style="margin:0;">Seguros</h2>
                <button type="button" class="btn btn-primary" id="btn-add-ins">➕ Agregar Seguro</button>
            </div>
            <div id="insurance-list-content" class="mt-1"></div>
        </div>
    `;
    container.querySelector('#btn-add-ins').addEventListener('click', () => openInsForm(container, null));
    refreshList(container);
}

function bankOptions(selectedId) {
    return `<option value="">-- Seleccione banco --</option>` +
        bankRepository.getAll().map(b => `<option value="${esc(b.id)}" ${b.id === selectedId ? 'selected' : ''}>${esc(b.nombre)}</option>`).join('');
}

function openInsForm(container, ins) {
    polizaDataUrl = ins?.poliza || null;
    openFormModal({
        title: ins ? 'Editar Seguro' : 'Registrar Seguro',
        html: `
            <div class="form-row">
                <div class="form-group" data-field="nombre"><label>Nombre *</label><input type="text" name="nombre" value="${esc(ins?.nombre || '')}" required><div class="error-message" data-error="nombre"></div></div>
                <div class="form-group" data-field="bancoId"><label>Banco *</label><select name="bancoId" required>${bankOptions(ins?.bancoId)}</select><div class="error-message" data-error="bancoId"></div></div>
            </div>
            <div class="form-group" data-field="descripcion"><label>Descripción *</label><textarea name="descripcion" rows="3" required>${esc(ins?.descripcion || '')}</textarea><div class="error-message" data-error="descripcion"></div></div>
            <div class="form-group"><label>Póliza (archivo)</label><input type="file" id="modal-poliza" accept=".pdf,.jpg,.jpeg,.png"><div id="modal-poliza-preview">${polizaDataUrl ? '<span style="color:#1565c0;">📄 Archivo existente</span>' : ''}</div></div>
        `,
        submitLabel: ins ? 'Guardar Cambios' : 'Registrar Seguro',
        onSubmit: (form) => {
            clearModalErrors();
            const fd = new FormData(form);
            const result = ins
                ? updateInsurance(ins.id, fd.get('nombre'), fd.get('descripcion'), fd.get('bancoId'), polizaDataUrl)
                : createInsurance(fd.get('nombre'), fd.get('descripcion'), fd.get('bancoId'), polizaDataUrl);
            if (result.success) { closeFormModal(); refreshList(container); }
            else { showModalFieldErrors(result.errors); }
        },
        onOpen: (overlay) => {
            const fileInput = overlay.querySelector('#modal-poliza');
            fileInput.addEventListener('change', () => {
                const file = fileInput.files[0];
                if (file) { const r = new FileReader(); r.onload = () => { polizaDataUrl = r.result; }; r.readAsDataURL(file); }
            });
        },
    });
}

function refreshList(container) {
    const el = container.querySelector('#insurance-list-content');
    const list = insuranceRepository.getAll();
    if (list.length === 0) { el.innerHTML = '<div class="empty-state">No hay seguros registrados.</div>'; return; }

    const rows = list.map(ins => {
        const bank = ins.bancoId ? bankRepository.getById(ins.bancoId) : null;
        const polizaBtn = ins.poliza ? `<button type="button" class="btn-icon view-poliza-btn" data-file="${esc(ins.poliza)}" title="Ver póliza">📄</button>` : '-';
        return `<tr>
            <td>${esc(ins.nombre)}</td><td>${bank ? esc(bank.nombre) : '-'}</td><td>${esc(ins.descripcion)}</td>
            <td>${polizaBtn}</td><td>${auditLinkHtml(ins)}</td>
            <td class="actions">
                <button type="button" class="btn-icon primary edit-ins-btn" data-id="${esc(ins.id)}" title="Editar">✏️</button>
                <button type="button" class="btn-icon danger delete-ins-btn" data-id="${esc(ins.id)}" title="Eliminar">🗑️</button>
            </td>
        </tr>`;
    }).join('');

    el.innerHTML = `<table class="data-table"><thead><tr><th>Nombre</th><th>Banco</th><th>Descripción</th><th>Póliza</th><th>Registro</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table>`;

    el.querySelectorAll('.view-poliza-btn').forEach(b => b.addEventListener('click', () => { const f = b.getAttribute('data-file'); if (f) openFileViewer(f); }));
    el.querySelectorAll('.edit-ins-btn').forEach(b => b.addEventListener('click', () => { const i = list.find(x => x.id === b.getAttribute('data-id')); if (i) openInsForm(container, i); }));
    el.querySelectorAll('.delete-ins-btn').forEach(b => b.addEventListener('click', () => {
        if (confirm('¿Eliminar este seguro y sus coberturas?')) { const r = deleteInsurance(b.getAttribute('data-id')); if (r.success) refreshList(container); }
    }));
}

function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
