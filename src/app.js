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

const _S = 'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
function ico(paths) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" ${_S} class="nav-icon" aria-hidden="true">${paths}</svg>`;
}

/** Labels para la navegación */
const NAV_LABELS = {
    dashboard:         `${ico('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>')} Inicio`,
    clientes:          `${ico('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>')} Clientes`,
    bancos:            `${ico('<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7 12 2"/>')} Bancos`,
    tarjetas:          `${ico('<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>')} Tarjetas`,
    seguros:           `${ico('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>')} Seguros`,
    coberturas:        `${ico('<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><line x1="13" y1="8" x2="21" y2="8"/><line x1="13" y1="18" x2="21" y2="18"/>')} Coberturas`,
    siniestros:        `${ico('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>')} Siniestros`,
    reclamos:          `${ico('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>')} Reclamos`,
    eventos:           `${ico('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/>')} Eventos`,
    pendientes:        `${ico('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>')} Pendientes`,
    seguimiento:       `${ico('<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>')} Seguimiento`,
    alertas:           `${ico('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>')} Alertas`,
    usuarios:          `${ico('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>')} Usuarios`,
    actividad:         `${ico('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>')} Actividad`,
    adelantos:         `${ico('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>')} Adelantos`,
    consultaAdelantos: `${ico('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>')} Consultas`,
    fichaCliente:      `${ico('<rect x="3" y="4" width="18" height="18" rx="2"/><circle cx="12" cy="10" r="2"/><path d="M7 20v-1a5 5 0 0 1 10 0v1"/><line x1="8" y1="2" x2="8" y2="4"/><line x1="16" y1="2" x2="16" y2="4"/>')} Ficha`,
    tarjetasSinSeguro: `${ico('<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>')} Sin Seguro`,
};

/** Orden de items en el sidebar */
const SIDEBAR_ORDER = [
    'dashboard',
    'clientes',
    'fichaCliente',
    'tarjetasSinSeguro',
    'bancos',
    'tarjetas',
    'seguros',
    'coberturas',
    'siniestros',
    'reclamos',
    'eventos',
    'pendientes',
    'seguimiento',
    'alertas',
    'adelantos',
    'consultaAdelantos',
    'usuarios',
    'actividad',
];

/** Página de inicio por defecto: Alertas (para todos los usuarios con acceso). */
function defaultHomeSection() {
    if (hasAccess('alertas')) return 'alertas';
    if (hasAccess('clientes')) return 'clientes';
    const allowed = getAllowedScreens().filter(k => k !== 'dashboard');
    return allowed.length > 0 ? allowed[0] : 'clientes';
}

function getCurrentSection() {
    const hash = window.location.hash.replace('#', '');
    if (routes[hash] && hasAccess(hash)) return hash;
    return defaultHomeSection();
}

function updateNavActive(section) {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.getAttribute('data-section') === section);
    });
}

