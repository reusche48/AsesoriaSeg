import { getActiveClient, setActiveClient } from '../state/clientContext.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { claimEventRepository } from '../repositories/claimEventRepository.js';
import { openFileViewer } from '../app.js';
import { getCollection, loadCollections, uploadFile } from '../storage.js';
import { changeClaimState, reopenClaim } from '../services/claimService.js';
import { getEventsWithDeadline } from '../services/claimEventService.js';
import { openFormModal, closeFormModal, showModalAlert } from './modalHelper.js';
import { getNextActionsForClient } from '../services/nextActionService.js';
import { markStepComplete, reopenStep, esOpcional } from '../services/claimStepService.js';
import { confirmarEliminacion } from '../utils.js';
import { setEventPreselectClaim, setEventPreselectEvent } from './claimEventUI.js';
import { openStepEventModal } from './claimEventModal.js';
import { startAutoRefresh, stopAutoRefresh } from './autoRefresh.js';

/** Huella de datos para detectar avances de otros dispositivos. */
function guiaSignature() {
    const ev = getCollection('claimEvents').length;
    const st = getCollection('claimSteps').map(s => s.id + s.estado).join();
    const pay = getCollection('payments').length;
    const vu = getCollection('vueltas').map(v => v.id + v.estado).join();
    const cl = getCollection('claims').map(c => c.id + c.estado).join();
    return `e${ev}|s${st}|p${pay}|v${vu}|c${cl}`;
}

const ESTADO_GENERAL = {
    hecho:        { bg: '#064e3b', color: '#34d399', label: '✓ Hecho' },
    pendiente:    { bg: '#78350f', color: '#fbbf24', label: '◷ Pendiente' },
    proximamente: { bg: '#1f2937', color: '#9ca3af', label: 'Próximamente' },
};
const ESTADO_PASO = {
    completado: { color: '#10b981', label: '✓ Completado' },
    en_curso:   { color: '#f59e0b', label: '◷ En curso' },
    pendiente:  { color: '#9ca3af', label: 'Pendiente' },
};

export function renderGuiaSection(container) {
    stopAutoRefresh();
    const active = getActiveClient();
    if (!active) {
        renderPicker(container);
        return;
    }
    renderForClient(container, active);
    startAutoRefresh('#guia', ['claims', 'claimEvents', 'claimSteps', 'payments', 'vueltas', 'incidents'],
        guiaSignature, () => renderGuiaSection(container), 8000);
}

