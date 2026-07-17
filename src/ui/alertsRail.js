// Columna lateral "Atender hoy": el centro de operación siempre visible.
// En escritorio es una columna fija a la derecha; en móvil, un panel deslizante
// que se abre con el botón flotante 🔔.
import { getAtenderHoy } from '../services/attentionService.js';
import { setActiveClient, getActiveClientId, getActiveClient, onActiveClientChange } from '../state/clientContext.js';
import { loadCollections } from '../storage.js';
import { openClaimEventFormModal } from './alertsUI.js';

const SEV_CFG = [
    { badge: '🔴 Vencido',    color: '#ef4444', diasTxt: d => `${d} día(s) vencido` },
    { badge: '🟠 Vence hoy',  color: '#f59e0b', diasTxt: () => 'vence hoy' },
    { badge: '📄 Denuncia',   color: '#c084fc', diasTxt: d => `cerrada hace ${d} día(s)` },
    { badge: '💤 Dormido',    color: '#60a5fa', diasTxt: d => `${d} día(s) sin actividad` },
    { badge: '📋 Por hacer',  color: '#818cf8', diasTxt: d => `vence en ${d} día(s)` },
    { badge: '💳 Pago',       color: '#fbbf24', diasTxt: d => (d == null ? 'sin pago registrado' : `vencido hace ${d} día(s)`) },
    { badge: '⚖️ Cuadre',     color: '#fb923c', diasTxt: () => 'pendiente de cuadrar' },
];

// Colecciones que necesita getAtenderHoy para calcular en cualquier pantalla.
const RAIL_COLLECTIONS = ['clients', 'incidents', 'claims', 'claimEvents', 'claimSteps',
    'vueltas', 'blockingCodes', 'banks', 'cards', 'payments', 'recargas', 'recargaItems', 'cuadres', 'cuadreGastos'];

function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

/** Cierra el panel deslizante (móvil). */
function closeRail() {
    document.getElementById('alerts-rail')?.classList.remove('open');
    document.getElementById('alerts-rail-backdrop')?.classList.remove('open');
}

/** Monta los listeners fijos de la columna (una sola vez, al iniciar la app). */
export function mountAlertsRail() {
    document.getElementById('app-layout')?.classList.add('rail-on');
    const rail = document.getElementById('alerts-rail');
    if (rail) rail.style.display = '';

    document.getElementById('alerts-rail-vertodo')?.addEventListener('click', () => { closeRail(); window.location.hash = '#alertas'; });
    document.getElementById('alerts-rail-refresh')?.addEventListener('click', (e) => {
        const b = e.currentTarget;
        b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
        refreshAlertsRail(true); // trae datos frescos del servidor
    });
    document.getElementById('alerts-rail-close')?.addEventListener('click', closeRail);
    document.getElementById('alerts-rail-backdrop')?.addEventListener('click', closeRail);
    document.getElementById('alerts-fab')?.addEventListener('click', () => {
        rail?.classList.add('open');
        document.getElementById('alerts-rail-backdrop')?.classList.add('open');
    });

    // Refrescar la columna cuando cambia el cliente activo (barra superior).
    onActiveClientChange(() => refreshAlertsRail());

    // Auto-refresco periódico: recalcula de la caché (barato) y solo re-pinta si algo
    // cambió. Así, al registrar un pago/seguimiento, la alerta desaparece sola en segundos.
    setInterval(() => refreshAlertsRail(false), 15000);

    refreshAlertsRail();
}

let lastRailSig = null;

/**
 * Recalcula y pinta la lista "Atender hoy" en la columna y actualiza el badge del botón flotante.
 * @param {boolean} force - true = trae datos frescos del servidor y re-pinta siempre (botón 🔄).
 *                          false = recalcula de la caché y solo re-pinta si algo cambió (auto-refresco).
 */
