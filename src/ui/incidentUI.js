import { createIncident, updateIncident, addIncidentBank, getIncidentBanks, deleteClaim } from '../services/incidentService.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { openFileViewer, auditLinkHtml } from '../app.js';
import { openFormModal, closeFormModal, showModalAlert, clearModalErrors } from './modalHelper.js';
import { uploadFile } from '../storage.js';
import { confirmarEliminacion, handleFileUpload } from '../utils.js';
import { getActiveClientId } from '../state/clientContext.js';

/**
 * Módulo UI para registro de siniestros con denuncia policial.
 */

let selectedFileDataUrl = null;
let selectedFileName = null;
let incidentClientId = null;

/**
 * Renderiza la sección completa de siniestros.
 */
export function renderIncidentSection(container) {
    selectedFileDataUrl = null;
    selectedFileName = null;

    const clients = clientRepository.getAll();
    const clientOpts = clients.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.nombreCompleto)} ${escapeHtml(c.apellidosCompletos)} (${escapeHtml(c.dni)})</option>`).join('');

    container.innerHTML = `
        <div class="section">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                <h2 class="section-title" style="margin:0;">Siniestros Registrados</h2>
                <button type="button" class="btn btn-primary" id="incident-add-btn">➕ Agregar Siniestro</button>
            </div>
            <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;margin-top:0.75rem;">
                <select id="incident-filter-client" style="flex:1;min-width:220px;padding:0.5rem;border:1px solid #ccc;border-radius:4px;">
                    <option value="">-- Todos los clientes --</option>
                    ${clientOpts}
                </select>
                <button type="button" class="btn btn-secondary" id="incident-filter-clear" title="Limpiar filtro">✖ Limpiar</button>
            </div>
            <div id="incident-list-content" class="mt-2"></div>
        </div>

        <div class="section mt-2" id="incident-bank-section" style="display:none;">
            <h2 class="section-title">Bancos por Reclamar del Siniestro</h2>
            <div id="incident-bank-info"></div>
            <button type="button" class="btn btn-primary" id="incident-bank-add-btn">➕ Agregar Banco</button>
            <div id="incident-bank-list" class="mt-2"></div>
        </div>
    `;

    container.querySelector('#incident-add-btn').addEventListener('click', () => openIncidentModal(container, null));
    container.querySelector('#incident-bank-add-btn').addEventListener('click', () => {
        const section = container.querySelector('#incident-bank-section');
        const incidentId = section.getAttribute('data-incident-id');
        if (incidentId) openBankModal(container, incidentId);
    });

    const filterSel = container.querySelector('#incident-filter-client');
    filterSel.addEventListener('change', (e) => { incidentClientId = e.target.value || null; refreshIncidentList(container); });
    container.querySelector('#incident-filter-clear').addEventListener('click', () => {
        incidentClientId = null; filterSel.value = ''; refreshIncidentList(container);
    });

    // Pre-seleccionar el cliente activo global
    const active = getActiveClientId();
    incidentClientId = (active && clients.some(c => c.id === active)) ? active : null;
    if (incidentClientId) filterSel.value = incidentClientId;

    refreshIncidentList(container);
}

/**
 * Abre modal para crear/editar siniestro.
 */
function openIncidentModal(container, incidentId) {
    const editing = incidentId ? incidentRepository.getById(incidentId) : null;
    const clients = clientRepository.getAll();

    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const defaultDate = editing?.fecha || `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    const html = `
        <div class="form-row">
            <div class="form-group" data-field="clienteId">
                <label>Cliente *</label>
                <select id="modal-incident-client" required ${editing ? 'disabled' : ''}>
                    <option value="">-- Seleccione un cliente --</option>
                    ${clients.map(c => `<option value="${escapeHtml(c.id)}" ${editing && editing.clienteId === c.id ? 'selected' : ''}>${escapeHtml(c.nombreCompleto)} ${escapeHtml(c.apellidosCompletos)} (${escapeHtml(c.dni)})</option>`).join('')}
                </select>
                <div class="error-message" data-error="clienteId"></div>
            </div>
            <div class="form-group" data-field="fecha">
                <label>Fecha del siniestro *</label>
                <input type="date" id="modal-incident-fecha" value="${defaultDate}" required>
                <div class="error-message" data-error="fecha"></div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group" data-field="denunciaArchivo">
                <label>Denuncia policial (PDF, JPG, PNG) ${editing ? '' : '*'}</label>
                <input type="file" id="modal-incident-file" accept=".pdf,.jpg,.jpeg,.png" ${editing ? '' : 'required'}>
                <div class="error-message" data-error="denunciaArchivo"></div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group" data-field="denunciaDescripcion">
                <label>Descripción de la denuncia *</label>
                <textarea id="modal-incident-descripcion" rows="3" required>${editing ? escapeHtml(editing.denunciaDescripcion || '') : ''}</textarea>
                <div class="error-message" data-error="denunciaDescripcion"></div>
            </div>
        </div>
    `;

    selectedFileDataUrl = null;
    selectedFileName = null;

    openFormModal({
        title: editing ? 'Editar Siniestro' : 'Nuevo Siniestro',
        html,
        submitLabel: editing ? 'Actualizar' : 'Registrar',
        onOpen: (overlay) => {
            const fileInput = overlay.querySelector('#modal-incident-file');
            fileInput.addEventListener('change', async () => {
                const file = fileInput.files[0];
                if (file) {
                    await handleFileUpload(fileInput, url => { selectedFileDataUrl = url; selectedFileName = file.name; }, uploadFile);
                } else {
                    selectedFileDataUrl = null; selectedFileName = null;
                }
            });
        },
        onSubmit: (form) => {
            clearModalErrors();
            const fecha = form.querySelector('#modal-incident-fecha').value;
            const descripcion = form.querySelector('#modal-incident-descripcion').value;
            const policeReport = {
                file: selectedFileDataUrl ? { name: selectedFileName, dataUrl: selectedFileDataUrl } : null,
                description: descripcion,
            };

            let result;
            if (editing) {
                result = updateIncident(incidentId, fecha, policeReport);
            } else {
                const clienteId = form.querySelector('#modal-incident-client').value;
                result = createIncident(clienteId, fecha, policeReport);
            }

            if (result.success) {
                closeFormModal();
                refreshIncidentList(container);
                if (!editing) {
                    showBankSection(container, result.incident.id);
                }
            } else {
                showModalFieldErrors(result.errors);
            }
        }
    });
}

