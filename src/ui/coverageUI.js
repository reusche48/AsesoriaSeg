import { addCoverage, updateCoverage, deleteCoverage } from '../services/insuranceService.js';
import { insuranceRepository } from '../repositories/insuranceRepository.js';
import { coverageRepository } from '../repositories/coverageRepository.js';
import { auditLinkHtml } from '../app.js';
import { openFormModal, closeFormModal, showModalFieldErrors, showModalAlert, clearModalErrors } from './modalHelper.js';

let selectedInsuranceId = null;

export function renderCoverageSection(container) {
    selectedInsuranceId = null;
    const insurances = insuranceRepository.getAll();
    container.innerHTML = `
        <div class="section">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                <h2 class="section-title" style="margin:0;">Coberturas</h2>
                <button type="button" class="btn btn-primary" id="btn-add-cov">➕ Agregar Cobertura</button>
            </div>
            <div class="form-group" style="margin-top:0.75rem;">
                <select id="cov-filter-ins" style="width:100%;padding:0.5rem;border:1px solid #ccc;border-radius:4px;">
                    <option value="">-- Seleccione seguro para ver coberturas --</option>
                    ${insurances.map(i => `<option value="${esc(i.id)}">${esc(i.nombre)}</option>`).join('')}
                </select>
            </div>
            <div id="cov-list-content" class="mt-1"><div class="empty-state">Seleccione un seguro.</div></div>
        </div>
    `;
    container.querySelector('#btn-add-cov').addEventListener('click', () => openCovForm(container, null));
    container.querySelector('#cov-filter-ins').addEventListener('change', (e) => {
        selectedInsuranceId = e.target.value || null;
        refreshList(container);
    });
}

function openCovForm(container, cov) {
    const insurances = insuranceRepository.getAll();
    const insOpts = `<option value="">-- Seleccione --</option>` + insurances.map(i =>
        `<option value="${esc(i.id)}" ${(cov?.seguroId || selectedInsuranceId) === i.id ? 'selected' : ''}>${esc(i.nombre)}</option>`).join('');

    openFormModal({
        title: cov ? 'Editar Cobertura' : 'Agregar Cobertura',
        html: `
            <div class="form-group" data-field="seguroId"><label>Seguro *</label><select name="seguroId" required ${cov ? 'disabled' : ''}>${insOpts}</select><div class="error-message" data-error="seguroId"></div></div>
            <div class="form-row">
                <div class="form-group" data-field="nombre"><label>Nombre *</label><input type="text" name="nombre" required value="${esc(cov?.nombre || '')}"><div class="error-message" data-error="nombre"></div></div>
                <div class="form-group" data-field="monto"><label>Monto *</label><input type="number" name="monto" min="0.01" step="0.01" required placeholder="0.00" value="${cov ? Number(cov.monto || 0).toFixed(2) : ''}"><div class="error-message" data-error="monto"></div></div>
            </div>
            <div class="form-group" data-field="descripcion"><label>Descripción *</label><textarea name="descripcion" rows="3" required>${esc(cov?.descripcion || '')}</textarea><div class="error-message" data-error="descripcion"></div></div>
        `,
        submitLabel: cov ? 'Guardar Cambios' : 'Agregar Cobertura',
        onSubmit: (form) => {
            clearModalErrors();
            const fd = new FormData(form);
            const monto = fd.get('monto') ? parseFloat(fd.get('monto')) : '';

            let result;
            if (cov) {
                result = updateCoverage(cov.id, { nombre: fd.get('nombre'), descripcion: fd.get('descripcion'), monto });
            } else {
                result = addCoverage(fd.get('seguroId'), fd.get('nombre'), fd.get('descripcion'), monto);
                if (result.success) { selectedInsuranceId = fd.get('seguroId'); const sel = container.querySelector('#cov-filter-ins'); if (sel) sel.value = selectedInsuranceId; }
            }

            if (result.success) { closeFormModal(); refreshList(container); }
            else { showModalFieldErrors(result.errors); }
        },
    });
}

function refreshList(container) {
    const el = container.querySelector('#cov-list-content');
    if (!selectedInsuranceId) { el.innerHTML = '<div class="empty-state">Seleccione un seguro.</div>'; return; }
    const covs = coverageRepository.findByInsuranceId(selectedInsuranceId);
    if (covs.length === 0) { el.innerHTML = '<div class="empty-state">No hay coberturas para este seguro.</div>'; return; }

    const rows = covs.map(c => `<tr>
        <td>${esc(c.nombre)}</td><td>${esc(c.descripcion)}</td><td>${fmtMoney(c.monto)}</td><td>${auditLinkHtml(c)}</td>
        <td class="actions">
            <button type="button" class="btn-icon primary edit-cov-btn" data-id="${esc(c.id)}" title="Editar">✏️</button>
            <button type="button" class="btn-icon danger delete-cov-btn" data-id="${esc(c.id)}" title="Eliminar">🗑️</button>
        </td>
    </tr>`).join('');
    el.innerHTML = `<table class="data-table"><thead><tr><th>Nombre</th><th>Descripción</th><th>Monto</th><th>Registro</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table>`;

    el.querySelectorAll('.edit-cov-btn').forEach(b => b.addEventListener('click', () => {
        const c = covs.find(x => x.id === b.getAttribute('data-id'));
        if (c) openCovForm(container, c);
    }));
    el.querySelectorAll('.delete-cov-btn').forEach(b => b.addEventListener('click', () => {
        if (!confirm('¿Eliminar esta cobertura?')) return;
        const result = deleteCoverage(b.getAttribute('data-id'));
        if (result.success) { refreshList(container); }
        else { alert(result.error || 'No se pudo eliminar.'); }
    }));
}

function fmtMoney(v) { return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
