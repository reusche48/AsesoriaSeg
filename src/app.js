// Punto de entrada principal de la aplicación SPA
// Implementa hash routing, login y control de acceso por permisos

import { initStorage, loadSectionData, getCollection } from './storage.js';
import { login, logout, restoreSession, getSession, hasAccess, getAllowedScreens, isSessionExpired,
    verifySecurityCode, getSecurityCodeStatus, setSecurityCode, disableSecurityCode } from './auth.js';
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
import { renderStepTemplateSection } from './ui/stepTemplateUI.js';
import { renderGuiaSection } from './ui/guiaUI.js';
import { renderPaymentSection } from './ui/paymentUI.js';
import { renderVueltaSection } from './ui/vueltaUI.js';
import { renderRechargeSection } from './ui/rechargeUI.js';
import { renderCuadreSection } from './ui/cuadreUI.js';
import { mountClientContextBar } from './ui/clientContextBar.js';
import { clearActiveClient } from './state/clientContext.js';

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
    plantillasPasos: renderStepTemplateSection,
    guia: renderGuiaSection,
    pagos: renderPaymentSection,
    vuelta: renderVueltaSection,
    recargas: renderRechargeSection,
    cuadre: renderCuadreSection,
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
    plantillasPasos:   `${ico('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>')} Pasos por Banco`,
    guia:              `${ico('<polygon points="3 11 22 2 13 21 11 13 3 11"/>')} Guía`,
    pagos:             `${ico('<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>')} Pagos Seguro`,
    vuelta:            `${ico('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>')} La Vuelta`,
    recargas:          `${ico('<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>')} Recargas`,
    cuadre:            `${ico('<path d="M12 3v18"/><path d="M3 7h18"/><path d="m6 7-3 5a3 3 0 0 0 6 0z"/><path d="m18 7-3 5a3 3 0 0 0 6 0z"/><path d="M7 21h10"/>')} Cuadre de Cuentas`,
};

/** Orden de items en el sidebar */
const SIDEBAR_ORDER = [
    'clientes',
    'guia',
    'fichaCliente',
    'bancos',
    'tarjetas',
    'seguros',
    'coberturas',
    'reclamos',
    'eventos',
    'alertas',
    'plantillasPasos',
    'pagos',
    'vuelta',
    'recargas',
    'cuadre',
    'adelantos',
    'consultaAdelantos',
    // Consulta / configuración (menos usados en el día a día)
    'siniestros',
    'usuarios',
    'actividad',
];