/**
 * Abre modal para agregar banco al siniestro.
 */
function openBankModal(container, incidentId) {
    const banks = bankRepository.getAll();
    const html = `
        <div class="form-row">
            <div class="form-group" data-field="bancoId">
                <label>Banco *</label>
                <select id="modal-bank-select" required>
                    <option value="">-- Seleccione un banco --</option>
                    ${banks.map(b => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.nombre)}</option>`).join('')}
                </select>
                <div class="error-message" data-error="bancoId"></div>
            </div>
        </div>
    `;

    openFormModal({
        title: 'Agregar Banco al Siniestro',
        html,
        submitLabel: 'Agregar',
        onSubmit: (form) => {
            clearModalErrors();
            const bankId = form.querySelector('#modal-bank-select').value;
            const result = addIncidentBank(incidentId, bankId);
            if (result.success) {
                closeFormModal();
                refreshBankList(container, incidentId);
                refreshIncidentList(container);
            } else {
                showModalFieldErrors(result.errors);
            }
        }
    });
}

/**
 * Actualiza la lista de siniestros registrados.
 */
function refreshIncidentList(container) {
    const listContent = container.querySelector('#incident-list-content');
    let incidents = incidentRepository.getAll();
    if (incidentClientId) incidents = incidents.filter(i => i.clienteId === incidentClientId);

    if (incidents.length === 0) {
        listContent.innerHTML = incidentClientId
            ? '<div class="empty-state">Este cliente no tiene siniestros registrados.</div>'
            : '<div class="empty-state">No hay siniestros registrados.</div>';
        return;
    }

    const rows = incidents.map(inc => {
        const client = clientRepository.getById(inc.clienteId);
        const clientName = client ? `${escapeHtml(client.nombreCompleto)} ${escapeHtml(client.apellidosCompletos)}` : 'Desconocido';
        const archivoLink = inc.denunciaArchivo
            ? `<button type="button" class="btn-icon view-file-btn" title="Ver archivo" data-file="${escapeHtml(inc.denunciaArchivo)}" data-format="${escapeHtml(inc.denunciaFormato || '')}">📄</button> <a href="${inc.denunciaArchivo}" download="denuncia.${(inc.denunciaFormato || 'pdf').toLowerCase()}" class="btn-icon" title="Descargar">⬇️</a>`
            : '-';
        return `
            <tr>
                <td>${clientName}</td>
                <td>${formatDate(inc.fecha)}</td>
                <td>${archivoLink}</td>
                <td>${auditLinkHtml(inc)}</td>
                <td>
                    <button type="button" class="btn-icon primary edit-incident-btn" data-incident-id="${escapeHtml(inc.id)}" title="Editar">✏️</button>
                    <button type="button" class="btn-icon view-banks-btn" data-incident-id="${escapeHtml(inc.id)}" title="Bancos">🏦</button>
                    <button type="button" class="btn-icon go-reclamo-btn" data-client-id="${escapeHtml(inc.clienteId)}" title="Ir a Reclamos de este cliente">📑</button>
                </td>
            </tr>
        `;
    }).join('');

    listContent.innerHTML = `
        <table class="data-table">
            <thead><tr><th>Cliente</th><th>Fecha</th><th>Archivo</th><th>Registro</th><th>Acciones</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    listContent.querySelectorAll('.edit-incident-btn').forEach(btn => {
        btn.addEventListener('click', () => openIncidentModal(container, btn.getAttribute('data-incident-id')));
    });
    listContent.querySelectorAll('.view-banks-btn').forEach(btn => {
        btn.addEventListener('click', () => showBankSection(container, btn.getAttribute('data-incident-id')));
    });
    listContent.querySelectorAll('.go-reclamo-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const clientId = btn.getAttribute('data-client-id');
            window.location.hash = '#reclamos';
            // Pasar el clienteId como parámetro de estado para pre-seleccionar
            sessionStorage.setItem('reclamos_preselect_client', clientId);
            window.dispatchEvent(new HashChangeEvent('hashchange'));
        });
    });
    listContent.querySelectorAll('.view-file-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const file = btn.getAttribute('data-file');
            const format = btn.getAttribute('data-format');
            if (file) openFileViewer(file, format);
        });
    });
}

