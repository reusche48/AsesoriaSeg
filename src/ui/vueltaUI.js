import { getActiveClient, setActiveClient } from '../state/clientContext.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import {
    getOpenVueltas, getVueltas, getAllOpenVueltas, getRecentVueltas, eligibleBanks, canStartVuelta, startVuelta, updateVuelta,
    getEvidencias, addEvidencia, updateEvidencia, deleteEvidencia,
    getBlockingCodes, addBlockingCode, updateBlockingCode, deleteBlockingCode,
    canCloseVuelta, closeVuelta, reopenVuelta, ensureSiniestroForVuelta, bancosDeVuelta, tarjetasDeBanco, TIPOS_EVIDENCIA,
    deleteVuelta, puedeEliminarVuelta, removeBancoFromVuelta, addBancoToVuelta,
} from '../services/vueltaService.js';
import { isAdmin } from '../auth.js';
import { uploadFile, loadCollections } from '../storage.js';
import { startAutoRefresh, stopAutoRefresh } from './autoRefresh.js';
import { openFileViewer } from '../app.js';
import { openFormModal, closeFormModal, showModalAlert } from './modalHelper.js';
import { confirmarEliminacion } from '../utils.js';

const TIPO_LABEL = { retiro_cajero: 'Retiro cajero', compra: 'Compra', transferencia: 'Transferencia', otro: 'Otro' };

// ── Auto-refresco (varios celulares sobre la misma vuelta) ──
/** Huella de los datos de las vueltas del cliente (para detectar cambios de otros dispositivos). */
function vueltaSignature(clientId) {
    const parts = [];
    for (const v of getVueltas(clientId)) {
        parts.push(`${v.id}:${v.estado}:${v.bancoIds || ''}:${v.denunciaEvidencia || ''}:${v.denunciaFecha || ''}`);
        getEvidencias(v.id).forEach(e => parts.push('e' + e.id + (e.evidencia || '')));
        getBlockingCodes(v.id).forEach(c => parts.push('c' + c.id));
    }
    return parts.sort().join('|');
}

// Entrada (router / botón Actualizar): trae datos frescos del servidor para que
// varias personas/celulares vean la misma vuelta en vivo, y luego pinta.
export async function renderVueltaSection(container) {
    container.innerHTML = '<div class="empty-state" style="padding:1.5rem;">Actualizando…</div>';
    try { await loadCollections(['vueltas', 'vueltaEvidencias', 'blockingCodes', 'payments']); } catch (e) { /* ignore */ }
    paint(container);
}

// Re-pintado interno (tras una acción): usa el caché ya actualizado, sin recargar.
function paint(container) {
    stopAutoRefresh();
    const active = getActiveClient();
    if (!active) { renderPicker(container); return; }
    renderForClient(container, active);
}

