import { getEventsWithDeadline, addClaimEvent, getClaimsWithoutActivity } from '../services/claimEventService.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { openFormModal, closeFormModal, clearModalErrors, showModalAlert } from './modalHelper.js';
import { uploadFile, getCollection, isAdminUser } from '../storage.js';
import { CONFIG_KEYS, DEFAULT_DIAS_DORMIDO, getConfigNumber, setConfigValue } from '../services/configService.js';
import { getAtenderHoy } from '../services/attentionService.js';
import { setActiveClient, getActiveClient, onActiveClientChange } from '../state/clientContext.js';
import { advanceRepository } from '../repositories/advanceRepository.js';
import { setEventPreselectClaim } from './claimEventUI.js';
import { startAutoRefresh, stopAutoRefresh } from './autoRefresh.js';

// Pestaña activa de Alertas (se conserva entre re-renders / auto-refresco)
let alertActiveTab = 'vencimientos';

/** Huella de datos para detectar cambios de otros dispositivos. */
function alertsSignature() {
    const ev = getCollection('claimEvents').length;
    const cl = getCollection('claims').map(c => c.id + (c.estado || '')).join();
    const st = getCollection('claimSteps').map(s => s.id + (s.estado || '')).join();
    const cfg = getCollection('config').map(c => c.id + ':' + c.valor).join();
    const vu = getCollection('vueltas').map(v => v.id + (v.estado || '') + (v.denunciaEvidencia ? 'd' : '')).join();
    const pg = getCollection('payments').map(p => p.id + (p.fecha || '')).join();
    return `e${ev}|c${cl}|s${st}|k${cfg}|v${vu}|p${pg}`;
}

/** Navega a la sección Eventos mostrando todos los eventos del reclamo. */
function verHistorialEnEventos(claimId) {
    setEventPreselectClaim(claimId);
    window.location.hash = '#eventos';
}

// Holds evidence URL between file upload and form submit
let _alertEvidenceUrl = null;
// Filtro de cliente activo en la sección Alertas (se conserva entre re-renders)
let alertClientFilter = '';
// Último cliente activo (topbar) aplicado como filtro — para aplicarlo UNA sola vez
// por selección (si el usuario borra el filtro, los re-renders no lo re-imponen).
let lastAppliedActiveClientId = null;

// Re-render inmediato de Alertas cuando cambia el cliente activo (registro único).
let activeClientListenerOn = false;
let alertsContainerRef = null;
function registerActiveClientListener(container) {
    alertsContainerRef = container;
    if (activeClientListenerOn) return;
    activeClientListenerOn = true;
    onActiveClientChange(() => {
        if (!location.hash.startsWith('#alertas') || !alertsContainerRef) return;
        if (document.querySelector('.form-modal-overlay')) return; // no interrumpir un modal
        renderAlertsSection(alertsContainerRef);
    });
}

/** Sincroniza el filtro con el cliente activo del topbar (una vez por selección). */
function syncFilterWithActiveClient() {
    const active = getActiveClient();
    if (active) {
        if (active.id !== lastAppliedActiveClientId) {
            alertClientFilter = `${active.nombreCompleto || ''} ${active.apellidosCompletos || ''}`.trim();
            lastAppliedActiveClientId = active.id;
        }
    } else if (lastAppliedActiveClientId !== null) {
        // Se quitó el cliente activo (✕): volver a mostrar todo
        alertClientFilter = '';
        lastAppliedActiveClientId = null;
    }
}

/** Nombre completo del cliente de un reclamo (objeto claim). */
function clientNameForClaim(claim) {
    if (!claim) return '';
    const incident = incidentRepository.getById(claim.siniestroId);
    const client = incident ? clientRepository.getById(incident.clienteId) : null;
    return client ? `${client.nombreCompleto} ${client.apellidosCompletos}` : '';
}

/** Nombre del cliente a partir del id de reclamo. */
function clientNameForClaimId(claimId) {
    return clientNameForClaim(claimRepository.getById(claimId));
}

/** ¿El nombre coincide con el filtro de cliente actual? (vacío = todos) */
function matchesClientFilter(name) {
    const f = alertClientFilter.trim().toLowerCase();
    if (!f) return true;
    return (name || '').toLowerCase().includes(f);
}