function renderPicker(container) {
    const clients = clientRepository.getAll()
        .slice()
        .sort((a, b) => `${a.nombreCompleto} ${a.apellidosCompletos}`.localeCompare(`${b.nombreCompleto} ${b.apellidosCompletos}`));

    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">🧭 Guía / Secretaria</h2>
            <p style="color:#9ca3af;">Selecciona un cliente para ver qué hacer ahora con su trámite.</p>
            <div class="form-group" style="max-width:480px;">
                <label for="guia-client">Cliente</label>
                <input type="text" id="guia-client" autocomplete="off" placeholder="Escribe nombre o DNI para filtrar...">
                <div id="guia-client-list" style="margin-top:0.4rem;max-height:55vh;overflow-y:auto;border:1px solid #1f2937;border-radius:8px;background:#0b1220;"></div>
            </div>
        </div>`;

    const input = container.querySelector('#guia-client');
    const list = container.querySelector('#guia-client-list');

    const norm = s => (s ?? '').toString().toLowerCase();
    function renderList(query) {
        const q = norm(query).trim();
        const matches = clients.filter(c => !q || norm(`${c.nombreCompleto} ${c.apellidosCompletos} ${c.dni}`).includes(q));
        if (matches.length === 0) {
            list.innerHTML = `<div style="padding:0.75rem;color:#6b7280;">Sin clientes que coincidan.</div>`;
            return;
        }
        list.innerHTML = matches.map(c => `
            <div class="guia-client-item" data-id="${esc(c.id)}" role="button" tabindex="0"
                 style="padding:0.65rem 0.85rem;border-bottom:1px solid #1f2937;cursor:pointer;color:#f1f5f9;">
                <div>${esc(c.nombreCompleto)} ${esc(c.apellidosCompletos)}</div>
                <div style="font-size:0.78rem;color:#9ca3af;">DNI: ${esc(c.dni || '—')}</div>
            </div>`).join('');
        list.querySelectorAll('.guia-client-item').forEach(el => {
            el.addEventListener('click', () => { setActiveClient(el.getAttribute('data-id')); renderGuiaSection(container); });
        });
    }

    input.addEventListener('input', () => renderList(input.value));
    renderList('');
}

function renderForClient(container, client) {
    const { generales, porBanco } = getNextActionsForClient(client.id);

    const generalesHtml = generales.map(g => {
        const cfg = ESTADO_GENERAL[g.estado] || ESTADO_GENERAL.pendiente;
        const clickable = g.hash && g.estado !== 'proximamente';
        return `<div class="guia-gen-step" ${clickable ? `data-hash="${esc(g.hash)}" style="cursor:pointer;"` : ''}
            style="display:flex;align-items:center;gap:0.75rem;padding:0.55rem 0.75rem;border-bottom:1px solid #1f2937;">
            <span style="width:22px;height:22px;border-radius:50%;background:#1f2937;color:#9ca3af;display:inline-flex;align-items:center;justify-content:center;font-size:0.78rem;flex:0 0 auto;">${g.orden}</span>
            <div style="flex:1;">
                <div style="color:#f1f5f9;">${esc(g.label)}</div>
                ${g.detalle ? `<div style="font-size:0.78rem;color:#9ca3af;">${esc(g.detalle)}</div>` : ''}
            </div>
            <span style="background:${cfg.bg};color:${cfg.color};border-radius:99px;padding:2px 10px;font-size:0.76rem;font-weight:700;white-space:nowrap;">${cfg.label}</span>
        </div>`;
    }).join('');

    const bancosHtml = porBanco.length === 0
        ? '<div class="empty-state">Este cliente aún no tiene reclamos. Inicia uno en Reclamos.</div>'
        : porBanco.map(b => renderBancoCard(b)).join('');

    container.innerHTML = `
        <div class="section">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                <h2 class="section-title" style="margin:0;">🧭 Guía: ${esc(client.nombreCompleto)} ${esc(client.apellidosCompletos)}</h2>
                <div style="display:flex;gap:0.5rem;">
                    <button type="button" class="btn btn-secondary" id="guia-actualizar" title="Traer lo último del servidor">🔄 Actualizar</button>
                    <button type="button" class="btn btn-secondary" id="guia-cambiar">Cambiar cliente</button>
                </div>
            </div>
            <h3 style="color:#cbd5e1;font-size:0.95rem;margin:1rem 0 0.25rem;">Pasos generales</h3>
            <div style="background:#111827;border:1px solid #1f2937;border-radius:8px;overflow:hidden;">${generalesHtml}</div>
            <h3 style="color:#cbd5e1;font-size:0.95rem;margin:1.25rem 0 0.5rem;">Trámite por banco</h3>
            <div style="display:flex;flex-direction:column;gap:0.75rem;">${bancosHtml}</div>
        </div>`;

    container.querySelector('#guia-actualizar').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true; btn.textContent = 'Actualizando…';
        try { await loadCollections(['claims', 'claimEvents', 'claimSteps', 'payments', 'vueltas', 'incidents']); } catch (err) { /* ignore */ }
        renderGuiaSection(container);
    });
    container.querySelector('#guia-cambiar').addEventListener('click', () => { setActiveClient(null); renderGuiaSection(container); });
    container.querySelectorAll('.guia-gen-step[data-hash]').forEach(el => {
        el.addEventListener('click', () => { window.location.hash = el.getAttribute('data-hash'); });
    });

    // Evidencias de las partes registradas en cada paso
    container.querySelectorAll('.guia-ev-ver').forEach(a => {
        a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openFileViewer(a.getAttribute('data-file')); });
    });

    // Al tocar la línea del evento: ir al módulo Eventos y abrirlo en edición.
    container.querySelectorAll('.guia-ev-det').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.guia-ev-ver')) return; // el 📎 abre la evidencia, no navega
            const evId = el.getAttribute('data-ev');
            const ev = claimEventRepository.getAll().find(x => x.id === evId);
            setEventPreselectEvent(evId);
            if (ev) setEventPreselectClaim(ev.reclamoId);
            window.location.hash = '#eventos';
        });
    });

    // Acciones por banco
    porBanco.forEach(b => {
        const card = container.querySelector(`[data-claim="${b.claimId}"]`);
        if (!card) return;
        card.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-action');
                const stepId = btn.getAttribute('data-step');
                const paso = b.steps.find(s => s.id === stepId) || b.pasoActual;
                if (action === 'registrar') {
                    openStepEventModal({ claimId: b.claimId, paso, onDone: () => renderGuiaSection(container) });
                } else if (action === 'completar') {
                    markStepComplete(stepId);
                    renderGuiaSection(container);
                } else if (action === 'historial') {
                    setEventPreselectClaim(b.claimId);
                    window.location.hash = '#eventos';
                } else if (action === 'culminar') {
                    openCulminarModal(container, b);
                } else if (action === 'reabrir-reclamo') {
                    (async () => {
                        if (!await confirmarEliminacion(
                            '¿Reabrir este reclamo? Volverá a "En Proceso" y podrás seguir trabajando sus pasos. Quedará constancia en el historial. No se borra nada.',
                            { titulo: '↩ Reabrir reclamo', confirmLabel: 'Reabrir reclamo', confirmColor: '#7c3aed' }
                        )) return;
                        const r = reopenClaim(b.claimId);
                        if (r.success) renderGuiaSection(container); else alert(r.errors?.[0]?.message || 'No se pudo reabrir.');
                    })();
                } else if (action === 'reabrir') {
                    (async () => {
                        if (!await confirmarEliminacion(
                            '¿Reabrir este paso? Volverá a estar activo para seguir trabajándolo. No se borra nada de lo registrado.',
                            { titulo: '↩ Reabrir paso', confirmLabel: 'Reabrir', confirmColor: '#7c3aed' }
                        )) return;
                        reopenStep(stepId);
                        renderGuiaSection(container);
                    })();
                }
            });
        });
    });
}

function renderBancoCard(b) {
    // Reclamo Culminado: pasos de solo lectura (sin iniciar, sin reabrir).
    const reclamoCerrado = b.estadoReclamo === 'Culminado';
    const actuales = reclamoCerrado ? [] : ((b.pasosActuales && b.pasosActuales.length) ? b.pasosActuales : (b.pasoActual ? [b.pasoActual] : []));
    const actualesSet = new Set(actuales.map(s => s.id));
    // Botones de acción de un paso (se muestran AL COSTADO del paso, no abajo).
    const botonesDePaso = (cur) => {
        const btns = [];
        if (cur.estado === 'pendiente') {
            btns.push(`<button type="button" class="btn btn-primary" data-action="registrar" data-step="${esc(cur.id)}" style="padding:0.3rem 0.7rem;font-size:0.8rem;white-space:nowrap;">▶ Iniciar paso</button>`);
        } else if (cur.estado === 'en_curso') {
            if (cur.tipoPaso === 'peticion_parcial') {
                btns.push(`<button type="button" class="btn btn-secondary" data-action="registrar" data-step="${esc(cur.id)}" style="padding:0.3rem 0.7rem;font-size:0.8rem;white-space:nowrap;">Registrar parte</button>`);
                btns.push(`<button type="button" class="btn btn-primary" data-action="completar" data-step="${esc(cur.id)}" style="padding:0.3rem 0.7rem;font-size:0.8rem;white-space:nowrap;">✓ Marcar completo</button>`);
            } else {
                btns.push(`<button type="button" class="btn btn-secondary" data-action="registrar" data-step="${esc(cur.id)}" style="padding:0.3rem 0.7rem;font-size:0.8rem;white-space:nowrap;">Agregar seguimiento</button>`);
                btns.push(`<button type="button" class="btn btn-primary" data-action="completar" data-step="${esc(cur.id)}" style="padding:0.3rem 0.7rem;font-size:0.8rem;white-space:nowrap;">✓ Marcar respondido</button>`);
            }
        }
        return btns;
    };

    let pasosHtml;
    if (b.sinPasos) {
        pasosHtml = `<div style="color:#9ca3af;font-size:0.85rem;padding:0.5rem 0;">Sin pasos configurados para este banco. Configúralos en <a href="#plantillasPasos" style="color:#7c3aed;">Pasos por Banco</a>.</div>`;
    } else {
        pasosHtml = b.steps.map(s => {
            const cfg = ESTADO_PASO[s.estado] || ESTADO_PASO.pendiente;
            const esActual = actualesSet.has(s.id);
            const acc = s.accion;
            const stage = Math.floor(Number(s.orden) || 0);
            const btns = esActual ? botonesDePaso(s) : [];
            const labelEstado = (reclamoCerrado && s.estado !== 'completado')
                ? '<span style="color:#6b7280;">— No realizado</span>'
                : cfg.label;
            const right = btns.length
                ? `<div style="display:flex;flex-direction:column;gap:0.3rem;align-items:stretch;">${btns.join('')}</div>`
                : `<span style="color:${cfg.color};font-size:0.76rem;white-space:nowrap;">${labelEstado}${s.estado === 'completado' && !reclamoCerrado ? ` <button type="button" data-action="reabrir" data-step="${esc(s.id)}" title="Reabrir este paso (si lo completaste por error)" style="background:none;border:1px solid #374151;border-radius:6px;color:#9ca3af;cursor:pointer;font-size:0.72rem;padding:1px 7px;margin-left:6px;">↩ Reabrir</button>` : ''}</span>`;
            return `<div style="display:flex;align-items:flex-start;gap:0.6rem;padding:0.5rem 0;border-top:1px solid #1f2937;${esActual ? 'background:#0b1220;' : ''}">
                <span style="width:20px;text-align:center;color:#64748b;font-size:0.78rem;padding-top:3px;">${stage}</span>
                <div style="flex:1;min-width:0;">
                    <span style="color:${esActual ? '#f1f5f9' : '#cbd5e1'};${esActual ? 'font-weight:600;' : ''}">${esc(s.nombre)}</span>
                    ${esOpcional(s) ? ' <span style="background:#1f2937;color:#9ca3af;border-radius:99px;padding:1px 8px;font-size:0.7rem;vertical-align:middle;">opcional</span>' : ''}
                    ${esActual && acc ? `<div style="font-size:0.8rem;color:${acc.color};margin-top:2px;">➜ ${esc(acc.texto)}</div>` : ''}
                    ${s.descripcion ? `<div style="font-size:0.78rem;color:#9ca3af;margin-top:3px;white-space:pre-wrap;line-height:1.35;word-break:break-word;">${descToHtml(s.descripcion)}</div>` : ''}
                    ${(() => {
                        if (!esActual) return '';
                        const evsPaso = eventosDelPaso(s.id);
                        if (!evsPaso.length) return '';
                        return `<div style="margin-top:6px;border-top:1px dashed #1f2937;padding-top:5px;">
                            <div style="font-size:0.72rem;color:#64748b;font-weight:700;margin-bottom:2px;">REGISTRADO EN ESTE PASO (${evsPaso.length})</div>
                            ${evsPaso.slice(0, 5).map(e => `<div class="guia-ev-det" data-ev="${esc(e.id)}" title="Toca para abrir este evento en Eventos y modificarlo" style="font-size:0.78rem;color:#cbd5e1;padding:2px 0;word-break:break-word;cursor:pointer;">
                                • ${formatDateTime(e.fecha)} — ${esc((e.observacion || e.descripcion || '').slice(0, 90))}${(e.observacion || '').length > 90 ? '…' : ''}
                                ${e.evidencia ? ` <a href="#" class="guia-ev-ver" data-file="${esc(e.evidencia)}" style="color:#7c3aed;white-space:nowrap;">📎 ver</a>` : ''}
                                ${(e.archivos || '').split(',').filter(Boolean).length ? ` <span style="color:#64748b;white-space:nowrap;" title="Archivos adjuntos">📎${(e.archivos || '').split(',').filter(Boolean).length}</span>` : ''}
                                ${plazoBadge(e)}
                                <span style="color:#4b5563;font-size:0.72rem;"> ✏️ abrir en Eventos</span>
                            </div>`).join('')}
                            ${evsPaso.length > 5 ? `<div style="font-size:0.74rem;color:#6b7280;">… y ${evsPaso.length - 5} más en "Ver historial"</div>` : ''}
                        </div>`;
                    })()}
                </div>
                <div style="flex:0 0 auto;text-align:right;">${right}</div>
            </div>`;
        }).join('');
    }

    let botones = '';
    if (!b.sinPasos) {
        if (reclamoCerrado) {
            // Resultado del cierre según el último evento de culminación
            const cierre = claimEventRepository.getAll()
                .filter(e => e.reclamoId === b.claimId && (e.descripcion === 'Reclamo indemnizado' || e.descripcion === 'Reclamo rechazado'))
                .sort((a, c) => new Date(c.fecha) - new Date(a.fecha))[0];
            const resTxt = cierre
                ? (cierre.descripcion === 'Reclamo rechazado'
                    ? ' · Resultado: <span style="color:#ef4444;font-weight:700;">NEGATIVO (rechazado)</span>'
                    : ' · Resultado: <span style="color:#10b981;font-weight:700;">POSITIVO (indemnizado)</span>')
                : '';
            botones += `<div style="margin-top:0.5rem;color:#10b981;font-size:0.85rem;display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
                <span>✅ Reclamo culminado — trámite cerrado (solo lectura).${resTxt}</span>
                <button type="button" data-action="reabrir-reclamo" title="Si lo culminaste por error, vuelve a En Proceso" style="background:none;border:1px solid #374151;border-radius:6px;color:#9ca3af;cursor:pointer;font-size:0.74rem;padding:2px 9px;">↩ Reabrir reclamo</button>
            </div>`;
        } else if (b.tramiteCompleto) {
            const nOpc = (b.opcionalesPendientes || []).length;
            botones += `<div style="margin-top:0.5rem;color:#10b981;font-size:0.85rem;">✓ Trámite completo en este banco.${nOpc ? ` <span style="color:#9ca3af;">· Opcional(es) no realizado(s): ${nOpc}</span>` : ''}</div>`;
        }
        const puedeCulminar = b.tramiteCompleto && b.estadoReclamo !== 'Culminado';
        botones += `<div style="margin-top:0.6rem;display:flex;gap:0.4rem;flex-wrap:wrap;">
            ${puedeCulminar ? `<button type="button" class="btn btn-primary" data-action="culminar" style="padding:0.3rem 0.7rem;font-size:0.8rem;">✅ Culminar reclamo</button>` : ''}
            <button type="button" class="btn btn-secondary" data-action="historial" style="padding:0.3rem 0.7rem;font-size:0.8rem;">Ver historial</button>
        </div>`;
    }

    const estadoColor = b.estadoReclamo === 'Culminado' ? '#10b981' : b.estadoReclamo === 'En Proceso' ? '#3b82f6' : '#f59e0b';
    return `<div data-claim="${esc(b.claimId)}" style="background:#111827;border:1px solid #1f2937;border-radius:8px;padding:0.85rem 1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
            <strong style="color:#f1f5f9;">🏦 ${esc(b.bancoNombre)}</strong>
            <span style="color:${estadoColor};font-size:0.8rem;font-weight:700;">${esc(b.estadoReclamo)}</span>
        </div>
        <div style="margin-top:0.4rem;">${pasosHtml}</div>
        ${botones}
    </div>`;
}

/** Eventos (partes) registrados en un paso, más recientes primero, con flag respondido. */
function eventosDelPaso(stepId) {
    const all = claimEventRepository.getAll();
    return all.filter(e => e.stepId === stepId)
        .map(e => ({ ...e, respondido: all.some(x => x.eventoOrigenId === e.id) }))
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

/** Etiqueta de plazo de un evento (si lo tiene). */
function plazoBadge(e) {
    if (!e.fechaVencimiento) return '';
    if (e.respondido) return '<span style="color:#10b981;">· ✓ respondido</span>';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const v = new Date(e.fechaVencimiento); v.setHours(0, 0, 0, 0);
    const d = Math.ceil((v - today) / 86400000);
    if (d < 0) return `<span style="color:#ef4444;">· 🔴 vencido hace ${-d} día(s)</span>`;
    if (d === 0) return '<span style="color:#f59e0b;">· 🟠 vence hoy</span>';
    return `<span style="color:#3b82f6;">· vence en ${d} día(s)</span>`;
}

function formatDateTime(str) {
    if (!str) return '';
    const d = new Date(str);
    if (isNaN(d)) return str;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) + ' ' +
        d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

/** Modal para culminar un reclamo (observación + evidencia opcional del correo de aprobación). */
function openCulminarModal(container, b) {
    let evidenceUrl = null, uploading = false;

    // Avisar qué quedará sin resolver al cerrar (no bloquea: cerrar es decisión del usuario)
    const alertasPend = getEventsWithDeadline().filter(e => e.reclamoId === b.claimId && !e.respondido);
    const opcPend = (b.opcionalesPendientes || []).length;
    let avisoHtml = '';
    if (alertasPend.length || opcPend) {
        const items = [
            ...alertasPend.map(e => `• ${esc(e.descripcion || 'Evento con plazo')} — ${esc(e.estadoAlerta)}`),
            ...(opcPend ? [`• ${opcPend} paso(s) opcional(es) sin realizar`] : []),
        ].join('<br>');
        avisoHtml = `<div style="background:#78350f22;border:1px solid #b45309;border-radius:8px;padding:0.6rem 0.8rem;margin-bottom:0.75rem;font-size:0.83rem;color:#fbbf24;">
            ⚠️ <strong>Al culminar se apagarán estas alertas pendientes:</strong><br>${items}
        </div>`;
    }

    openFormModal({
        title: `✅ Culminar reclamo — ${b.bancoNombre}`, submitLabel: 'Culminar',
        html: `
            ${avisoHtml}
            <p style="color:#9ca3af;font-size:0.85rem;">El reclamo pasará a <strong style="color:#10b981;">Culminado</strong> y se registrará un evento con el resultado y la evidencia.</p>
            <div class="form-group"><label>Resultado del caso *</label>
                <div style="display:flex;flex-direction:column;gap:0.4rem;">
                    <label style="display:flex;align-items:center;gap:0.5rem;font-weight:normal;cursor:pointer;">
                        <input type="radio" name="cul-resultado" value="positivo" style="width:auto;margin:0;flex:0 0 auto;">
                        <span>✅ Positivo — siniestro aprobado / indemnizado</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:0.5rem;font-weight:normal;cursor:pointer;">
                        <input type="radio" name="cul-resultado" value="negativo" style="width:auto;margin:0;flex:0 0 auto;">
                        <span>❌ Negativo — rechazado (incluso tras DEFASEG / Indecopi)</span>
                    </label>
                </div></div>
            <div class="form-group"><label>Observación / resultado *</label>
                <textarea id="cul-obs" rows="3" required placeholder="Ej: Siniestro aprobado — indemnizado según correo adjunto."></textarea></div>
            <div class="form-group"><label>Evidencia (correo/carta de resolución) *</label>
                <input type="file" id="cul-file" accept=".pdf,.jpg,.jpeg,.png,.webp">
                <div id="cul-status" style="font-size:0.82rem;margin-top:4px;color:#9ca3af;min-height:1.2em;"></div></div>`,
        onOpen: (overlay) => {
            const input = overlay.querySelector('#cul-file'), status = overlay.querySelector('#cul-status');
            input.addEventListener('change', () => {
                const file = input.files[0]; if (!file) { evidenceUrl = null; status.textContent = ''; return; }
                uploading = true; status.textContent = '⏳ Subiendo...'; status.style.color = '#f59e0b';
                uploadFile(file).then(u => { evidenceUrl = u; uploading = false; status.textContent = '✓ Subido'; status.style.color = '#10b981'; })
                    .catch(() => { evidenceUrl = null; uploading = false; input.value = ''; status.textContent = 'Error al subir'; status.style.color = '#ef4444'; });
            });
        },
        onSubmit: (form) => {
            if (uploading) { showModalAlert('Espere a que suba el archivo.', 'error'); return; }
            const resultado = form.querySelector('input[name="cul-resultado"]:checked')?.value;
            if (!resultado) { showModalAlert('Indica si el resultado del caso fue positivo o negativo.', 'error'); return; }
            const obs = form.querySelector('#cul-obs').value.trim();
            if (!obs) { showModalAlert('La observación es requerida.', 'error'); return; }
            if (!evidenceUrl) { showModalAlert('La evidencia es obligatoria: adjunta el correo o carta de la resolución.', 'error'); return; }
            // Si el reclamo sigue "Pendiente", avanzar primero a "En Proceso" (sin observación);
            // el paso final a "Culminado" lleva la observación, la evidencia y el resultado.
            if (b.estadoReclamo === 'Pendiente') {
                const r1 = changeClaimState(b.claimId, null);
                if (!r1.success) { showModalAlert(r1.errors?.[0]?.message || 'No se pudo culminar.', 'error'); return; }
            }
            const r = changeClaimState(b.claimId, obs, evidenceUrl, resultado);
            if (r.success) { closeFormModal(); renderGuiaSection(container); }
            else showModalAlert(r.errors?.[0]?.message || 'No se pudo culminar.', 'error');
        },
    });
}

function esc(str) { const d = document.createElement('div'); d.textContent = str ?? ''; return d.innerHTML; }
/** Escapa el texto y convierte URLs en enlaces clicables (para descripciones de pasos). */
function descToHtml(text) {
    return esc(text).replace(/(https?:\/\/[^\s]+)/g,
        '<a href="$1" target="_blank" rel="noopener" style="color:#7c3aed;word-break:break-all;">$1</a>');
}
