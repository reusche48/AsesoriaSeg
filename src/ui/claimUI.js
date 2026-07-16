import { addClaimDetail, updateClaimDetail, deleteClaimDetail, calculateClaimTotal, changeClaimState } from '../services/claimService.js';
import { deleteClaim } from '../services/incidentService.js';
import { isAdmin } from '../auth.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { claimDetailRepository } from '../repositories/claimDetailRepository.js';
import { claimEventRepository } from '../repositories/claimEventRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { insuranceRepository } from '../repositories/insuranceRepository.js';
import { coverageRepository } from '../repositories/coverageRepository.js';
import { openFileViewer } from '../app.js';
import { openFormModal, closeFormModal, showModalAlert, clearModalErrors } from './modalHelper.js';
import { uploadFile } from '../storage.js';
import { confirmarEliminacion, handleFileUpload } from '../utils.js';
import { getActiveClientId, setActiveClient } from '../state/clientContext.js';
import { evidenciasDeBancoCliente, TIPOS_EVIDENCIA, getAllVueltas, bancosDeVuelta } from '../services/vueltaService.js';

let selectedDetailEvidenceDataUrl = null;

export function renderClaimSection(container) {
    selectedDetailEvidenceDataUrl = null;

    const clients = clientRepository.getAll();
    // Prioridad: navegación explícita (sessionStorage) > cliente activo global
    const preselectClientId = sessionStorage.getItem('reclamos_preselect_client') || getActiveClientId() || null;
    sessionStorage.removeItem('reclamos_preselect_client');

    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">Detalle de Reclamos</h2>
            <div id="claim-vueltas-box" style="margin:0.75rem 0 1rem;"></div>
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
                    <label for="claim-vuelta-select">Vuelta (siniestro) *</label>
                    <select id="claim-vuelta-select" aria-label="Seleccionar vuelta">
                        <option value="">-- Primero seleccione un cliente --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="claim-bank-select">Banco (Reclamo) *</label>
                    <select id="claim-bank-select" aria-label="Seleccionar banco/reclamo">
                        <option value="">-- Primero seleccione una vuelta --</option>
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
    setupVueltaSelector(container);
    setupBankSelector(container);
    renderVueltaLauncher(container);

    if (preselectClientId) {
        const sel = container.querySelector('#claim-client-select');
        if (sel) { sel.value = preselectClientId; sel.dispatchEvent(new Event('change')); }
    }

    container.querySelector('#claim-detail-add-btn').addEventListener('click', () => {
        const claimId = container.querySelector('#claim-bank-select').value;
        if (claimId) openDetailModal(container, claimId, null);
    });
}

/**
 * Lista de vueltas para reclamar: SIN RECLAMAR primero, luego reclamadas (editables).
 * Cada banco es un chip clicable que abre directo su reclamo (montos + coberturas).
 */