export function renderAlertsSection(container) {
    stopAutoRefresh();
    syncFilterWithActiveClient();
    registerActiveClientListener(container);
    const allEvents = getEventsWithDeadline();
    const allInactive = getClaimsWithoutActivity();
    const tabAct = (t) => alertActiveTab === t;
    const tabStyle = (t) => `padding:0.5rem 1.1rem;border:none;border-radius:6px 6px 0 0;background:${tabAct(t) ? '#7c3aed' : '#1f2937'};color:${tabAct(t) ? '#fff' : '#9ca3af'};font-weight:600;font-size:0.9rem;cursor:pointer;`;

    // Lista de clientes con alertas, para sugerencias del buscador
    const nombresSet = new Set();
    allEvents.forEach(e => { const n = clientNameForClaimId(e.reclamoId); if (n) nombresSet.add(n); });
    allInactive.forEach(i => { const n = clientNameForClaim(i); if (n) nombresSet.add(n); });
    const sugerencias = [...nombresSet].sort();

    container.innerHTML = `
        <div class="section">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
                <h2 class="section-title" style="margin:0;">⚠️ Alertas</h2>
                ${isAdminUser() ? `<button type="button" class="btn btn-secondary" id="alert-config-btn" title="Configurar umbral de casos dormidos">⚙</button>` : ''}
            </div>
            <div style="display:flex;gap:0.5rem;align-items:flex-end;flex-wrap:wrap;margin-bottom:1rem;">
                <div class="form-group" style="flex:1;min-width:240px;margin:0;">
                    <label for="alert-client-search">Buscar por cliente</label>
                    <input type="text" id="alert-client-search" list="alert-client-list" autocomplete="off"
                        placeholder="Escriba un cliente para filtrar (vacío = todos)" value="${esc(alertClientFilter)}">
                    <datalist id="alert-client-list">
                        ${sugerencias.map(n => `<option value="${esc(n)}"></option>`).join('')}
                    </datalist>
                </div>
                <button type="button" class="btn btn-secondary" id="alert-clear-filter" title="Limpiar filtro">✖ Limpiar</button>
            </div>
            <div id="alert-filter-hint" style="font-size:0.82rem;color:#9ca3af;margin-bottom:0.75rem;"></div>
            <div id="alert-kpis" style="margin-bottom:1rem;"></div>
            <div id="atender-hoy" style="margin-bottom:1rem;"></div>
            <div class="tab-bar" style="display:flex;gap:8px;margin-bottom:1rem;border-bottom:2px solid #1f2937;padding-bottom:0;">
                <button class="tab-btn ${tabAct('vencimientos') ? 'active' : ''}" data-tab="vencimientos" style="${tabStyle('vencimientos')}">
                    Vencimientos de Plazos <span id="tab-badge-venc"></span>
                </button>
                <button class="tab-btn ${tabAct('inactividad') ? 'active' : ''}" data-tab="inactividad" style="${tabStyle('inactividad')}">
                    Reclamos sin Actividad <span id="tab-badge-inact"></span>
                </button>
            </div>
            <div id="tab-content-vencimientos" style="display:${tabAct('vencimientos') ? '' : 'none'};"></div>
            <div id="tab-content-inactividad" style="display:${tabAct('inactividad') ? '' : 'none'};"></div>
        </div>
    `;

    function applyFilterAndRender() {
        const events = allEvents.filter(e => matchesClientFilter(clientNameForClaimId(e.reclamoId)));
        const inactive = allInactive.filter(i => matchesClientFilter(clientNameForClaim(i)));

        renderKpiStrip(container); // resumen global: se oculta si hay un cliente filtrado
        renderAtenderHoy(container);
        renderVencimientos(container, events);
        renderInactividad(container, inactive);

        // Badges de las pestañas
        const countVenc = events.filter(e => e.estadoAlerta === 'Vencido' || e.estadoAlerta === 'Vence hoy').length;
        const countInact = inactive.filter(i => i.nivelAlerta === 'Critico' || i.nivelAlerta === 'Sin eventos').length;
        const badgeVenc = container.querySelector('#tab-badge-venc');
        const badgeInact = container.querySelector('#tab-badge-inact');
        badgeVenc.innerHTML = countVenc > 0
            ? `<span style="background:#ef4444;color:#fff;border-radius:10px;padding:1px 7px;font-size:0.75rem;margin-left:6px;">${countVenc}</span>` : '';
        badgeInact.innerHTML = inactive.length > 0
            ? `<span style="background:${countInact > 0 ? '#ef4444' : '#f59e0b'};color:#fff;border-radius:10px;padding:1px 7px;font-size:0.75rem;margin-left:6px;">${inactive.length}</span>` : '';

        // Hint del filtro
        const hint = container.querySelector('#alert-filter-hint');
        hint.innerHTML = alertClientFilter.trim()
            ? `Filtrando por <strong style="color:#f1f5f9;">"${esc(alertClientFilter.trim())}"</strong> — ${events.length} vencimiento(s) y ${inactive.length} reclamo(s) sin actividad.`
            : '';
    }

    // ⚙ Configuración del umbral de "caso dormido" (solo admin)
    const cfgBtn = container.querySelector('#alert-config-btn');
    if (cfgBtn) cfgBtn.addEventListener('click', () => {
        const actual = getConfigNumber(CONFIG_KEYS.DIAS_DORMIDO, DEFAULT_DIAS_DORMIDO);
        openFormModal({
            title: '⚙ Configuración de alertas', submitLabel: 'Guardar',
            html: `
                <div class="form-group">
                    <label>Días sin actividad para considerar un caso "dormido" *</label>
                    <input type="number" id="cfg-dias-dormido" min="1" step="1" value="${actual}" required>
                    <div style="font-size:0.8rem;color:#9ca3af;margin-top:4px;">
                        Un reclamo activo sin ningún evento en este número de días aparecerá en 🔥 Atender hoy.
                        Se aplica a todos los usuarios y dispositivos.
                    </div>
                </div>`,
            onSubmit: async (form) => {
                const n = parseInt(form.querySelector('#cfg-dias-dormido').value);
                if (!Number.isFinite(n) || n < 1) { showModalAlert('Ingrese un número de días válido (mínimo 1).', 'error'); return; }
                try {
                    await setConfigValue(CONFIG_KEYS.DIAS_DORMIDO, n);
                } catch (e) {
                    showModalAlert('No se pudo guardar en el servidor. Intente de nuevo.', 'error');
                    return;
                }
                closeFormModal();
                renderAlertsSection(container);
            },
        });
    });

    // Buscador de cliente
    const searchInput = container.querySelector('#alert-client-search');
    searchInput.addEventListener('input', () => {
        alertClientFilter = searchInput.value;
        applyFilterAndRender();
    });
    container.querySelector('#alert-clear-filter').addEventListener('click', () => {
        alertClientFilter = '';
        searchInput.value = '';
        applyFilterAndRender();
        searchInput.focus();
    });

    // Pestañas
    container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');
            alertActiveTab = tab;
            container.querySelectorAll('.tab-btn').forEach(b => {
                const isActive = b === btn;
                b.style.background = isActive ? '#7c3aed' : '#1f2937';
                b.style.color = isActive ? '#fff' : '#9ca3af';
                b.classList.toggle('active', isActive);
            });
            container.querySelectorAll('[id^="tab-content-"]').forEach(el => {
                el.style.display = el.id === `tab-content-${tab}` ? '' : 'none';
            });
        });
    });

    applyFilterAndRender(); // incluye renderKpiStrip (se oculta si hay filtro activo)

    // Auto-refresco: ver en vivo nuevos eventos/avances de otros dispositivos.
    // No re-pinta si estás escribiendo en el buscador.
    startAutoRefresh('#alertas', ['claims', 'claimEvents', 'incidents', 'claimSteps', 'config', 'vueltas', 'payments'], alertsSignature, () => {
        if (document.activeElement && document.activeElement.id === 'alert-client-search') return;
        renderAlertsSection(container);
    }, 8000);
}

