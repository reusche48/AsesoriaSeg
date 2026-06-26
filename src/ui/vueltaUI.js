import { getActiveClient, setActiveClient } from '../state/clientContext.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import {
    getOpenVueltas, getVueltas, eligibleBanks, canStartVuelta, startVuelta, updateVuelta,
    getEvidencias, addEvidencia, deleteEvidencia,
    getBlockingCodes, addBlockingCode, deleteBlockingCode,
    canCloseVuelta, closeVuelta, bancosDeVuelta, tarjetasDeBanco, TIPOS_EVIDENCIA,
} from '../services/vueltaService.js';
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
    const clients = clientRepository.getAll();
    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">🔄 La Vuelta</h2>
            <p style="color:#9ca3af;">Selecciona un cliente para gestionar sus vueltas (evidencias por banco, códigos de bloqueo y denuncia).</p>
            <div class="form-group" style="max-width:420px;">
                <label for="vu-client">Cliente</label>
                <input type="text" id="vu-client" list="vu-client-list" autocomplete="off" placeholder="Escribe nombre o DNI...">
                <datalist id="vu-client-list">
                    ${clients.map(c => `<option value="${esc(c.nombreCompleto)} ${esc(c.apellidosCompletos)} — ${esc(c.dni)}" data-id="${esc(c.id)}"></option>`).join('')}
                </datalist>
            </div>
        </div>`;
    const input = container.querySelector('#vu-client');
    input.addEventListener('change', () => {
        const opt = [...container.querySelectorAll('#vu-client-list option')].find(o => o.value === input.value);
        const id = opt?.getAttribute('data-id');
        if (id) { setActiveClient(id); paint(container); }
    });
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
           <ul style="color:#9ca3af;">${cerradas.map(v => `<li>Vuelta del ${formatDate(v.fecha)} — bancos: ${bancosDeVuelta(v).map(b => esc(b.nombre)).join(', ') || '—'} (cerrada ${v.fechaCierre ? formatDate(v.fechaCierre) : ''})</li>`).join('')}</ul>`
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

    const bancosHtml = bancos.map(b => {
        const evB = evid.filter(e => e.bancoId === b.id);
        const cdB = codes.filter(c => c.bancoId === b.id);
        const faltaCodigo = !codesByBank.has(b.id);
        const evRows = evB.length ? evB.map(e => `<div style="display:flex;justify-content:space-between;gap:0.5rem;font-size:0.82rem;color:#cbd5e1;padding:2px 0;">
            <span>${esc(TIPO_LABEL[e.tipo] || e.tipo)}${e.concepto ? ' — ' + esc(e.concepto) : ''} ${e.fecha ? '· ' + formatDate(e.fecha) : ''} ${e.hora ? esc(e.hora) : ''}</span>
            <span style="white-space:nowrap;">${e.evidencia ? `<a href="#" class="vu-ver" data-file="${esc(e.evidencia)}" style="color:#7c3aed;">ver</a>` : ''} <a href="#" class="vu-del-ev" data-id="${esc(e.id)}" style="color:#ef4444;">✕</a></span>
        </div>`).join('') : '<div style="color:#6b7280;font-size:0.8rem;">Sin evidencias</div>';
        const cdRows = cdB.length ? cdB.map(c => `<div style="display:flex;justify-content:space-between;gap:0.5rem;font-size:0.82rem;color:#cbd5e1;padding:2px 0;">
            <span>🔒 <strong>${esc(c.codigo)}</strong>${c.observacion ? ' — ' + esc(c.observacion) : ''}</span>
            <a href="#" class="vu-del-cd" data-id="${esc(c.id)}" style="color:#ef4444;">✕</a>
        </div>`).join('') : `<div style="color:${faltaCodigo ? '#ef4444' : '#6b7280'};font-size:0.8rem;">${faltaCodigo ? '⚠️ Falta código de bloqueo' : 'Sin códigos'}</div>`;

        return `<div style="background:#0b1220;border:1px solid ${faltaCodigo ? '#7f1d1d' : '#1f2937'};border-radius:8px;padding:0.7rem 0.85rem;">
            <strong style="color:#f1f5f9;">🏦 ${esc(b.nombre)}</strong>
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
            <button type="button" class="btn btn-primary vu-cerrar" ${cerrarChk.ok ? '' : 'disabled title="' + esc(cerrarChk.motivo) + '"'}>🔒 Cerrar vuelta</button>
        </div>
        ${!cerrarChk.ok ? `<div style="color:#f59e0b;font-size:0.8rem;margin:0.3rem 0;">⚠️ ${esc(cerrarChk.motivo)}</div>` : ''}
        <div style="margin-top:0.6rem;background:#0b1220;border:1px solid #1f2937;border-radius:8px;padding:0.5rem 0.75rem;display:flex;justify-content:space-between;align-items:center;">
            <span style="color:#cbd5e1;font-size:0.85rem;">📄 Denuncia: ${v.denunciaFecha ? formatDate(v.denunciaFecha) : 'sin fecha'}${v.denunciaEvidencia ? ' · <a href="#" class="vu-ver-den" style="color:#7c3aed;">ver</a>' : ' · sin evidencia'}</span>
            <button type="button" class="btn btn-secondary vu-denuncia" style="padding:2px 8px;font-size:0.74rem;">Editar</button>
        </div>
        <div style="margin-top:0.6rem;display:flex;flex-direction:column;gap:0.5rem;">${bancos.length ? bancosHtml : '<div style="color:#9ca3af;">Esta vuelta no tiene bancos.</div>'}</div>
    </div>`;
}

function wireVueltaPanel(container, client, v) {
    const panel = container.querySelector(`.vu-panel[data-vuelta="${v.id}"]`);
    if (!panel) return;
    const cerrarBtn = panel.querySelector('.vu-cerrar');
    if (cerrarBtn && !cerrarBtn.hasAttribute('disabled')) cerrarBtn.addEventListener('click', async () => {
        if (!await confirmarEliminacion('¿Cerrar esta vuelta? Ya no podrás agregar evidencias ni códigos.')) return;
        const r = closeVuelta(v.id);
        if (r.success) paint(container); else alert(r.error);
    });
    panel.querySelector('.vu-denuncia').addEventListener('click', () => openDenunciaModal(container, v));
    const vd = panel.querySelector('.vu-ver-den');
    if (vd) vd.addEventListener('click', (e) => { e.preventDefault(); openFileViewer(v.denunciaEvidencia); });
    panel.querySelectorAll('.vu-add-ev').forEach(b => b.addEventListener('click', () => openEvidenciaModal(container, v.id, b.getAttribute('data-banco'))));
    panel.querySelectorAll('.vu-add-cd').forEach(b => b.addEventListener('click', () => openCodigoModal(container, v.id, client.id, b.getAttribute('data-banco'))));
    panel.querySelectorAll('.vu-ver').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); openFileViewer(a.getAttribute('data-file')); }));
    panel.querySelectorAll('.vu-del-ev').forEach(a => a.addEventListener('click', async (e) => { e.preventDefault(); if (await confirmarEliminacion('¿Eliminar evidencia?')) { deleteEvidencia(a.getAttribute('data-id')); paint(container); } }));
    panel.querySelectorAll('.vu-del-cd').forEach(a => a.addEventListener('click', async (e) => { e.preventDefault(); if (await confirmarEliminacion('¿Eliminar código de bloqueo?')) { deleteBlockingCode(a.getAttribute('data-id')); paint(container); } }));
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

