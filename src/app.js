// Punto de entrada principal de la aplicación SPA
// Implementa hash routing, login y control de acceso por permisos

import { initStorage, loadSectionData, getCollection } from './storage.js';
import { login, logout, restoreSession, getSession, hasAccess, getAllowedScreens, isSessionExpired } from './auth.js';
import { renderClientSection } from './ui/clientUI.js';
import { renderBankSection } from './ui/bankUI.js';
import { renderCardSection } from './ui/cardUI.js';
import { renderInsuranceSection } from './ui/insuranceUI.js';
import { renderCoverageSection } from './ui/coverageUI.js';
import { renderIncidentSection } from './ui/incidentUI.js';
import { renderClaimSection } from './ui/claimUI.js';
import { renderClaimEventSection } from './ui/claimEventUI.js';
import { renderPendingClaimsSection } from './ui/pendingClaimsUI.js';
import { renderTrackingSection } from './ui/trackingUI.js';
import { renderAlertsSection } from './ui/alertsUI.js';
import { renderUsersSection } from './ui/usersUI.js';
import { renderActivitySection } from './ui/activityUI.js';
import { renderDashboardSection } from './ui/dashboardUI.js';
import { renderAdvanceSection } from './ui/advanceUI.js';
import { renderAdvanceQuerySection } from './ui/advanceQueryUI.js';
import { renderClientProfileSection } from './ui/clientProfileUI.js';
import { renderUninsuredCardsSection } from './ui/uninsuredCardsUI.js';

/** Mapa de secciones: hash → función de renderizado. */
const routes = {
    dashboard: renderDashboardSection,
    clientes: renderClientSection,
    bancos: renderBankSection,
    tarjetas: renderCardSection,
    seguros: renderInsuranceSection,
    coberturas: renderCoverageSection,
    siniestros: renderIncidentSection,
    reclamos: renderClaimSection,
    eventos: renderClaimEventSection,
    pendientes: renderPendingClaimsSection,
    seguimiento: renderTrackingSection,
    alertas: renderAlertsSection,
    usuarios: renderUsersSection,
    actividad: renderActivitySection,
    adelantos: renderAdvanceSection,
    consultaAdelantos: renderAdvanceQuerySection,
    fichaCliente: renderClientProfileSection,
    tarjetasSinSeguro: renderUninsuredCardsSection,
};

/** Labels para la navegación */
const NAV_LABELS = {
    dashboard: '🏠 Inicio',
    clientes: '👤 Clientes', bancos: '🏦 Bancos', tarjetas: '💳 Tarjetas',
    seguros: '🛡️ Seguros', coberturas: '📋 Coberturas', siniestros: '⚠️ Siniestros',
    reclamos: '📑 Reclamos', eventos: '📅 Eventos', pendientes: '⏳ Pendientes',
    seguimiento: '📊 Seguimiento', alertas: '🔔 Alertas', usuarios: '🔐 Usuarios',
    actividad: '📝 Actividad',
    adelantos: '💵 Adelantos',
    consultaAdelantos: '🔎 Consulta',
    fichaCliente: '📄 Ficha',
    tarjetasSinSeguro: '🔍 Sin Seguro',
};

/** Grupos de navegación — cada grupo se muestra como dropdown */
const NAV_GROUPS = [
    { key: 'dashboard',  label: '🏠 Inicio' },
    { label: '👤 Clientes',   items: ['clientes', 'fichaCliente'] },
    { label: '🏦 Catálogos',  items: ['bancos', 'tarjetas', 'seguros', 'coberturas', 'tarjetasSinSeguro'] },
    { label: '📑 Reclamos',   items: ['siniestros', 'reclamos', 'eventos', 'pendientes', 'seguimiento', 'alertas'] },
    { label: '💵 Adelantos',  items: ['adelantos', 'consultaAdelantos'] },
    { label: '🔐 Admin',      items: ['usuarios', 'actividad'] },
];

function getCurrentSection() {
    const hash = window.location.hash.replace('#', '');
    if (routes[hash] && hasAccess(hash)) return hash;
    // Dashboard primero si tiene acceso
    if (hasAccess('dashboard')) return 'dashboard';
    const allowed = getAllowedScreens();
    return allowed.length > 0 ? allowed[0] : 'dashboard';
}