// ──────────────────────────────────────────────
// Fila de KPIs (antes el Dashboard) — resumen global, no filtrado por cliente
// ──────────────────────────────────────────────
function renderKpiStrip(container) {
    const box = container.querySelector('#alert-kpis');
    if (!box) return;
    // Es un resumen GLOBAL (todos los clientes). Con un cliente filtrado estos totales
    // confunden, así que se ocultan; reaparecen al quitar el filtro (ver todos).
    if (alertClientFilter.trim()) { box.innerHTML = ''; box.style.display = 'none'; return; }
    box.style.display = '';
    const clientes = clientRepository.getAll().length;
    const claims = claimRepository.getAll();
    const activos = claims.filter(c => c.estado !== 'Culminado').length;
    const culminados = claims.filter(c => c.estado === 'Culminado').length;
    const montoProceso = claims.filter(c => c.estado !== 'Culminado')
        .reduce((s, c) => s + (Number(c.montoTotal) || 0), 0);
    const adelantos = advanceRepository.getAll().reduce((s, a) => s + (Number(a.montoSoles) || 0), 0);
    const money = n => 'S/ ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const kpi = (icon, valor, label, color) => `
        <div style="flex:1;min-width:130px;background:#111827;border:1px solid #1f2937;border-radius:10px;padding:0.6rem 0.85rem;">
            <div style="font-size:0.78rem;color:#9ca3af;">${icon} ${label}</div>
            <div style="font-size:1.3rem;font-weight:800;color:${color};margin-top:2px;">${valor}</div>
        </div>`;

    box.innerHTML = `<div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
        ${kpi('👤', clientes, 'Clientes', '#f1f5f9')}
        ${kpi('📑', activos, 'Reclamos activos', '#60a5fa')}
        ${kpi('💰', money(montoProceso), 'Monto en proceso', '#34d399')}
        ${kpi('✅', culminados, 'Reclamos culminados', '#a7f3d0')}
        ${kpi('💵', money(adelantos), 'Adelantos entregados', '#c084fc')}
    </div>`;
}

// ──────────────────────────────────────────────
// Bloque prioritario: 🔥 Atender hoy
// ──────────────────────────────────────────────
const SEV_CFG = [
    { badge: '🔴 Vencido',    color: '#ef4444', diasTxt: d => `${d} día(s) vencido` },
    { badge: '🟠 Vence hoy',  color: '#f59e0b', diasTxt: () => 'vence hoy' },
    { badge: '📄 Denuncia',   color: '#c084fc', diasTxt: d => `cerrada hace ${d} día(s)` },
    { badge: '💤 Dormido',    color: '#60a5fa', diasTxt: d => `${d} día(s) sin actividad` },
    { badge: '📋 Por hacer',  color: '#818cf8', diasTxt: d => `vence en ${d} día(s)` },
    { badge: '💳 Pago',       color: '#fbbf24', diasTxt: d => (d == null ? 'sin pago registrado' : `vencido hace ${d} día(s)`) },
    { badge: '⚖️ Cuadre',     color: '#fb923c', diasTxt: () => 'pendiente de cuadrar' },
];

function renderAtenderHoy(container) {
    const box = container.querySelector('#atender-hoy');
    if (!box) return;
    const { items, umbral } = getAtenderHoy();
    const filtered = items.filter(i => matchesClientFilter(i.clienteNombre));
    const hayVencidos = filtered.some(i => i.severidad === 0);

    if (filtered.length === 0) {
        box.innerHTML = `<div style="background:#111827;border:1px solid #065f46;border-radius:10px;padding:0.8rem 1rem;color:#34d399;">
            ✅ Nada urgente por atender hoy. <span style="color:#6b7280;font-size:0.8rem;">(dormido = ${umbral}+ días sin actividad)</span></div>`;
        return;
    }

    const rows = filtered.map((it, idx) => {
        const cfg = SEV_CFG[it.severidad] || SEV_CFG[3];
        const btns = it.tipo === 'cuadre'
            ? `<button type="button" class="btn btn-primary ah-cuadre-btn" data-idx="${idx}" style="padding:0.25rem 0.6rem;font-size:0.78rem;white-space:nowrap;">Ir a Cuadre</button>`
            : it.tipo === 'pago'
            ? `<button type="button" class="btn btn-primary ah-pago-btn" data-idx="${idx}" style="padding:0.25rem 0.6rem;font-size:0.78rem;white-space:nowrap;">Ir a Pagos</button>`
            : it.vueltaId
            ? `<button type="button" class="btn btn-primary ah-vuelta-btn" data-idx="${idx}" style="padding:0.25rem 0.6rem;font-size:0.78rem;white-space:nowrap;">Subir denuncia</button>`
            : [
                `<button type="button" class="btn btn-primary ah-guia-btn" data-idx="${idx}" style="padding:0.25rem 0.6rem;font-size:0.78rem;white-space:nowrap;">Ir a Guía</button>`,
                it.eventoId
                    ? `<button type="button" class="btn btn-secondary ah-seg-btn" data-idx="${idx}" style="padding:0.25rem 0.6rem;font-size:0.78rem;white-space:nowrap;">+ Seguimiento</button>`
                    : `<button type="button" class="btn btn-secondary ah-ev-btn" data-idx="${idx}" style="padding:0.25rem 0.6rem;font-size:0.78rem;white-space:nowrap;">+ Evento</button>`,
            ].join('');
        return `<div style="display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0.75rem;border-top:1px solid #1f2937;flex-wrap:wrap;">
            <span style="color:${cfg.color};font-size:0.78rem;font-weight:700;white-space:nowrap;flex:0 0 92px;">${cfg.badge}</span>
            <div style="flex:1;min-width:180px;">
                <div style="color:#f1f5f9;">${esc(it.clienteNombre)} <span style="color:#9ca3af;">· ${esc(it.bancoNombre)}</span></div>
                <div style="font-size:0.8rem;color:${cfg.color};">${esc(it.queHacer)} <span style="color:#6b7280;">· ${cfg.diasTxt(it.dias)}</span></div>
            </div>
            <div style="display:flex;gap:4px;">${btns}</div>
        </div>`;
    }).join('');

    box.innerHTML = `<div style="background:#111827;border:1.5px solid ${hayVencidos ? '#7f1d1d' : '#7c3aed'};border-radius:10px;overflow:hidden;">
        <div style="padding:0.6rem 0.85rem;display:flex;justify-content:space-between;align-items:center;background:${hayVencidos ? '#1f0a0a' : '#160f26'};">
            <strong style="color:#f1f5f9;">🔥 Atender hoy (${filtered.length})</strong>
            <span style="color:#6b7280;font-size:0.78rem;">dormido = ${umbral}+ días sin actividad</span>
        </div>
        ${rows}
    </div>`;

    box.querySelectorAll('.ah-guia-btn').forEach(btn => btn.addEventListener('click', () => {
        const it = filtered[Number(btn.getAttribute('data-idx'))];
        if (it?.clienteId) { setActiveClient(it.clienteId); window.location.hash = '#guia'; }
    }));
    box.querySelectorAll('.ah-vuelta-btn').forEach(btn => btn.addEventListener('click', () => {
        const it = filtered[Number(btn.getAttribute('data-idx'))];
        if (it?.clienteId) { setActiveClient(it.clienteId); window.location.hash = '#vuelta'; }
    }));
    box.querySelectorAll('.ah-pago-btn').forEach(btn => btn.addEventListener('click', () => {
        const it = filtered[Number(btn.getAttribute('data-idx'))];
        if (it?.clienteId) { setActiveClient(it.clienteId); window.location.hash = '#pagos'; }
    }));
    box.querySelectorAll('.ah-cuadre-btn').forEach(btn => btn.addEventListener('click', () => {
        window.location.hash = '#cuadre';
    }));
    box.querySelectorAll('.ah-seg-btn').forEach(btn => btn.addEventListener('click', () => {
        const it = filtered[Number(btn.getAttribute('data-idx'))];
        if (it) openClaimEventFormModal(container, it.claimId, it.eventoId);
    }));
    box.querySelectorAll('.ah-ev-btn').forEach(btn => btn.addEventListener('click', () => {
        const it = filtered[Number(btn.getAttribute('data-idx'))];
        if (it) openClaimEventFormModal(container, it.claimId, null);
    }));
}

// ──────────────────────────────────────────────
// Tab 1: Vencimientos de plazos
// ──────────────────────────────────────────────
function renderVencimientos(container, events) {
    const content = container.querySelector('#tab-content-vencimientos');

    if (events.length === 0) {
        content.innerHTML = '<div class="empty-state">No hay eventos con plazo de vencimiento registrados.</div>';
        return;
    }

    const rows = events.map(ev => {
        const claim = claimRepository.getById(ev.reclamoId);
        let clientLabel = '-', bankLabel = '-';
        if (claim) {
            const incident = incidentRepository.getById(claim.siniestroId);
            const client = incident ? clientRepository.getById(incident.clienteId) : null;
            const bank = bankRepository.getById(claim.bancoId);
            clientLabel = client ? `${client.nombreCompleto} ${client.apellidosCompletos}` : '-';
            bankLabel = bank ? bank.nombre : '-';
        }

        const estadoStyle = ev.estadoAlerta === 'Vencido'     ? 'color:#ef4444;font-weight:700;' :
                            ev.estadoAlerta === 'Vence hoy'   ? 'color:#f59e0b;font-weight:700;' :
                            ev.estadoAlerta === 'Respondido'  ? 'color:#10b981;font-weight:700;' :
                                                                'color:#3b82f6;font-weight:700;';

        const diasLabel = ev.diasRestantes < 0
            ? `${Math.abs(ev.diasRestantes)} días vencido`
            : ev.diasRestantes === 0 ? 'Hoy' : `${ev.diasRestantes} días`;

        const diasStyle = ev.diasRestantes < 0 ? 'color:#ef4444;font-weight:700;' :
                          ev.diasRestantes <= 3 ? 'color:#f59e0b;font-weight:700;' : '';

        const tipoLabel = ev.tipoDias === 'laborables' ? 'Lab.' : 'Nat.';

        const accionCell = !ev.respondido
            ? `<div style="display:flex;gap:4px;align-items:center;">
                   <button type="button" class="btn btn-secondary ver-historial-venc-btn"
                       style="padding:0.25rem 0.6rem;font-size:0.78rem;white-space:nowrap;"
                       data-claim="${esc(ev.reclamoId)}"
                       data-client="${esc(clientLabel)}"
                       data-bank="${esc(bankLabel)}"
                       title="Ver todos los eventos de este reclamo">Ver Historial</button>
                   <button type="button" class="btn btn-primary followup-btn"
                       style="padding:0.25rem 0.6rem;font-size:0.78rem;white-space:nowrap;"
                       data-id="${esc(ev.id)}"
                       data-reclamo="${esc(ev.reclamoId)}"
                       title="Registrar seguimiento de este evento">+ Seguimiento</button>
               </div>`
            : `<span style="color:#10b981;" title="Ya tiene respuesta">✅ Respondido</span>`;

        return `<tr>
            <td>${esc(clientLabel)}</td>
            <td>${esc(bankLabel)}</td>
            <td>${esc(ev.descripcion)}</td>
            <td>${formatDate(ev.fecha)}</td>
            <td>${ev.diasEspera} ${tipoLabel}</td>
            <td>${formatDate(ev.fechaVencimiento)}</td>
            <td style="${diasStyle}">${diasLabel}</td>
            <td style="${estadoStyle}">${esc(ev.estadoAlerta)}</td>
            <td>${accionCell}</td>
        </tr>`;
    }).join('');

    content.innerHTML = `
        <table class="data-table">
            <thead><tr>
                <th>Cliente</th><th>Banco</th><th>Evento</th><th>Fecha Evento</th>
                <th>Plazo</th><th>Vencimiento</th><th>Días Rest.</th><th>Estado</th><th>Acción</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>`;

    content.querySelectorAll('.followup-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            openClaimEventFormModal(container, btn.getAttribute('data-reclamo'), btn.getAttribute('data-id'));
        });
    });

    content.querySelectorAll('.ver-historial-venc-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            verHistorialEnEventos(btn.getAttribute('data-claim'));
        });
    });
}

// ──────────────────────────────────────────────
// Tab 2: Reclamos sin actividad reciente
// ──────────────────────────────────────────────
function renderInactividad(container, items) {
    const content = container.querySelector('#tab-content-inactividad');

    if (items.length === 0) {
        content.innerHTML = '<div class="empty-state" style="padding:2rem;">✅ Todos los reclamos tienen actividad reciente. ¡Buen trabajo!</div>';
        return;
    }

    const nivelCfg = {
        'Sin eventos': { color: '#ef4444', bg: '#fee2e2', label: 'Sin eventos' },
        'Critico':     { color: '#dc2626', bg: '#fee2e2', label: '🔴 Crítico'  },
        'Urgente':     { color: '#d97706', bg: '#fef3c7', label: '🟠 Urgente'  },
        'Atencion':    { color: '#ca8a04', bg: '#fefce8', label: '🟡 Atención' },
    };

    const rows = items.map(item => {
        const incident = incidentRepository.getById(item.siniestroId);
        const client = incident ? clientRepository.getById(incident.clienteId) : null;
        const bank = bankRepository.getById(item.bancoId);
        const clientLabel = client ? `${client.nombreCompleto} ${client.apellidosCompletos}` : '-';
        const bankLabel = bank ? bank.nombre : '-';

        const cfg = nivelCfg[item.nivelAlerta] || nivelCfg['Atencion'];
        const badge = `<span style="background:${cfg.bg};color:${cfg.color};border-radius:99px;padding:2px 10px;font-size:0.78rem;font-weight:700;white-space:nowrap;">${cfg.label}</span>`;

        const diasText = item.nivelAlerta === 'Sin eventos'
            ? `${item.diasSinActividad}d desde reclamo`
            : `${item.diasSinActividad} días`;
        const diasStyle = item.diasSinActividad >= 30 ? 'color:#ef4444;font-weight:700;' :
                          item.diasSinActividad >= 15 ? 'color:#f59e0b;font-weight:700;' : '';

        const ultimaAct = item.ultimaActividad ? formatDateTime(item.ultimaActividad) : '—';
        const estadoStyle = item.estado === 'Pendiente' ? 'color:#f59e0b;' : 'color:#3b82f6;';

        return `<tr>
            <td>${esc(clientLabel)}</td>
            <td>${esc(bankLabel)}</td>
            <td style="${estadoStyle}">${esc(item.estado || 'Pendiente')}</td>
            <td>${formatDate(item.fecha)}</td>
            <td style="${diasStyle}">${diasText}</td>
            <td>${ultimaAct}</td>
            <td>${item.totalEventos}</td>
            <td>${badge}</td>
            <td>
                <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
                    <button type="button" class="btn btn-secondary ver-historial-btn"
                        style="padding:0.3rem 0.65rem;font-size:0.78rem;white-space:nowrap;"
                        data-claim="${esc(item.id)}"
                        data-client="${esc(clientLabel)}"
                        data-bank="${esc(bankLabel)}"
                        title="Ver todos los eventos de este reclamo">
                        Ver Historial
                    </button>
                    <button type="button" class="btn btn-primary registrar-evento-btn"
                        style="padding:0.3rem 0.65rem;font-size:0.78rem;white-space:nowrap;"
                        data-claim="${esc(item.id)}"
                        title="Registrar nuevo evento para este reclamo">
                        + Evento
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    content.innerHTML = `
        <div style="margin-bottom:0.75rem;font-size:0.85rem;color:#9ca3af;">
            Reclamos activos sin actividad: <strong style="color:#f1f5f9;">${items.length}</strong> —
            Críticos: <strong style="color:#ef4444;">${items.filter(i => i.nivelAlerta === 'Critico' || i.nivelAlerta === 'Sin eventos').length}</strong> |
            Urgentes: <strong style="color:#f59e0b;">${items.filter(i => i.nivelAlerta === 'Urgente').length}</strong> |
            En atención: <strong style="color:#ca8a04;">${items.filter(i => i.nivelAlerta === 'Atencion').length}</strong>
        </div>
        <table class="data-table">
            <thead><tr>
                <th>Cliente</th><th>Banco</th><th>Estado</th><th>Fecha Reclamo</th>
                <th>Sin actividad</th><th>Última actividad</th><th>Eventos</th><th>Nivel</th><th>Acción</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>`;

    content.querySelectorAll('.ver-historial-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            verHistorialEnEventos(btn.getAttribute('data-claim'));
        });
    });

    content.querySelectorAll('.registrar-evento-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            openClaimEventFormModal(container, btn.getAttribute('data-claim'), null);
        });
    });
}

