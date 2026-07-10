import { bankRepository } from '../repositories/bankRepository.js';
import {
    getTemplates, createStepTemplate, updateStepTemplate, deleteStepTemplate,
    seedBancoTemplates, nextOrden, TIPOS_PASO,
} from '../services/stepTemplateService.js';
import { esOpcional } from '../services/claimStepService.js';
import { auditLinkHtml } from '../app.js';
import { openFormModal, closeFormModal, clearModalErrors, showModalAlert } from './modalHelper.js';
import { confirmarEliminacion } from '../utils.js';

let selectedBankId = ''; // '' = General

const TIPO_LABEL = {
    espera: '⏳ Espera respuesta',
    informativo: 'ℹ️ Informativo',
    peticion_parcial: '🧩 Petición por partes',
};

export function renderStepTemplateSection(container) {
    const banks = bankRepository.getAll().slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    container.innerHTML = `
        <div class="section">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                <h2 class="section-title" style="margin:0;">🗺️ Pasos del trámite por banco</h2>
                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                    <button type="button" class="btn btn-secondary" id="btn-seed-steps" title="Precargar pasos de BCP e Interbank">⚡ Precargar BCP / Interbank</button>
                    <button type="button" class="btn btn-primary" id="btn-add-step">➕ Agregar Paso</button>
                </div>
            </div>
            <p style="color:#9ca3af;font-size:0.85rem;margin:0.5rem 0 1rem;">
                Define el trámite de cada banco como una lista de pasos ordenados. La Guía usará estos pasos para decirte qué hacer y cuándo alertarte.
            </p>
            <div class="form-group" style="max-width:340px;">
                <label for="step-bank-select">Banco</label>
                <select id="step-bank-select">
                    <option value="">— Pasos generales (cualquier banco) —</option>
                    ${banks.map(b => `<option value="${esc(b.id)}" ${b.id === selectedBankId ? 'selected' : ''}>${esc(b.nombre)}</option>`).join('')}
                </select>
            </div>
            <div id="step-list-content" class="mt-1"></div>
        </div>
    `;

    container.querySelector('#step-bank-select').addEventListener('change', (e) => {
        selectedBankId = e.target.value;
        refreshStepList(container);
    });
    container.querySelector('#btn-add-step').addEventListener('click', () => openStepForm(container, null));
    container.querySelector('#btn-seed-steps').addEventListener('click', () => {
        const r = seedBancoTemplates();
        const msg = [];
        if (r.seeded.length) msg.push('Precargado: ' + r.seeded.join(', '));
        if (r.skipped.length) msg.push('Omitido: ' + r.skipped.join(', '));
        alert(msg.join('\n') || 'Sin cambios.');
        refreshStepList(container);
    });

    refreshStepList(container);
}