/** Construye la navegación en el sidebar según los permisos del usuario */
function buildNavigation() {
    const nav = document.getElementById('main-nav');
    const footer = document.getElementById('sidebar-footer');
    if (!nav) return;

    const allowed = new Set(getAllowedScreens());
    const session = getSession();

    function navLink(key) {
        const badge = key === 'alertas'
            ? `<span id="alerts-badge" style="display:none;background:#7c3aed;color:#fff;border-radius:10px;padding:1px 7px;font-size:0.7rem;margin-left:auto;"></span>`
            : '';
        return `<a href="#${key}" class="nav-link" data-section="${key}">${NAV_LABELS[key] || key}${badge}</a>`;
    }

    nav.innerHTML = SIDEBAR_ORDER
        .filter(k => allowed.has(k))
        .map(navLink)
        .join('');

    // En mobile, cerrar sidebar al navegar
    nav.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 900) {
                document.getElementById('sidebar')?.classList.remove('open');
                document.getElementById('sidebar-overlay')?.classList.remove('open');
            }
        });
    });

    // Footer: usuario + acciones
    if (footer) {
        const userName = session?.user?.nombreCompleto || session?.user?.usuario || 'Usuario';
        footer.innerHTML = `
            <div class="sidebar-user">
                <div class="sidebar-user-name">
                    ${ico('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>')}
                    ${escapeHtmlGlobal(userName)}
                </div>
                <div class="sidebar-user-actions">
                    <button type="button" class="sidebar-user-btn" id="change-pwd-btn">
                        ${ico('<path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5"/>')} Cambiar contraseña
                    </button>
                    <button type="button" class="sidebar-user-btn sidebar-user-btn--danger" id="logout-btn">
                        ${ico('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>')} Cerrar sesión
                    </button>
                </div>
            </div>`;
    }

    document.getElementById('logout-btn')?.addEventListener('click', () => {
        logout();
        showLoginScreen();
    });

    document.getElementById('change-pwd-btn')?.addEventListener('click', () => {
        showChangePasswordPopup();
    });
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
                <div class="form-group">
                    <label>Contraseña actual *</label>
                    <input type="password" id="cpwd-actual" required placeholder="Contraseña actual">
                </div>
                <div class="form-group">
                    <label>Nueva contraseña *</label>
                    <input type="password" id="cpwd-nueva" required placeholder="Mínimo 4 caracteres">
                </div>
                <div class="form-group">
                    <label>Confirmar nueva contraseña *</label>
                    <input type="password" id="cpwd-confirmar" required placeholder="Repite la nueva contraseña">
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
    const sidebar = document.getElementById('sidebar');
    const topbar = document.getElementById('topbar');
    if (sidebar) sidebar.style.display = 'none';
    if (topbar) topbar.style.display = 'none';

    const container = document.getElementById('app-container');
    container.innerHTML = `
        <div style="max-width:380px;margin:10vh auto;padding:2rem;background:#111827;border:1px solid #1f2937;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
            <div style="text-align:center;margin-bottom:1.75rem;">
                <div style="width:48px;height:48px;background:#7c3aed;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1rem;color:#fff;margin:0 auto 0.75rem;">AS</div>
                <h2 style="font-size:1.3rem;color:#f1f5f9;margin-bottom:0.25rem;">Iniciar Sesión</h2>
                <p style="font-size:0.85rem;color:#6b7280;">Sistema de Monitoreo de Reclamos</p>
            </div>
            <form id="login-form" novalidate>
                <div class="form-group">
                    <label for="login-usuario">Usuario</label>
                    <input type="text" id="login-usuario" required placeholder="Ingrese su usuario">
                </div>
                <div class="form-group">
                    <label for="login-clave">Contraseña</label>
                    <input type="password" id="login-clave" required placeholder="Ingrese su contraseña">
                </div>
                <div id="login-alert" style="margin-bottom:0.5rem;"></div>
                <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;padding:0.65rem;">Ingresar</button>
            </form>
        </div>
    `;

    container.querySelector('#login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const usuario = container.querySelector('#login-usuario').value.trim();
        const clave = container.querySelector('#login-clave').value;
        const alertDiv = container.querySelector('#login-alert');

        if (!usuario || !clave) {
            alertDiv.innerHTML = '<div class="alert alert-error">Ingrese usuario y contraseña.</div>';
            return;
        }

        alertDiv.innerHTML = '<div class="alert alert-info">Verificando...</div>';
        const result = await login(usuario, clave);

        if (result.success) {
            await startApp(true);
        } else {
            alertDiv.innerHTML = `<div class="alert alert-error">${result.error}</div>`;
        }
    });
}

/** Inicia la app. freshLogin=true fuerza la página de inicio ignorando un hash viejo. */
async function startApp(freshLogin = false) {
    const sidebar = document.getElementById('sidebar');
    const topbar = document.getElementById('topbar');
    if (sidebar) sidebar.style.display = '';
    if (topbar) topbar.style.display = '';

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

    // Sidebar toggle (hamburguesa)
    const navToggle = document.getElementById('nav-toggle');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const sidebarClose = document.getElementById('sidebar-close');

    navToggle?.addEventListener('click', () => {
        sidebar?.classList.toggle('open');
        sidebarOverlay?.classList.toggle('open');
    });
    sidebarOverlay?.addEventListener('click', () => {
        sidebar?.classList.remove('open');
        sidebarOverlay.classList.remove('open');
    });
    sidebarClose?.addEventListener('click', () => {
        sidebar?.classList.remove('open');
        sidebarOverlay?.classList.remove('open');
    });

    window.addEventListener('hashchange', () => navigateTo(getCurrentSection()));

    // Verificar expiración de sesión cada minuto
    setInterval(() => {
        if (isSessionExpired()) {
            logout();
            alert('Su sesión ha expirado. Por favor inicie sesión nuevamente.');
            showLoginScreen();
        }
    }, 60 * 1000);

    // En login nuevo, ir a la página de inicio (Alertas) ignorando un hash viejo.
    // Al recargar con sesión activa, respetar la sección que esté en el hash.
    const section = freshLogin ? defaultHomeSection() : getCurrentSection();
    window.location.hash = `#${section}`;
    navigateTo(section);
}

/** Actualiza el badge de alertas vencidas en la navegación */
export function updateAlertsBadge() {
    const badge = document.getElementById('alerts-badge');
    if (!badge) return;
    import('./services/claimEventService.js').then(({ getEventsWithDeadline, getClaimsWithoutActivity }) => {
        try {
            const vencidas = getEventsWithDeadline().filter(a => a.estadoAlerta === 'Vencido').length;
            const criticas = getClaimsWithoutActivity()
                .filter(a => a.nivelAlerta === 'Critico' || a.nivelAlerta === 'Sin eventos').length;
            const total = vencidas + criticas;
            badge.textContent = total;
            badge.style.display = total > 0 ? 'inline' : 'none';
        } catch (e) { /* ignorar si aún no hay datos */ }
    }).catch(() => {});
}

/** Configura la búsqueda global en el header */

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
