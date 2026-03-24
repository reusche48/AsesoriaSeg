// Punto de entrada principal de la aplicación SPA
// Implementa hash routing, login y control de acceso por permisos

import { initStorage } from './storage.js';
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
    consultaAdelantos: '🔎 Consulta Adelantos',
    fichaCliente: '📄 Ficha Cliente',
    tarjetasSinSeguro: '🔍 Sin Seguro',
};

function getCurrentSection() {
    const hash = window.location.hash.replace('#', '');
    if (routes[hash] && hasAccess(hash)) return hash;
    // Dashboard primero si tiene acceso
    if (hasAccess('dashboard')) return 'dashboard';
    const allowed = getAllowedScreens();
    return allowed.length > 0 ? allowed[0] : 'dashboard';
}

function updateNavActive(section) {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.getAttribute('data-section') === section);
    });
}

/** Construye la navegación según los permisos del usuario */
function buildNavigation() {
    const nav = document.getElementById('main-nav');
    if (!nav) return;

    const allowed = getAllowedScreens();
    const session = getSession();

    nav.innerHTML = allowed.map(key =>
        `<a href="#${key}" class="nav-link" data-section="${key}">${NAV_LABELS[key] || key}</a>`
    ).join('') +
    `<a href="#" class="nav-link" id="change-pwd-btn" title="Cambiar contraseña" style="margin-left:auto;">🔒</a>` +
    `<a href="#" class="nav-link nav-logout" id="logout-btn" title="Cerrar sesión">🚪 ${session?.user?.usuario || ''}</a>`;

    // Cerrar menú al seleccionar
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

function navigateTo(section) {
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
        container.innerHTML = '';
        renderFn(container);
        updateNavActive(section);
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
    if (fmt === 'PDF' || dataUrl.startsWith('data:application/pdf')) {
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
document.addEventListener('DOMContentLoaded', init);