export async function refreshAlertsRail(force = false) {
    const body = document.getElementById('alerts-rail-content');
    if (!body) return;
    try { await loadCollections(RAIL_COLLECTIONS, force); } catch (e) { /* usar lo que haya en caché */ }

    let all = [];
    try { all = getAtenderHoy().items; } catch (e) { all = []; }

    // Respetar el cliente activo (el de la barra superior): si hay uno, solo sus alertas.
    const activeId = getActiveClientId();
    const items = activeId ? all.filter(i => i.clienteId === activeId) : all;

    // Guarda: si nada cambió (y no es refresco manual), no re-pintar (evita saltos de scroll).
    const sig = (activeId || '') + '#' + items.map(i => `${i.claimId || ''}:${i.eventoId || ''}:${i.tipo || ''}:${i.severidad}:${i.dias}`).join('|');
    if (!force && sig === lastRailSig) return;
    lastRailSig = sig;
    const prevScroll = body.scrollTop;

    // Contador de la cabecera y badge flotante (reflejan lo que se muestra).
    const countEl = document.getElementById('alerts-rail-count');
    if (countEl) countEl.textContent = items.length ? items.length : '';
    const urgentes = items.filter(i => i.severidad === 0 || i.severidad === 1).length;
    const fabBadge = document.getElementById('alerts-fab-badge');
    if (fabBadge) { fabBadge.textContent = urgentes; fabBadge.style.display = urgentes > 0 ? 'flex' : 'none'; }

    const cli = activeId ? getActiveClient() : null;
    const notaFiltro = cli
        ? `<div style="font-size:0.76rem;color:#9ca3af;padding:2px 4px 6px;">Filtrado por <strong style="color:#cbd5e1;">${esc(cli.nombreCompleto || '')}</strong> · <a href="#" class="rail-ver-todos" style="color:#a78bfa;">ver todos</a></div>`
        : '';

    if (items.length === 0) {
        body.innerHTML = notaFiltro + `<div style="color:#34d399;padding:0.8rem;font-size:0.85rem;text-align:center;">✅ Nada urgente por atender${cli ? ' de este cliente' : ''}.</div>`;
        body.querySelector('.rail-ver-todos')?.addEventListener('click', (e) => { e.preventDefault(); setActiveClient(null); });
        return;
    }

    // Filtrado: se muestran las alertas del cliente tal cual (sin encabezados de grupo).
    // Sin filtro: se agrupan por cliente y el grupo con más alertas va primero. En ambos
    // casos las tarjetas ya no repiten el nombre del cliente (va arriba o en el encabezado).
    let html = notaFiltro;
    const ordered = []; // orden plano de render; el click usa data-idx contra este arreglo.

    if (cli) {
        items.forEach(it => { html += renderCard(it, ordered.length); ordered.push(it); });
    } else {
        // Agrupar por cliente conservando el orden que trae el servicio dentro del grupo.
        const grupos = new Map(); // clienteKey -> { clienteId, clienteNombre, items: [] }
        for (const it of items) {
            const key = it.clienteId || '—';
            if (!grupos.has(key)) grupos.set(key, { clienteId: it.clienteId || null, clienteNombre: it.clienteNombre || '—', items: [] });
            grupos.get(key).items.push(it);
        }
        // Grupos: más alertas primero; desempate por severidad más urgente y luego días.
        const gruposOrdenados = [...grupos.values()].sort((a, b) =>
            b.items.length - a.items.length
            || Math.min(...a.items.map(i => i.severidad)) - Math.min(...b.items.map(i => i.severidad))
            || (Math.max(...b.items.map(i => i.dias || 0))) - (Math.max(...a.items.map(i => i.dias || 0))));

        for (const g of gruposOrdenados) {
            html += renderGroupHeader(g);
            g.items.forEach(it => { html += renderCard(it, ordered.length); ordered.push(it); });
        }
    }

    body.innerHTML = html;

    body.querySelectorAll('.rail-act').forEach(btn => btn.addEventListener('click', () => {
        const it = ordered[Number(btn.getAttribute('data-idx'))];
        if (!it) return;
        const act = btn.getAttribute('data-act');
        if (act === 'guia' && it.clienteId) { setActiveClient(it.clienteId); closeRail(); window.location.hash = '#guia'; }
        else if (act === 'pago' && it.clienteId) { setActiveClient(it.clienteId); closeRail(); window.location.hash = '#pagos'; }
        else if (act === 'vuelta' && it.clienteId) { setActiveClient(it.clienteId); closeRail(); window.location.hash = '#vuelta'; }
        else if (act === 'cuadre') { closeRail(); window.location.hash = '#cuadre'; }
        else if (act === 'seg') { openClaimEventFormModal(document.getElementById('app-container'), it.claimId, it.eventoId, refreshAlertsRail); }
        else if (act === 'ev') { openClaimEventFormModal(document.getElementById('app-container'), it.claimId, null, refreshAlertsRail); }
    }));
    // Encabezado de grupo: tocarlo filtra la columna por ese cliente.
    body.querySelectorAll('.rail-grupo[data-cliente]').forEach(h => h.addEventListener('click', () => {
        setActiveClient(h.getAttribute('data-cliente'));
    }));
    body.querySelector('.rail-ver-todos')?.addEventListener('click', (e) => { e.preventDefault(); setActiveClient(null); });
    body.scrollTop = prevScroll;
}

