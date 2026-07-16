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

    body.innerHTML = notaFiltro + items.map((it, idx) => {
        const cfg = SEV_CFG[it.severidad] || SEV_CFG[3];
        const botones = it.tipo === 'cuadre'
            ? `<button type="button" class="btn btn-primary rail-act" data-act="cuadre" data-idx="${idx}" style="padding:0.25rem 0.55rem;font-size:0.76rem;">Ir a Cuadre</button>`
            : it.tipo === 'pago'
            ? `<button type="button" class="btn btn-primary rail-act" data-act="pago" data-idx="${idx}" style="padding:0.25rem 0.55rem;font-size:0.76rem;">Ir a Pagos</button>`
            : it.vueltaId
            ? `<button type="button" class="btn btn-primary rail-act" data-act="vuelta" data-idx="${idx}" style="padding:0.25rem 0.55rem;font-size:0.76rem;">Subir denuncia</button>`
            : `<button type="button" class="btn btn-primary rail-act" data-act="guia" data-idx="${idx}" style="padding:0.25rem 0.55rem;font-size:0.76rem;">Ir a Guía</button>`
              + (it.eventoId
                  ? `<button type="button" class="btn btn-secondary rail-act" data-act="seg" data-idx="${idx}" style="padding:0.25rem 0.55rem;font-size:0.76rem;">+ Seg.</button>`
                  : `<button type="button" class="btn btn-secondary rail-act" data-act="ev" data-idx="${idx}" style="padding:0.25rem 0.55rem;font-size:0.76rem;">+ Evento</button>`);
        return `<div style="background:#111827;border:1px solid #1f2937;border-left:3px solid ${cfg.color};border-radius:8px;padding:0.5rem 0.6rem;margin-bottom:0.45rem;">
            <div style="color:${cfg.color};font-size:0.72rem;font-weight:700;">${cfg.badge} · ${cfg.diasTxt(it.dias)}</div>
            <div style="color:#f1f5f9;font-size:0.84rem;margin-top:1px;">${esc(it.clienteNombre)} <span style="color:#9ca3af;">· ${esc(it.bancoNombre)}</span></div>
            <div style="color:#cbd5e1;font-size:0.78rem;margin:2px 0 5px;word-break:break-word;">${esc(it.queHacer)}</div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;">${botones}</div>
        </div>`;
    }).join('');

    body.querySelectorAll('.rail-act').forEach(btn => btn.addEventListener('click', () => {
        const it = items[Number(btn.getAttribute('data-idx'))];
        if (!it) return;
        const act = btn.getAttribute('data-act');
        if (act === 'guia' && it.clienteId) { setActiveClient(it.clienteId); closeRail(); window.location.hash = '#guia'; }
        else if (act === 'pago' && it.clienteId) { setActiveClient(it.clienteId); closeRail(); window.location.hash = '#pagos'; }
        else if (act === 'vuelta' && it.clienteId) { setActiveClient(it.clienteId); closeRail(); window.location.hash = '#vuelta'; }
        else if (act === 'cuadre') { closeRail(); window.location.hash = '#cuadre'; }
        else if (act === 'seg') { openClaimEventFormModal(document.getElementById('app-container'), it.claimId, it.eventoId, refreshAlertsRail); }
        else if (act === 'ev') { openClaimEventFormModal(document.getElementById('app-container'), it.claimId, null, refreshAlertsRail); }
    }));
    body.querySelector('.rail-ver-todos')?.addEventListener('click', (e) => { e.preventDefault(); setActiveClient(null); });
    body.scrollTop = prevScroll;
}