function refreshStepList(container) {
    const listContent = container.querySelector('#step-list-content');
    const steps = getTemplates(selectedBankId);

    if (steps.length === 0) {
        listContent.innerHTML = '<div class="empty-state">No hay pasos definidos. Usa "Agregar Paso" o "Precargar BCP / Interbank".</div>';
        return;
    }

    const rows = steps.map(s => {
        const plazo = s.tipoPaso === 'informativo'
            ? '—'
            : `${s.diasEspera || '?'} ${s.tipoDias === 'laborables' ? 'lab.' : 'nat.'}`;
        return `<tr>
            <td style="text-align:center;color:#94a3b8;">${esc(s.orden)}</td>
            <td>${esc(s.nombre)}</td>
            <td>${TIPO_LABEL[s.tipoPaso] || esc(s.tipoPaso)}${esOpcional(s) ? ' <span style="background:#1f2937;color:#9ca3af;border-radius:99px;padding:1px 8px;font-size:0.72rem;">opcional</span>' : ''}</td>
            <td>${plazo}</td>
            <td style="max-width:280px;color:#9ca3af;font-size:0.85rem;">${esc(s.descripcion || '')}</td>
            <td>${auditLinkHtml(s)}</td>
            <td class="actions">
                <button type="button" class="btn-icon primary edit-step-btn" data-id="${esc(s.id)}" title="Editar">✏️</button>
                <button type="button" class="btn-icon danger delete-step-btn" data-id="${esc(s.id)}" data-name="${esc(s.nombre)}" title="Eliminar">🗑️</button>
            </td>
        </tr>`;
    }).join('');

    listContent.innerHTML = `
        <table class="data-table">
            <thead><tr><th>#</th><th>Paso</th><th>Tipo</th><th>Plazo</th><th>Descripción</th><th>Registro</th><th>Acciones</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;

    listContent.querySelectorAll('.edit-step-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const s = steps.find(x => x.id === btn.getAttribute('data-id'));
            if (s) openStepForm(container, s);
        });
    });
    listContent.querySelectorAll('.delete-step-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id'), name = btn.getAttribute('data-name');
            if (await confirmarEliminacion(`¿Eliminar el paso "${name}"?`)) {
                deleteStepTemplate(id);
                refreshStepList(container);
            }
        });
    });
}

function openStepForm(container, step) {
    const editing = !!step;
    const tipo = step?.tipoPaso || 'espera';
    const ordenDefault = editing ? step.orden : nextOrden(selectedBankId);

    openFormModal({
        title: editing ? 'Editar Paso' : 'Nuevo Paso',
        submitLabel: editing ? 'Guardar Cambios' : 'Agregar Paso',
        html: `
            <div class="form-row">
                <div class="form-group" style="flex:0 0 90px;">
                    <label>Orden</label>
                    <input type="number" id="step-orden" min="0" step="0.1" value="${esc(ordenDefault)}" title="Entero = etapa que salta junta. Decimal ordena dentro de la etapa (ej. 1, 1.5).">
                </div>
                <div class="form-group" data-field="nombre" style="flex:1;">
                    <label>Nombre del paso *</label>
                    <input type="text" id="step-nombre" value="${esc(step?.nombre || '')}" required placeholder="Ej: Presentar reclamo">
                    <div class="error-message" data-error="nombre"></div>
                </div>
            </div>
            <div class="form-group">
                <label>Descripción / instrucción</label>
                <textarea id="step-descripcion" rows="2" placeholder="Qué hacer en este paso...">${esc(step?.descripcion || '')}</textarea>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Tipo de paso</label>
                    <select id="step-tipo">
                        ${TIPOS_PASO.map(t => `<option value="${t.value}" ${t.value === tipo ? 'selected' : ''}>${t.label}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group step-plazo-field">
                    <label>Días de espera</label>
                    <input type="number" id="step-dias" min="1" step="1" value="${esc(step?.diasEspera || '')}" placeholder="Ej: 15">
                </div>
                <div class="form-group step-plazo-field">
                    <label>Tipo de días</label>
                    <select id="step-tipodias">
                        <option value="naturales" ${step?.tipoDias !== 'laborables' ? 'selected' : ''}>Naturales</option>
                        <option value="laborables" ${step?.tipoDias === 'laborables' ? 'selected' : ''}>Laborables (L-V)</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label style="display:flex;align-items:center;gap:0.5rem;font-weight:normal;cursor:pointer;">
                    <input type="checkbox" id="step-opcional" ${esOpcional(step) ? 'checked' : ''} style="width:auto;margin:0;flex:0 0 auto;">
                    <span>Paso opcional (no bloquea avanzar de etapa)</span>
                </label>
            </div>
        `,
        onOpen: (overlay) => {
            const tipoSel = overlay.querySelector('#step-tipo');
            const toggle = () => {
                const esInfo = tipoSel.value === 'informativo';
                overlay.querySelectorAll('.step-plazo-field').forEach(el => { el.style.display = esInfo ? 'none' : ''; });
            };
            tipoSel.addEventListener('change', toggle);
            toggle();
        },
        onSubmit: (form) => {
            clearModalErrors();
            const data = {
                bancoId: selectedBankId || null,
                orden: form.querySelector('#step-orden').value,
                nombre: form.querySelector('#step-nombre').value,
                descripcion: form.querySelector('#step-descripcion').value,
                tipoPaso: form.querySelector('#step-tipo').value,
                diasEspera: form.querySelector('#step-dias').value,
                tipoDias: form.querySelector('#step-tipodias').value,
                opcional: form.querySelector('#step-opcional').checked,
            };
            const result = editing ? updateStepTemplate(step.id, data) : createStepTemplate(data);
            if (result.success) { closeFormModal(); refreshStepList(container); }
            else { showModalAlert(result.error, 'error'); }
        },
    });
}

function esc(str) { const d = document.createElement('div'); d.textContent = str ?? ''; return d.innerHTML; }