/** ¿La app está abierta como PWA instalada (ícono de pantalla de inicio)? */
function isStandaloneApp() {
    return window.navigator.standalone === true
        || window.matchMedia('(display-mode: standalone)').matches;
}

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
        let badge = '';
        if (key === 'alertas') {
            badge = `<span id="alerts-badge" style="display:none;background:#7c3aed;color:#fff;border-radius:10px;padding:1px 7px;font-size:0.7rem;margin-left:auto;"></span>`;
        } else if (key === 'guia') {
            badge = `<span id="guia-badge" style="display:none;background:#d97706;color:#fff;border-radius:10px;padding:1px 7px;font-size:0.7rem;margin-left:auto;"></span>`;
        }
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
                    <button type="button" class="sidebar-user-btn" id="security-code-btn">
                        ${ico('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>')} Código de seguridad
                    </button>
                    <button type="button" class="sidebar-user-btn sidebar-user-btn--danger" id="logout-btn">
                        ${ico('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>')} Cerrar sesión
                    </button>
                </div>
            </div>`;
    }

    document.getElementById('logout-btn')?.addEventListener('click', () => {
        clearActiveClient();
        logout();
        showLoginScreen();
    });

    document.getElementById('change-pwd-btn')?.addEventListener('click', () => {
        showChangePasswordPopup();
    });

    document.getElementById('security-code-btn')?.addEventListener('click', () => {
        showSecurityCodePopup();
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
    // Al salir de Eventos, olvidar el reclamo enfocado (de Alertas → Ver Historial)
    if (section !== 'eventos') {
        try { sessionStorage.removeItem('eventos_focus_claim'); } catch (e) { /* ignore */ }
    }
    const renderFn = routes[section];
    if (renderFn) {
        container.innerHTML = '<div class="empty-state" style="padding:2rem;">Cargando...</div>';
        updateNavActive(section);
        await loadSectionData(section);
        container.innerHTML = '';
        renderFn(container);
        updateAlertsBadge();
        updateGuiaBadge();
    }
}

/**
 * Construye un nombre de archivo para descargar.
 * Si se pasa una base (ej. "DNI_frontal_12345678") se le agrega la extensión real.
 */
function buildDownloadName(dataUrl, baseName) {
    const clean = String(dataUrl).split('?')[0].split('#')[0];
    const ext = (clean.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
    if (baseName) {
        return ext && !baseName.toLowerCase().endsWith('.' + ext) ? `${baseName}.${ext}` : baseName;
    }
    const seg = clean.substring(clean.lastIndexOf('/') + 1);
    return seg || 'archivo';
}

/**
 * Abre el modal de visualización de archivos, con botón de descarga.
 * @param {string} dataUrl - URL del archivo (uploads/...) o data URL
 * @param {string} [format] - 'PDF' u otro (opcional)
 * @param {string} [filename] - Nombre descriptivo para la descarga (opcional)
 */
export function openFileViewer(dataUrl, format, filename) {
    const modal = document.getElementById('file-viewer-modal');
    const body = document.getElementById('modal-body');
    if (!modal || !body) return;
    const fmt = (format || '').toUpperCase();
    const isPdf = fmt === 'PDF'
        || dataUrl.startsWith('data:application/pdf')
        || dataUrl.toLowerCase().endsWith('.pdf');
    const media = isPdf
        ? `<iframe src="${dataUrl}"></iframe>`
        : `<img src="${dataUrl}" alt="Archivo">`;
    const dlName = buildDownloadName(dataUrl, filename);
    body.innerHTML = `
        <div class="file-viewer-toolbar" style="display:flex;justify-content:flex-end;margin-bottom:0.5rem;">
            <a href="${dataUrl}" download="${escapeHtmlGlobal(dlName)}" class="btn btn-primary"
               style="text-decoration:none;font-size:0.85rem;padding:0.35rem 0.9rem;">⬇️ Descargar</a>
        </div>
        ${media}
    `;
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

/** Configuración self-service del código de seguridad (2º factor). */
async function showSecurityCodePopup() {
    const prev = document.querySelector('.audit-popup-overlay');
    if (prev) prev.remove();
    const session = getSession();
    if (!session) return;

    const OPCIONES = [
        { v: -3, t: 'Tres antes' }, { v: -2, t: 'Dos antes' }, { v: -1, t: 'Uno antes' },
        { v: 0, t: 'El mismo' },
        { v: 1, t: 'Uno después' }, { v: 2, t: 'Dos después' }, { v: 3, t: 'Tres después' },
    ];
    const sel = (id, def) => `<select id="${id}" style="padding:0.4rem;border:1px solid #334155;border-radius:6px;background:#0f172a;color:#e2e8f0;">
        ${OPCIONES.map(o => `<option value="${o.v}" ${o.v === def ? 'selected' : ''}>${o.t}</option>`).join('')}</select>`;

    const overlay = document.createElement('div');
    overlay.className = 'audit-popup-overlay';
    overlay.innerHTML = `
        <div class="audit-popup" style="min-width:340px;max-width:440px;">
            <button class="audit-close">&times;</button>
            <h3>🔒 Código de seguridad</h3>
            <p style="color:#9ca3af;font-size:0.85rem;line-height:1.4;">
                Al iniciar sesión verás lo que parece un <strong>captcha</strong> con 4 números: uno tendrá un
                <strong style="color:#e8a13a;">color distinto</strong> — ese es el tuyo. Tu código se forma
                aplicando tu regla a ese número (con vuelta: si es 0, "uno antes" es 9).
                <br><span style="color:#6b7280;">Nadie más sabe que es una regla: si escriben los números tal cual, no entran.</span>
            </p>
            <div id="scode-status" style="margin:0.4rem 0;color:#9ca3af;font-size:0.85rem;">Cargando…</div>
            <div style="display:flex;gap:0.6rem;align-items:center;margin:0.6rem 0;flex-wrap:wrap;">
                <div><div style="color:#6b7280;font-size:0.72rem;">1ª cifra</div>${sel('scode-1', -1)}</div>
                <div><div style="color:#6b7280;font-size:0.72rem;">2ª cifra</div>${sel('scode-2', 0)}</div>
                <div><div style="color:#6b7280;font-size:0.72rem;">3ª cifra</div>${sel('scode-3', 1)}</div>
            </div>
            <div id="scode-preview" style="background:#0b1220;border:1px solid #1f2937;border-radius:8px;padding:0.5rem 0.7rem;color:#cbd5e1;font-size:0.9rem;margin-bottom:0.6rem;"></div>
            <div id="scode-alert"></div>
            <button type="button" id="scode-save" class="btn btn-primary" style="width:100%;">Guardar código</button>
            <button type="button" id="scode-disable" style="width:100%;margin-top:0.5rem;background:none;border:1px solid #7f1d1d;color:#fca5a5;border-radius:8px;padding:0.4rem;cursor:pointer;display:none;">Desactivar el código de seguridad</button>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.audit-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const offsets = () => [1, 2, 3].map(i => parseInt(overlay.querySelector('#scode-' + i).value, 10));
    const preview = () => {
        const os = offsets();
        const ejemplo = os.map(o => (((8 + o) % 10) + 10) % 10).join('');
        overlay.querySelector('#scode-preview').innerHTML = `Ejemplo: si el número de color distinto es el <strong style="color:#e8a13a;">8</strong>, tu código será <strong style="color:#a78bfa;">${ejemplo}</strong>`;
    };
    [1, 2, 3].forEach(i => overlay.querySelector('#scode-' + i).addEventListener('change', preview));
    preview();

    // Estado actual
    const disableBtn = overlay.querySelector('#scode-disable');
    getSecurityCodeStatus().then(configured => {
        overlay.querySelector('#scode-status').innerHTML = configured
            ? '✅ Ya tienes un código configurado. Puedes cambiarlo abajo o desactivarlo.'
            : 'Aún no tienes código configurado. Este segundo paso es opcional.';
        disableBtn.style.display = configured ? '' : 'none';
    });

    overlay.querySelector('#scode-save').addEventListener('click', async () => {
        const alertDiv = overlay.querySelector('#scode-alert');
        alertDiv.innerHTML = '<div class="alert alert-info">Guardando…</div>';
        const r = await setSecurityCode(offsets());
        if (r.success) {
            alertDiv.innerHTML = '<div class="alert alert-success">Código guardado. Se te pedirá al iniciar sesión.</div>';
            disableBtn.style.display = '';
        } else {
            alertDiv.innerHTML = `<div class="alert alert-error">${r.error || 'Error al guardar.'}</div>`;
        }
    });

    disableBtn.addEventListener('click', async () => {
        const alertDiv = overlay.querySelector('#scode-alert');
        alertDiv.innerHTML = '<div class="alert alert-info">Procesando…</div>';
        const ok = await disableSecurityCode();
        if (ok) {
            alertDiv.innerHTML = '<div class="alert alert-success">Código de seguridad desactivado.</div>';
            disableBtn.style.display = 'none';
            overlay.querySelector('#scode-status').textContent = 'Aún no tienes código configurado. Este segundo paso es opcional.';
        } else {
            alertDiv.innerHTML = '<div class="alert alert-error">No se pudo desactivar.</div>';
        }
    });
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

        if (result.success && result.twofa) {
            showSecurityCodeStep(result.challenge, result.challengeToken);
        } else if (result.success) {
            await startApp();
        } else {
            alertDiv.innerHTML = `<div class="alert alert-error">${result.error}</div>`;
        }
    });
}