function renderPicker(container) {
    const clients = clientRepository.getAll()
        .slice()
        .sort((a, b) => `${a.nombreCompleto} ${a.apellidosCompletos}`.localeCompare(`${b.nombreCompleto} ${b.apellidosCompletos}`));

    const abiertas = getAllOpenVueltas();
    const openIds = new Set(abiertas.map(v => v.id));
    const recientes = getRecentVueltas(10).filter(v => !openIds.has(v.id));

    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">🔄 La Vuelta</h2>
            <p style="color:#9ca3af;">Selecciona un cliente para gestionar sus vueltas (evidencias por banco, códigos de bloqueo y denuncia).</p>
            <div class="form-group" style="max-width:480px;">
                <label for="vu-client">Cliente</label>
                <input type="text" id="vu-client" autocomplete="off" placeholder="Escribe nombre o DNI para filtrar...">
                <div id="vu-client-list" style="margin-top:0.4rem;max-height:42vh;overflow-y:auto;border:1px solid #1f2937;border-radius:8px;background:#0b1220;"></div>
            </div>
            ${abiertas.length ? `
                <h3 style="color:#cbd5e1;font-size:0.95rem;margin:1.25rem 0 0.5rem;">🟢 Vueltas abiertas (${abiertas.length})</h3>
                <div style="border:1px solid #1f2937;border-radius:8px;overflow:hidden;background:#0b1220;">
                    ${abiertas.map(v => vueltaPickRow(v)).join('')}
                </div>` : ''}
            ${recientes.length ? `
                <h3 style="color:#cbd5e1;font-size:0.95rem;margin:1.25rem 0 0.5rem;">🕑 Últimas vueltas</h3>
                <div style="border:1px solid #1f2937;border-radius:8px;overflow:hidden;background:#0b1220;">
                    ${recientes.map(v => vueltaPickRow(v)).join('')}
                </div>` : ''}
        </div>`;

    container.querySelectorAll('.vu-pick-row').forEach(el => {
        el.addEventListener('click', () => { setActiveClient(el.getAttribute('data-client')); paint(container); });
    });

    const input = container.querySelector('#vu-client');
    const list = container.querySelector('#vu-client-list');

    const norm = s => (s ?? '').toString().toLowerCase();
    function renderList(query) {
        const q = norm(query).trim();
        const matches = clients.filter(c => {
            if (!q) return true;
            return norm(`${c.nombreCompleto} ${c.apellidosCompletos} ${c.dni}`).includes(q);
        });
        if (matches.length === 0) {
            list.innerHTML = `<div style="padding:0.75rem;color:#6b7280;">Sin clientes que coincidan.</div>`;
            return;
        }
        list.innerHTML = matches.map(c => `
            <div class="vu-client-item" data-id="${esc(c.id)}" role="button" tabindex="0"
                 style="padding:0.65rem 0.85rem;border-bottom:1px solid #1f2937;cursor:pointer;color:#f1f5f9;">
                <div>${esc(c.nombreCompleto)} ${esc(c.apellidosCompletos)}</div>
                <div style="font-size:0.78rem;color:#9ca3af;">DNI: ${esc(c.dni || '—')}</div>
            </div>`).join('');
        list.querySelectorAll('.vu-client-item').forEach(el => {
            el.addEventListener('click', () => { setActiveClient(el.getAttribute('data-id')); paint(container); });
        });
    }

    input.addEventListener('input', () => renderList(input.value));
    renderList('');
}

/** Fila de vuelta en el selector (sin cliente activo): clic → entra a esa vuelta. */
function vueltaPickRow(v) {
    const cli = clientRepository.getById(v.clienteId);
    const nombre = cli ? `${cli.nombreCompleto} ${cli.apellidosCompletos}` : 'Cliente';
    const bancos = bancosDeVuelta(v).map(b => b.nombre).join(', ') || '—';
    const abierta = v.estado === 'abierta';
    return `<div class="vu-pick-row" data-client="${esc(v.clienteId)}" role="button" tabindex="0"
                 style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;padding:0.6rem 0.85rem;border-bottom:1px solid #1f2937;cursor:pointer;">
        <div>
            <div style="color:#f1f5f9;">${esc(nombre)}</div>
            <div style="font-size:0.78rem;color:#9ca3af;">${formatDate(v.fecha)} · ${esc(bancos)}</div>
        </div>
        <span style="font-size:0.74rem;font-weight:700;white-space:nowrap;color:${abierta ? '#34d399' : '#9ca3af'};">${abierta ? '🟢 Abierta' : 'Cerrada'}</span>
    </div>`;
}

function renderForClient(container, client) {
    const abiertas = getOpenVueltas(client.id);
    const cerradas = getVueltas(client.id).filter(v => v.estado === 'cerrada');
    const chk = canStartVuelta(client.id);
    const elig = eligibleBanks(client.id);

    const iniciarHtml = chk.ok
        ? `<div style="background:#111827;border:1px solid #1f2937;border-radius:8px;padding:0.85rem 1rem;">
                <div style="color:#cbd5e1;margin-bottom:0.5rem;">Bancos al día listos para una vuelta: <strong style="color:#34d399;">${elig.map(b => esc(b.nombre)).join(', ')}</strong></div>
                <button type="button" class="btn btn-primary" id="vu-iniciar">▶ Iniciar vuelta con estos bancos</button>
            </div>`
        : `<div style="background:#111827;border:1px solid #1f2937;border-radius:8px;padding:0.85rem 1rem;color:#9ca3af;">${esc(chk.motivo)}</div>`;

    const abiertasHtml = abiertas.map(v => renderVueltaPanel(v)).join('');
    const cerradasHtml = cerradas.length
        ? `<h3 style="color:#cbd5e1;font-size:0.95rem;margin:1.25rem 0 0.5rem;">Vueltas cerradas</h3>
           <div style="display:flex;flex-direction:column;gap:0.5rem;">${cerradas.map(v => `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;background:#0b1220;border:1px solid ${v.denunciaEvidencia ? '#1f2937' : '#7c3aed'};border-radius:8px;padding:0.6rem 0.85rem;">
                    <span style="color:#9ca3af;font-size:0.85rem;">Vuelta del <strong style="color:#cbd5e1;">${formatDate(v.fecha)}</strong> — ${bancosDeVuelta(v).map(b => esc(b.nombre)).join(', ') || '—'} <span style="color:#6b7280;">(cerrada ${v.fechaCierre ? formatDate(v.fechaCierre) : ''})</span>${v.denunciaEvidencia ? '' : '<br><span style="color:#c084fc;font-weight:700;">📄 Falta la denuncia</span> <span style="color:#6b7280;">— al subirla se crearán el siniestro y los reclamos</span>'}</span>
                    <span style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                        ${v.denunciaEvidencia ? '' : `<button type="button" class="btn btn-primary vu-denuncia-cerrada" data-vuelta="${esc(v.id)}" style="padding:0.3rem 0.7rem;font-size:0.8rem;white-space:nowrap;">📄 Subir denuncia</button>`}
                        <button type="button" class="btn btn-secondary vu-reabrir" data-vuelta="${esc(v.id)}" style="padding:0.3rem 0.7rem;font-size:0.8rem;white-space:nowrap;">✏️ Reabrir para editar</button>
                    </span>
                </div>`).join('')}</div>`
        : '';

    container.innerHTML = `<div class="section">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
            <h2 class="section-title" style="margin:0;">🔄 La Vuelta: ${esc(client.nombreCompleto)} ${esc(client.apellidosCompletos)}</h2>
            <div style="display:flex;gap:0.5rem;">
                <button type="button" class="btn btn-secondary" id="vu-actualizar" title="Traer lo último (si tu compañero cargó algo)">🔄 Actualizar</button>
                <button type="button" class="btn btn-secondary" id="vu-cambiar">Cambiar cliente</button>
            </div>
        </div>
        <h3 style="color:#cbd5e1;font-size:0.95rem;margin:1rem 0 0.5rem;">Nueva vuelta</h3>
        ${iniciarHtml}
        ${abiertas.length ? `<h3 style="color:#cbd5e1;font-size:0.95rem;margin:1.25rem 0 0.5rem;">Vuelta(s) en curso</h3><div style="display:flex;flex-direction:column;gap:1rem;">${abiertasHtml}</div>` : ''}
        ${cerradasHtml}
    </div>`;

    container.querySelector('#vu-actualizar').addEventListener('click', () => renderVueltaSection(container));
    container.querySelector('#vu-cambiar').addEventListener('click', () => { setActiveClient(null); paint(container); });

    container.querySelectorAll('.vu-denuncia-cerrada').forEach(btn => {
        btn.addEventListener('click', () => {
            const vc = cerradas.find(x => x.id === btn.getAttribute('data-vuelta'));
            if (vc) openDenunciaModal(container, vc);
        });
    });

    container.querySelectorAll('.vu-reabrir').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!await confirmarEliminacion(
                '¿Reabrir esta vuelta para editarla? Volverá a estar “en curso” y podrás agregar o quitar evidencias y códigos. Luego deberás cerrarla de nuevo.',
                { titulo: '✏️ Reabrir vuelta', confirmLabel: 'Reabrir', confirmColor: '#7c3aed' }
            )) return;
            const r = reopenVuelta(btn.getAttribute('data-vuelta'));
            if (r.success) paint(container); else alert(r.error);
        });
    });

    container.querySelectorAll('.vu-del-vuelta').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-vuelta');
            const v = getVueltas(client.id).find(x => x.id === id);
            if (!v) return;
            const bancos = bancosDeVuelta(v).map(b => b.nombre).join(', ') || '—';
            if (!await confirmarEliminacion(
                `¿Eliminar la vuelta del ${formatDate(v.fecha)} (${bancos})? Se borrarán sus evidencias y códigos de bloqueo. Esta acción no se puede deshacer.`,
                { titulo: '🗑️ Eliminar vuelta', confirmLabel: 'Eliminar' }
            )) return;
            const r = await deleteVuelta(id);
            if (r.success) paint(container); else alert(r.error);
        });
    });

    const iniBtn = container.querySelector('#vu-iniciar');
    if (iniBtn) iniBtn.addEventListener('click', () => openIniciarModal(container, client.id));

    // Listeners por panel de vuelta abierta
    abiertas.forEach(v => wireVueltaPanel(container, client, v));

    // Auto-refresco mientras se ve la sección (para ver lo que cargan otros dispositivos)
    startAutoRefresh('#vuelta', ['vueltas', 'vueltaEvidencias', 'blockingCodes', 'payments'],
        () => vueltaSignature(client.id), () => paint(container), 6000);
}

function renderVueltaPanel(v) {
    const bancos = bancosDeVuelta(v);
    const evid = getEvidencias(v.id);
    const codes = getBlockingCodes(v.id);
    const codesByBank = new Set(codes.map(c => c.bancoId));
    const cerrarChk = canCloseVuelta(v);
    // Bancos elegibles del cliente (seguro al día y no en otra vuelta) para volver a agregar.
    const addables = eligibleBanks(v.clienteId);

    const bancosHtml = bancos.map(b => {
        const evB = evid.filter(e => e.bancoId === b.id);
        const cdB = codes.filter(c => c.bancoId === b.id);
        const faltaCodigo = !codesByBank.has(b.id);
        const evRows = evB.length ? evB.map(e => `<div style="display:flex;align-items:center;gap:0.55rem;font-size:0.82rem;color:#cbd5e1;padding:3px 0;">
            ${miniatura(e.evidencia)}
            <span style="flex:1;min-width:0;">${esc(TIPO_LABEL[e.tipo] || e.tipo)}${e.concepto ? ' — ' + esc(e.concepto) : ''} ${e.fecha ? '· ' + formatDate(e.fecha) : ''} ${e.hora ? esc(e.hora) : ''}</span>
            <span style="white-space:nowrap;">${e.evidencia ? `<a href="#" class="vu-ver" data-file="${esc(e.evidencia)}" style="color:#7c3aed;">ver</a> ` : ''}<a href="#" class="vu-edit-ev" data-id="${esc(e.id)}" style="color:#60a5fa;">✏️</a> <a href="#" class="vu-del-ev" data-id="${esc(e.id)}" style="color:#ef4444;">✕</a></span>
        </div>`).join('') : '<div style="color:#6b7280;font-size:0.8rem;">Sin evidencias</div>';
        const cdRows = cdB.length ? cdB.map(c => `<div style="display:flex;align-items:center;gap:0.55rem;font-size:0.82rem;color:#cbd5e1;padding:3px 0;">
            ${c.evidencia ? miniatura(c.evidencia) : '<span style="width:38px;flex:0 0 auto;text-align:center;">🔒</span>'}
            <span style="flex:1;min-width:0;"><strong>${esc(c.codigo)}</strong>${c.observacion ? ' — ' + esc(c.observacion) : ''}${c.fecha ? ' · ' + formatDate(c.fecha) : ''}${c.hora ? ' ' + esc(c.hora) : ''}</span>
            <span style="white-space:nowrap;">${c.evidencia ? `<a href="#" class="vu-ver" data-file="${esc(c.evidencia)}" style="color:#7c3aed;">ver</a> ` : ''}<a href="#" class="vu-edit-cd" data-id="${esc(c.id)}" style="color:#60a5fa;">✏️</a> <a href="#" class="vu-del-cd" data-id="${esc(c.id)}" style="color:#ef4444;">✕</a></span>
        </div>`).join('') : `<div style="color:${faltaCodigo ? '#ef4444' : '#6b7280'};font-size:0.8rem;">${faltaCodigo ? '⚠️ Falta código de bloqueo' : 'Sin códigos'}</div>`;

        const bancoVacio = evB.length === 0 && cdB.length === 0;
        return `<div style="background:#0b1220;border:1px solid ${faltaCodigo ? '#7f1d1d' : '#1f2937'};border-radius:8px;padding:0.7rem 0.85rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
                <strong style="color:#f1f5f9;">🏦 ${esc(b.nombre)}</strong>
                ${bancoVacio ? `<button type="button" class="vu-del-banco" data-vuelta="${esc(v.id)}" data-banco="${esc(b.id)}" title="Quitar este banco de la vuelta" style="padding:2px 8px;font-size:0.72rem;background:#7f1d1d;color:#fff;border:none;border-radius:6px;cursor:pointer;white-space:nowrap;">✕ Quitar banco</button>` : ''}
            </div>
            <div style="margin-top:0.4rem;display:flex;justify-content:space-between;align-items:center;">
                <span style="color:#9ca3af;font-size:0.78rem;font-weight:600;">EVIDENCIAS</span>
                <button type="button" class="btn btn-secondary vu-add-ev" data-banco="${esc(b.id)}" style="padding:2px 8px;font-size:0.74rem;">+ Evidencia</button>
            </div>${evRows}
            <div style="margin-top:0.5rem;display:flex;justify-content:space-between;align-items:center;">
                <span style="color:#9ca3af;font-size:0.78rem;font-weight:600;">CÓDIGOS DE BLOQUEO</span>
                <button type="button" class="btn btn-secondary vu-add-cd" data-banco="${esc(b.id)}" style="padding:2px 8px;font-size:0.74rem;">+ Código</button>
            </div>${cdRows}
        </div>`;
    }).join('');

    return `<div class="vu-panel" data-vuelta="${esc(v.id)}" style="background:#111827;border:1px solid #1f2937;border-radius:8px;padding:0.85rem 1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
            <span style="color:#cbd5e1;">Vuelta del <strong>${formatDate(v.fecha)}</strong> — ${bancos.map(b => esc(b.nombre)).join(', ')}</span>
            <span style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                ${(isAdmin() && puedeEliminarVuelta(v)) ? `<button type="button" class="vu-del-vuelta" data-vuelta="${esc(v.id)}" style="padding:0.35rem 0.7rem;font-size:0.8rem;white-space:nowrap;background:#7f1d1d;color:#fff;border:none;border-radius:6px;cursor:pointer;">🗑️ Eliminar</button>` : ''}
                <button type="button" class="btn btn-primary vu-cerrar" ${cerrarChk.ok ? '' : 'disabled title="' + esc(cerrarChk.motivo) + '"'}>🔒 Cerrar vuelta</button>
            </span>
        </div>
        ${!cerrarChk.ok ? `<div style="color:#f59e0b;font-size:0.8rem;margin:0.3rem 0;">⚠️ ${esc(cerrarChk.motivo)}</div>` : ''}
        <div style="margin-top:0.6rem;background:#0b1220;border:1px solid #1f2937;border-radius:8px;padding:0.5rem 0.75rem;display:flex;justify-content:space-between;align-items:center;">
            <span style="color:#cbd5e1;font-size:0.85rem;">📄 Denuncia: ${v.denunciaFecha ? formatDate(v.denunciaFecha) : 'sin fecha'}${v.denunciaEvidencia ? ' · <a href="#" class="vu-ver-den" style="color:#7c3aed;">ver</a>' : ' · sin evidencia'}</span>
            <button type="button" class="btn btn-secondary vu-denuncia" style="padding:2px 8px;font-size:0.74rem;">Editar</button>
        </div>
        <div style="margin-top:0.6rem;display:flex;flex-direction:column;gap:0.5rem;">${bancos.length ? bancosHtml : '<div style="color:#9ca3af;">Esta vuelta no tiene bancos.</div>'}</div>
        ${addables.length ? `<div style="margin-top:0.6rem;display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;">
            <span style="color:#9ca3af;font-size:0.8rem;">➕ Agregar banco:</span>
            ${addables.map(b => `<button type="button" class="vu-add-banco" data-vuelta="${esc(v.id)}" data-banco="${esc(b.id)}" style="padding:2px 8px;font-size:0.74rem;background:#065f46;color:#fff;border:none;border-radius:6px;cursor:pointer;">+ ${esc(b.nombre)}</button>`).join('')}
        </div>` : ''}
    </div>`;
}

function wireVueltaPanel(container, client, v) {
    const panel = container.querySelector(`.vu-panel[data-vuelta="${v.id}"]`);
    if (!panel) return;
    const cerrarBtn = panel.querySelector('.vu-cerrar');
    if (cerrarBtn && !cerrarBtn.hasAttribute('disabled')) cerrarBtn.addEventListener('click', () => openCerrarVueltaModal(container, v));
    panel.querySelector('.vu-denuncia').addEventListener('click', () => openDenunciaModal(container, v));
    const vd = panel.querySelector('.vu-ver-den');
    if (vd) vd.addEventListener('click', (e) => { e.preventDefault(); openFileViewer(v.denunciaEvidencia); });
    panel.querySelectorAll('.vu-add-ev').forEach(b => b.addEventListener('click', () => openEvidenciaModal(container, v.id, b.getAttribute('data-banco'))));
    panel.querySelectorAll('.vu-add-cd').forEach(b => b.addEventListener('click', () => openCodigoModal(container, v.id, client.id, b.getAttribute('data-banco'))));
    panel.querySelectorAll('.vu-ver').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); openFileViewer(a.getAttribute('data-file')); }));
    panel.querySelectorAll('.vu-edit-ev').forEach(a => a.addEventListener('click', (e) => {
        e.preventDefault();
        const ev = getEvidencias(v.id).find(x => x.id === a.getAttribute('data-id'));
        if (ev) openEvidenciaModal(container, v.id, ev.bancoId, ev);
    }));
    panel.querySelectorAll('.vu-del-ev').forEach(a => a.addEventListener('click', async (e) => { e.preventDefault(); if (await confirmarEliminacion('¿Eliminar evidencia?')) { deleteEvidencia(a.getAttribute('data-id')); paint(container); } }));
    panel.querySelectorAll('.vu-edit-cd').forEach(a => a.addEventListener('click', (e) => {
        e.preventDefault();
        const cd = getBlockingCodes(v.id).find(x => x.id === a.getAttribute('data-id'));
        if (cd) openCodigoModal(container, v.id, client.id, cd.bancoId, cd);
    }));
    panel.querySelectorAll('.vu-del-cd').forEach(a => a.addEventListener('click', async (e) => { e.preventDefault(); if (await confirmarEliminacion('¿Eliminar código de bloqueo?')) { deleteBlockingCode(a.getAttribute('data-id')); paint(container); } }));
    panel.querySelectorAll('.vu-del-banco').forEach(btn => btn.addEventListener('click', async () => {
        const bancoNombre = bancosDeVuelta(v).find(b => b.id === btn.getAttribute('data-banco'))?.nombre || 'este banco';
        if (!await confirmarEliminacion(`¿Quitar ${bancoNombre} de esta vuelta? Solo se puede porque no tiene evidencias ni código de bloqueo.`, { titulo: '✕ Quitar banco', confirmLabel: 'Quitar' })) return;
        const r = removeBancoFromVuelta(btn.getAttribute('data-vuelta'), btn.getAttribute('data-banco'));
        if (r.success) paint(container); else alert(r.error);
    }));
    panel.querySelectorAll('.vu-add-banco').forEach(btn => btn.addEventListener('click', () => {
        const r = addBancoToVuelta(btn.getAttribute('data-vuelta'), btn.getAttribute('data-banco'));
        if (r.success) paint(container); else alert(r.error);
    }));
}

function openIniciarModal(container, clientId) {
    const hoy = new Date().toISOString().split('T')[0];
    openFormModal({
        title: 'Iniciar vuelta', submitLabel: 'Iniciar',
        html: `<div class="form-group"><label>Fecha de la vuelta *</label><input type="date" id="vu-fecha" value="${hoy}" required></div>
               <p style="color:#9ca3af;font-size:0.82rem;">Solo se incluirán los bancos con el seguro al día. Los demás podrás hacerlos en otra vuelta cuando estén pagados.</p>`,
        onSubmit: (form) => {
            const r = startVuelta(clientId, form.querySelector('#vu-fecha').value);
            if (r.success) { closeFormModal(); paint(container); } else showModalAlert(r.error, 'error');
        },
    });
}

function openEvidenciaModal(container, vueltaId, bancoId, ev = null) {
    const banco = bankRepository.getById(bancoId)?.nombre || '';
    const now = new Date(); const pad = n => String(n).padStart(2, '0');
    let evidenceUrl = null, uploading = false;
    const fechaDef = ev?.fecha || now.toISOString().split('T')[0];
    const horaDef = ev?.hora || `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    openFormModal({
        title: `${ev ? 'Editar evidencia' : 'Evidencia'} — ${banco}`, submitLabel: ev ? 'Guardar' : 'Agregar',
        html: `
            <div class="form-row">
                <div class="form-group"><label>Tipo *</label>
                    <select id="ev-tipo">${TIPOS_EVIDENCIA.map(t => `<option value="${t.value}" ${ev && ev.tipo === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}</select></div>
                <div class="form-group"><label>Fecha</label><input type="date" id="ev-fecha" value="${esc(fechaDef)}"></div>
                <div class="form-group"><label>Hora</label><input type="time" id="ev-hora" value="${esc(horaDef)}"></div>
            </div>
            <div class="form-group"><label>Concepto</label><input type="text" id="ev-concepto" value="${esc(ev?.concepto || '')}" placeholder="Ej: compra en tienda X / retiro S/500"></div>
            <div class="form-group"><label>Evidencia (foto/PDF)</label>
                <input type="file" id="ev-file" accept=".pdf,.jpg,.jpeg,.png,.webp">
                <div id="ev-status" style="font-size:0.82rem;margin-top:4px;color:#9ca3af;min-height:1.2em;">${ev?.evidencia ? '📎 Ya tiene archivo (sube otro para reemplazarlo)' : ''}</div></div>`,
        onOpen: (overlay) => {
            const input = overlay.querySelector('#ev-file'), status = overlay.querySelector('#ev-status');
            input.addEventListener('change', () => {
                const file = input.files[0]; if (!file) { evidenceUrl = null; status.textContent = ''; return; }
                uploading = true; status.textContent = '⏳ Subiendo...'; status.style.color = '#f59e0b';
                uploadFile(file).then(u => { evidenceUrl = u; uploading = false; status.textContent = '✓ Subido'; status.style.color = '#10b981'; })
                    .catch(() => { evidenceUrl = null; uploading = false; input.value = ''; status.textContent = 'Error al subir'; status.style.color = '#ef4444'; });
            });
        },
        onSubmit: (form) => {
            if (uploading) { showModalAlert('Espere a que suba el archivo.', 'error'); return; }
            const data = {
                bancoId, tipo: form.querySelector('#ev-tipo').value,
                fecha: form.querySelector('#ev-fecha').value, hora: form.querySelector('#ev-hora').value,
                concepto: form.querySelector('#ev-concepto').value, evidencia: evidenceUrl,
            };
            const r = ev ? updateEvidencia(ev.id, data) : addEvidencia(vueltaId, data);
            if (r.success) { closeFormModal(); paint(container); } else showModalAlert(r.error, 'error');
        },
    });
}

function openCodigoModal(container, vueltaId, clientId, bancoId, cd = null) {
    const editar = !!cd;
    const banco = bankRepository.getById(bancoId)?.nombre || '';
    const cards = tarjetasDeBanco(clientId, bancoId);
    const now = new Date(); const pad = n => String(n).padStart(2, '0');
    // En edición: parte de la evidencia y tarjetas ya guardadas.
    let evidenceUrl = editar ? (cd.evidencia || null) : null, uploading = false;
    const tarjetasGuardadas = editar ? new Set(String(cd.tarjetaIds || '').split(',').filter(Boolean)) : null;
    const fechaVal = editar ? (cd.fecha || '') : now.toISOString().split('T')[0];
    const horaVal = editar ? (cd.hora || '') : `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    openFormModal({
        title: `Código de bloqueo — ${banco}`, submitLabel: editar ? 'Guardar' : 'Agregar',
        html: `
            <div class="form-group"><label>Código de bloqueo *</label><input type="text" id="cd-codigo" required placeholder="Código que dio el banco" value="${editar ? esc(cd.codigo || '') : ''}"></div>
            <div class="form-row">
                <div class="form-group"><label>Fecha</label><input type="date" id="cd-fecha" value="${esc(fechaVal)}"></div>
                <div class="form-group"><label>Hora</label><input type="time" id="cd-hora" value="${esc(horaVal)}"></div>
            </div>
            ${cards.length ? `<div class="form-group"><label>Tarjetas que cubre</label>
                <div style="display:flex;flex-direction:column;gap:0.35rem;">
                ${cards.map(c => `<label style="display:flex;align-items:center;gap:0.5rem;font-weight:normal;font-size:0.9rem;cursor:pointer;"><input type="checkbox" class="cd-card" value="${esc(c.id)}" ${(editar ? tarjetasGuardadas.has(c.id) : true) ? 'checked' : ''} style="width:auto;margin:0;flex:0 0 auto;"><span>${esc(c.numero || c.id)}${c.moneda ? ' (' + esc(c.moneda) + ')' : ''}</span></label>`).join('')}
                </div></div>` : ''}
            <div class="form-group"><label>Observación</label><input type="text" id="cd-obs" placeholder="Ej: bloquea ambas tarjetas" value="${editar ? esc(cd.observacion || '') : ''}"></div>
            <div class="form-group"><label>Evidencia (foto/PDF — opcional)</label>
                <input type="file" id="cd-file" accept=".pdf,.jpg,.jpeg,.png,.webp">
                <div id="cd-status" style="font-size:0.82rem;margin-top:4px;color:#9ca3af;min-height:1.2em;">${editar && cd.evidencia ? '✓ Ya hay una evidencia (sube otra para reemplazar)' : ''}</div></div>`,
        onOpen: (overlay) => {
            const input = overlay.querySelector('#cd-file'), status = overlay.querySelector('#cd-status');
            input.addEventListener('change', () => {
                const file = input.files[0]; if (!file) { status.textContent = ''; return; }
                uploading = true; status.textContent = '⏳ Subiendo...'; status.style.color = '#f59e0b';
                uploadFile(file).then(u => { evidenceUrl = u; uploading = false; status.textContent = '✓ Subido'; status.style.color = '#10b981'; })
                    .catch(() => { uploading = false; input.value = ''; status.textContent = 'Error al subir'; status.style.color = '#ef4444'; });
            });
        },
        onSubmit: (form) => {
            if (uploading) { showModalAlert('Espere a que suba el archivo.', 'error'); return; }
            const tarjetaIds = [...form.querySelectorAll('.cd-card:checked')].map(c => c.value);
            const datos = {
                bancoId, codigo: form.querySelector('#cd-codigo').value, tarjetaIds,
                observacion: form.querySelector('#cd-obs').value,
                fecha: form.querySelector('#cd-fecha').value, hora: form.querySelector('#cd-hora').value,
                evidencia: evidenceUrl,
            };
            const r = editar ? updateBlockingCode(cd.id, datos) : addBlockingCode(vueltaId, datos);
            if (r.success) { closeFormModal(); paint(container); } else showModalAlert(r.error, 'error');
        },
    });
}

function openDenunciaModal(container, vuelta) {
    let evidenceUrl = vuelta.denunciaEvidencia || null, uploading = false;
    openFormModal({
        title: 'Denuncia', submitLabel: 'Guardar',
        html: `
            <div class="form-group"><label>Fecha de la denuncia</label><input type="date" id="dn-fecha" value="${vuelta.denunciaFecha || ''}"></div>
            <div class="form-group"><label>Evidencia de la denuncia</label>
                <input type="file" id="dn-file" accept=".pdf,.jpg,.jpeg,.png,.webp">
                <div id="dn-status" style="font-size:0.82rem;margin-top:4px;color:#9ca3af;min-height:1.2em;">${vuelta.denunciaEvidencia ? '✓ Ya hay una evidencia (sube otra para reemplazar)' : ''}</div></div>
            ${vuelta.denunciaEvidencia ? `<div style="margin-top:0.6rem;border-top:1px solid #1f2937;padding-top:0.6rem;">
                <button type="button" id="dn-delete" style="background:#7f1d1d;color:#fff;border:none;border-radius:6px;padding:0.45rem 0.9rem;cursor:pointer;font-size:0.85rem;">🗑️ Eliminar denuncia</button>
            </div>` : ''}`,
        onOpen: (overlay) => {
            const input = overlay.querySelector('#dn-file'), status = overlay.querySelector('#dn-status');
            input.addEventListener('change', () => {
                const file = input.files[0]; if (!file) return;
                uploading = true; status.textContent = '⏳ Subiendo...'; status.style.color = '#f59e0b';
                uploadFile(file).then(u => { evidenceUrl = u; uploading = false; status.textContent = '✓ Subido'; status.style.color = '#10b981'; })
                    .catch(() => { uploading = false; input.value = ''; status.textContent = 'Error al subir'; status.style.color = '#ef4444'; });
            });

            // Eliminar la denuncia (quita archivo y fecha). NO borra el siniestro ya generado.
            overlay.querySelector('#dn-delete')?.addEventListener('click', async () => {
                const yaTieneSiniestro = !!vuelta.siniestroId;
                const msg = '¿Eliminar la denuncia de esta vuelta? Se quitarán el archivo y la fecha, y la vuelta volverá a figurar "sin denuncia" (saldrá otra vez la alerta para subirla).'
                    + (yaTieneSiniestro ? ' Ojo: el siniestro y los reclamos ya creados desde esta vuelta NO se borran.' : '');
                if (!await confirmarEliminacion(msg, { titulo: '🗑️ Eliminar denuncia', confirmLabel: 'Eliminar denuncia' })) return;
                updateVuelta(vuelta.id, { denunciaEvidencia: null, denunciaFecha: null });
                closeFormModal();
                paint(container);
            });
        },
        onSubmit: async (form) => {
            if (uploading) { showModalAlert('Espere a que suba el archivo.', 'error'); return; }
            updateVuelta(vuelta.id, { denunciaFecha: form.querySelector('#dn-fecha').value || null, denunciaEvidencia: evidenceUrl });
            closeFormModal();
            // Si la vuelta ya está CERRADA y recién ahora tiene denuncia:
            // crear el siniestro y los reclamos automáticamente (la alerta se apaga sola).
            if (vuelta.estado === 'cerrada' && evidenceUrl) {
                const r = await ensureSiniestroForVuelta(vuelta.id);
                if (r.success && (r.siniestroCreado || r.reclamosCreados?.length)) {
                    showReclamosCreadosToast(r.reclamosCreados || [], r.clienteId, r.siniestroCreado);
                }
            }
            paint(container);
        },
    });
}

/**
 * Modal de cierre de vuelta. "La vuelta ES el siniestro": si tiene denuncia,
 * al cerrar se crea el siniestro y los reclamos automáticamente. Si no la tiene,
 * ofrece subirla aquí mismo (opcional, no bloquea el cierre).
 */
function openCerrarVueltaModal(container, v) {
    const tieneDenuncia = !!v.denunciaEvidencia;
    let evidenceUrl = null, uploading = false;
    const infoHtml = tieneDenuncia
        ? `<div style="background:#064e3b33;border:1px solid #065f46;border-radius:8px;padding:0.6rem 0.8rem;margin-bottom:0.75rem;font-size:0.85rem;color:#34d399;">
            📄 Denuncia registrada${v.denunciaFecha ? ' (' + formatDate(v.denunciaFecha) + ')' : ''} ✓<br>
            <span style="color:#9ca3af;">${v.siniestroId ? 'Esta vuelta ya está amarrada a su siniestro.' : 'Al cerrar se crearán el siniestro y los reclamos automáticamente.'}</span></div>`
        : `<div style="background:#78350f22;border:1px solid #b45309;border-radius:8px;padding:0.6rem 0.8rem;margin-bottom:0.75rem;font-size:0.85rem;color:#fbbf24;">
            ⚠️ Esta vuelta no tiene denuncia. Sin denuncia NO se creará el siniestro automáticamente.<br>
            <span style="color:#9ca3af;">Puedes subirla aquí mismo, o cerrar sin ella y agregarla después reabriendo la vuelta.</span></div>
           <div class="form-row">
               <div class="form-group"><label>Fecha de la denuncia</label><input type="date" id="cv-fecha" value="${new Date().toISOString().split('T')[0]}"></div>
           </div>
           <div class="form-group"><label>Denuncia (PDF/foto — opcional)</label>
               <input type="file" id="cv-file" accept=".pdf,.jpg,.jpeg,.png,.webp">
               <div id="cv-status" style="font-size:0.82rem;margin-top:4px;color:#9ca3af;min-height:1.2em;"></div></div>`;

    openFormModal({
        title: '🔒 Cerrar vuelta', submitLabel: 'Cerrar vuelta',
        html: `${infoHtml}
            <p style="color:#9ca3af;font-size:0.85rem;">La vuelta quedará finalizada (de solo lectura): ya no podrás agregar evidencias ni códigos. No se borra nada.</p>`,
        onOpen: (overlay) => {
            const input = overlay.querySelector('#cv-file');
            if (!input) return;
            const status = overlay.querySelector('#cv-status');
            input.addEventListener('change', () => {
                const file = input.files[0]; if (!file) { evidenceUrl = null; status.textContent = ''; return; }
                uploading = true; status.textContent = '⏳ Subiendo...'; status.style.color = '#f59e0b';
                uploadFile(file).then(u => { evidenceUrl = u; uploading = false; status.textContent = '✓ Subido'; status.style.color = '#10b981'; })
                    .catch(() => { evidenceUrl = null; uploading = false; input.value = ''; status.textContent = 'Error al subir'; status.style.color = '#ef4444'; });
            });
        },
        onSubmit: async (form) => {
            if (uploading) { showModalAlert('Espere a que suba la denuncia.', 'error'); return; }
            if (!tieneDenuncia && evidenceUrl) {
                updateVuelta(v.id, { denunciaFecha: form.querySelector('#cv-fecha')?.value || null, denunciaEvidencia: evidenceUrl });
            }
            const r = await closeVuelta(v.id);
            if (r.success) {
                closeFormModal();
                paint(container);
                if (r.siniestroCreado || r.reclamosCreados?.length) showReclamosCreadosToast(r.reclamosCreados || [], r.clienteId, r.siniestroCreado);
            } else showModalAlert(r.error, 'error');
        },
    });
}

/** Toast tras cerrar la vuelta: siniestro/reclamos creados automáticamente + link a la Guía. */
function showReclamosCreadosToast(creados, clienteId, siniestroCreado) {
    const prev = document.getElementById('vu-reclamos-toast');
    if (prev) prev.remove();
    const toast = document.createElement('div');
    toast.id = 'vu-reclamos-toast';
    toast.style.cssText = 'position:fixed;bottom:1rem;right:1rem;background:#065f46;color:#fff;padding:0.9rem 1.1rem;border-radius:8px;z-index:99999;font-size:0.92rem;line-height:1.4;box-shadow:0 4px 14px rgba(0,0,0,0.4);max-width:360px;';
    const partes = [];
    if (siniestroCreado) partes.push('el siniestro');
    if (creados.length) partes.push(`${creados.length} reclamo(s): ${creados.map(c => esc(c.bancoNombre)).join(', ')}`);
    toast.innerHTML = `<strong>✅ Se creó ${partes.join(' y ')}.</strong><br>
        El trámite ya aparece con sus pasos. <a href="#" id="vu-toast-guia" style="color:#a7f3d0;font-weight:700;">Ir a la Guía →</a>`;
    document.body.appendChild(toast);
    toast.querySelector('#vu-toast-guia').addEventListener('click', (e) => {
        e.preventDefault();
        setActiveClient(clienteId);
        toast.remove();
        window.location.hash = '#guia';
    });
    setTimeout(() => toast.remove(), 12000);
}

/** Miniatura clicable de una evidencia: imagen real si es foto, ícono si es PDF/otro. */
function miniatura(url) {
    if (!url) return '';
    const clean = String(url).split('?')[0].split('#')[0].toLowerCase();
    const esImg = /\.(jpg|jpeg|png|webp|gif)$/.test(clean);
    const base = 'width:38px;height:38px;border-radius:6px;border:1px solid #334155;cursor:pointer;flex:0 0 auto;';
    return esImg
        ? `<img src="${esc(url)}" class="vu-ver" data-file="${esc(url)}" alt="evidencia" title="Ver evidencia" style="${base}object-fit:cover;background:#fff;">`
        : `<span class="vu-ver" data-file="${esc(url)}" title="Ver archivo (PDF)" style="${base}display:inline-flex;align-items:center;justify-content:center;font-size:1.1rem;background:#111827;">📄</span>`;
}

function esc(str) { const d = document.createElement('div'); d.textContent = str ?? ''; return d.innerHTML; }
function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
}