// ──────────────────────────────────────────────
// Modal de evento completo (Seguimiento y Nuevo Evento)
// eventoOrigenId != null → es un seguimiento de un vencimiento
// eventoOrigenId == null → es un evento nuevo
// ──────────────────────────────────────────────
function openClaimEventFormModal(container, reclamoId, eventoOrigenId) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const defaultDateTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    _alertEvidenceUrl = null;

    const isFollowup = !!eventoOrigenId;
    const title = isFollowup ? 'Registrar Seguimiento' : 'Registrar Evento';
    const descOptions = ['Reclamo presentado','Documentación enviada','En revisión','Reclamo observado','Avance del reclamo','Reclamo indemnizado','Reclamo rechazado'];
    const defaultDesc = isFollowup ? 'Avance del reclamo' : 'Reclamo presentado';

    const html = `
        <div class="form-row">
            <div class="form-group" data-field="fecha">
                <label>Fecha y hora *</label>
                <input type="datetime-local" id="modal-alerta-fecha" value="${defaultDateTime}" required>
                <div class="error-message" data-error="fecha"></div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group" data-field="descripcion">
                <label>Descripción *</label>
                <select id="modal-alerta-descripcion" required>
                    <option value="">-- Seleccione --</option>
                    ${descOptions.map(d => `<option value="${d}"${d === defaultDesc ? ' selected' : ''}>${d}</option>`).join('')}
                </select>
                <div class="error-message" data-error="descripcion"></div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group" data-field="observacion">
                <label>Observación *</label>
                <textarea id="modal-alerta-observacion" rows="3" required placeholder="Describa en detalle el estado o avance del reclamo..."></textarea>
                <div class="error-message" data-error="observacion"></div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Evidencia (archivo opcional)</label>
                <input type="file" id="modal-alerta-evidencia">
                <div id="modal-alerta-evidencia-status" style="font-size:0.8rem;color:#9ca3af;margin-top:4px;min-height:1.2em;"></div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Días de espera para respuesta</label>
                <input type="number" id="modal-alerta-dias" min="1" step="1" placeholder="Ej: 30 (opcional)">
            </div>
            <div class="form-group">
                <label>Tipo de días</label>
                <select id="modal-alerta-tipodias">
                    <option value="naturales">Días naturales</option>
                    <option value="laborables">Días laborables (L-V)</option>
                </select>
            </div>
        </div>`;

    openFormModal({
        title,
        html,
        submitLabel: 'Registrar',
        onOpen: (overlay) => {
            const evidenciaInput = overlay.querySelector('#modal-alerta-evidencia');
            const statusDiv = overlay.querySelector('#modal-alerta-evidencia-status');
            evidenciaInput.addEventListener('change', () => {
                const file = evidenciaInput.files[0];
                if (!file) { _alertEvidenceUrl = null; statusDiv.textContent = ''; return; }
                statusDiv.textContent = 'Subiendo archivo...';
                statusDiv.style.color = '#9ca3af';
                uploadFile(file)
                    .then(url => {
                        _alertEvidenceUrl = url;
                        statusDiv.textContent = '✓ Archivo subido correctamente';
                        statusDiv.style.color = '#10b981';
                    })
                    .catch(() => {
                        statusDiv.textContent = 'Error al subir el archivo.';
                        statusDiv.style.color = '#ef4444';
                        _alertEvidenceUrl = null;
                    });
            });
        },
        onSubmit: (form) => {
            clearModalErrors();
            const diasStr = form.querySelector('#modal-alerta-dias').value;
            const dias = diasStr ? parseInt(diasStr) : null;
            const result = addClaimEvent(
                reclamoId,
                form.querySelector('#modal-alerta-fecha').value,
                form.querySelector('#modal-alerta-descripcion').value,
                form.querySelector('#modal-alerta-observacion').value,
                _alertEvidenceUrl,
                dias,
                dias ? form.querySelector('#modal-alerta-tipodias').value : null,
                eventoOrigenId
            );
            if (result.success) {
                closeFormModal();
                renderAlertsSection(container);
            } else {
                const overlay = document.querySelector('.form-modal-overlay');
                if (overlay) result.errors.forEach(err => {
                    const el = overlay.querySelector(`[data-error="${err.field}"]`);
                    if (el) el.textContent = err.message;
                });
            }
        }
    });
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function esc(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}