function openEvidenciaModal(container, vueltaId, bancoId) {
    const banco = bankRepository.getById(bancoId)?.nombre || '';
    const now = new Date(); const pad = n => String(n).padStart(2, '0');
    let evidenceUrl = null, uploading = false;
    openFormModal({
        title: `Evidencia — ${banco}`, submitLabel: 'Agregar',
        html: `
            <div class="form-row">
                <div class="form-group"><label>Tipo *</label>
                    <select id="ev-tipo">${TIPOS_EVIDENCIA.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}</select></div>
                <div class="form-group"><label>Fecha</label><input type="date" id="ev-fecha" value="${now.toISOString().split('T')[0]}"></div>
                <div class="form-group"><label>Hora</label><input type="time" id="ev-hora" value="${pad(now.getHours())}:${pad(now.getMinutes())}"></div>
            </div>
            <div class="form-group"><label>Concepto</label><input type="text" id="ev-concepto" placeholder="Ej: compra en tienda X / retiro S/500"></div>
            <div class="form-group"><label>Evidencia (foto/PDF)</label>
                <input type="file" id="ev-file" accept=".pdf,.jpg,.jpeg,.png,.webp">
                <div id="ev-status" style="font-size:0.82rem;margin-top:4px;color:#9ca3af;min-height:1.2em;"></div></div>`,
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
            const r = addEvidencia(vueltaId, {
                bancoId, tipo: form.querySelector('#ev-tipo').value,
                fecha: form.querySelector('#ev-fecha').value, hora: form.querySelector('#ev-hora').value,
                concepto: form.querySelector('#ev-concepto').value, evidencia: evidenceUrl,
            });
            if (r.success) { closeFormModal(); paint(container); } else showModalAlert(r.error, 'error');
        },
    });
}