/**
 * Paso 2 del login, DISFRAZADO como un captcha. No revela el mecanismo: quien no
 * conoce su regla escribirá los números tal cual (como un captcha) → código incorrecto
 * → menú falso. El usuario legítimo aplica su regla al dígito de color distinto.
 */
function showSecurityCodeStep(challenge, challengeToken) {
    const container = document.getElementById('app-container');
    // Colores tipo captcha; el dígito "resaltado" va en un color distinto (la pista discreta).
    const coloresBase = ['#9aa4b2', '#c0c7d1', '#aeb6c2', '#b6bdc9'];
    const rots = [-9, 6, -5, 8, -7, 4];
    const digitsHtml = challenge.digits.map((d, i) => {
        const esPista = i === challenge.highlight;
        const color = esPista ? '#e8a13a' : coloresBase[i % coloresBase.length];
        return `<span style="display:inline-block;transform:rotate(${rots[i % rots.length]}deg);font-family:'Courier New',monospace;font-size:2.1rem;font-weight:800;color:${color};margin:0 7px;text-shadow:1px 1px 0 rgba(0,0,0,0.4);">${d}</span>`;
    }).join('');
    const captchaBg = 'background:#0b1220;background-image:repeating-linear-gradient(45deg,rgba(255,255,255,0.04) 0 2px,transparent 2px 7px),repeating-linear-gradient(-30deg,rgba(255,255,255,0.03) 0 1px,transparent 1px 9px);';
    container.innerHTML = `
        <div style="max-width:400px;margin:10vh auto;padding:2rem;background:#111827;border:1px solid #1f2937;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
            <div style="text-align:center;margin-bottom:1.1rem;">
                <h2 style="font-size:1.2rem;color:#f1f5f9;margin-bottom:0.25rem;">Verificación de seguridad</h2>
                <p style="font-size:0.85rem;color:#9ca3af;">Ingrese el código captcha para continuar.</p>
            </div>
            <div style="text-align:center;margin:1rem 0;padding:0.9rem 0.5rem;border:1px solid #1f2937;border-radius:10px;${captchaBg}user-select:none;">${digitsHtml}</div>
            <form id="sec-form" novalidate>
                <input type="text" inputmode="numeric" autocomplete="off" id="sec-codigo" placeholder="Código captcha"
                    style="width:100%;text-align:center;font-size:1.25rem;letter-spacing:0.35em;padding:0.6rem;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#e2e8f0;">
                <div id="sec-alert" style="margin:0.6rem 0;"></div>
                <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;padding:0.65rem;">Verificar</button>
            </form>
            <button type="button" id="sec-cancel" style="width:100%;margin-top:0.6rem;background:none;border:none;color:#6b7280;cursor:pointer;font-size:0.85rem;">← Volver</button>
        </div>`;

    container.querySelector('#sec-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const codigo = container.querySelector('#sec-codigo').value.trim();
        const alertDiv = container.querySelector('#sec-alert');
        if (!codigo) { alertDiv.innerHTML = '<div class="alert alert-error">Ingrese el código.</div>'; return; }
        alertDiv.innerHTML = '<div class="alert alert-info">Verificando...</div>';
        const r = await verifySecurityCode(challengeToken, codigo);
        if (r.success) {
            await startApp();
        } else if (r.decoy) {
            showDecoyMenu();
        } else {
            alertDiv.innerHTML = `<div class="alert alert-error">${r.error || 'Error'}</div>`;
        }
    });
    container.querySelector('#sec-cancel').addEventListener('click', () => showLoginScreen());
}

