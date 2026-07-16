import { getActiveClient } from '../state/clientContext.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import {
    MONEDAS,
    getCuadreByRecarga, getOrCreateCuadre, setTipoCambio, bancosDeRecarga, esInformativo,
    getGastos, addGasto, updateGasto, deleteGasto, deleteCuadre, computeSaldo,
} from '../services/cuadreService.js';
import { getAllRecargas, searchRecargas, getRecarga } from '../services/rechargeService.js';
import { uploadFile, loadCollections } from '../storage.js';
import { startAutoRefresh, stopAutoRefresh } from './autoRefresh.js';
import { openFileViewer } from '../app.js';
import { openFormModal, closeFormModal, showModalAlert } from './modalHelper.js';
import { confirmarEliminacion } from '../utils.js';

// Recarga cuyo cuadre está abierto en el editor (null = vista lista).
let openRecargaId = null;
let listQuery = '';
let evidenceUrl = null;
let uploading = false;

// ── Entrada / auto-refresco ────────────────────────────────

function cuadreSignature() {
    const parts = [];
    for (const r of getAllRecargas()) {
        const c = getCuadreByRecarga(r.id);
        if (!c) { parts.push('r' + r.id + ':nc'); continue; }
        parts.push(`c${c.id}:${c.reclamoIds || ''}:${c.tipoCambio || ''}`);
        for (const g of getGastos(c.id)) parts.push('g' + g.id + ':' + g.monto + ':' + (g.informativo ? '1' : '0') + ':' + (g.bancoId || '') + ':' + (g.evidencia || ''));
    }
    return parts.join('|');
}

export async function renderCuadreSection(container) {
    container.innerHTML = '<div class="empty-state" style="padding:1.5rem;">Actualizando…</div>';
    try { await loadCollections(['clients', 'banks', 'incidents', 'claims', 'recargas', 'recargaItems', 'cuadres', 'cuadreGastos']); } catch (e) { /* ignore */ }
    paint(container);
}

function paint(container) {
    stopAutoRefresh();
    const recarga = openRecargaId ? getRecarga(openRecargaId) : null;
    if (recarga) renderEditor(container, recarga);
    else renderList(container);
    startAutoRefresh('#cuadre', ['cuadres', 'cuadreGastos', 'recargas', 'recargaItems', 'claims'],
        () => cuadreSignature(), () => paint(container), 8000);
}

// ── Vista lista ────────────────────────────────────────────

function estadoCuadre(recarga) {
    const c = getCuadreByRecarga(recarga.id);
    if (!c) return { txt: 'Sin iniciar', color: '#9ca3af' };
    const r = computeSaldo(c);
    if (r.faltaTipoCambio) return { txt: 'Falta tipo de cambio', color: '#f59e0b' };
    if (r.cuadrado) return { txt: '✓ Cuadrado', color: '#34d399' };
    if (r.saldo > 0) return { txt: `Falta cuadrar: ${money(r.saldo)}`, color: '#ef4444' };
    return { txt: `Excedido: ${money(Math.abs(r.saldo))}`, color: '#ef4444' };
}

function renderList(container) {
    const recargas = searchRecargas(listQuery);
    container.innerHTML = `
        <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
            <h2 style="margin:0;">⚖️ Cuadre de Cuentas</h2>
        </div>
        <div style="margin:0.8rem 0;">
            <input type="text" id="cd-buscar" autocomplete="off" placeholder="Buscar recarga por nombre o cliente..."
                value="${esc(listQuery)}" style="width:100%;max-width:520px;padding:0.55rem 0.7rem;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#e2e8f0;">
        </div>
        <div id="cd-list"></div>`;

    renderListRows(container, recargas);

    const buscar = container.querySelector('#cd-buscar');
    buscar.addEventListener('input', () => { listQuery = buscar.value; renderListRows(container, searchRecargas(listQuery)); });
}