function updateNavActive(section) {
    // Links directos
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.getAttribute('data-section') === section);
    });
    // Botones de grupo: resaltar si algún hijo está activo
    document.querySelectorAll('.nav-group-btn').forEach(btn => {
        const dropdown = btn.nextElementSibling;
        const hasActive = dropdown && dropdown.querySelector(`.nav-link[data-section="${section}"]`);
        btn.classList.toggle('has-active', !!hasActive);
    });
}

/** Construye la navegación según los permisos del usuario */
function buildNavigation() {
    const nav = document.getElementById('main-nav');
    if (!nav) return;

    const allowed = new Set(getAllowedScreens());
    const session = getSession();

    const groupsHtml = NAV_GROUPS.map(group => {
        // Ítem directo (sin dropdown)
        if (group.key) {
            if (!allowed.has(group.key)) return '';
            const badge = group.key === 'alertas'
                ? `<span id="alerts-badge" style="display:none;background:#e53935;color:#fff;border-radius:10px;padding:1px 6px;font-size:0.7rem;margin-left:4px;vertical-align:middle;"></span>`
                : '';
            return `<a href="#${group.key}" class="nav-link" data-section="${group.key}">${group.label}${badge}</a>`;
        }
        // Grupo con dropdown
        const visibleItems = group.items.filter(k => allowed.has(k));
        if (visibleItems.length === 0) return '';
        // Si solo hay 1 ítem visible, mostrarlo directo sin dropdown
        if (visibleItems.length === 1) {
            const k = visibleItems[0];
            const badge = k === 'alertas'
                ? `<span id="alerts-badge" style="display:none;background:#e53935;color:#fff;border-radius:10px;padding:1px 6px;font-size:0.7rem;margin-left:4px;vertical-align:middle;"></span>`
                : '';
            return `<a href="#${k}" class="nav-link" data-section="${k}">${NAV_LABELS[k] || k}${badge}</a>`;
        }
        const links = visibleItems.map(k => {
            const badge = k === 'alertas'
                ? `<span id="alerts-badge" style="display:none;background:#e53935;color:#fff;border-radius:10px;padding:1px 6px;font-size:0.7rem;margin-left:4px;vertical-align:middle;"></span>`
                : '';
            return `<a href="#${k}" class="nav-link" data-section="${k}">${NAV_LABELS[k] || k}${badge}</a>`;
        }).join('');
        return `<div class="nav-group">
            <button type="button" class="nav-group-btn">${group.label}</button>
            <div class="nav-dropdown">${links}</div>
        </div>`;
    }).join('');

    nav.innerHTML = groupsHtml +
    `<div class="nav-search-wrap" style="margin-left:auto;display:flex;align-items:center;position:relative;">
        <input type="text" id="global-search-input" placeholder="🔍 Buscar..." autocomplete="off"
            style="padding:0.3rem 0.6rem;border:1px solid rgba(255,255,255,0.3);border-radius:4px;font-size:0.82rem;width:140px;background:rgba(255,255,255,0.12);color:#fff;">
        <div id="global-search-results" style="display:none;position:absolute;top:100%;right:0;background:#fff;border:1px solid #ccc;border-radius:4px;min-width:280px;max-height:320px;overflow-y:auto;z-index:1000;box-shadow:0 4px 12px rgba(0,0,0,0.15);"></div>
    </div>` +
    `<a href="#" class="nav-link" id="change-pwd-btn" title="Cambiar contraseña" style="padding:0.4rem 0.5rem;">🔒</a>` +
    `<a href="#" class="nav-link nav-logout" id="logout-btn" title="Cerrar sesión">🚪 ${session?.user?.usuario || ''}</a>`;

    // Cerrar menú/dropdown al seleccionar
    nav.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => nav.classList.remove('open'));
    });

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
            showLoginScreen();
        });
    }

    // Cambiar contraseña
    const changePwdBtn = document.getElementById('change-pwd-btn');
    if (changePwdBtn) {
        changePwdBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showChangePasswordPopup();
        });
    }
}

async function navigateTo(section) {
    if (!hasAccess(section)) {
        const allowed = getAllowedScreens();
        section = allowed.length > 0 ? allowed[0] : null;
        if (!section) return;
        window.location.hash = `#${section}`;
        return;
    }
    const container = document.getElementById('app-container');
    if (!container) return;
    const renderFn = routes[section];
    if (renderFn) {
        container.innerHTML = '<div class="empty-state" style="padding:2rem;">Cargando...</div>';
        updateNavActive(section);
        await loadSectionData(section);
        container.innerHTML = '';
        renderFn(container);
        updateAlertsBadge();
    }
}