/**
 * "Menú falso": cuando el código de seguridad es incorrecto se muestra un sistema de
 * EMPEÑOS ficticio (todo estático, sin token, sin base de datos, sin acceso real a nada
 * del sistema de asesoría). Es navegable para parecer legítimo.
 */
function showDecoyMenu() {
    const sidebar = document.getElementById('sidebar');
    const topbar = document.getElementById('topbar');
    if (sidebar) sidebar.style.display = 'none';
    if (topbar) topbar.style.display = 'none';
    const container = document.getElementById('app-container');

    // ── Paleta (violeta oscuro) ──
    const C = { bg: '#0a0614', side: '#1a0533', side2: '#2e1065', card: '#17102b', bd: '#2e1065', accent: '#8b5cf6', txt: '#e9e5f2', mut: '#a99fc4' };
    const money = n => 'S/ ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pill = (t, col) => `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:0.7rem;font-weight:700;background:${col}22;color:${col};">${t}</span>`;
    const estPill = e => e === 'Vencido' ? pill('Vencido', '#f87171') : e === 'Por vencer' ? pill('Por vencer', '#fbbf24') : e === 'Rematado' ? pill('Rematado', '#94a3b8') : pill('Activo', '#34d399');

    // ── Datos ficticios ──
    const empenos = [
        ['EMP-001042', 'María Quispe', 'Anillo de oro 18k 5.2g', 850, '10%', '12/07/2026', 'Activo'],
        ['EMP-001041', 'José Ramírez', 'Laptop HP Core i5', 1200, '10%', '05/07/2026', 'Vencido'],
        ['EMP-001040', 'Ana Torres', 'Cadena de oro 14k 8g', 620, '8%', '20/07/2026', 'Activo'],
        ['EMP-001039', 'Luis Castro', 'iPhone 12 64GB', 1450, '10%', '09/07/2026', 'Por vencer'],
        ['EMP-001038', 'Rosa Medina', 'Reloj Casio + pulsera plata', 340, '8%', '15/07/2026', 'Activo'],
        ['EMP-001037', 'Pedro Salas', 'Televisor LG 43"', 700, '10%', '02/07/2026', 'Vencido'],
    ];
    const clientes = [
        ['María Quispe', '45872103', '987 654 321', 2, 1470], ['José Ramírez', '40912385', '999 112 233', 1, 1320],
        ['Ana Torres', '46551209', '955 887 001', 1, 620], ['Luis Castro', '41220987', '988 443 776', 3, 2890],
        ['Rosa Medina', '47881230', '944 556 778', 1, 340], ['Pedro Salas', '09887654', '966 221 334', 2, 1540],
    ];
    const inventario = [
        ['INV-2201', 'Anillo oro 18k 5.2g', 'Joyería', 'Bueno', 980, 'Disponible'], ['INV-2200', 'Laptop HP Core i5', 'Electrónica', 'Regular', 1400, 'En empeño'],
        ['INV-2199', 'Cadena oro 14k 8g', 'Joyería', 'Bueno', 720, 'En empeño'], ['INV-2198', 'iPhone 12 64GB', 'Celulares', 'Bueno', 1600, 'En empeño'],
        ['INV-2197', 'Televisor LG 43"', 'Electrónica', 'Regular', 820, 'Para remate'], ['INV-2196', 'Pulsera de plata 925', 'Joyería', 'Nuevo', 260, 'Disponible'],
    ];
    const pagos = [
        ['08/07/2026', 'EMP-001041', 'José Ramírez', 'Interés mensual', 120, 'Efectivo'], ['08/07/2026', 'EMP-001040', 'Ana Torres', 'Renovación', 96, 'Yape'],
        ['07/07/2026', 'EMP-001042', 'María Quispe', 'Interés mensual', 85, 'Efectivo'], ['07/07/2026', 'EMP-001035', 'Carla Ruiz', 'Cancelación total', 940, 'Transferencia'],
        ['06/07/2026', 'EMP-001039', 'Luis Castro', 'Interés mensual', 145, 'Efectivo'],
    ];

    // ── Menú (igual estructura que un panel real) ──
    const NAV = [
        { s: 'Principal' }, { id: 'dashboard', i: '📊', l: 'Dashboard' }, { id: 'empenios', i: '🤝', l: 'Empeños' }, { id: 'aprobaciones', i: '🛡️', l: 'Aprobaciones' }, { id: 'pagos', i: '💵', l: 'Pagos' },
        { s: 'Operaciones' }, { id: 'clientes', i: '👥', l: 'Clientes' }, { id: 'inventario', i: '📦', l: 'Inventario' }, { id: 'subastas', i: '🔨', l: 'Subastas' }, { id: 'ventas', i: '🛒', l: 'Ventas' },
        { s: 'Finanzas' }, { id: 'tesoreria', i: '🏦', l: 'Tesorería' }, { id: 'gastos', i: '🧾', l: 'Gastos de Empresa' }, { id: 'inversion', i: '🪙', l: 'Inversión de Capital' },
        { s: 'Sistema' }, { id: 'configuracion', i: '⚙️', l: 'Configuración' }, { id: 'usuarios', i: '🔐', l: 'Usuarios' }, { id: 'auditoria', i: '🕓', l: 'Auditoría' },
    ];
    const TITULOS = { dashboard: 'Dashboard', empenios: 'Empeños', aprobaciones: 'Aprobaciones', pagos: 'Pagos', clientes: 'Clientes', inventario: 'Inventario', subastas: 'Subastas', ventas: 'Ventas', tesoreria: 'Tesorería', gastos: 'Gastos de Empresa', inversion: 'Inversión de Capital', configuracion: 'Configuración', usuarios: 'Usuarios', auditoria: 'Auditoría' };

    const th = t => `<th style="text-align:left;padding:0.55rem 0.85rem;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.04em;color:${C.mut};background:${C.side};">${t}</th>`;
    const td = (v, extra = '') => `<td style="padding:0.6rem 0.85rem;font-size:0.83rem;color:${C.txt};border-top:1px solid ${C.bd};${extra}">${v}</td>`;
    const tabla = (heads, rows) => `<div style="background:${C.card};border:1px solid ${C.bd};border-radius:12px;overflow:hidden;overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:560px;"><thead><tr>${heads.map(th).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
    const kpi = (label, valor, sub, col) => `<div style="background:${C.card};border:1px solid ${C.bd};border-radius:12px;padding:0.9rem 1.1rem;flex:1;min-width:150px;">
        <div style="color:${C.mut};font-size:0.76rem;">${label}</div>
        <div style="color:${col};font-size:1.5rem;font-weight:800;margin-top:2px;">${valor}</div>
        <div style="color:${C.mut};font-size:0.72rem;margin-top:2px;">${sub}</div></div>`;

    function vistaDashboard() {
        const barras = [62, 48, 75, 90, 68, 84];
        const meses = ['Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul'];
        return `
            <div style="display:flex;gap:0.8rem;flex-wrap:wrap;margin-bottom:1rem;">
                ${kpi('Empeños activos', '128', 'Deuda: ' + money(96420), '#a78bfa')}
                ${kpi('Vencidos', '14', 'Deuda: ' + money(11280), '#f87171')}
                ${kpi('Por vencer', '9', 'Próximos 7 días', '#fbbf24')}
                ${kpi('Inventario', '213', 'Valor: ' + money(184300), '#34d399')}
                ${kpi('Ventas del mes', money(24850), '32 operaciones', '#60a5fa')}
            </div>
            <div style="display:flex;gap:0.8rem;flex-wrap:wrap;">
                <div style="flex:2;min-width:280px;background:${C.card};border:1px solid ${C.bd};border-radius:12px;padding:1rem;">
                    <div style="color:${C.txt};font-weight:700;margin-bottom:0.8rem;">Empeños otorgados por mes</div>
                    <div style="display:flex;align-items:flex-end;gap:14px;height:150px;">
                        ${barras.map((h, i) => `<div style="flex:1;text-align:center;"><div style="height:${h * 1.4}px;background:linear-gradient(180deg,${C.accent},#6d28d9);border-radius:6px 6px 0 0;"></div><div style="color:${C.mut};font-size:0.72rem;margin-top:4px;">${meses[i]}</div></div>`).join('')}
                    </div>
                </div>
                <div style="flex:1;min-width:220px;background:${C.card};border:1px solid ${C.bd};border-radius:12px;padding:1rem;">
                    <div style="color:${C.txt};font-weight:700;margin-bottom:0.6rem;">Saldos bancarios</div>
                    <div style="display:flex;justify-content:space-between;padding:0.35rem 0;color:${C.txt};font-size:0.85rem;border-bottom:1px solid ${C.bd};"><span>BCP · Corriente</span><b>${money(42180)}</b></div>
                    <div style="display:flex;justify-content:space-between;padding:0.35rem 0;color:${C.txt};font-size:0.85rem;border-bottom:1px solid ${C.bd};"><span>BBVA · Ahorros</span><b>${money(18640)}</b></div>
                    <div style="display:flex;justify-content:space-between;padding:0.35rem 0;color:${C.txt};font-size:0.85rem;"><span>Caja chica</span><b>${money(3250)}</b></div>
                    <div style="margin-top:0.6rem;color:${C.mut};font-size:0.76rem;">Cobros hoy: <b style="color:#34d399;">${money(1820)}</b> · Pendientes: <b style="color:#fbbf24;">${money(4560)}</b></div>
                </div>
            </div>
            <div style="color:${C.txt};font-weight:700;margin:1rem 0 0.6rem;">Vencimientos próximos</div>
            ${tabla(['Contrato', 'Cliente', 'Artículo', 'Monto', 'Vence', 'Estado'], empenos.filter(e => e[6] !== 'Activo').map(e => `<tr>${td(e[0])}${td(e[1])}${td(e[2])}${td(money(e[3]))}${td(e[5])}${td(estPill(e[6]))}</tr>`).join(''))}`;
    }
    function vistaEmpenos() {
        return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem;flex-wrap:wrap;gap:0.5rem;">
                <input placeholder="Buscar por contrato o cliente..." style="padding:0.5rem 0.7rem;border:1px solid ${C.bd};border-radius:8px;background:${C.side};color:${C.txt};min-width:240px;">
                <button class="decoy-btn" style="background:${C.accent};color:#fff;border:none;border-radius:8px;padding:0.5rem 0.9rem;cursor:pointer;font-weight:600;">+ Nuevo empeño</button>
            </div>
            ${tabla(['Contrato', 'Cliente', 'Artículo', 'Préstamo', 'Interés', 'Vencimiento', 'Estado'], empenos.map(e => `<tr>${td('<b>' + e[0] + '</b>')}${td(e[1])}${td(e[2])}${td(money(e[3]))}${td(e[4])}${td(e[5])}${td(estPill(e[6]))}</tr>`).join(''))}`;
    }
    function vistaClientes() {
        return tabla(['Cliente', 'DNI', 'Teléfono', 'Empeños activos', 'Deuda total'], clientes.map(c => `<tr>${td('<b>' + c[0] + '</b>')}${td(c[1])}${td(c[2])}${td(c[3])}${td(money(c[4]))}</tr>`).join(''));
    }
    function vistaInventario() {
        const cond = { 'Disponible': '#34d399', 'En empeño': '#a78bfa', 'Para remate': '#fbbf24' };
        return tabla(['Código', 'Artículo', 'Categoría', 'Condición', 'Avalúo', 'Estado'], inventario.map(x => `<tr>${td('<b>' + x[0] + '</b>')}${td(x[1])}${td(x[2])}${td(x[3])}${td(money(x[4]))}${td(pill(x[5], cond[x[5]] || '#94a3b8'))}</tr>`).join(''));
    }
    function vistaPagos() {
        const met = { 'Efectivo': '#34d399', 'Yape': '#a78bfa', 'Transferencia': '#60a5fa' };
        return tabla(['Fecha', 'Contrato', 'Cliente', 'Concepto', 'Monto', 'Método'], pagos.map(p => `<tr>${td(p[0])}${td('<b>' + p[1] + '</b>')}${td(p[2])}${td(p[3])}${td('<b style="color:#34d399;">' + money(p[4]) + '</b>')}${td(pill(p[5], met[p[5]] || '#94a3b8'))}</tr>`).join(''));
    }
    function vistaGenerica(id) {
        return `<div style="background:${C.card};border:1px solid ${C.bd};border-radius:12px;padding:2.5rem;text-align:center;color:${C.mut};">
            <div style="font-size:2rem;">📄</div><div style="margin-top:0.5rem;">Módulo <b style="color:${C.txt};">${TITULOS[id] || id}</b></div>
            <div style="font-size:0.85rem;margin-top:0.3rem;">Sin registros en el periodo actual.</div></div>`;
    }
    const vista = id => id === 'dashboard' ? vistaDashboard() : id === 'empenios' ? vistaEmpenos() : id === 'clientes' ? vistaClientes()
        : id === 'inventario' ? vistaInventario() : id === 'pagos' ? vistaPagos() : vistaGenerica(id);

    function paintDecoy(active) {
        const menu = NAV.map(n => n.s
            ? `<div style="padding:0.9rem 1rem 0.3rem;color:${C.mut};font-size:0.68rem;text-transform:uppercase;letter-spacing:0.06em;">${n.s}</div>`
            : `<div class="decoy-nav" data-id="${n.id}" style="display:flex;align-items:center;gap:0.6rem;padding:0.55rem 1rem;cursor:pointer;color:${active === n.id ? '#fff' : C.mut};${active === n.id ? 'background:' + C.side2 + ';border-left:3px solid ' + C.accent + ';' : 'border-left:3px solid transparent;'}"><span>${n.i}</span><span style="font-size:0.88rem;">${n.l}</span></div>`
        ).join('');
        container.innerHTML = `
            <div style="display:flex;min-height:100vh;background:${C.bg};">
                <aside style="width:230px;background:${C.side};flex-shrink:0;overflow-y:auto;max-height:100vh;">
                    <div style="padding:1.1rem 1rem;display:flex;align-items:center;gap:0.55rem;border-bottom:1px solid ${C.side2};">
                        <div style="width:34px;height:34px;border-radius:9px;background:${C.accent};display:flex;align-items:center;justify-content:center;font-size:1.1rem;">🤝</div>
                        <div><div style="color:#fff;font-weight:800;font-size:0.98rem;line-height:1;">Casa de Empeño</div><div style="color:${C.mut};font-size:0.7rem;">Suc. Centro</div></div>
                    </div>
                    ${menu}
                </aside>
                <div style="flex:1;display:flex;flex-direction:column;min-width:0;">
                    <header style="display:flex;justify-content:space-between;align-items:center;padding:0.8rem 1.3rem;background:${C.side};border-bottom:1px solid ${C.side2};flex-wrap:wrap;gap:0.5rem;">
                        <h2 style="margin:0;color:${C.txt};font-size:1.1rem;">${TITULOS[active] || 'Panel'}</h2>
                        <div style="display:flex;align-items:center;gap:0.9rem;color:${C.mut};font-size:0.82rem;">
                            <span>🔔</span><span>Miércoles, 08/07/2026</span>
                            <span style="display:flex;align-items:center;gap:0.4rem;"><span style="width:28px;height:28px;border-radius:50%;background:${C.accent};display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:0.8rem;">C</span>Carlos M. · Gerente</span>
                        </div>
                    </header>
                    <main style="padding:1.3rem;overflow-x:hidden;">${vista(active)}</main>
                </div>
            </div>`;
        container.querySelectorAll('.decoy-nav').forEach(el => el.addEventListener('click', () => paintDecoy(el.getAttribute('data-id'))));
        container.querySelectorAll('.decoy-btn').forEach(b => b.addEventListener('click', () => { b.textContent = 'Cargando...'; setTimeout(() => { b.textContent = '+ Nuevo empeño'; }, 1200); }));
    }
    paintDecoy('dashboard');
}