function renderListRows(container, recargas) {
    const listEl = container.querySelector('#cd-list');
    if (!listEl) return;
    if (recargas.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${listQuery ? 'No hay recargas que coincidan.' : 'No hay recargas. Crea una en el módulo "Recargas" para poder cuadrarla.'}</div>`;
        return;
    }
    listEl.innerHTML = recargas.map(r => {
        const cli = clientRepository.getById(r.clienteId);
        const nombreCli = cli ? `${cli.nombreCompleto || ''} ${cli.apellidosCompletos || ''}`.trim() : '—';
        const est = estadoCuadre(r);
        return `<div class="cd-row" data-id="${esc(r.id)}" role="button" tabindex="0"
                style="border:1px solid #1f2937;border-radius:10px;padding:0.7rem 0.9rem;margin-bottom:0.5rem;cursor:pointer;background:#111827;">
            <div style="display:flex;justify-content:space-between;gap:0.8rem;flex-wrap:wrap;align-items:baseline;">
                <strong style="color:#f1f5f9;font-size:1.02rem;">${esc(r.nombre || '(sin nombre)')}</strong>
                <span style="color:${est.color};font-weight:700;">${esc(est.txt)}</span>
            </div>
            <div style="color:#9ca3af;font-size:0.85rem;margin-top:2px;">${esc(nombreCli)} · ${esc(formatDate(r.fecha))}</div>
        </div>`;
    }).join('');
    listEl.querySelectorAll('.cd-row').forEach(el => el.addEventListener('click', () => {
        openRecargaId = el.getAttribute('data-id');
        paint(container);
    }));
}

// ── Vista editor (cuadre de una recarga) ───────────────────

function renderEditor(container, recarga) {
    const cuadre = getOrCreateCuadre(recarga.id);
    const cli = clientRepository.getById(recarga.clienteId);
    const nombreCli = cli ? `${cli.nombreCompleto || ''} ${cli.apellidosCompletos || ''}`.trim() : '—';
    const r = computeSaldo(cuadre);
    const gastos = getGastos(cuadre.id);

    // Estado del saldo
    let saldoColor, saldoTxt;
    if (r.faltaTipoCambio) { saldoColor = '#f59e0b'; saldoTxt = 'Ingresa el tipo de cambio (hay montos en dólares)'; }
    else if (r.cuadrado) { saldoColor = '#34d399'; saldoTxt = '✓ Cuadrado'; }
    else if (r.saldo > 0) { saldoColor = '#ef4444'; saldoTxt = `Falta cuadrar: ${money(r.saldo)} por justificar`; }
    else { saldoColor = '#ef4444'; saldoTxt = `Excedido en ${money(Math.abs(r.saldo))}`; }

    const bancosHtml = r.porBanco.length === 0 ? '<div style="color:#6b7280;padding:0.4rem 0.6rem;">Sin recargas registradas.</div>'
        : `<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead><tr style="color:#9ca3af;text-align:left;">
                <th style="padding:0.3rem 0.5rem;">Banco</th><th style="padding:0.3rem 0.5rem;text-align:right;">Recarga</th>
                <th style="padding:0.3rem 0.5rem;text-align:right;">Gastos</th><th style="padding:0.3rem 0.5rem;text-align:right;">Dif.</th></tr></thead>
            <tbody>${r.porBanco.map(b => `<tr style="border-top:1px solid #1f2937;">
                <td style="padding:0.3rem 0.5rem;color:#e2e8f0;">${esc(b.bancoNombre)}</td>
                <td style="padding:0.3rem 0.5rem;text-align:right;color:#34d399;">${money(b.recargaSoles)}</td>
                <td style="padding:0.3rem 0.5rem;text-align:right;color:#fbbf24;">${money(b.gastosSoles)}</td>
                <td style="padding:0.3rem 0.5rem;text-align:right;color:${Math.abs(b.diff) < 0.005 ? '#34d399' : '#e2e8f0'};">${money(b.diff)}</td></tr>`).join('')}</tbody></table>`;

    const bancoNombreDe = (id) => id ? (bankRepository.getById(id)?.nombre || '—') : null;
    const gastosHtml = gastos.length === 0 ? '<div style="color:#6b7280;padding:0.4rem 0.6rem;">Sin gastos registrados.</div>'
        : gastos.map(g => {
            const info = esInformativo(g);
            const bn = bancoNombreDe(g.bancoId);
            return `<div style="display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0.6rem;border-top:1px solid #1f2937;flex-wrap:wrap;${info ? 'opacity:0.9;' : ''}">
            ${miniatura(g.evidencia)}
            <div style="flex:1;min-width:150px;">
                <div style="color:#e2e8f0;">${esc(g.concepto)} <span style="color:${info ? '#94a3b8' : '#fbbf24'};font-weight:700;">${esc(money(g.monto, g.moneda))}</span>
                    ${info ? '<span style="background:#334155;color:#cbd5e1;border-radius:99px;padding:1px 8px;font-size:0.7rem;margin-left:4px;">ℹ️ informativo</span>' : ''}</div>
                <div style="color:#9ca3af;font-size:0.8rem;">${bn ? '🏦 ' + esc(bn) + ' · ' : ''}${esc(formatDate(g.fecha))}${info ? ' · no suma ni resta' : ''}</div>
            </div>
            <button type="button" class="btn-icon primary cd-gasto-edit" data-id="${esc(g.id)}" title="Editar">✏️</button>
            <button type="button" class="btn-icon danger cd-gasto-del" data-id="${esc(g.id)}" title="Eliminar">🗑️</button>
        </div>`;
        }).join('');

    container.innerHTML = `
        <button type="button" id="cd-volver" class="btn btn-secondary" style="margin-bottom:0.8rem;">← Volver a la lista</button>
        <div style="background:#111827;border:1.5px solid ${saldoColor};border-radius:10px;overflow:hidden;margin-bottom:1rem;">
            <div style="padding:0.75rem 0.95rem;background:#160f26;display:flex;justify-content:space-between;gap:0.8rem;flex-wrap:wrap;align-items:center;">
                <div>
                    <strong style="color:#f1f5f9;font-size:1.1rem;">${esc(recarga.nombre || '(sin nombre)')}</strong>
                    <div style="color:#9ca3af;font-size:0.85rem;">${esc(nombreCli)}</div>
                </div>
                <div style="text-align:right;">
                    <div style="color:${saldoColor};font-weight:800;font-size:1.15rem;">${esc(saldoTxt)}</div>
                    <div style="color:#6b7280;font-size:0.8rem;">Recarga ${money(r.recargaSoles)} − Gastos ${money(r.gastosSoles)}</div>
                </div>
            </div>
            <div style="padding:0.5rem 0.7rem;display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;border-top:1px solid #1f2937;">
                <label style="color:#9ca3af;font-size:0.85rem;">Tipo de cambio (USD→S/):</label>
                <input type="number" id="cd-tc" min="0" step="0.001" value="${esc(cuadre.tipoCambio ?? '')}" placeholder="Ej: 3.75"
                    style="width:110px;padding:0.3rem 0.5rem;border:1px solid #334155;border-radius:6px;background:#0f172a;color:#e2e8f0;">
                ${r.hayUSD ? '<span style="color:#f59e0b;font-size:0.8rem;">Hay montos en dólares</span>' : '<span style="color:#6b7280;font-size:0.8rem;">(solo si usas dólares)</span>'}
                <span style="flex:1;"></span>
                <button type="button" id="cd-borrar" class="btn-icon danger" title="Eliminar este cuadre">🗑️</button>
            </div>
        </div>

        <div style="background:#111827;border:1px solid #1f2937;border-radius:10px;padding:0.5rem 0.6rem;margin-bottom:1rem;">
            <div style="color:#9ca3af;font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;padding:0.3rem 0.5rem;">Desglose por banco (recarga − gastos)</div>
            ${bancosHtml}
        </div>

        <div style="background:#111827;border:1px solid #1f2937;border-radius:10px;padding:0.5rem 0.6rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.3rem 0.5rem;">
                <span style="color:#9ca3af;font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">Gastos</span>
                <button type="button" id="cd-add-gasto" class="btn btn-primary" style="padding:0.25rem 0.7rem;font-size:0.82rem;">➕ Agregar gasto</button>
            </div>
            ${gastosHtml}
        </div>`;

    container.querySelector('#cd-volver').addEventListener('click', () => { openRecargaId = null; paint(container); });
    container.querySelector('#cd-add-gasto').addEventListener('click', () => openGastoModal(container, recarga, cuadre, null));
    container.querySelector('#cd-borrar').addEventListener('click', async () => {
        if (await confirmarEliminacion('¿Eliminar este cuadre y sus gastos? (La recarga NO se borra.)')) {
            deleteCuadre(cuadre.id);
            openRecargaId = null;
            paint(container);
        }
    });
    const tcInput = container.querySelector('#cd-tc');
    tcInput.addEventListener('change', () => { setTipoCambio(cuadre.id, tcInput.value); paint(container); });

    container.querySelectorAll('.cd-gasto-edit').forEach(b => b.addEventListener('click', () => {
        const g = gastos.find(x => x.id === b.getAttribute('data-id'));
        if (g) openGastoModal(container, recarga, cuadre, g);
    }));
    container.querySelectorAll('.cd-gasto-del').forEach(b => b.addEventListener('click', async () => {
        if (await confirmarEliminacion('¿Eliminar este gasto?')) { deleteGasto(b.getAttribute('data-id')); paint(container); }
    }));
    container.querySelectorAll('.cd-ver').forEach(el => el.addEventListener('click', () => {
        const f = el.getAttribute('data-file'); if (f) openFileViewer(f);
    }));
}

// ── Modal: agregar / editar gasto ──────────────────────────

function openGastoModal(container, recarga, cuadre, gasto) {
    evidenceUrl = gasto ? (gasto.evidencia || null) : null;
    uploading = false;
    const hoy = new Date().toISOString().split('T')[0];
    const monedaOpts = MONEDAS.map(m =>
        `<option value="${m}" ${(gasto ? gasto.moneda : 'PEN') === m ? 'selected' : ''}>${m === 'USD' ? 'USD ($)' : 'PEN (S/)'}</option>`).join('');
    const bancos = bancosDeRecarga(recarga.id);
    const bancoOpts = `<option value="">— General (sin banco) —</option>` + bancos.map(b =>
        `<option value="${esc(b.id)}" ${(gasto?.bancoId || '') === b.id ? 'selected' : ''}>${esc(b.nombre)}</option>`).join('');
    const esInfo = gasto ? esInformativo(gasto) : false;

    openFormModal({
        title: gasto ? 'Editar gasto' : 'Agregar gasto',
        submitLabel: gasto ? 'Guardar' : 'Agregar',
        html: `
            <div class="form-group"><label>Concepto *</label>
                <input type="text" id="cd-g-concepto" value="${esc(gasto?.concepto || '')}" placeholder="Ej: Comida, Pasajes..." required></div>
            <div class="form-row">
                <div class="form-group"><label>Monto *</label><input type="number" id="cd-g-monto" min="0" step="0.01" value="${esc(gasto?.monto ?? '')}" placeholder="Ej: 20.00" required></div>
                <div class="form-group"><label>Moneda *</label><select id="cd-g-moneda">${monedaOpts}</select></div>
            </div>
            <div class="form-group"><label>Banco</label><select id="cd-g-banco">${bancoOpts}</select></div>
            <div class="form-group"><label>Fecha *</label><input type="date" id="cd-g-fecha" value="${esc(gasto?.fecha || hoy)}" required></div>
            <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;margin:0.2rem 0 0.6rem;">
                <input type="checkbox" id="cd-g-info" ${esInfo ? 'checked' : ''}>
                <span style="color:#cbd5e1;">ℹ️ Informativo <span style="color:#9ca3af;font-size:0.85rem;">(solo referencia — no suma ni resta en el saldo)</span></span>
            </label>
            <div class="form-group">
                <label>Evidencia (opcional)</label>
                <input type="file" id="cd-g-evidencia" accept=".pdf,.jpg,.jpeg,.png,.webp">
                <div id="cd-g-evidencia-status" style="font-size:0.85rem;margin-top:0.3rem;">${gasto?.evidencia ? '📎 Ya tiene evidencia (sube otra para reemplazarla)' : ''}</div>
            </div>
            <div class="form-group"><label>Observaciones</label><textarea id="cd-g-obs" rows="2">${esc(gasto?.observaciones || '')}</textarea></div>`,
        onOpen: (overlay) => {
            const input = overlay.querySelector('#cd-g-evidencia');
            const status = overlay.querySelector('#cd-g-evidencia-status');
            input.addEventListener('change', () => {
                const file = input.files[0];
                if (!file) return;
                uploading = true; status.textContent = '⏳ Subiendo archivo...'; status.style.color = '#f59e0b';
                uploadFile(file).then(url => {
                    evidenceUrl = url; uploading = false; status.textContent = '✓ Archivo subido'; status.style.color = '#10b981';
                }).catch(() => { uploading = false; input.value = ''; status.textContent = 'Error al subir.'; status.style.color = '#ef4444'; });
            });
        },
        onSubmit: (form) => {
            if (uploading) { showModalAlert('Espere a que termine de subir la evidencia.', 'error'); return; }
            const data = {
                concepto: form.querySelector('#cd-g-concepto').value,
                monto: form.querySelector('#cd-g-monto').value,
                moneda: form.querySelector('#cd-g-moneda').value,
                fecha: form.querySelector('#cd-g-fecha').value,
                bancoId: form.querySelector('#cd-g-banco').value || null,
                informativo: form.querySelector('#cd-g-info').checked,
                evidencia: evidenceUrl,
                observaciones: form.querySelector('#cd-g-obs').value,
            };
            const result = gasto ? updateGasto(gasto.id, data) : addGasto(cuadre.id, data);
            if (!result.success) { showModalAlert(result.error, 'error'); return; }
            closeFormModal();
            paint(container);
        },
    });
}

// ── Helpers locales ────────────────────────────────────────

function miniatura(url) {
    if (!url) return '<span style="width:38px;flex:0 0 auto;"></span>';
    const clean = String(url).split('?')[0].split('#')[0].toLowerCase();
    const esImg = /\.(jpg|jpeg|png|webp|gif)$/.test(clean);
    const base = 'width:38px;height:38px;border-radius:6px;border:1px solid #334155;cursor:pointer;flex:0 0 auto;';
    return esImg
        ? `<img src="${esc(url)}" class="cd-ver" data-file="${esc(url)}" title="Ver evidencia" style="${base}object-fit:cover;background:#fff;">`
        : `<span class="cd-ver" data-file="${esc(url)}" title="Ver evidencia" style="${base}display:inline-flex;align-items:center;justify-content:center;background:#1f2937;color:#e2e8f0;">📄</span>`;
}

function money(n, moneda) {
    const simbolo = moneda === 'USD' ? '$' : 'S/';
    return `${simbolo} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr + 'T00:00:00' : dateStr);
    return isNaN(d) ? String(dateStr) : d.toLocaleDateString('es-PE');
}