/**
 * Abre el modal de visualización de archivos.
 */
export function openFileViewer(dataUrl, format) {
    const modal = document.getElementById('file-viewer-modal');
    const body = document.getElementById('modal-body');
    if (!modal || !body) return;
    const fmt = (format || '').toUpperCase();
    const isPdf = fmt === 'PDF'
        || dataUrl.startsWith('data:application/pdf')
        || dataUrl.toLowerCase().endsWith('.pdf');
    if (isPdf) {
        body.innerHTML = `<iframe src="${dataUrl}"></iframe>`;
    } else {
        body.innerHTML = `<img src="${dataUrl}" alt="Archivo">`;
    }
    modal.style.display = 'flex';
}

/**
 * Genera HTML de un link de auditoría para usar en tablas.
 * @param {object} entity - Entidad con campos creadoPor, modificadoPor, etc.
 * @returns {string} HTML del link
 */
export function auditLinkHtml(entity) {
    const user = entity.creadoPor || '-';
    const data = encodeURIComponent(JSON.stringify({
        creadoPor: entity.creadoPor || '-',
        fechaCreacion: entity.fechaCreacion || '-',
        modificadoPor: entity.modificadoPor || '-',
        fechaModificacion: entity.fechaModificacion || '-',
        equipoRegistro: entity.equipoRegistro || '-',
    }));
    return `<span class="audit-link" data-audit="${data}">${escapeHtmlGlobal(user)}</span>`;
}

/**
 * Muestra el popup de auditoría al hacer clic en un audit-link.
 */
function showAuditPopup(info) {
    // Remover popup anterior si existe
    const prev = document.querySelector('.audit-popup-overlay');
    if (prev) prev.remove();

    const formatFecha = (str) => {
        if (!str || str === '-') return '-';
        const d = new Date(str);
        if (isNaN(d)) return str;
        return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })
            + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    };

    const overlay = document.createElement('div');
    overlay.className = 'audit-popup-overlay';
    overlay.innerHTML = `
        <div class="audit-popup">
            <button class="audit-close">&times;</button>
            <h3>📋 Información de Registro</h3>
            <div class="audit-row"><span class="audit-label">Creado por:</span><span class="audit-value">${escapeHtmlGlobal(info.creadoPor)}</span></div>
            <div class="audit-row"><span class="audit-label">Fecha creación:</span><span class="audit-value">${escapeHtmlGlobal(formatFecha(info.fechaCreacion))}</span></div>
            <div class="audit-row"><span class="audit-label">Modificado por:</span><span class="audit-value">${escapeHtmlGlobal(info.modificadoPor)}</span></div>
            <div class="audit-row"><span class="audit-label">Fecha modificación:</span><span class="audit-value">${escapeHtmlGlobal(formatFecha(info.fechaModificacion))}</span></div>
            <div class="audit-row"><span class="audit-label">Equipo:</span><span class="audit-value">${escapeHtmlGlobal(info.equipoRegistro)}</span></div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('.audit-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

function escapeHtmlGlobal(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/** Muestra popup para cambiar contraseña del usuario logueado */
function showChangePasswordPopup() {
    const prev = document.querySelector('.audit-popup-overlay');
    if (prev) prev.remove();

    const session = getSession();
    if (!session) return;

    const overlay = document.createElement('div');
    overlay.className = 'audit-popup-overlay';
    overlay.innerHTML = `
        <div class="audit-popup" style="min-width:320px;">
            <button class="audit-close">&times;</button>
            <h3>🔒 Cambiar Contraseña</h3>
            <form id="change-pwd-form" novalidate>
                <div class="form-group" style="margin-bottom:0.75rem;">
                    <label style="font-weight:600;font-size:0.85rem;">Contraseña actual *</label>
                    <input type="password" id="cpwd-actual" required style="width:100%;padding:0.4rem 0.6rem;border:1px solid #ccc;border-radius:4px;">
                </div>
                <div class="form-group" style="margin-bottom:0.75rem;">
                    <label style="font-weight:600;font-size:0.85rem;">Nueva contraseña *</label>
                    <input type="password" id="cpwd-nueva" required style="width:100%;padding:0.4rem 0.6rem;border:1px solid #ccc;border-radius:4px;">
                </div>
                <div class="form-group" style="margin-bottom:0.75rem;">
                    <label style="font-weight:600;font-size:0.85rem;">Confirmar nueva contraseña *</label>
                    <input type="password" id="cpwd-confirmar" required style="width:100%;padding:0.4rem 0.6rem;border:1px solid #ccc;border-radius:4px;">
                </div>
                <div id="cpwd-alert"></div>
                <button type="submit" class="btn btn-primary" style="width:100%;">Cambiar Contraseña</button>
            </form>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('.audit-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    overlay.querySelector('#change-pwd-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const actual = overlay.querySelector('#cpwd-actual').value;
        const nueva = overlay.querySelector('#cpwd-nueva').value;
        const confirmar = overlay.querySelector('#cpwd-confirmar').value;
        const alertDiv = overlay.querySelector('#cpwd-alert');

        if (!actual || !nueva || !confirmar) {
            alertDiv.innerHTML = '<div class="alert alert-error">Todos los campos son requeridos.</div>';
            return;
        }
        if (nueva.length < 4) {
            alertDiv.innerHTML = '<div class="alert alert-error">La nueva contraseña debe tener al menos 4 caracteres.</div>';
            return;
        }
        if (nueva !== confirmar) {
            alertDiv.innerHTML = '<div class="alert alert-error">Las contraseñas no coinciden.</div>';
            return;
        }

        alertDiv.innerHTML = '<div class="alert alert-info">Procesando...</div>';
        try {
            const res = await fetch('api.php?action=changePassword', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: session.user.id, claveActual: actual, claveNueva: nueva }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                alertDiv.innerHTML = '<div class="alert alert-success">Contraseña actualizada exitosamente.</div>';
                setTimeout(() => overlay.remove(), 1500);
            } else {
                alertDiv.innerHTML = `<div class="alert alert-error">${data.error || 'Error al cambiar contraseña.'}</div>`;
            }
        } catch (err) {
            alertDiv.innerHTML = '<div class="alert alert-error">Error de conexión.</div>';
        }
    });
}