/**
 * Muestra la sección de bancos por reclamar para un siniestro.
 */
function showBankSection(container, incidentId) {
    const section = container.querySelector('#incident-bank-section');
    section.style.display = '';
    section.setAttribute('data-incident-id', incidentId);

    const incident = incidentRepository.getById(incidentId);
    const client = incident ? clientRepository.getById(incident.clienteId) : null;

    container.querySelector('#incident-bank-info').innerHTML = `<div class="alert alert-success">
        Siniestro: ${escapeHtml(incidentId.substring(0, 8))} —
        Cliente: ${client ? escapeHtml(client.nombreCompleto + ' ' + client.apellidosCompletos) : 'N/A'} —
        Fecha: ${incident ? formatDate(incident.fecha) : 'N/A'}
    </div>`;

    refreshBankList(container, incidentId);
    section.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Actualiza la lista de bancos asociados al siniestro.
 */
function refreshBankList(container, incidentId) {
    const listDiv = container.querySelector('#incident-bank-list');
    const claims = getIncidentBanks(incidentId);

    if (claims.length === 0) {
        listDiv.innerHTML = '<div class="empty-state">No hay bancos registrados para este siniestro.</div>';
        return;
    }

    const rows = claims.map(claim => {
        const bank = bankRepository.getById(claim.bancoId);
        const bankName = bank ? escapeHtml(bank.nombre) : 'Desconocido';
        const estado = claim.estado || 'Pendiente';
        const estadoClass = estado === 'Pendiente' ? 'color: orange;' :
                            estado === 'En Proceso' ? 'color: blue;' :
                            estado === 'Culminado' ? 'color: green;' : '';
        return `
            <tr>
                <td>${bankName}</td>
                <td style="${estadoClass} font-weight:bold;">${escapeHtml(estado)}</td>
                <td>
                    <button type="button" class="btn-icon danger delete-claim-btn" data-claim-id="${escapeHtml(claim.id)}" title="Eliminar reclamo">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');

    listDiv.innerHTML = `
        <table class="data-table">
            <thead><tr><th>Banco</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    listDiv.querySelectorAll('.delete-claim-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const claimId = btn.getAttribute('data-claim-id');
            if (await confirmarEliminacion('¿Está seguro de eliminar este reclamo?')) {
                const result = deleteClaim(claimId);
                if (result.success) {
                    refreshBankList(container, incidentId);
                } else {
                    alert(result.message);
                }
            }
        });
    });
}

function showModalFieldErrors(errors) {
    const overlay = document.querySelector('.form-modal-overlay');
    if (!overlay) return;
    for (const err of errors) {
        const el = overlay.querySelector(`[data-error="${err.field}"]`);
        if (el) el.textContent = err.message;
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    // "YYYY-MM-DD" se interpreta como local para evitar el corrimiento de un día por UTC
    const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
}