function renderVueltaLauncher(container) {
    const box = container.querySelector('#claim-vueltas-box');
    if (!box) return;
    // Respetar el cliente seleccionado en el desplegable: si hay uno, solo sus vueltas.
    const selClient = container.querySelector('#claim-client-select')?.value || null;
    const vueltas = getAllVueltas().filter(v =>
        v.estado === 'cerrada' && v.siniestroId && (!selClient || v.clienteId === selClient));
    if (!vueltas.length) { box.innerHTML = ''; return; }

    const claims = claimRepository.getAll();
    const decor = vueltas.map(v => {
        const client = clientRepository.getById(v.clienteId);
        const bancos = bancosDeVuelta(v).map(b => {
            const claim = claims.find(c => c.siniestroId === v.siniestroId && c.bancoId === b.id) || null;
            const nDet = claim ? claimDetailRepository.findByClaimId(claim.id).length : 0;
            return { ...b, nDet };
        });
        return {
            v, bancos,
            clienteNombre: client ? `${client.nombreCompleto} ${client.apellidosCompletos}` : '—',
            sinReclamar: bancos.some(b => b.nDet === 0),
        };
    }).sort((a, b) => ((b.sinReclamar ? 1 : 0) - (a.sinReclamar ? 1 : 0)) || (new Date(b.v.fecha) - new Date(a.v.fecha)));

    const chip = (v, b) => b.nDet === 0
        ? `<button type="button" class="claim-vuelta-banco" data-cliente="${esc(v.clienteId)}" data-vuelta="${esc(v.id)}" data-banco="${esc(b.id)}"
             style="background:#78350f;border:1px solid #b45309;color:#fbbf24;border-radius:8px;padding:4px 12px;font-size:0.8rem;font-weight:700;cursor:pointer;">
             ${esc(b.nombre)} · ⏳ SIN RECLAMAR</button>`
        : `<button type="button" class="claim-vuelta-banco" data-cliente="${esc(v.clienteId)}" data-vuelta="${esc(v.id)}" data-banco="${esc(b.id)}"
             style="background:#064e3b;border:1px solid #065f46;color:#34d399;border-radius:8px;padding:4px 12px;font-size:0.8rem;cursor:pointer;">
             ${esc(b.nombre)} · ✔ ${b.nDet} cobertura(s) <span style="color:#9ca3af;">✏ editar</span></button>`;

    box.innerHTML = `
        <div style="background:#111827;border:1px solid #1f2937;border-radius:10px;overflow:hidden;">
            <div style="padding:0.6rem 0.85rem;background:#160f26;border-bottom:1px solid #1f2937;">
                <strong style="color:#f1f5f9;">🔄 Reclamar por vuelta</strong>
                <span style="color:#6b7280;font-size:0.78rem;"> — toca un banco para asignarle coberturas y montos</span>
            </div>
            ${decor.map(d => `<div style="display:flex;align-items:center;gap:0.6rem;padding:0.55rem 0.85rem;border-top:1px solid #1f2937;flex-wrap:wrap;">
                <div style="flex:1;min-width:180px;">
                    <span style="color:#f1f5f9;">${esc(d.clienteNombre)}</span>
                    <span style="color:#6b7280;font-size:0.8rem;"> · vuelta del ${formatDate(d.v.fecha)}</span>
                </div>
                <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">${d.bancos.map(b => chip(d.v, b)).join('')}</div>
            </div>`).join('')}
        </div>`;

    box.querySelectorAll('.claim-vuelta-banco').forEach(btn => {
        btn.addEventListener('click', () => launchFromVuelta(container, btn.getAttribute('data-cliente'), btn.getAttribute('data-vuelta'), btn.getAttribute('data-banco')));
    });
}

/** Abre el reclamo de un banco disparando los selectores existentes (cliente → vuelta → banco). */
function launchFromVuelta(container, clienteId, vueltaId, bancoId) {
    const cs = container.querySelector('#claim-client-select');
    cs.value = clienteId;
    cs.dispatchEvent(new Event('change'));
    // Fijar la vuelta del chip: sin esto se abriría el reclamo de otra vuelta del mismo banco.
    const vs = container.querySelector('#claim-vuelta-select');
    const vOpt = [...vs.options].find(o => o.value === vueltaId);
    if (!vOpt) { avisoFlotante('⚠️ No se encontró la vuelta de este banco.'); return; }
    vs.selectedIndex = vOpt.index;
    vs.dispatchEvent(new Event('change'));
    const bs = container.querySelector('#claim-bank-select');
    const opt = [...bs.options].find(o => o.getAttribute('data-bank-id') === bancoId);
    if (!opt) {
        avisoFlotante('⚠️ El banco no está disponible en esta vuelta.');
        return;
    }
    bs.selectedIndex = opt.index;
    bs.dispatchEvent(new Event('change'));
    setTimeout(() => container.querySelector('#claim-info')?.scrollIntoView({ behavior: 'smooth' }), 150);
}

/** Aviso no bloqueante (un alert() nativo congelaría la página). */
function avisoFlotante(mensaje) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:1rem;right:1rem;background:#b45309;color:#fff;padding:0.75rem 1rem;border-radius:8px;z-index:99999;font-size:0.9rem;max-width:340px;';
    t.textContent = mensaje;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 6000);
}