/** Inicia la app (tras login o al restaurar sesión). Siempre abre en la página de inicio. */
async function startApp() {
    const sidebar = document.getElementById('sidebar');
    const topbar = document.getElementById('topbar');
    if (sidebar) sidebar.style.display = '';
    if (topbar) topbar.style.display = '';

    const container = document.getElementById('app-container');
    container.innerHTML = '<div class="empty-state">Cargando datos...</div>';

    await initStorage();
    buildNavigation();
    mountClientContextBar();

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

    // Verificar expiración de sesión cada minuto.
    // Solo actúa si esta pestaña tiene sesión Y la guardada realmente expiró
    // (isSessionExpired relee localStorage: un login nuevo en otra pestaña
    // re-sincroniza esta en lugar de cerrarla).
    setInterval(() => {
        if (getSession() && isSessionExpired()) {
            clearActiveClient();
            logout();
            alert('Su sesión ha expirado. Por favor inicie sesión nuevamente.');
            showLoginScreen();
        }
    }, 60 * 1000);

    // Al ingresar al sistema (login o restaurar sesión) abrir en la página de
    // inicio (Alertas), ignorando un #seccion viejo en la URL. Excepción: si la
    // app está instalada como PWA (ícono del celular), arranca en "La Vuelta".
    const section = (isStandaloneApp() && hasAccess('vuelta')) ? 'vuelta' : defaultHomeSection();
    window.location.hash = `#${section}`;
    navigateTo(section);
}

/** Actualiza el badge de alertas vencidas en la navegación */
export function updateAlertsBadge() {
    const badge = document.getElementById('alerts-badge');
    if (!badge) return;
    import('./services/attentionService.js').then(({ getAtenderHoy }) => {
        try {
            // Solo lo urgente (vencidos + vence hoy + dormidos + denuncias); los pasos
            // aún dentro de plazo ("Por hacer") se ven en la lista, no inflan el badge.
            const total = getAtenderHoy().urgentes;
            badge.textContent = total;
            badge.style.display = total > 0 ? 'inline' : 'none';
        } catch (e) { /* ignorar si aún no hay datos */ }
    }).catch(() => {});
}

/** Actualiza el badge de acciones pendientes de la Guía. */
export function updateGuiaBadge() {
    const badge = document.getElementById('guia-badge');
    if (!badge) return;
    import('./services/nextActionService.js').then(({ getAllPendingActions }) => {
        try {
            const total = getAllPendingActions();
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

window.__viewFile = (dataUrl, format, filename) => openFileViewer(dataUrl, format, filename);
window.__getCollection = getCollection;
document.addEventListener('DOMContentLoaded', init);
