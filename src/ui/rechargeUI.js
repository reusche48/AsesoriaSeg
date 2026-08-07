import { getActiveClient } from '../state/clientContext.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import {
    MONEDAS, bancosDeCliente,
    getAllRecargas, searchRecargas, getRecarga,
    createRecarga, updateRecarga, deleteRecarga,
    getItems, addItem, updateItem, deleteItem, totalesPorMoneda,
    TIPOS_ITEM, tipoDeItem, resumenPorMoneda, distribucionPorBanco,
} from '../services/rechargeService.js';
import { uploadFile, loadCollections } from '../storage.js';
import { startAutoRefresh, stopAutoRefresh } from './autoRefresh.js';
import { openFileViewer, auditLinkHtml } from '../app.js';
import { openFormModal, closeFormModal, showModalAlert } from './modalHelper.js';
import { confirmarEliminacion } from '../utils.js';

// Recarga actualmente abierta en el editor (null = vista lista).
let openRecargaId = null;
// Filtro de búsqueda de la vista lista.
let listQuery = '';
// Estado de subida de evidencia dentro de los modales.
let evidenceUrl = null;
let uploading = false;
// Cliente elegido en el modal "Nueva recarga".
let nuevaClienteId = null;

/** Colores/etiqueta de cada tipo de movimiento en la lista. */
const TIPO_CFG = {
    ingreso: { badge: '⬇ Ingreso', color: '#34d399', bg: '#064e3b' },
    interno: { badge: '🔁 Interno', color: '#93c5fd', bg: '#1e3a8a' },
    salida: { badge: '⬆ Salida', color: '#fca5a5', bg: '#7f1d1d' },
};

// ── Entrada / auto-refresco ────────────────────────────────

/** Huella de datos para detectar cambios de otros dispositivos. */
function rechargeSignature() {
    const parts = [];
    for (const r of getAllRecargas()) {
        parts.push(`${r.id}:${r.nombre || ''}:${r.fecha || ''}`);
        for (const it of getItems(r.id)) {
            parts.push(`i${it.id}:${it.monto}:${it.moneda}:${it.bancoId}:${it.tipo || ''}:${it.bancoDestinoId || ''}:${it.destinoDetalle || ''}:${it.evidencia || ''}`);
        }
    }
    return parts.join('|');
}

export async function renderRechargeSection(container) {
    container.innerHTML = '<div class="empty-state" style="padding:1.5rem;">Actualizando…</div>';
    try { await loadCollections(['clients', 'cards', 'banks', 'recargas', 'recargaItems']); } catch (e) { /* ignore */ }
    paint(container);
}

function paint(container) {
    stopAutoRefresh();
    const recarga = openRecargaId ? getRecarga(openRecargaId) : null;
    if (recarga) renderEditor(container, recarga);
    else renderList(container);
    startAutoRefresh('#recargas', ['recargas', 'recargaItems', 'clients', 'cards', 'banks'],
        () => rechargeSignature(), () => paint(container), 8000);
}

// ── Vista lista ────────────────────────────────────────────

