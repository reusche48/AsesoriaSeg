import { addClaimDetail, updateClaimDetail, deleteClaimDetail, calculateClaimTotal, changeClaimState } from '../services/claimService.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { claimDetailRepository } from '../repositories/claimDetailRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { cardRepository } from '../repositories/cardRepository.js';
import { insuranceRepository } from '../repositories/insuranceRepository.js';
import { coverageRepository } from '../repositories/coverageRepository.js';
import { openFileViewer } from '../app.js';
import { openFormModal, closeFormModal, showModalAlert, clearModalErrors } from './modalHelper.js';
import { initStorage, uploadFile } from '../storage.js';
import { confirmarEliminacion, handleFileUpload } from '../utils.js';

let selectedDetailEvidenceDataUrl = null;

export function renderClaimSection(container) {
    selectedDetailEvidenceDataUrl = null;

    const clients = clientRepository.getAll();
    const preselectClientId = sessionStorage.getItem('reclamos_preselect_client');
    sessionStorage.removeItem('reclamos_preselect_client');

    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">Detalle de Reclamos</h2>
            <button type="button" class="btn btn-secondary" id="refresh-data-btn" style="float:right;">🔄 Refrescar Datos</button>
            <div class="form-row">
                <div class="form-group">
                    <label for="claim-client-select">Cliente *</label>
                    <select id="claim-client-select" aria-label="Seleccionar cliente">
                        <option value="">-- Seleccione un cliente --</option>
                        ${clients.map(cl => {
                            const sel = preselectClientId === cl.id ? 'selected' : '';
                            return `<option value="${esc(cl.id)}" ${sel}>${esc(cl.nombreCompleto)} ${esc(cl.apellidosCompletos)} (${esc(cl.dni)})</option>`;
                        }).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="claim-bank-select">Banco (Reclamo) *</label>
                    <select id="claim-bank-select" aria-label="Seleccionar banco/reclamo">
                        <option value="">-- Primero seleccione un cliente --</option>
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

    setupClientSelector(container);
    setupBankSelector(container);

    if (preselectClientId) {
        const sel = container.querySelector('#claim-client-select');
        if (sel) { sel.value = preselectClientId; sel.dispatchEvent(new Event('change')); }
    }

    container.querySelector('#claim-detail-add-btn').addEventListener('click', () => {
        const claimId = container.querySelector('#claim-bank-select').value;
        if (claimId) openDetailModal(container, claimId, null);
    });

    container.querySelector('#refresh-data-btn').addEventListener('click', async () => {
        const btn = container.querySelector('#refresh-data-btn');
        btn.disabled = true;
        btn.textContent = '⏳ Refrescando...';
        
        try {
            await initStorage();
            alert('Datos actualizados correctamente. La página se recargará.');
            window.location.reload();
        } catch (error) {
            alert('Error al refrescar datos: ' + error.message);
            btn.disabled = false;
            btn.textContent = '🔄 Refrescar Datos';
        }
    });
}

function setupClientSelector(container) {
    const clientSelect = container.querySelector('#claim-client-select');
    clientSelect.addEventListener('change', () => {
        const clientId = clientSelect.value;
        const bankSelect = container.querySelector('#claim-bank-select');
        container.querySelector('#claim-detail-list-section').style.display = 'none';
        container.querySelector('#claim-info').innerHTML = '';

        if (!clientId) {
            bankSelect.innerHTML = '<option value="">-- Primero seleccione un cliente --</option>';
            return;
        }

        // Obtener bancos del cliente (de sus tarjetas)
        const clientCards = cardRepository.findByClientId(clientId);
        const clientBankIds = [...new Set(clientCards.map(c => c.bancoId))];
        
        if (clientBankIds.length === 0) {
            bankSelect.innerHTML = '<option value="">-- El cliente no tiene tarjetas registradas. Presione "Refrescar Datos" --</option>';
            return;
        }

        // Obtener siniestros del cliente
        const clientIncidents = incidentRepository.getAll().filter(inc => inc.clienteId === clientId);

        if (clientIncidents.length === 0) {
            bankSelect.innerHTML = '<option value="">-- El cliente no tiene siniestros registrados --</option>';
            return;
        }

        // Obtener todos los reclamos del cliente
        const clientIncidentIds = clientIncidents.map(inc => inc.id);
        const allClaims = claimRepository.getAll();
        const clientClaims = allClaims.filter(claim => clientIncidentIds.includes(claim.siniestroId));
        
        // Crear opciones: mostrar bancos donde tiene tarjetas
        const options = clientBankIds.map(bankId => {
            const bank = bankRepository.getById(bankId);
            const bankName = bank ? bank.nombre : 'Desconocido';
            
            // Buscar si ya existe un reclamo para este banco
            const existingClaim = clientClaims.find(c => c.bancoId === bankId);
            
            if (existingClaim) {
                const estado = existingClaim.estado ? ` (${existingClaim.estado})` : '';
                return `<option value="${esc(existingClaim.id)}" data-bank-id="${esc(bankId)}" data-exists="true">${esc(bankName)}${estado}</option>`;
            } else {
                return `<option value="" data-bank-id="${esc(bankId)}" data-exists="false">${esc(bankName)} (Nuevo)</option>`;
            }
        }).join('');

        bankSelect.innerHTML = `<option value="">-- Seleccione un banco --</option>` + options;

        // Si solo tiene un banco, seleccionarlo automáticamente
        if (clientBankIds.length === 1) {
            bankSelect.selectedIndex = 1;
            bankSelect.dispatchEvent(new Event('change'));
        }
    });
}

function setupBankSelector(container) {
    const bankSelect = container.querySelector('#claim-bank-select');
    bankSelect.addEventListener('change', async () => {
        const selectedOption = bankSelect.options[bankSelect.selectedIndex];
        const claimId = bankSelect.value;
        const bankId = selectedOption.getAttribute('data-bank-id');
        const exists = selectedOption.getAttribute('data-exists') === 'true';
        
        if (!bankId) {
            container.querySelector('#claim-detail-list-section').style.display = 'none';
            container.querySelector('#claim-info').innerHTML = '';
            return;
        }

        const clientId = container.querySelector('#claim-client-select').value;

        // Si no existe reclamo, crear uno automáticamente
        if (!exists) {
            // Buscar el primer siniestro del cliente
            const clientIncidents = incidentRepository.getAll().filter(inc => inc.clienteId === clientId);
            if (clientIncidents.length === 0) {
                alert('El cliente no tiene siniestros registrados. Debe crear un siniestro primero.');
                bankSelect.value = '';
                return;
            }

            const incident = clientIncidents[0]; // Usar el primer siniestro
            const today = new Date().toISOString().split('T')[0];

            // Crear reclamo automáticamente
            const { createClaim } = await import('../services/claimService.js');
            const result = createClaim(incident.id, bankId, today, null, null);
            
            if (!result.success) {
                alert('Error al crear reclamo: ' + result.errors.map(e => e.message).join(', '));
                bankSelect.value = '';
                return;
            }

            // Actualizar el select con el nuevo reclamo
            selectedOption.value = result.claim.id;
            selectedOption.setAttribute('data-exists', 'true');
            selectedOption.textContent = selectedOption.textContent.replace(' (Nuevo)', ' (Pendiente)');
            bankSelect.value = result.claim.id;

            updateClaimInfo(container, result.claim.id);
        } else {
            updateClaimInfo(container, claimId);
        }

        container.querySelector('#claim-detail-list-section').style.display = '';
        refreshDetailList(container, bankSelect.value);
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
                    handleFileUpload(overlay.querySelector('#modal-claim-evidence'), url => { selectedDetailEvidenceDataUrl = url; }, uploadFile);
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

const STATE_COLORS = { 'Pendiente': '#e65100', 'En Proceso': '#1565c0', 'Culminado': '#2e7d32' };
const STATE_NEXT_LABEL = { 'Pendiente': '▶ Iniciar proceso', 'En Proceso': '✅ Marcar como Culminado' };

function updateClaimInfo(container, claimId) {
    const claim = claimRepository.getById(claimId);
    const bank = claim ? bankRepository.getById(claim.bancoId) : null;
    const incident = claim ? incidentRepository.getById(claim.siniestroId) : null;
    const client = incident ? clientRepository.getById(incident.clienteId) : null;
    const clientName = client ? `${esc(client.nombreCompleto)} ${esc(client.apellidosCompletos)}` : 'N/A';
    const details = claimDetailRepository.findByClaimId(claimId);
    const estado = claim?.estado || 'Pendiente';
    const stateColor = STATE_COLORS[estado] || '#333';
    const nextLabel = STATE_NEXT_LABEL[estado];

    const advanceBtn = nextLabel
        ? `<button type="button" class="btn btn-primary" id="claim-advance-state-btn" style="margin-top:0.5rem;">${nextLabel}</button>`
        : `<span style="color:${stateColor};font-weight:700;">Reclamo culminado</span>`;

    container.querySelector('#claim-info').innerHTML = `<div class="alert alert-info">
        <div><strong>Cliente:</strong> ${clientName}</div>
        <div><strong>Banco:</strong> ${bank ? esc(bank.nombre) : 'N/A'}</div>
        <div><strong>Fecha:</strong> ${claim ? formatDate(claim.fecha) : 'N/A'}</div>
        <div><strong>Estado:</strong> <span style="color:${stateColor};font-weight:700;">${esc(estado)}</span></div>
        <div><strong>Monto Total (Soles):</strong> S/ ${formatMoney(claim?.montoTotal)}</div>
        <div><strong>Coberturas registradas:</strong> ${details.length}</div>
        <div>${advanceBtn}</div>
    </div>`;

    const advBtn = container.querySelector('#claim-advance-state-btn');
    if (advBtn) {
        advBtn.addEventListener('click', () => {
            const obs = estado === 'Pendiente'
                ? 'Reclamo iniciado — documentación en proceso.'
                : 'Reclamo culminado — indemnización procesada.';
            const result = changeClaimState(claimId, obs);
            if (result.success) {
                updateClaimInfo(container, claimId);
            } else {
                alert(result.errors?.[0]?.message || 'Error al cambiar estado.');
            }
        });
    }
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
        btn.addEventListener('click', async () => {
            if (await confirmarEliminacion('¿Eliminar esta cobertura del reclamo?')) {
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