function setupClientSelector(container) {
    const clientSelect = container.querySelector('#claim-client-select');
    clientSelect.addEventListener('change', () => {
        const clientId = clientSelect.value;
        const vueltaSelect = container.querySelector('#claim-vuelta-select');
        const bankSelect = container.querySelector('#claim-bank-select');
        container.querySelector('#claim-detail-list-section').style.display = 'none';
        container.querySelector('#claim-info').innerHTML = '';
        bankSelect.innerHTML = '<option value="">-- Primero seleccione una vuelta --</option>';
        renderVueltaLauncher(container); // el bloque "Reclamar por vuelta" respeta el cliente elegido

        if (!clientId) {
            vueltaSelect.innerHTML = '<option value="">-- Primero seleccione un cliente --</option>';
            return;
        }

        // Vueltas reclamables del cliente: cerradas y ya amarradas a su siniestro.
        // "La vuelta ES el siniestro": elegir la vuelta = elegir de qué siniestro se reclama.
        const vueltas = getAllVueltas()
            .filter(v => v.clienteId === clientId && v.estado === 'cerrada' && v.siniestroId)
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        if (vueltas.length === 0) {
            // ¿Tiene una vuelta cerrada SIN denuncia? Entonces el siniestro está esperando la denuncia.
            const vueltaSinDen = getAllVueltas().find(v => v.clienteId === clientId && v.estado === 'cerrada' && !v.denunciaEvidencia);
            if (vueltaSinDen) {
                vueltaSelect.innerHTML = '<option value="">-- Falta subir la denuncia de su vuelta --</option>';
                container.querySelector('#claim-info').innerHTML = `
                    <div style="background:#160f26;border:1px solid #7c3aed;border-radius:8px;padding:0.7rem 0.9rem;font-size:0.88rem;color:#cbd5e1;">
                        📄 Este cliente tiene una <strong>vuelta cerrada sin denuncia</strong> (del ${formatDate(vueltaSinDen.fecha)}).
                        Al subir la denuncia se crearán el <strong>siniestro y los reclamos automáticamente</strong>, y podrás asignarles coberturas aquí.
                        <div style="margin-top:0.5rem;"><button type="button" class="btn btn-primary" id="claim-ir-vuelta" style="padding:0.3rem 0.8rem;font-size:0.82rem;">📄 Ir a La Vuelta a subir la denuncia</button></div>
                    </div>`;
                container.querySelector('#claim-ir-vuelta').addEventListener('click', () => {
                    setActiveClient(clientId);
                    window.location.hash = '#vuelta';
                });
                return;
            }
            vueltaSelect.innerHTML = '<option value="">-- El cliente no tiene vueltas cerradas --</option>';
            return;
        }

        vueltaSelect.innerHTML = '<option value="">-- Seleccione la vuelta --</option>' + vueltas.map(v => {
            const nombres = bancosDeVuelta(v).map(b => b.nombre).join(', ');
            return `<option value="${esc(v.id)}">Vuelta del ${formatDate(v.fecha)}${nombres ? ' — ' + esc(nombres) : ''}</option>`;
        }).join('');

        // Si solo tiene una vuelta, seleccionarla automáticamente (sin fricción).
        if (vueltas.length === 1) {
            vueltaSelect.selectedIndex = 1;
            vueltaSelect.dispatchEvent(new Event('change'));
        }
    });
}

