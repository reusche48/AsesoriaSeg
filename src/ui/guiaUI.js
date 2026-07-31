import { getActiveClient, setActiveClient } from '../state/clientContext.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { claimEventRepository } from '../repositories/claimEventRepository.js';
import { openFileViewer } from '../app.js';
import { getCollection, loadCollections, uploadFile } from '../storage.js';
import { changeClaimState, reopenClaim } from '../services/claimService.js';
import { getEventsWithDeadline, archivosCount } from '../services/claimEventService.js';
import { getVueltas, getEvidencias, getBlockingCodes, bancosDeVuelta } from '../services/vueltaService.js';
import { openFormModal, closeFormModal, showModalAlert } from './modalHelper.js';
import { getNextActionsForClient } from '../services/nextActionService.js';
import { markStepComplete, reopenStep, esOpcional } from '../services/claimStepService.js';
import { confirmarEliminacion } from '../utils.js';
import { openEventModal } from './claimEventUI.js';
import { setClientToEdit } from './clientUI.js';
import { openStepEventModal } from './claimEventModal.js';
import { startAutoRefresh, stopAutoRefresh } from './autoRefresh.js';

// Vuelta elegida en el selector (solo aplica cuando el cliente tiene 2+ vueltas).
let selectedVueltaId = null;

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
        const esVuelta = g.hash === '#vuelta';
        const esCliente = g.hash === '#clientes';
        // La FILA es clickeable para hash/vuelta. Para "Registrar cliente" NO — así se
        // pueden seleccionar/copiar los datos (DNI, etc.); ahí el link es solo el título.
        const clickAttr = clickable && !esCliente
            ? (esVuelta ? 'data-vudetalle="1" title="Toca para ver toda la información de la vuelta (denuncia, evidencias, códigos de bloqueo)" style="cursor:pointer;"'
                : `data-hash="${esc(g.hash)}" style="cursor:pointer;"`)
            : '';
        // El paso "Registrar cliente" muestra los datos de contacto AL COSTADO del título
        // (aprovechando el ancho). Solo el título es link; los datos son texto seleccionable.
        const contactoHtml = `<div style="flex:1;min-width:200px;display:flex;flex-wrap:wrap;gap:3px 1.4rem;font-size:0.8rem;color:#9ca3af;">
                <span>🪪 <strong style="color:#cbd5e1;">DNI:</strong> ${esc(client.dni || '—')}</span>
                <span>📞 ${esc(client.telefono1 || '—')}</span>
                <span>✉️ ${esc(client.email1 || '—')}</span>
                <span>📍 ${esc(client.direccion || '—')}</span>
            </div>`;
        const mainHtml = esCliente
            ? `<div style="flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:baseline;gap:0.35rem 1.2rem;">
                <span class="guia-cliente-edit" title="Toca para ver / editar los datos del cliente" style="color:#a78bfa;font-weight:600;cursor:pointer;text-decoration:underline;">${esc(g.label)}</span>
                ${contactoHtml}
            </div>`
            : `<div style="flex:1;min-width:0;">
                <div style="color:#f1f5f9;">${esc(g.label)}</div>
                ${g.detalle ? `<div style="font-size:0.78rem;color:#9ca3af;">${esc(g.detalle)}</div>` : ''}
            </div>`;
        return `<div class="guia-gen-step" ${clickAttr}
            style="display:flex;align-items:center;gap:0.75rem;padding:0.55rem 0.75rem;border-bottom:1px solid #1f2937;">
            <span style="width:22px;height:22px;border-radius:50%;background:#1f2937;color:#9ca3af;display:inline-flex;align-items:center;justify-content:center;font-size:0.78rem;flex:0 0 auto;">${g.orden}</span>
            ${mainHtml}
            <span style="background:${cfg.bg};color:${cfg.color};border-radius:99px;padding:2px 10px;font-size:0.76rem;font-weight:700;white-space:nowrap;align-self:center;">${cfg.label}</span>
        </div>`;
    }).join('');

    // Selector de vuelta: SOLO si el cliente tiene 2+ vueltas. Al elegir una, se muestra
    // el trámite de sus bancos; los reclamos SIN vuelta se muestran SIEMPRE (no se filtran).
    const vueltas = getVueltas(client.id);
    let selectorHtml = '';
    let bancosMostrar = porBanco;
    if (vueltas.length >= 2) {
        if (!vueltas.some(v => v.id === selectedVueltaId)) selectedVueltaId = vueltas[0].id;
        const sv = vueltas.find(v => v.id === selectedVueltaId);
        const vueltaSiniestros = new Set(vueltas.map(v => v.siniestroId).filter(Boolean));
        bancosMostrar = porBanco.filter(b => {
            const claim = claimRepository.getById(b.claimId);
            if (!claim) return false;
            const enSeleccionada = sv && sv.siniestroId && claim.siniestroId === sv.siniestroId;
            const sinVuelta = !vueltaSiniestros.has(claim.siniestroId);
            return enSeleccionada || sinVuelta;
        });
        const hayFueraDeVuelta = bancosMostrar.length < porBanco.length;
        selectorHtml = `
            <h3 style="color:#cbd5e1;font-size:0.95rem;margin:1rem 0 0.4rem;">¿Qué vuelta deseas ver?</h3>
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
                ${vueltas.map(v => {
                    const bancos = bancosDeVuelta(v).map(b => esc(b.nombre)).join(', ') || '—';
                    const sel = v.id === selectedVueltaId;
                    return `<button type="button" class="guia-vuelta-pick" data-vuelta="${esc(v.id)}"
                        style="text-align:left;padding:0.5rem 0.8rem;border-radius:8px;cursor:pointer;border:1.5px solid ${sel ? '#7c3aed' : '#1f2937'};background:${sel ? '#1e1533' : '#111827'};color:#e2e8f0;">
                        <div style="font-weight:700;">🔄 Vuelta del ${formatDateSolo(v.fecha)}${v.estado === 'cerrada' ? '' : ' <span style="color:#fcd34d;font-size:0.72rem;">(en curso)</span>'}</div>
                        <div style="font-size:0.78rem;color:#9ca3af;">${bancos}</div>
                    </button>`;
                }).join('')}
            </div>
            ${hayFueraDeVuelta ? '<div style="font-size:0.78rem;color:#6b7280;margin-top:0.35rem;">Se muestran los bancos de la vuelta elegida + los reclamos que no pertenecen a ninguna vuelta.</div>' : ''}`;
    }

    const bancosHtml = bancosMostrar.length === 0
        ? '<div class="empty-state">Este cliente aún no tiene reclamos. Inicia uno en Reclamos.</div>'
        : bancosMostrar.map(b => renderBancoCard(b)).join('');

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
            ${selectorHtml}
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
    container.querySelectorAll('.guia-vuelta-pick').forEach(btn => btn.addEventListener('click', () => {
        selectedVueltaId = btn.getAttribute('data-vuelta');
        renderGuiaSection(container);
    }));
    container.querySelectorAll('.guia-gen-step[data-hash]').forEach(el => {
        el.addEventListener('click', () => { window.location.hash = el.getAttribute('data-hash'); });
    });
    container.querySelectorAll('.guia-gen-step[data-vudetalle]').forEach(el => {
        el.addEventListener('click', () => openVueltaDetalleModal(container, client.id));
    });
    container.querySelectorAll('.guia-cliente-edit').forEach(el => {
        el.addEventListener('click', (e) => { e.stopPropagation(); setClientToEdit(client.id); window.location.hash = '#clientes'; });
    });

    // Evidencias de las partes registradas en cada paso
    container.querySelectorAll('.guia-ev-ver').forEach(a => {
        a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openFileViewer(a.getAttribute('data-file')); });
    });

    // Al tocar la línea del evento: abrir el modal de detalle (ver / editar / eliminar) aquí mismo.
    container.querySelectorAll('.guia-ev-det').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.guia-ev-ver')) return; // el 📎 abre la evidencia, no el detalle
            const evId = el.getAttribute('data-ev');
            const ev = claimEventRepository.getAll().find(x => x.id === evId);
            if (ev) openEventModal(container, ev, { onDone: () => renderGuiaSection(container) });
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
                    openHistorialModal(container, b);
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
        // Primer paso del reclamo: ahí se muestran también los eventos sin paso del reclamo.
        const primerPasoId = b.steps.length
            ? b.steps.slice().sort((a, c) => (Number(a.orden) || 0) - (Number(c.orden) || 0))[0].id
            : null;
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
                ? `<div class="guia-step-btns" style="display:flex;flex-direction:column;gap:0.3rem;align-items:stretch;">${btns.join('')}</div>`
                : `<span style="color:${cfg.color};font-size:0.76rem;white-space:nowrap;">${labelEstado}${s.estado === 'completado' && !reclamoCerrado ? ` <button type="button" data-action="reabrir" data-step="${esc(s.id)}" title="Reabrir este paso (si lo completaste por error)" style="background:none;border:1px solid #374151;border-radius:6px;color:#9ca3af;cursor:pointer;font-size:0.72rem;padding:1px 7px;margin-left:6px;">↩ Reabrir</button>` : ''}</span>`;
            return `<div class="guia-step-row" style="display:flex;align-items:flex-start;gap:0.6rem;padding:0.5rem 0;border-top:1px solid #1f2937;${esActual ? 'background:#0b1220;' : ''}">
                <span style="width:20px;text-align:center;color:#64748b;font-size:0.78rem;padding-top:3px;">${stage}</span>
                <div style="flex:1;min-width:0;">
                    <span style="color:${esActual ? '#f1f5f9' : '#cbd5e1'};${esActual ? 'font-weight:600;' : ''}">${esc(s.nombre)}</span>
                    ${esOpcional(s) ? ' <span style="background:#1f2937;color:#9ca3af;border-radius:99px;padding:1px 8px;font-size:0.7rem;vertical-align:middle;">opcional</span>' : ''}
                    ${esActual && acc ? `<div style="font-size:0.8rem;color:${acc.color};margin-top:2px;">➜ ${esc(acc.texto)}</div>` : ''}
                    ${s.descripcion ? `<div style="font-size:0.78rem;color:#9ca3af;margin-top:3px;white-space:pre-wrap;line-height:1.35;word-break:break-word;">${descToHtml(s.descripcion)}</div>` : ''}
                    ${(() => {
                        // Muestra los eventos del paso ACTIVO y de los COMPLETADOS. Además, el
                        // PRIMER paso incluye los eventos del reclamo SIN paso (ej. "Reclamo
                        // presentado" o seguimientos antiguos), para que no queden fuera de la secuencia.
                        const esCompletado = s.estado === 'completado';
                        const esPrimero = s.id === primerPasoId;
                        let evsPaso = eventosDelPaso(s.id);
                        if (esPrimero) {
                            const all = claimEventRepository.getAll();
                            const huerfanos = all.filter(e => e.reclamoId === b.claimId && !e.stepId)
                                .map(e => ({ ...e, respondido: all.some(x => x.eventoOrigenId === e.id) }));
                            if (huerfanos.length) {
                                evsPaso = evsPaso.concat(huerfanos).sort((a, c) => new Date(a.fecha) - new Date(c.fecha)
                                    || new Date(a.fechaRegistro || a.fecha) - new Date(c.fechaRegistro || c.fecha));
                            }
                        }
                        if (!esActual && !esCompletado && !esPrimero) return '';
                        if (!evsPaso.length) return '';
                        // En orden cronológico (antiguo→nuevo) mostramos los más recientes;
                        // los anteriores se avisan arriba para no ocultar la actividad reciente.
                        const MAX_EV = 20;
                        const visiblesEv = evsPaso.slice(-MAX_EV);
                        const ocultasEv = evsPaso.length - visiblesEv.length;
                        const encTxt = esCompletado ? `✓ REGISTRADO EN ESTE PASO (${evsPaso.length})` : `REGISTRADO EN ESTE PASO (${evsPaso.length})`;
                        return `<div style="margin-top:6px;border-top:1px dashed #1f2937;padding-top:5px;${esCompletado ? 'opacity:0.85;' : ''}">
                            <div style="font-size:0.72rem;color:${esCompletado ? '#10b981' : '#64748b'};font-weight:700;margin-bottom:2px;">${encTxt}</div>
                            ${ocultasEv > 0 ? `<div style="font-size:0.74rem;color:#6b7280;">… ${ocultasEv} anterior(es) en "Ver historial"</div>` : ''}
                            ${visiblesEv.map(e => `<div class="guia-ev-det" data-ev="${esc(e.id)}" title="Toca para ver, editar o eliminar este evento" style="font-size:0.78rem;color:#cbd5e1;padding:6px 0;border-top:1px solid #1f2937;word-break:break-word;cursor:pointer;">
                                • ${formatDateTime(e.fecha)} — ${esc((e.observacion || e.descripcion || '').slice(0, 90))}${(e.observacion || '').length > 90 ? '…' : ''}
                                ${e.evidencia ? ` <a href="#" class="guia-ev-ver" data-file="${esc(e.evidencia)}" style="color:#7c3aed;white-space:nowrap;">📎 ver</a>` : ''}
                                ${archivosCount(e.archivos) ? ` <span style="color:#64748b;white-space:nowrap;" title="Archivos adjuntos">📎${archivosCount(e.archivos)}</span>` : ''}
                                ${plazoBadge(e)}
                                <span style="color:#4b5563;font-size:0.72rem;"> ✏️ abrir</span>
                            </div>`).join('')}
                        </div>`;
                    })()}
                </div>
                <div class="guia-step-actions" style="flex:0 0 auto;text-align:right;">${right}</div>
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
        // Orden cronológico: lo primero que se hizo arriba, lo último abajo.
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha)
            || new Date(a.fechaRegistro || a.fecha) - new Date(b.fechaRegistro || b.fecha));
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

const TIPO_LABEL_VU = { retiro_cajero: 'Retiro cajero', compra: 'Compra', transferencia: 'Transferencia', otro: 'Otro' };

/** Fecha corta (solo día/mes/año). */
function formatDateSolo(dateStr) {
    if (!dateStr) return '—';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Miniatura clicable de un archivo (imagen real si es foto, ícono si es PDF/otro). */
function miniaturaVu(url) {
    if (!url) return '';
    const clean = String(url).split('?')[0].split('#')[0].toLowerCase();
    const esImg = /\.(jpg|jpeg|png|webp|gif)$/.test(clean);
    const base = 'width:44px;height:44px;border-radius:6px;border:1px solid #334155;cursor:pointer;flex:0 0 auto;';
    return esImg
        ? `<img src="${esc(url)}" class="vudet-ver" data-file="${esc(url)}" alt="archivo" title="Ver archivo" style="${base}object-fit:cover;background:#fff;">`
        : `<span class="vudet-ver" data-file="${esc(url)}" title="Ver archivo (PDF)" style="${base}display:inline-flex;align-items:center;justify-content:center;font-size:1.2rem;background:#111827;">📄</span>`;
}

/** Modal de solo lectura con TODA la información de la(s) vuelta(s) del cliente. */
async function openVueltaDetalleModal(container, clientId) {
    const overlay = document.createElement('div');
    overlay.className = 'audit-popup-overlay';
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.innerHTML = `<div class="audit-popup" style="min-width:320px;max-width:680px;"><div style="color:#9ca3af;padding:1.2rem;text-align:center;">Cargando información de la vuelta…</div></div>`;

    // Guía no precarga estas colecciones: se traen al abrir el detalle (y frescas para reflejar otros equipos).
    try { await loadCollections(['vueltas', 'vueltaEvidencias', 'blockingCodes'], true); } catch (e) { /* usar lo que haya en caché */ }
    if (!document.body.contains(overlay)) return; // el usuario cerró mientras cargaba

    const vueltas = getVueltas(clientId);
    const estadoTag = (v) => v.estado === 'cerrada'
        ? `<span style="background:#064e3b;color:#6ee7b7;border-radius:99px;padding:1px 9px;font-size:0.72rem;font-weight:700;">🔒 Cerrada${v.fechaCierre ? ' · ' + formatDateSolo(v.fechaCierre) : ''}</span>`
        : `<span style="background:#78350f;color:#fcd34d;border-radius:99px;padding:1px 9px;font-size:0.72rem;font-weight:700;">🟡 En curso</span>`;

    const vueltaHtml = (v) => {
        const bancos = bancosDeVuelta(v);
        const evid = getEvidencias(v.id);
        const codes = getBlockingCodes(v.id);
        const codesByBank = new Set(codes.map(c => c.bancoId));

        const bancosHtml = bancos.map(b => {
            const evB = evid.filter(e => e.bancoId === b.id);
            const cdB = codes.filter(c => c.bancoId === b.id);
            const faltaCodigo = !codesByBank.has(b.id);
            const evRows = evB.length ? evB.map(e => `<div style="display:flex;align-items:center;gap:0.55rem;font-size:0.82rem;color:#cbd5e1;padding:3px 0;">
                ${miniaturaVu(e.evidencia) || '<span style="width:44px;flex:0 0 auto;text-align:center;color:#4b5563;">—</span>'}
                <span style="flex:1;min-width:0;word-break:break-word;">${esc(TIPO_LABEL_VU[e.tipo] || e.tipo || '')}${e.concepto ? ' — ' + esc(e.concepto) : ''}${e.fecha ? ' · ' + formatDateSolo(e.fecha) : ''}${e.hora ? ' ' + esc(e.hora) : ''}</span>
                ${e.evidencia ? `<a href="#" class="vudet-ver" data-file="${esc(e.evidencia)}" style="color:#7c3aed;white-space:nowrap;">ver</a>` : ''}
            </div>`).join('') : '<div style="color:#6b7280;font-size:0.8rem;">Sin evidencias</div>';
            const cdRows = cdB.length ? cdB.map(c => `<div style="display:flex;align-items:center;gap:0.55rem;font-size:0.82rem;color:#cbd5e1;padding:3px 0;">
                ${c.evidencia ? miniaturaVu(c.evidencia) : '<span style="width:44px;flex:0 0 auto;text-align:center;font-size:1.2rem;">🔒</span>'}
                <span style="flex:1;min-width:0;word-break:break-word;"><strong>${esc(c.codigo || '')}</strong>${c.observacion ? ' — ' + esc(c.observacion) : ''}${c.fecha ? ' · ' + formatDateSolo(c.fecha) : ''}${c.hora ? ' ' + esc(c.hora) : ''}</span>
                ${c.evidencia ? `<a href="#" class="vudet-ver" data-file="${esc(c.evidencia)}" style="color:#7c3aed;white-space:nowrap;">ver</a>` : ''}
            </div>`).join('') : `<div style="color:${faltaCodigo ? '#ef4444' : '#6b7280'};font-size:0.8rem;">${faltaCodigo ? '⚠️ Falta código de bloqueo' : 'Sin códigos'}</div>`;

            return `<div style="background:#0b1220;border:1px solid ${faltaCodigo ? '#7f1d1d' : '#1f2937'};border-radius:8px;padding:0.6rem 0.8rem;">
                <strong style="color:#f1f5f9;">🏦 ${esc(b.nombre)}</strong>
                <div style="color:#9ca3af;font-size:0.74rem;font-weight:700;margin:0.4rem 0 0.1rem;">EVIDENCIAS (${evB.length})</div>${evRows}
                <div style="color:#9ca3af;font-size:0.74rem;font-weight:700;margin:0.5rem 0 0.1rem;">CÓDIGOS DE BLOQUEO (${cdB.length})</div>${cdRows}
            </div>`;
        }).join('');

        const denuncia = `<div style="background:#0b1220;border:1px solid ${v.denunciaEvidencia ? '#1f2937' : '#7c3aed'};border-radius:8px;padding:0.55rem 0.8rem;display:flex;align-items:center;gap:0.6rem;">
            ${v.denunciaEvidencia ? miniaturaVu(v.denunciaEvidencia) : '<span style="width:44px;flex:0 0 auto;text-align:center;font-size:1.2rem;">📄</span>'}
            <span style="flex:1;min-width:0;color:#cbd5e1;font-size:0.85rem;">📄 <strong>Denuncia</strong>${v.denunciaFecha ? ' · ' + formatDateSolo(v.denunciaFecha) : ' · sin fecha'}${v.denunciaEvidencia ? '' : ' <span style="color:#c084fc;font-weight:700;">(falta subirla)</span>'}</span>
            ${v.denunciaEvidencia ? `<a href="#" class="vudet-ver" data-file="${esc(v.denunciaEvidencia)}" style="color:#7c3aed;white-space:nowrap;">ver</a>` : ''}
        </div>`;

        return `<div style="border:1px solid #1f2937;border-radius:10px;padding:0.7rem 0.85rem;background:#111827;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.5rem;">
                <span style="color:#f1f5f9;font-weight:700;">Vuelta del ${formatDateSolo(v.fecha)}</span>
                ${estadoTag(v)}
            </div>
            <div style="color:#9ca3af;font-size:0.8rem;margin-bottom:0.5rem;">Bancos: ${bancos.map(b => esc(b.nombre)).join(', ') || '—'}</div>
            ${denuncia}
            <div style="margin-top:0.55rem;display:flex;flex-direction:column;gap:0.5rem;">${bancos.length ? bancosHtml : '<div style="color:#9ca3af;font-size:0.82rem;">Esta vuelta no tiene bancos.</div>'}</div>
        </div>`;
    };

    overlay.innerHTML = `
        <div class="audit-popup" style="min-width:340px;max-width:680px;max-height:85vh;overflow-y:auto;">
            <button type="button" class="audit-close">&times;</button>
            <h3>🔄 La Vuelta — información completa (${vueltas.length})</h3>
            ${vueltas.length
                ? `<div style="display:flex;flex-direction:column;gap:0.7rem;">${vueltas.map(vueltaHtml).join('')}</div>`
                : '<div style="color:#9ca3af;padding:0.6rem;">Este cliente aún no tiene vueltas registradas.</div>'}
            <div style="margin-top:0.8rem;border-top:1px solid #1f2937;padding-top:0.6rem;text-align:right;">
                <button type="button" id="vudet-ir" class="btn btn-secondary" style="padding:0.35rem 0.8rem;font-size:0.82rem;">✏️ Editar en La Vuelta</button>
            </div>
        </div>`;
    overlay.querySelector('.audit-close').addEventListener('click', close);
    overlay.querySelector('#vudet-ir').addEventListener('click', () => { close(); window.location.hash = '#vuelta'; });
    overlay.querySelectorAll('.vudet-ver').forEach(el => el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openFileViewer(el.getAttribute('data-file')); }));
}

/** Modal con el historial completo de eventos del reclamo (ver/editar/eliminar cada uno). */
function openHistorialModal(container, b) {
    const overlay = document.createElement('div');
    overlay.className = 'audit-popup-overlay';
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    function render() {
        const all = claimEventRepository.getAll();
        const evs = all.filter(e => e.reclamoId === b.claimId)
            .map(e => ({ ...e, respondido: all.some(x => x.eventoOrigenId === e.id) }))
            .sort((a, c) => new Date(a.fecha) - new Date(c.fecha)
                || new Date(a.fechaRegistro || a.fecha) - new Date(c.fechaRegistro || c.fecha));
        overlay.innerHTML = `
            <div class="audit-popup" style="min-width:340px;max-width:640px;max-height:82vh;overflow-y:auto;">
                <button type="button" class="audit-close">&times;</button>
                <h3>📋 Historial — ${esc(b.bancoNombre)} (${evs.length})</h3>
                ${evs.length ? evs.map(e => `<div class="hist-ev" data-ev="${esc(e.id)}" title="Toca para ver, editar o eliminar" style="display:flex;gap:0.5rem;align-items:flex-start;padding:0.55rem 0;border-top:1px solid #1f2937;cursor:pointer;">
                    <div style="flex:1;min-width:0;">
                        <div style="color:#cbd5e1;font-size:0.82rem;">${formatDateTime(e.fecha)} — ${esc(e.descripcion || '')}</div>
                        ${e.observacion ? `<div style="color:#9ca3af;font-size:0.8rem;white-space:pre-wrap;word-break:break-word;">${esc(e.observacion.slice(0, 160))}${e.observacion.length > 160 ? '…' : ''}</div>` : ''}
                        <div style="font-size:0.75rem;margin-top:2px;">${e.evidencia ? `<a href="#" class="hist-ver" data-file="${esc(e.evidencia)}" style="color:#7c3aed;">📎 evidencia</a> ` : ''}${archivosCount(e.archivos) ? `<span style="color:#64748b;">📎${archivosCount(e.archivos)} adjunto(s)</span> ` : ''}${plazoBadge(e)}</div>
                    </div>
                    <span style="color:#4b5563;font-size:0.72rem;white-space:nowrap;">✏️ abrir</span>
                </div>`).join('') : '<div style="color:#9ca3af;padding:0.6rem;">Sin eventos registrados.</div>'}
            </div>`;
        overlay.querySelector('.audit-close').addEventListener('click', close);
        overlay.querySelectorAll('.hist-ver').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openFileViewer(a.getAttribute('data-file')); }));
        overlay.querySelectorAll('.hist-ev').forEach(row => row.addEventListener('click', () => {
            const ev = claimEventRepository.getById(row.getAttribute('data-ev'));
            if (ev) openEventModal(container, ev, { onDone: () => { renderGuiaSection(container); render(); } });
        }));
    }
    render();
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