/** Encabezado de un grupo de alertas de un mismo cliente (con contador). Tocable si hay clienteId. */
function renderGroupHeader(g) {
    const nombre = g.clienteId ? esc(g.clienteNombre) : 'Sin cliente';
    const attrs = g.clienteId ? ` data-cliente="${esc(g.clienteId)}"` : '';
    const cursor = g.clienteId ? 'cursor:pointer;' : '';
    return `<div class="rail-grupo"${attrs} style="${cursor}display:flex;align-items:center;gap:6px;margin:0.55rem 2px 0.35rem;">
        <span style="color:#f1f5f9;font-size:0.82rem;font-weight:700;">${nombre}</span>
        <span style="background:#1f2937;color:#cbd5e1;font-size:0.7rem;font-weight:700;border-radius:999px;padding:1px 7px;">${g.items.length}</span>
    </div>`;
}

/** Tarjeta de una alerta. NO muestra el nombre del cliente (va en el filtro o en el encabezado de grupo). */
function renderCard(it, idx) {
    const cfg = SEV_CFG[it.severidad] || SEV_CFG[3];
    const botones = it.tipo === 'cuadre'
        ? `<button type="button" class="btn btn-primary rail-act" data-act="cuadre" data-idx="${idx}" style="padding:0.25rem 0.55rem;font-size:0.82rem;">Ir a Cuadre</button>`
        : it.tipo === 'pago'
        ? `<button type="button" class="btn btn-primary rail-act" data-act="pago" data-idx="${idx}" style="padding:0.25rem 0.55rem;font-size:0.82rem;">Ir a Pagos</button>`
        : it.vueltaId
        ? `<button type="button" class="btn btn-primary rail-act" data-act="vuelta" data-idx="${idx}" style="padding:0.25rem 0.55rem;font-size:0.82rem;">Subir denuncia</button>`
        : it.eventoId
            ? `<button type="button" class="btn btn-primary rail-act" data-act="seg" data-idx="${idx}" style="padding:0.25rem 0.55rem;font-size:0.82rem;">+ Seg.</button>`
            : `<button type="button" class="btn btn-primary rail-act" data-act="ev" data-idx="${idx}" style="padding:0.25rem 0.55rem;font-size:0.82rem;">+ Evento</button>`;
    return `<div style="background:#111827;border:1px solid #1f2937;border-left:3px solid ${cfg.color};border-radius:8px;padding:0.5rem 0.6rem;margin-bottom:0.45rem;">
        <div style="color:${cfg.color};font-size:0.78rem;font-weight:700;">${cfg.badge} · ${cfg.diasTxt(it.dias)}</div>
        <div style="color:#9ca3af;font-size:0.86rem;margin-top:1px;">${esc(it.bancoNombre)}</div>
        <div style="color:#cbd5e1;font-size:0.84rem;margin:2px 0 5px;word-break:break-word;">${esc(it.queHacer)}</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">${botones}</div>
    </div>`;
}