// Listener global para audit-links
document.addEventListener('click', (e) => {
    const link = e.target.closest('.audit-link');
    if (link) {
        try {
            const info = JSON.parse(decodeURIComponent(link.getAttribute('data-audit')));
            showAuditPopup(info);
        } catch (err) { /* ignore */ }
    }
});

/** Muestra la pantalla de login */
function showLoginScreen() {
    const header = document.querySelector('.app-header');
    if (header) header.style.display = 'none';

    const container = document.getElementById('app-container');
    container.innerHTML = `
        <div style="max-width:360px;margin:80px auto;padding:2rem;">
            <h2 style="text-align:center;margin-bottom:1.5rem;">Iniciar Sesión</h2>
            <form id="login-form" novalidate>
                <div class="form-group" style="margin-bottom:1rem;">
                    <label for="login-usuario">Usuario</label>
                    <input type="text" id="login-usuario" required placeholder="Ingrese su usuario" style="width:100%;">
                </div>
                <div class="form-group" style="margin-bottom:1rem;">
                    <label for="login-clave">Contraseña</label>
                    <input type="password" id="login-clave" required placeholder="Ingrese su contraseña" style="width:100%;">
                </div>
                <div id="login-alert"></div>
                <button type="submit" class="btn btn-primary" style="width:100%;">Ingresar</button>
            </form>
        </div>
    `;

    container.querySelector('#login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const usuario = container.querySelector('#login-usuario').value.trim();
        const clave = container.querySelector('#login-clave').value;
        const alertDiv = container.querySelector('#login-alert');

        if (!usuario || !clave) {
            alertDiv.innerHTML = '<div class="alert alert-danger">Ingrese usuario y contraseña.</div>';
            return;
        }

        alertDiv.innerHTML = '<div class="alert alert-info">Verificando...</div>';
        const result = await login(usuario, clave);

        if (result.success) {
            await startApp();
        } else {
            alertDiv.innerHTML = `<div class="alert alert-danger">${result.error}</div>`;
        }
    });
}

