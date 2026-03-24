import { addClaimDetail, updateClaimDetail, deleteClaimDetail, calculateClaimTotal } from '../services/claimService.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { claimDetailRepository } from '../repositories/claimDetailRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { insuranceRepository } from '../repositories/insuranceRepository.js';
import { coverageRepository } from '../repositories/coverageRepository.js';
import { openFileViewer } from '../app.js';
import { openFormModal, closeFormModal, showModalAlert, clearModalErrors } from './modalHelper.js';

let selectedDetailEvidenceDataUrl = null;

export function renderClaimSection(container) {
    selectedDetailEvidenceDataUrl = null;

    const incidents = incidentRepository.getAll();

    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">Detalle de Reclamos</h2>
            <div class="form-row">
                <div class="form-group">
                    <label for="claim-incident-select">Siniestro *</label>
                    <select id="claim-incident-select" aria-label="Seleccionar siniestro">
                        <option value="">-- Seleccione un siniestro --</option>
                        ${incidents.map(inc => {
                            const cl = clientRepository.getById(inc.clienteId);
                            const clName = cl ? `${cl.nombreCompleto} ${cl.apellidosCompletos}` : 'Desconocido';
                            return `<option value="${esc(inc.id)}">${formatDate(inc.fecha)} — ${esc(clName)}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="claim-bank-select">Banco (Reclamo) *</label>
                    <select id="claim-bank-select" aria-label="Seleccionar banco/reclamo">
                        <option value="">-- Primero seleccione un siniestro --</option>
                    </select>
                </div>
            </div>
            <div id="claim-info"></div>
        </div>

        <div class="section mt-2" id="claim-detail-list-section" style="display:none;">
            <h2 class="section-title">Coberturas Reclamadas</h2>
            <button type="button" class="btn btn-primary" id="claim-detail-add-btn">➕ Agregar Cobertura</button>
            <div id="claim-detail-total" class="alert alert-info mt-2" style="display:none;"></div>
            <div id="claim-detail-list-content" class="mt-2"></div>
        </div>
    `;

    setupIncidentSelector(container);
    setupBankSelector(container);

    container.querySelector('#claim-detail-add-btn').addEventListener('click', () => {
        const claimId = container.querySelector('#claim-bank-select').value;
        if (claimId) openDetailModal(container, claimId, null);
    });
}

function setupIncidentSelector(container) {
    const incSelect = container.querySelector('#claim-incident-select');
    incSelect.addEventListener('change', () => {
        const incidentId = incSelect.value;
        const bankSelect = container.querySelector('#claim-bank-select');
        container.querySelector('#claim-detail-list-section').style.display = 'none';
        container.querySelector('#claim-info').innerHTML = '';

        if (!incidentId) {
            bankSelect.innerHTML = '<option value="">-- Primero seleccione un siniestro --</option>';
            return;
        }

        const claims = claimRepository.findByIncidentId(incidentId);
        if (claims.length === 0) {
            bankSelect.innerHTML = '<option value="">-- No hay bancos registrados --</option>';
            return;
        }

        bankSelect.innerHTML = `<option value="">-- Seleccione un banco --</option>` +
            claims.map(c => {
                const bank = bankRepository.getById(c.bancoId);
                const bankName = bank ? esc(bank.nombre) : 'Desconocido';
                return `<option value="${esc(c.id)}">${bankName} — [${esc(c.estado)}]</option>`;
            }).join('');
    });
}

function setupBankSelector(container) {
    const bankSelect = container.querySelector('#claim-bank-select');
    bankSelect.addEventListener('change', () => {
        const claimId = bankSelect.value;
        if (!claimId) {
            container.querySelector('#claim-detail-list-section').style.display = 'none';
            container.querySelector('#claim-info').innerHTML = '';
            return;
        }

        updateClaimInfo(container, claimId);
        container.querySelector('#claim-detail-list-section').style.display = '';
        refreshDetailList(container, claimId);
    });
}

/**
 * Abre modal para agregar/editar cobertura del reclamo.
 */
function openDetailModal(container, claimId, detailId) {
    const editing = detailId ? claimDetailRepository.getById(detailId) : null;
    const claim = claimRepository.getById(claimId);
    const bank = claim ? bankRepository.getById(claim.bancoId) : null;

    // Seguros del banco
    const insurances = bank ? insuranceRepository.findByBankId(bank.id) : [];

    // Si editando, buscar cobertura y seguro
    let editInsuranceId = '';
    let editCoverages = [];
    if (editing) {
        const cov = coverageRepository.getById(editing.coberturaId);
        if (cov) {
            editInsuranceId = cov.seguroId;
            editCoverages = coverageRepository.findByInsuranceId(cov.seguroId);
        }
    }

    const html = `
        <div class="form-row">
            <div class="form-group" data-field="seguroId">
                <label>Seguro (Póliza) *</label>
                <select id="modal-claim-insurance" required>
                    <option value="">-- Seleccione un seguro --</option>
                    ${insurances.map(ins => `<option value="${esc(ins.id)}" ${editing && editInsuranceId === ins.id ? 'selected' : ''}>${esc(ins.nombre)}</option>`).join('')}
                </select>
                <div class="error-message" data-error="seguroId"></div>
            </div>
            <div class="form-group" data-field="coberturaId">
                <label>Cobertura *</label>
                <select id="modal-claim-coverage" required>
                    ${editing && editCoverages.length > 0
                        ? `<option value="">-- Seleccione --</option>` + editCoverages.map(c => `<option value="${esc(c.id)}" ${c.id === editing.coberturaId ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')
                        : '<option value="">-- Primero seleccione un seguro --</option>'}
                </select>
                <div class="error-message" data-error="coberturaId"></div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Monto que cubre la cobertura</label>
                <input type="text" id="modal-claim-cov-monto" readonly disabled style="background:#f5f5f5;" placeholder="Seleccione una cobertura" value="${editing ? getCovMontoText(editing.coberturaId) : ''}">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group" data-field="monto">
                <label>Monto a reclamar *</label>
                <input type="number" id="modal-claim-monto" min="0.01" step="0.01" required placeholder="0.00" value="${editing ? editing.monto : ''}">
                <div class="error-message" data-error="monto"></div>
            </div>
            <div class="form-group" data-field="moneda">
                <label>Moneda *</label>
                <select id="modal-claim-moneda">
                    <option value="PEN" ${editing && editing.moneda === 'PEN' ? 'selected' : ''}>Soles (PEN)</option>
                    <option value="USD" ${editing && editing.moneda === 'USD' ? 'selected' : ''}>Dólares (USD)</option>
                </select>
            </div>
        </div>
        <div class="form-row" id="modal-claim-tc-row" style="display:${editing && editing.moneda === 'USD' ? '' : 'none'};">
            <div class="form-group" data-field="tipoCambio">
                <label>Tipo de Cambio *</label>
                <input type="number" id="modal-claim-tc" min="0.01" step="0.001" placeholder="Ej: 3.75" value="${editing && editing.tipoCambio ? editing.tipoCambio : ''}">
                <div class="error-message" data-error="tipoCambio"></div>
            </div>
            <div class="form-group">
                <label>Equivalente en Soles</label>
                <input type="text" id="modal-claim-equiv" readonly disabled style="background:#f5f5f5;">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Evidencia (archivo opcional)</label>
                <input type="file" id="modal-claim-evidence">
            </div>
        </div>
    `;

    selectedDetailEvidenceDataUrl = editing ? (editing.evidencia || null) : null;

    openFormModal({
        title: editing ? 'Editar Cobertura' : 'Agregar Cobertura al Reclamo',
        html,
        submitLabel: editing ? 'Actualizar' : 'Agregar',
        onOpen: (overlay) => {
            const insuranceSelect = overlay.querySelector('#modal-claim-insurance');
            const coverageSelect = overlay.querySelector('#modal-claim-coverage');
            const covMontoInfo = overlay.querySelector('#modal-claim-cov-monto');
            const monedaSelect = overlay.querySelector('#modal-claim-moneda');
            const tcRow = overlay.querySelector('#modal-claim-tc-row');
            const montoInput = overlay.querySelector('#modal-claim-monto');
            const tcInput = overlay.querySelector('#modal-claim-tc');
            const equivInput = overlay.querySelector('#modal-claim-equiv');

            const updateEquiv = () => {
                const monto = parseFloat(montoInput.value) || 0;
                const tc = parseFloat(tcInput.value) || 0;
                equivInput.value = (monedaSelect.value === 'USD' && monto > 0 && tc > 0) ? formatMoney(monto * tc) + ' PEN' : '';
            };

            insuranceSelect.addEventListener('change', () => {
                const insId = insuranceSelect.value;
                covMontoInfo.value = '';
                if (!insId) { coverageSelect.innerHTML = '<option value="">-- Primero seleccione un seguro --</option>'; return; }
                const covs = coverageRepository.findByInsuranceId(insId);
                coverageSelect.innerHTML = covs.length === 0
                    ? '<option value="">-- No hay coberturas --</option>'
                    : `<option value="">-- Seleccione --</option>` + covs.map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
            });

            coverageSelect.addEventListener('change', () => {
                const covId = coverageSelect.value;
                if (!covId) { covMontoInfo.value = ''; return; }
                const cov = coverageRepository.getById(covId);
                if (cov) covMontoInfo.value = cov.monto != null ? formatMoney(cov.monto) : '0.00';
            });

            monedaSelect.addEventListener('change', () => {
                tcRow.style.display = monedaSelect.value === 'USD' ? '' : 'none';
                if (monedaSelect.value === 'PEN') { tcInput.value = ''; equivInput.value = ''; }
                updateEquiv();
            });
            montoInput.addEventListener('input', updateEquiv);
            tcInput.addEventListener('input', updateEquiv);
            updateEquiv();

            // Evidence
            overlay.querySelector('#modal-claim-evidence').addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = () => { selectedDetailEvidenceDataUrl = reader.result; };
                    reader.readAsDataURL(file);
                } else {
                    selectedDetailEvidenceDataUrl = null;
                }
            });
        },
        onSubmit: (form) => {
            clearModalErrors();
            const coverageId = form.querySelector('#modal-claim-coverage').value;
            const montoStr = form.querySelector('#modal-claim-monto').value;
            const monto = montoStr ? parseFloat(montoStr) : '';
            const moneda = form.querySelector('#modal-claim-moneda').value;
            const tcStr = form.querySelector('#modal-claim-tc').value;
            const tipoCambio = tcStr ? parseFloat(tcStr) : null;

            let result;
            if (editing) {
                result = updateClaimDetail(detailId, coverageId, monto, moneda, tipoCambio, selectedDetailEvidenceDataUrl);
            } else {
                result = addClaimDetail(claimId, coverageId, monto, moneda, tipoCambio, selectedDetailEvidenceDataUrl);
            }

            if (result.success) {
                closeFormModal();
                refreshDetailList(container, claimId);
                updateClaimInfo(container, claimId);
            } else {
                showModalFieldErrors(result.errors);
            }
        }
    });
}

function getCovMontoText(coberturaId) {
    const cov = coverageRepository.getById(coberturaId);
    return cov && cov.monto != null ? formatMoney(cov.monto) : '';
}

function updateClaimInfo(container, claimId) {
    const claim = claimRepository.getById(claimId);
    const bank = claim ? bankRepository.getById(claim.bancoId) : null;
    const incident = claim ? incidentRepository.getById(claim.siniestroId) : null;
    const client = incident ? clientRepository.getById(incident.clienteId) : null;
    const clientName = client ? `${esc(client.nombreCompleto)} ${esc(client.apellidosCompletos)}` : 'N/A';
    const details = claimDetailRepository.findByClaimId(claimId);

    container.querySelector('#claim-info').innerHTML = `<div class="alert alert-info">
        <div><strong>Cliente:</strong> ${clientName}</div>
        <div><strong>Banco:</strong> ${bank ? esc(bank.nombre) : 'N/A'}</div>
        <div><strong>Fecha:</strong> ${claim ? formatDate(claim.fecha) : 'N/A'}</div>
        <div><strong>Estado:</strong> ${claim ? esc(claim.estado) : 'N/A'}</div>
        <div><strong>Monto Total (Soles):</strong> S/ ${formatMoney(claim?.montoTotal)}</div>
        <div><strong>Coberturas registradas:</strong> ${details.length}</div>
    </div>`;
}

function refreshDetailList(container, claimId) {
    const listContent = container.querySelector('#claim-detail-list-content');
    const totalDiv = container.querySelector('#claim-detail-total');
    const details = claimDetailRepository.findByClaimId(claimId);
    const claim = claimRepository.getById(claimId);

    if (details.length === 0) {
        listContent.innerHTML = '<div class="empty-state">No hay coberturas reclamadas aún.</div>';
        totalDiv.style.display = 'none';
        return;
    }

    const rows = details.map(d => {
        const cov = coverageRepository.getById(d.coberturaId);
        const covName = cov ? esc(cov.nombre) : 'Desconocida';
        const covMonto = cov && cov.monto != null ? formatMoney(cov.monto) : '-';
        const mon = d.moneda || 'PEN';
        const tc = mon === 'USD' && d.tipoCambio ? Number(d.tipoCambio).toFixed(3) : '-';
        const montoSoles = d.montoSoles ? formatMoney(d.montoSoles) : formatMoney(d.monto);
        const evidenciaBtn = d.evidencia
            ? `<button type="button" class="btn-icon view-evidence-btn" title="Ver evidencia" data-file="${esc(d.evidencia)}">📎</button>`
            : '-';
        return `
            <tr>
                <td>${covName}</td>
                <td>${covMonto}</td>
                <td>${formatMoney(d.monto)}</td>
                <td>${mon}</td>
                <td>${tc}</td>
                <td>${montoSoles}</td>
                <td>${evidenciaBtn}</td>
                <td>
                    <button type="button" class="btn-icon primary edit-detail-btn" data-id="${esc(d.id)}" title="Editar">✏️</button>
                    <button type="button" class="btn-icon danger delete-detail-btn" data-id="${esc(d.id)}" title="Eliminar">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');

    listContent.innerHTML = `
        <table class="data-table">
            <thead><tr><th>Cobertura</th><th>Mto. Cobertura</th><th>Mto. Reclamado</th><th>Moneda</th><th>T.C.</th><th>Mto. Soles</th><th>Evidencia</th><th>Acciones</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    totalDiv.style.display = '';
    totalDiv.innerHTML = `Monto Total del Reclamo (en Soles): <strong>S/ ${formatMoney(claim?.montoTotal)}</strong>`;

    listContent.querySelectorAll('.edit-detail-btn').forEach(btn => {
        btn.addEventListener('click', () => openDetailModal(container, claimId, btn.getAttribute('data-id')));
    });
    listContent.querySelectorAll('.delete-detail-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (confirm('¿Eliminar esta cobertura del reclamo?')) {
                const result = deleteClaimDetail(btn.getAttribute('data-id'));
                if (result.success) {
                    refreshDetailList(container, claimId);
                    updateClaimInfo(container, claimId);
                }
            }
        });
    });
    listContent.querySelectorAll('.view-evidence-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const file = btn.getAttribute('data-file');
            if (file) openFileViewer(file);
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

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatMoney(value) {
    const num = Number(value) || 0;
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
}