function openCodigoModal(container, vueltaId, clientId, bancoId) {
    const banco = bankRepository.getById(bancoId)?.nombre || '';
    const cards = tarjetasDeBanco(clientId, bancoId);
    openFormModal({
        title: `Código de bloqueo — ${banco}`, submitLabel: 'Agregar',
        html: `
            <div class="form-group"><label>Código de bloqueo *</label><input type="text" id="cd-codigo" required placeholder="Código que dio el banco"></div>
            ${cards.length ? `<div class="form-group"><label>Tarjetas que cubre</label>
                <div style="display:flex;flex-direction:column;gap:2px;">
                ${cards.map(c => `<label style="font-weight:normal;font-size:0.85rem;"><input type="checkbox" class="cd-card" value="${esc(c.id)}"> ${esc(c.numero || c.id)} ${c.moneda ? '(' + esc(c.moneda) + ')' : ''}</label>`).join('')}
                </div></div>` : ''}
            <div class="form-group"><label>Observación</label><input type="text" id="cd-obs" placeholder="Ej: bloquea ambas tarjetas"></div>`,
        onSubmit: (form) => {
            const tarjetaIds = [...form.querySelectorAll('.cd-card:checked')].map(c => c.value);
            const r = addBlockingCode(vueltaId, { bancoId, codigo: form.querySelector('#cd-codigo').value, tarjetaIds, observacion: form.querySelector('#cd-obs').value });
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
                <div id="dn-status" style="font-size:0.82rem;margin-top:4px;color:#9ca3af;min-height:1.2em;">${vuelta.denunciaEvidencia ? '✓ Ya hay una evidencia (sube otra para reemplazar)' : ''}</div></div>`,
        onOpen: (overlay) => {
            const input = overlay.querySelector('#dn-file'), status = overlay.querySelector('#dn-status');
            input.addEventListener('change', () => {
                const file = input.files[0]; if (!file) return;
                uploading = true; status.textContent = '⏳ Subiendo...'; status.style.color = '#f59e0b';
                uploadFile(file).then(u => { evidenceUrl = u; uploading = false; status.textContent = '✓ Subido'; status.style.color = '#10b981'; })
                    .catch(() => { uploading = false; input.value = ''; status.textContent = 'Error al subir'; status.style.color = '#ef4444'; });
            });
        },
        onSubmit: (form) => {
            if (uploading) { showModalAlert('Espere a que suba el archivo.', 'error'); return; }
            updateVuelta(vuelta.id, { denunciaFecha: form.querySelector('#dn-fecha').value || null, denunciaEvidencia: evidenceUrl });
            closeFormModal(); paint(container);
        },
    });
}

function esc(str) { const d = document.createElement('div'); d.textContent = str ?? ''; return d.innerHTML; }
function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
}