/** Al elegir la vuelta se cargan SUS bancos y se resuelven los reclamos de ESE siniestro. */
function setupVueltaSelector(container) {
    const vueltaSelect = container.querySelector('#claim-vuelta-select');
    vueltaSelect.addEventListener('change', () => {
        const bankSelect = container.querySelector('#claim-bank-select');
        container.querySelector('#claim-detail-list-section').style.display = 'none';
        container.querySelector('#claim-info').innerHTML = '';

        const vuelta = getAllVueltas().find(v => v.id === vueltaSelect.value);
        if (!vuelta) {
            bankSelect.innerHTML = '<option value="">-- Primero seleccione una vuelta --</option>';
            return;
        }

        const bancos = bancosDeVuelta(vuelta);
        if (bancos.length === 0) {
            bankSelect.innerHTML = '<option value="">-- Esta vuelta no tiene bancos --</option>';
            return;
        }

        // Reclamos SOLO del siniestro de esta vuelta (antes se tomaba el primero del cliente).
        const claimsDeVuelta = claimRepository.getAll().filter(c => c.siniestroId === vuelta.siniestroId);
        const options = bancos.map(b => {
            const existingClaim = claimsDeVuelta.find(c => c.bancoId === b.id);
            if (existingClaim) {
                const estado = existingClaim.estado ? ` (${existingClaim.estado})` : '';
                return `<option value="${esc(existingClaim.id)}" data-bank-id="${esc(b.id)}" data-exists="true">${esc(b.nombre)}${estado}</option>`;
            }
            return `<option value="" data-bank-id="${esc(b.id)}" data-exists="false">${esc(b.nombre)} (Nuevo)</option>`;
        }).join('');

        bankSelect.innerHTML = '<option value="">-- Seleccione un banco --</option>' + options;

        // Si la vuelta tiene un solo banco, seleccionarlo automáticamente.
        if (bancos.length === 1) {
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

        // Si no existe reclamo, crear uno automáticamente
        if (!exists) {
            // El siniestro sale de la VUELTA elegida (antes se usaba el primero del
            // cliente, lo que colgaba el reclamo de la vuelta equivocada).
            const vueltaSelect = container.querySelector('#claim-vuelta-select');
            const vuelta = getAllVueltas().find(v => v.id === vueltaSelect.value);
            if (!vuelta || !vuelta.siniestroId) {
                alert('Seleccione la vuelta del reclamo.');
                bankSelect.value = '';
                return;
            }

            const today = new Date().toISOString().split('T')[0];

            // Crear reclamo automáticamente
            const { createClaim } = await import('../services/claimService.js');
            const result = createClaim(vuelta.siniestroId, bankId, today, null, null);
            
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
            <div class="form-group" data-field="montoSiniestrado">
                <label>Monto siniestrado (lo robado) *</label>
                <input type="number" id="modal-claim-monto-sin" min="0.01" step="0.01" required placeholder="Ej: 4500" value="${editing && editing.montoSiniestrado != null ? editing.montoSiniestrado : ''}">
                <div class="error-message" data-error="montoSiniestrado"></div>
            </div>
            <div class="form-group" data-field="monto">
                <label>Monto a reclamar (automático)</label>
                <input type="number" id="modal-claim-monto" readonly style="background:#0b1220;color:#34d399;font-weight:700;" placeholder="—" value="${editing ? editing.monto : ''}">
                <div style="font-size:0.75rem;color:#9ca3af;margin-top:2px;">El menor entre lo siniestrado y lo que cubre la póliza.</div>
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
        ${(() => {
            // Evidencias de la vuelta del banco: seleccionables por checkbox
            const incident = claim ? incidentRepository.getById(claim.siniestroId) : null;
            const evVuelta = (incident && claim) ? evidenciasDeBancoCliente(incident.clienteId, claim.bancoId).filter(e => e.evidencia) : [];
            if (!evVuelta.length) {
                // Si el banco SÍ está en una vuelta del cliente pero sin evidencias, avisar
                // (antes la sección se ocultaba y parecía que la opción no existía).
                const enVuelta = incident ? getAllVueltas().some(v => v.clienteId === incident.clienteId && String(v.bancoIds || '').includes(claim.bancoId)) : false;
                return enVuelta ? `<div class="form-group"><label>Evidencias de la vuelta</label>
                    <div style="background:#0b1220;border:1px dashed #374151;border-radius:8px;padding:0.5rem 0.7rem;font-size:0.82rem;color:#9ca3af;">
                        La vuelta de este cliente no tiene evidencias registradas para <strong>este banco</strong>.
                        Puedes reabrir la vuelta para agregarlas, o adjuntar un archivo aquí abajo.
                    </div></div>` : '';
            }
            const tipoLbl = Object.fromEntries(TIPOS_EVIDENCIA.map(t => [t.value, t.label]));
            const currentUrls = (editing?.evidencia || '').split(',').filter(Boolean);
            return `<div class="form-group"><label>Evidencias de la vuelta (marca las que respaldan esta cobertura)</label>
                <div style="display:flex;flex-direction:column;gap:0.35rem;background:#0b1220;border:1px solid #1f2937;border-radius:8px;padding:0.5rem 0.7rem;">
                    ${evVuelta.map(e => `<label style="display:flex;align-items:center;gap:0.5rem;font-weight:normal;font-size:0.85rem;cursor:pointer;">
                        <input type="checkbox" class="claim-ev-vuelta" value="${esc(e.evidencia)}" ${currentUrls.includes(e.evidencia) ? 'checked' : ''} style="width:auto;margin:0;flex:0 0 auto;">
                        ${miniaturaEv(e.evidencia)}
                        <span style="flex:1;min-width:0;">${esc(tipoLbl[e.tipo] || e.tipo)}${e.concepto ? ' — ' + esc(e.concepto) : ''}${e.fecha ? ' · ' + e.fecha : ''}</span>
                        <a href="#" class="claim-ev-ver" data-file="${esc(e.evidencia)}" style="color:#7c3aed;">ver</a>
                    </label>`).join('')}
                </div></div>`;
        })()}
        <div class="form-row">
            <div class="form-group">
                <label>Adjuntar archivo adicional (opcional)</label>
                <input type="file" id="modal-claim-evidence">
                <div id="modal-claim-ev-status" style="font-size:0.82rem;margin-top:4px;color:#9ca3af;min-height:1.2em;"></div>
            </div>
        </div>
    `;

    // El adjunto "extra" (subido a mano) = URLs del detalle que NO vienen de la vuelta
    {
        const incident = claim ? incidentRepository.getById(claim.siniestroId) : null;
        const vueltaUrls = new Set((incident && claim) ? evidenciasDeBancoCliente(incident.clienteId, claim.bancoId).map(e => e.evidencia).filter(Boolean) : []);
        const currentUrls = (editing?.evidencia || '').split(',').filter(Boolean);
        selectedDetailEvidenceDataUrl = currentUrls.find(u => !vueltaUrls.has(u)) || null;
    }

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

            const montoSinInput = overlay.querySelector('#modal-claim-monto-sin');

            const updateEquiv = () => {
                const monto = parseFloat(montoInput.value) || 0;
                const tc = parseFloat(tcInput.value) || 0;
                equivInput.value = (monedaSelect.value === 'USD' && monto > 0 && tc > 0) ? formatMoney(monto * tc) + ' PEN' : '';
            };

            // Monto a reclamar = el MENOR entre lo siniestrado y lo que cubre la póliza.
            // Ej: cubre 3,000 y robaron 4,500 → 3,000; robaron 2,000 → 2,000.
            const recalcReclamo = () => {
                const sin = parseFloat(montoSinInput.value) || 0;
                const cov = coverageSelect.value ? coverageRepository.getById(coverageSelect.value) : null;
                const tope = cov && cov.monto != null ? Number(cov.monto) : 0;
                montoInput.value = sin > 0 ? (tope > 0 ? Math.min(sin, tope) : sin).toFixed(2) : '';
                updateEquiv();
            };

            insuranceSelect.addEventListener('change', () => {
                const insId = insuranceSelect.value;
                covMontoInfo.value = '';
                if (!insId) { coverageSelect.innerHTML = '<option value="">-- Primero seleccione un seguro --</option>'; recalcReclamo(); return; }
                const covs = coverageRepository.findByInsuranceId(insId);
                coverageSelect.innerHTML = covs.length === 0
                    ? '<option value="">-- No hay coberturas --</option>'
                    : `<option value="">-- Seleccione --</option>` + covs.map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
                recalcReclamo();
            });

            coverageSelect.addEventListener('change', () => {
                const covId = coverageSelect.value;
                if (!covId) { covMontoInfo.value = ''; recalcReclamo(); return; }
                const cov = coverageRepository.getById(covId);
                if (cov) covMontoInfo.value = cov.monto != null ? formatMoney(cov.monto) : '0.00';
                recalcReclamo();
            });

            montoSinInput.addEventListener('input', recalcReclamo);

            monedaSelect.addEventListener('change', () => {
                tcRow.style.display = monedaSelect.value === 'USD' ? '' : 'none';
                if (monedaSelect.value === 'PEN') { tcInput.value = ''; equivInput.value = ''; }
                updateEquiv();
            });
            montoInput.addEventListener('input', updateEquiv);
            tcInput.addEventListener('input', updateEquiv);
            updateEquiv();

            // Evidencias de la vuelta: link "ver"
            overlay.querySelectorAll('.claim-ev-ver').forEach(a => {
                a.addEventListener('click', (e) => { e.preventDefault(); openFileViewer(a.getAttribute('data-file')); });
            });

            // Adjunto adicional (subido a mano)
            const evStatus = overlay.querySelector('#modal-claim-ev-status');
            const renderEvStatus = () => {
                if (!evStatus) return;
                evStatus.innerHTML = selectedDetailEvidenceDataUrl
                    ? `<span style="color:#10b981;">✓ Archivo adjunto</span> <a href="#" id="claim-ev-quitar" style="color:#ef4444;margin-left:8px;">Quitar</a>`
                    : '';
                evStatus.querySelector('#claim-ev-quitar')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    selectedDetailEvidenceDataUrl = null;
                    overlay.querySelector('#modal-claim-evidence').value = '';
                    renderEvStatus();
                });
            };
            renderEvStatus();
            overlay.querySelector('#modal-claim-evidence').addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    handleFileUpload(overlay.querySelector('#modal-claim-evidence'), url => { selectedDetailEvidenceDataUrl = url; renderEvStatus(); }, uploadFile);
                } else {
                    selectedDetailEvidenceDataUrl = null;
                    renderEvStatus();
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
            const msStr = form.querySelector('#modal-claim-monto-sin')?.value;
            const montoSiniestrado = msStr ? parseFloat(msStr) : null;
            if (!montoSiniestrado || montoSiniestrado <= 0) {
                showModalFieldErrors([{ field: 'montoSiniestrado', message: 'Ingrese el monto siniestrado (lo robado).' }]);
                return;
            }
            // Evidencias = las marcadas de la vuelta + el archivo adjunto (CSV)
            const marcadas = [...form.querySelectorAll('.claim-ev-vuelta:checked')].map(c => c.value);
            const evidenciaFinal = [...marcadas, selectedDetailEvidenceDataUrl].filter(Boolean).join(',') || null;

            let result;
            if (editing) {
                result = updateClaimDetail(detailId, coverageId, monto, moneda, tipoCambio, evidenciaFinal, montoSiniestrado);
            } else {
                result = addClaimDetail(claimId, coverageId, monto, moneda, tipoCambio, evidenciaFinal, montoSiniestrado);
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

    // Eliminar reclamo (solo admin, y solo si NO tiene eventos; primero hay que borrarlos).
    const nEventos = claimEventRepository.findByClaimId(claimId).length;
    const deleteBtn = isAdmin()
        ? (nEventos > 0
            ? `<div style="margin-top:0.5rem;color:#9ca3af;font-size:0.8rem;">Para eliminar este reclamo, primero elimina sus ${nEventos} evento(s) en la sección Eventos.</div>`
            : `<button type="button" id="claim-delete-btn" style="margin-top:0.5rem;background:#7f1d1d;color:#fff;border:none;border-radius:6px;padding:0.4rem 0.8rem;cursor:pointer;">🗑️ Eliminar reclamo</button>`)
        : '';

    // Evidencias registradas en la vuelta para este banco (consulta rápida al poner montos)
    const evVuelta = (client && claim) ? evidenciasDeBancoCliente(client.id, claim.bancoId) : [];
    const tipoLbl = Object.fromEntries(TIPOS_EVIDENCIA.map(t => [t.value, t.label]));
    const evVueltaHtml = evVuelta.length ? `
        <div style="margin-top:0.6rem;border-top:1px dashed #375a7f;padding-top:0.5rem;">
            <strong>📎 Evidencias de la vuelta — ${bank ? esc(bank.nombre) : ''} (${evVuelta.length}):</strong>
            ${evVuelta.map(e => `<div style="font-size:0.85rem;padding:2px 0;">
                • ${esc(tipoLbl[e.tipo] || e.tipo)}${e.concepto ? ' — ' + esc(e.concepto) : ''}${e.fecha ? ' · ' + formatDate(e.fecha) : ''}${e.hora ? ' ' + esc(e.hora) : ''}
                ${e.evidencia ? ` <a href="#" class="claim-vu-ev" data-file="${esc(e.evidencia)}" style="color:#7c3aed;font-weight:600;">ver</a>` : ' <span style="color:#9ca3af;">(sin archivo)</span>'}
            </div>`).join('')}
        </div>` : '';

    container.querySelector('#claim-info').innerHTML = `<div class="alert alert-info">
        <div><strong>Cliente:</strong> ${clientName}</div>
        <div><strong>Banco:</strong> ${bank ? esc(bank.nombre) : 'N/A'}</div>
        <div><strong>Fecha:</strong> ${claim ? formatDate(claim.fecha) : 'N/A'}</div>
        <div><strong>Estado:</strong> <span style="color:${stateColor};font-weight:700;">${esc(estado)}</span></div>
        <div><strong>Monto Total (Soles):</strong> S/ ${formatMoney(claim?.montoTotal)}</div>
        <div><strong>Coberturas registradas:</strong> ${details.length}</div>
        ${evVueltaHtml}
        <div>${advanceBtn}</div>
        <div>${deleteBtn}</div>
    </div>`;

    container.querySelectorAll('.claim-vu-ev').forEach(a => {
        a.addEventListener('click', (e) => { e.preventDefault(); openFileViewer(a.getAttribute('data-file')); });
    });

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

    const delBtn = container.querySelector('#claim-delete-btn');
    if (delBtn) {
        delBtn.addEventListener('click', async () => {
            if (!await confirmarEliminacion(
                '¿Eliminar este reclamo? Se borrarán sus coberturas y pasos. Esta acción no se puede deshacer.',
                { titulo: '🗑️ Eliminar reclamo', confirmLabel: 'Eliminar' }
            )) return;
            const r = deleteClaim(claimId);
            if (r.success) renderClaimSection(container);
            else alert(r.message || 'No se pudo eliminar el reclamo.');
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
        const evUrls = (d.evidencia || '').split(',').filter(Boolean);
        const evidenciaBtn = evUrls.length
            ? evUrls.map((u, i) => `<button type="button" class="btn-icon view-evidence-btn" title="Ver evidencia ${i + 1}" data-file="${esc(u)}">📎</button>`).join('')
            : '-';
        return `
            <tr>
                <td>${covName}</td>
                <td>${covMonto}</td>
                <td style="color:#f59e0b;">${d.montoSiniestrado != null && d.montoSiniestrado !== '' ? formatMoney(d.montoSiniestrado) : '-'}</td>
                <td>${formatMoney(d.monto)}</td>
                <td>${mon}</td>
                <td>${tc}</td>
                <td>${montoSoles}</td>
                <td style="white-space:nowrap;">${evidenciaBtn}</td>
                <td>
                    <button type="button" class="btn-icon primary edit-detail-btn" data-id="${esc(d.id)}" title="Editar">✏️</button>
                    <button type="button" class="btn-icon danger delete-detail-btn" data-id="${esc(d.id)}" title="Eliminar">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');

    listContent.innerHTML = `
        <table class="data-table">
            <thead><tr><th>Cobertura</th><th>Mto. Cobertura</th><th>Mto. Siniestrado</th><th>Mto. a Reclamar</th><th>Moneda</th><th>T.C.</th><th>Mto. Soles</th><th>Evidencias</th><th>Acciones</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    totalDiv.style.display = '';
    totalDiv.innerHTML = `Monto Total del Reclamo (en Soles): <strong>S/ ${formatMoney(claim?.montoTotal)}</strong>`;
    renderVueltaLauncher(container); // actualizar chips SIN RECLAMAR / reclamada

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

/** Miniatura de una evidencia: imagen real si es foto, ícono 📄 si es PDF/otro. */
function miniaturaEv(url) {
    const base = 'width:44px;height:44px;border-radius:6px;border:1px solid #334155;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;';
    const limpio = String(url || '').split('?')[0].split('#')[0].toLowerCase();
    const esImg = /^data:image\//i.test(url || '') || /\.(jpg|jpeg|png|webp|gif)$/i.test(limpio);
    if (!url || !esImg) return `<span style="${base}background:#1f2937;color:#e2e8f0;">📄</span>`;
    // Si la imagen falla al cargar, el envoltorio cae al ícono 📄 (sin comillas dobles en onerror).
    return `<span style="${base}background:#fff;"><img src="${esc(url)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.background='#1f2937';this.replaceWith(document.createTextNode('📄'))"></span>`;
}

function formatMoney(value) {
    const num = Number(value) || 0;
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
}