function renderList(container) {
    const recargas = searchRecargas(listQuery);
    container.innerHTML = `
        <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
            <h2 style="margin:0;">💵 Recargas</h2>
            <button type="button" id="rc-nueva" class="btn btn-primary">➕ Nueva recarga</button>
        </div>
        <div style="margin:0.8rem 0;">
            <input type="text" id="rc-buscar" autocomplete="off" placeholder="Buscar por nombre de la recarga o cliente..."
                value="${esc(listQuery)}" style="width:100%;max-width:520px;padding:0.55rem 0.7rem;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#e2e8f0;">
        </div>
        <div id="rc-list"></div>`;

    const listEl = container.querySelector('#rc-list');
    if (recargas.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${listQuery ? 'No hay recargas que coincidan con la búsqueda.' : 'Aún no hay recargas. Crea la primera con "➕ Nueva recarga".'}</div>`;
    } else {
        listEl.innerHTML = recargas.map(r => {
            const cli = clientRepository.getById(r.clienteId);
            const nombreCli = cli ? `${cli.nombreCompleto || ''} ${cli.apellidosCompletos || ''}`.trim() : '—';
            const items = getItems(r.id);
            const tot = totalesPorMoneda(r.id);
            const totTxt = Object.keys(tot).length ? Object.entries(tot).map(([m, n]) => money(n, m)).join('  ·  ') : 'Sin montos';
            return `<div class="rc-row" data-id="${esc(r.id)}" role="button" tabindex="0"
                    style="border:1px solid #1f2937;border-radius:10px;padding:0.7rem 0.9rem;margin-bottom:0.5rem;cursor:pointer;background:#111827;">
                <div style="display:flex;justify-content:space-between;gap:0.8rem;flex-wrap:wrap;align-items:baseline;">
                    <strong style="color:#f1f5f9;font-size:1.02rem;">${esc(r.nombre || '(sin nombre)')}</strong>
                    <span style="color:#34d399;font-weight:700;">${esc(totTxt)}</span>
                </div>
                <div style="color:#9ca3af;font-size:0.85rem;margin-top:2px;">
                    ${esc(nombreCli)} · ${esc(formatDate(r.fecha))} · ${items.length} monto(s)
                </div>
            </div>`;
        }).join('');
    }

    container.querySelector('#rc-nueva').addEventListener('click', () => openNuevaRecargaModal(container));
    const buscar = container.querySelector('#rc-buscar');
    buscar.addEventListener('input', () => {
        listQuery = buscar.value;
        const recs = searchRecargas(listQuery);
        // Re-render solo la lista para no perder el foco del buscador.
        renderListRows(container, recs);
    });
    wireListRows(container);
}

function renderListRows(container, recargas) {
    const listEl = container.querySelector('#rc-list');
    if (!listEl) return;
    if (recargas.length === 0) {
        listEl.innerHTML = `<div class="empty-state">No hay recargas que coincidan con la búsqueda.</div>`;
        return;
    }
    listEl.innerHTML = recargas.map(r => {
        const cli = clientRepository.getById(r.clienteId);
        const nombreCli = cli ? `${cli.nombreCompleto || ''} ${cli.apellidosCompletos || ''}`.trim() : '—';
        const items = getItems(r.id);
        const tot = totalesPorMoneda(r.id);
        const totTxt = Object.keys(tot).length ? Object.entries(tot).map(([m, n]) => money(n, m)).join('  ·  ') : 'Sin montos';
        return `<div class="rc-row" data-id="${esc(r.id)}" role="button" tabindex="0"
                style="border:1px solid #1f2937;border-radius:10px;padding:0.7rem 0.9rem;margin-bottom:0.5rem;cursor:pointer;background:#111827;">
            <div style="display:flex;justify-content:space-between;gap:0.8rem;flex-wrap:wrap;align-items:baseline;">
                <strong style="color:#f1f5f9;font-size:1.02rem;">${esc(r.nombre || '(sin nombre)')}</strong>
                <span style="color:#34d399;font-weight:700;">${esc(totTxt)}</span>
            </div>
            <div style="color:#9ca3af;font-size:0.85rem;margin-top:2px;">
                ${esc(nombreCli)} · ${esc(formatDate(r.fecha))} · ${items.length} monto(s)
            </div>
        </div>`;
    }).join('');
    wireListRows(container);
}

function wireListRows(container) {
    container.querySelectorAll('.rc-row').forEach(el => {
        el.addEventListener('click', () => { openRecargaId = el.getAttribute('data-id'); paint(container); });
    });
}

// ── Modal: Nueva recarga (cliente + nombre) ────────────────

function openNuevaRecargaModal(container) {
    const activo = getActiveClient();
    nuevaClienteId = activo ? activo.id : null;
    const clients = clientRepository.getAll();
    const hoy = new Date().toISOString().split('T')[0];

    openFormModal({
        title: 'Nueva recarga',
        submitLabel: 'Crear',
        html: `
            <div class="form-group" data-field="clienteId">
                <label>Cliente *</label>
                <div id="rc-cli-sel" style="color:#34d399;font-weight:600;margin-bottom:4px;">
                    ${activo ? esc(`${activo.nombreCompleto} ${activo.apellidosCompletos}`) : 'Ninguno seleccionado'}
                </div>
                <input type="text" id="rc-cli-buscar" autocomplete="off" placeholder="Escribe nombre o DNI para filtrar..."
                    style="width:100%;padding:0.5rem;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#e2e8f0;">
                <div id="rc-cli-list" style="max-height:34vh;overflow-y:auto;border:1px solid #1f2937;border-radius:8px;margin-top:4px;"></div>
            </div>
            <div class="form-group"><label>Nombre de la recarga *</label>
                <input type="text" id="rc-nombre" placeholder="Ej: Recargas mayo, Lote 3..." required></div>
            <div class="form-group"><label>Fecha</label>
                <input type="date" id="rc-fecha" value="${hoy}"></div>
            <div class="form-group"><label>Observaciones</label>
                <textarea id="rc-obs" rows="2"></textarea></div>`,
        onOpen: (overlay) => {
            const input = overlay.querySelector('#rc-cli-buscar');
            const list = overlay.querySelector('#rc-cli-list');
            const selLbl = overlay.querySelector('#rc-cli-sel');
            const norm = s => (s ?? '').toString().toLowerCase();
            const renderCli = (q) => {
                const query = norm(q).trim();
                const matches = clients.filter(c => !query ||
                    norm(`${c.nombreCompleto} ${c.apellidosCompletos} ${c.dni}`).includes(query)).slice(0, 50);
                list.innerHTML = matches.map(c => `
                    <div class="rc-cli-item" data-id="${esc(c.id)}" role="button" tabindex="0"
                        style="padding:0.45rem 0.6rem;border-bottom:1px solid #1f2937;cursor:pointer;">
                        <div style="color:#e2e8f0;">${esc(c.nombreCompleto)} ${esc(c.apellidosCompletos)}</div>
                        <div style="color:#6b7280;font-size:0.78rem;">DNI: ${esc(c.dni || '—')}</div>
                    </div>`).join('') || '<div style="padding:0.5rem;color:#6b7280;">Sin coincidencias.</div>';
                list.querySelectorAll('.rc-cli-item').forEach(it => it.addEventListener('click', () => {
                    nuevaClienteId = it.getAttribute('data-id');
                    const c = clientRepository.getById(nuevaClienteId);
                    selLbl.textContent = c ? `${c.nombreCompleto} ${c.apellidosCompletos}` : '';
                    input.value = '';
                    renderCli('');
                }));
            };
            input.addEventListener('input', () => renderCli(input.value));
            renderCli('');
        },
        onSubmit: (form) => {
            const result = createRecarga({
                clienteId: nuevaClienteId,
                nombre: form.querySelector('#rc-nombre').value,
                fecha: form.querySelector('#rc-fecha').value,
                observaciones: form.querySelector('#rc-obs').value,
            });
            if (!result.success) { showModalAlert(result.error, 'error'); return; }
            closeFormModal();
            openRecargaId = result.recarga.id;
            paint(container);
        },
    });
}

// ── Vista editor (una recarga) ─────────────────────────────

function renderEditor(container, recarga) {
    const cli = clientRepository.getById(recarga.clienteId);
    const nombreCli = cli ? `${cli.nombreCompleto || ''} ${cli.apellidosCompletos || ''}`.trim() : '—';
    const items = getItems(recarga.id);
    const resumen = resumenPorMoneda(recarga.id);
    // Cabecera: si hay salidas se detalla ingresos/salidas; si no, se ve igual que siempre.
    const totTxt = Object.keys(resumen).length
        ? Object.entries(resumen).map(([m, r]) => money(r.disponible, m)).join('  ·  ')
        : 'Sin montos';
    const detalleTxt = Object.entries(resumen)
        .filter(([, r]) => r.salidas > 0)
        .map(([m, r]) => `Ingresos ${money(r.ingresos, m)} · Salidas ${money(r.salidas, m)}`)
        .join('  ·  ');
    const hayNegativo = Object.values(resumen).some(r => r.disponible < 0);

    // Cuánto quedó en cada banco tras los movimientos internos y las salidas.
    const distrib = distribucionPorBanco(recarga.id);
    const distribHtml = distrib.length === 0 ? '' : `
        <div style="padding:0.5rem 0.7rem;border-top:1px solid #1f2937;">
            <div style="color:#9ca3af;font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;margin-bottom:0.35rem;">Cuánto hay en cada banco</div>
            ${distrib.map(b => `<div style="display:flex;justify-content:space-between;gap:0.75rem;padding:2px 0;font-size:0.87rem;">
                <span style="color:#e2e8f0;">🏦 ${esc(b.nombre)}</span>
                <span style="font-weight:700;white-space:nowrap;">${Object.entries(b.montos)
                    .map(([m, n]) => `<span style="color:${n < 0 ? '#f87171' : '#34d399'};">${esc(money(n, m))}</span>`)
                    .join(' · ')}</span>
            </div>`).join('')}
        </div>`;

    const itemsHtml = items.length === 0
        ? '<div class="empty-state">Aún no hay movimientos. Agrega el primero con "➕ Agregar movimiento".</div>'
        : items.map(it => {
            const banco = bankRepository.getById(it.bancoId)?.nombre || '—';
            const tipo = tipoDeItem(it);
            const cfg = TIPO_CFG[tipo];
            const destino = tipo === 'interno'
                ? ` → ${esc(bankRepository.getById(it.bancoDestinoId)?.nombre || '—')}`
                : tipo === 'salida' ? ` → ${esc(it.destinoDetalle || 'tercero')}` : '';
            const signo = tipo === 'salida' ? '− ' : '';
            return `<div style="display:flex;align-items:center;gap:0.6rem;padding:0.55rem 0.7rem;border-top:1px solid #1f2937;flex-wrap:wrap;">
                ${miniatura(it.evidencia)}
                <div style="flex:1;min-width:160px;">
                    <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;">
                        <span style="background:${cfg.bg};color:${cfg.color};border-radius:99px;padding:1px 8px;font-size:0.7rem;font-weight:700;white-space:nowrap;">${cfg.badge}</span>
                        <span style="color:#f1f5f9;">${esc(banco)}${destino}</span>
                        <span style="color:${cfg.color};font-weight:700;">${signo}${esc(money(it.monto, it.moneda))}</span>
                    </div>
                    <div style="color:#9ca3af;font-size:0.8rem;">${esc(formatDate(it.fecha))}${it.observaciones ? ' · ' + esc(it.observaciones) : ''}</div>
                </div>
                <button type="button" class="btn-icon primary rc-item-edit" data-id="${esc(it.id)}" title="Editar">✏️</button>
                <button type="button" class="btn-icon danger rc-item-del" data-id="${esc(it.id)}" title="Eliminar">🗑️</button>
            </div>`;
        }).join('');

    container.innerHTML = `
        <button type="button" id="rc-volver" class="btn btn-secondary" style="margin-bottom:0.8rem;">← Volver a la lista</button>
        <div style="background:#111827;border:1.5px solid #7c3aed;border-radius:10px;overflow:hidden;margin-bottom:1rem;">
            <div style="padding:0.75rem 0.95rem;display:flex;justify-content:space-between;align-items:center;gap:0.8rem;flex-wrap:wrap;background:#160f26;">
                <div>
                    <strong style="color:#f1f5f9;font-size:1.1rem;">${esc(recarga.nombre || '(sin nombre)')}</strong>
                    <div style="color:#9ca3af;font-size:0.85rem;">${esc(nombreCli)} · ${esc(formatDate(recarga.fecha))}</div>
                    ${recarga.observaciones ? `<div style="color:#9ca3af;font-size:0.82rem;margin-top:2px;">${esc(recarga.observaciones)}</div>` : ''}
                </div>
                <div style="text-align:right;">
                    ${detalleTxt ? `<div style="color:#9ca3af;font-size:0.78rem;">${esc(detalleTxt)}</div>` : ''}
                    <div style="color:${hayNegativo ? '#f87171' : '#34d399'};font-weight:700;font-size:1.05rem;">${detalleTxt ? 'Disponible ' : ''}${esc(totTxt)}</div>
                    <div style="display:flex;gap:6px;margin-top:6px;justify-content:flex-end;">
                        <button type="button" id="rc-editar-cab" class="btn-icon primary" title="Editar cabecera">✏️</button>
                        <button type="button" id="rc-borrar" class="btn-icon danger" title="Eliminar recarga">🗑️</button>
                    </div>
                </div>
            </div>
            ${distribHtml}
            <div style="padding:0.4rem 0.5rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:0.4rem 0.5rem;">
                    <span style="color:#9ca3af;font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">Montos y movimientos</span>
                    <button type="button" id="rc-add-item" class="btn btn-primary" style="padding:0.25rem 0.7rem;font-size:0.82rem;">➕ Agregar movimiento</button>
                </div>
                ${itemsHtml}
            </div>
        </div>`;

    container.querySelector('#rc-volver').addEventListener('click', () => { openRecargaId = null; paint(container); });
    container.querySelector('#rc-add-item').addEventListener('click', () => openItemModal(container, recarga, null));
    container.querySelector('#rc-editar-cab').addEventListener('click', () => openEditHeaderModal(container, recarga));
    container.querySelector('#rc-borrar').addEventListener('click', async () => {
        if (await confirmarEliminacion(`¿Eliminar la recarga "${recarga.nombre || ''}" y todos sus montos?`)) {
            deleteRecarga(recarga.id);
            openRecargaId = null;
            paint(container);
        }
    });
    container.querySelectorAll('.rc-item-edit').forEach(b => b.addEventListener('click', () => {
        const it = items.find(x => x.id === b.getAttribute('data-id'));
        if (it) openItemModal(container, recarga, it);
    }));
    container.querySelectorAll('.rc-item-del').forEach(b => b.addEventListener('click', async () => {
        if (await confirmarEliminacion('¿Eliminar este monto?')) { deleteItem(b.getAttribute('data-id')); paint(container); }
    }));
    container.querySelectorAll('.rc-ver').forEach(el => el.addEventListener('click', () => {
        const f = el.getAttribute('data-file'); if (f) openFileViewer(f);
    }));
}

// ── Modal: editar cabecera ─────────────────────────────────

function openEditHeaderModal(container, recarga) {
    openFormModal({
        title: 'Editar recarga',
        submitLabel: 'Guardar',
        html: `
            <div class="form-group"><label>Nombre de la recarga *</label>
                <input type="text" id="rc-e-nombre" value="${esc(recarga.nombre || '')}" required></div>
            <div class="form-group"><label>Fecha</label>
                <input type="date" id="rc-e-fecha" value="${esc(recarga.fecha || '')}"></div>
            <div class="form-group"><label>Observaciones</label>
                <textarea id="rc-e-obs" rows="2">${esc(recarga.observaciones || '')}</textarea></div>`,
        onSubmit: (form) => {
            const result = updateRecarga(recarga.id, {
                nombre: form.querySelector('#rc-e-nombre').value,
                fecha: form.querySelector('#rc-e-fecha').value,
                observaciones: form.querySelector('#rc-e-obs').value,
            });
            if (!result.success) { showModalAlert(result.error, 'error'); return; }
            closeFormModal();
            paint(container);
        },
    });
}

// ── Modal: agregar / editar monto ──────────────────────────

function openItemModal(container, recarga, item) {
    evidenceUrl = item ? (item.evidencia || null) : null;
    uploading = false;
    const bancos = bancosDeCliente(recarga.clienteId);
    // Incluir el banco actual del ítem aunque el cliente ya no tenga tarjeta ahí.
    if (item && item.bancoId && !bancos.some(b => b.id === item.bancoId)) {
        bancos.push({ id: item.bancoId, nombre: bankRepository.getById(item.bancoId)?.nombre || '(banco)' });
    }
    const hoy = new Date().toISOString().split('T')[0];
    const bankOpts = `<option value="">-- Seleccione --</option>` + bancos.map(b =>
        `<option value="${esc(b.id)}" ${item && item.bancoId === b.id ? 'selected' : ''}>${esc(b.nombre)}</option>`).join('');
    const monedaOpts = MONEDAS.map(m =>
        `<option value="${m}" ${(item ? item.moneda : 'PEN') === m ? 'selected' : ''}>${m === 'USD' ? 'USD ($)' : 'PEN (S/)'}</option>`).join('');
    const tipoActual = item ? tipoDeItem(item) : 'ingreso';
    const tipoOpts = TIPOS_ITEM.map(t =>
        `<option value="${t.id}" ${tipoActual === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('');
    // Banco destino (solo movimiento interno): mismas opciones que el origen.
    const destOpts = `<option value="">-- Seleccione --</option>` + bancos.map(b =>
        `<option value="${esc(b.id)}" ${item && item.bancoDestinoId === b.id ? 'selected' : ''}>${esc(b.nombre)}</option>`).join('');

    openFormModal({
        title: item ? 'Editar movimiento' : 'Agregar movimiento',
        submitLabel: item ? 'Guardar' : 'Agregar',
        html: `
            ${bancos.length === 0 ? '<div style="color:#f59e0b;margin-bottom:0.6rem;">Este cliente no tiene bancos con tarjeta registrada.</div>' : ''}
            <div class="form-group"><label>Tipo de movimiento *</label><select id="rc-i-tipo">${tipoOpts}</select></div>
            <div class="form-row">
                <div class="form-group"><label id="rc-i-banco-lbl">Banco *</label><select id="rc-i-banco" required>${bankOpts}</select></div>
                <div class="form-group"><label>Fecha *</label><input type="date" id="rc-i-fecha" value="${esc(item?.fecha || hoy)}" required></div>
            </div>
            <div class="form-group" id="rc-i-row-dest" style="display:none;">
                <label>Banco de destino *</label><select id="rc-i-banco-dest">${destOpts}</select>
                <div style="font-size:0.75rem;color:#6b7280;margin-top:2px;">El total de la recarga no cambia: la plata solo se reparte entre bancos.</div>
            </div>
            <div class="form-group" id="rc-i-row-tercero" style="display:none;">
                <label>¿A quién se envió? *</label>
                <input type="text" id="rc-i-destino-detalle" maxlength="255" value="${esc(item?.destinoDetalle || '')}" placeholder="Ej: Interbank de Juan Pérez">
                <div style="font-size:0.75rem;color:#6b7280;margin-top:2px;">Esta plata sale del total por justificar. No la registres además como gasto en el Cuadre.</div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Monto *</label><input type="number" id="rc-i-monto" min="0" step="0.01" value="${esc(item?.monto ?? '')}" placeholder="Ej: 150.00" required></div>
                <div class="form-group"><label>Moneda *</label><select id="rc-i-moneda">${monedaOpts}</select></div>
            </div>
            <div class="form-group">
                <label>Evidencia (opcional)</label>
                <input type="file" id="rc-i-evidencia" accept=".pdf,.jpg,.jpeg,.png,.webp">
                <div id="rc-i-evidencia-status" style="font-size:0.85rem;margin-top:0.3rem;">${item?.evidencia ? '📎 Ya tiene evidencia (sube otra para reemplazarla)' : ''}</div>
            </div>
            <div class="form-group"><label>Observaciones</label><textarea id="rc-i-obs" rows="2">${esc(item?.observaciones || '')}</textarea></div>`,
        onOpen: (overlay) => {
            // Mostrar solo los campos del tipo elegido (sin `required` en los ocultos:
            // bloquearían el envío sin explicar por qué; la validación real va en el servicio).
            const tipoSel = overlay.querySelector('#rc-i-tipo');
            const rowDest = overlay.querySelector('#rc-i-row-dest');
            const rowTercero = overlay.querySelector('#rc-i-row-tercero');
            const bancoLbl = overlay.querySelector('#rc-i-banco-lbl');
            const sync = () => {
                const t = tipoSel.value;
                rowDest.style.display = t === 'interno' ? '' : 'none';
                rowTercero.style.display = t === 'salida' ? '' : 'none';
                bancoLbl.textContent = t === 'ingreso' ? 'Banco *' : 'Banco de origen *';
            };
            tipoSel.addEventListener('change', sync);
            sync();

            const input = overlay.querySelector('#rc-i-evidencia');
            const status = overlay.querySelector('#rc-i-evidencia-status');
            input.addEventListener('change', () => {
                const file = input.files[0];
                if (!file) return;
                uploading = true; status.textContent = '⏳ Subiendo archivo...'; status.style.color = '#f59e0b';
                uploadFile(file).then(url => {
                    evidenceUrl = url; uploading = false; status.textContent = '✓ Archivo subido'; status.style.color = '#10b981';
                }).catch(() => {
                    uploading = false; input.value = ''; status.textContent = 'Error al subir.'; status.style.color = '#ef4444';
                });
            });
        },
        onSubmit: (form) => {
            if (uploading) { showModalAlert('Espere a que termine de subir la evidencia.', 'error'); return; }
            const data = {
                bancoId: form.querySelector('#rc-i-banco').value,
                tipo: form.querySelector('#rc-i-tipo').value,
                bancoDestinoId: form.querySelector('#rc-i-banco-dest').value || null,
                destinoDetalle: form.querySelector('#rc-i-destino-detalle').value,
                monto: form.querySelector('#rc-i-monto').value,
                moneda: form.querySelector('#rc-i-moneda').value,
                fecha: form.querySelector('#rc-i-fecha').value,
                evidencia: evidenceUrl,
                observaciones: form.querySelector('#rc-i-obs').value,
            };
            const result = item ? updateItem(item.id, data) : addItem(recarga.id, data);
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
        ? `<img src="${esc(url)}" class="rc-ver" data-file="${esc(url)}" title="Ver evidencia" style="${base}object-fit:cover;background:#fff;">`
        : `<span class="rc-ver" data-file="${esc(url)}" title="Ver evidencia" style="${base}display:inline-flex;align-items:center;justify-content:center;background:#1f2937;color:#e2e8f0;">📄</span>`;
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