/** Inicia la app después del login */
async function startApp() {
    const header = document.querySelector('.app-header');
    if (header) header.style.display = '';

    const container = document.getElementById('app-container');
    container.innerHTML = '<div class="empty-state">Cargando datos...</div>';

    await initStorage();
    buildNavigation();

    // Setup modal close
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modal = document.getElementById('file-viewer-modal');
    if (modalCloseBtn && modal) {
        modalCloseBtn.addEventListener('click', () => { modal.style.display = 'none'; });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
    }

    // Toggle menú hamburguesa
    const navToggle = document.getElementById('nav-toggle');
    const mainNav = document.getElementById('main-nav');
    if (navToggle && mainNav) {
        navToggle.addEventListener('click', () => mainNav.classList.toggle('open'));
    }

    window.addEventListener('hashchange', () => navigateTo(getCurrentSection()));
    setupGlobalSearch();

    // Verificar expiración de sesión cada minuto
    setInterval(() => {
        if (isSessionExpired()) {
            logout();
            alert('Su sesión ha expirado. Por favor inicie sesión nuevamente.');
            showLoginScreen();
        }
    }, 60 * 1000);

    const section = getCurrentSection();
    window.location.hash = `#${section}`;
    navigateTo(section);
}

/** Actualiza el badge de alertas vencidas en la navegación */
export function updateAlertsBadge() {
    const badge = document.getElementById('alerts-badge');
    if (!badge) return;
    import('./services/claimEventService.js').then(({ getEventsWithDeadline }) => {
        try {
            const vencidas = getEventsWithDeadline().filter(a => a.estadoAlerta === 'Vencido').length;
            badge.textContent = vencidas;
            badge.style.display = vencidas > 0 ? 'inline' : 'none';
        } catch (e) { /* ignorar si aún no hay datos */ }
    }).catch(() => {});
}

/** Configura la búsqueda global en el header */
function setupGlobalSearch() {
    const input = document.getElementById('global-search-input');
    const results = document.getElementById('global-search-results');
    if (!input || !results) return;

    let debounceTimer;
    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const q = input.value.trim().toLowerCase();
            if (q.length < 3) { results.style.display = 'none'; return; }
            showGlobalResults(q, results);
        }, 250);
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !results.contains(e.target)) {
            results.style.display = 'none';
        }
    });
}

function showGlobalResults(q, results) {
    const { getCollection } = window.__storage || {};
    const clients = (window.__getCollection?.('clients') || []);
    const claims  = (window.__getCollection?.('claims') || []);
    const incidents = (window.__getCollection?.('incidents') || []);

    const hits = [];

    for (const c of clients) {
        const text = `${c.nombreCompleto || ''} ${c.apellidosCompletos || ''} ${c.dni || ''}`.toLowerCase();
        if (text.includes(q)) hits.push({ tipo: 'Cliente', label: `${c.nombreCompleto} ${c.apellidosCompletos} — ${c.dni}`, section: 'fichaCliente', id: c.id });
        if (hits.length >= 5) break;
    }
    for (const r of claims) {
        if (hits.length >= 10) break;
        const obs = (r.observaciones || '').toLowerCase();
        const est = (r.estado || '').toLowerCase();
        if (obs.includes(q) || est.includes(q)) hits.push({ tipo: 'Reclamo', label: `Reclamo ${r.fecha || ''} — ${r.estado || 'Pendiente'}`, section: 'reclamos', id: r.id });
    }

    if (hits.length === 0) {
        results.style.display = 'block';
        results.innerHTML = '<div style="padding:0.75rem;color:#666;font-size:0.85rem;">Sin resultados</div>';
        return;
    }

    results.style.display = 'block';
    results.innerHTML = hits.map(h => `
        <div class="gs-item" data-section="${escapeHtmlGlobal(h.section)}" style="padding:0.6rem 0.85rem;cursor:pointer;border-bottom:1px solid #f0f0f0;font-size:0.85rem;">
            <span style="font-size:0.75rem;background:#e3f2fd;color:#1565c0;border-radius:3px;padding:1px 5px;margin-right:6px;">${escapeHtmlGlobal(h.tipo)}</span>
            ${escapeHtmlGlobal(h.label)}
        </div>
    `).join('');

    results.querySelectorAll('.gs-item').forEach(item => {
        item.addEventListener('mouseenter', () => item.style.background = '#f5f5f5');
        item.addEventListener('mouseleave', () => item.style.background = '');
        item.addEventListener('click', () => {
            results.style.display = 'none';
            const sec = item.getAttribute('data-section');
            window.location.hash = `#${sec}`;
            navigateTo(sec);
        });
    });
}

/** Inicialización principal */
async function init() {
    const session = restoreSession();
    if (session) {
        await startApp();
    } else {
        showLoginScreen();
    }
}

window.__viewFile = (dataUrl, format) => openFileViewer(dataUrl, format);
window.__getCollection = getCollection;
document.addEventListener('DOMContentLoaded', init);
