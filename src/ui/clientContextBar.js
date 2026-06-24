/**
 * Barra de "cliente activo" en el topbar.
 * Muestra el cliente seleccionado y permite cambiarlo o limpiarlo.
 * Al elegir un cliente, lo fija como activo y abre su Ficha.
 */
import { clientRepository } from '../repositories/clientRepository.js';
import {
    getActiveClient, getActiveClientId, setActiveClient,
    clearActiveClient, onActiveClientChange,
} from '../state/clientContext.js';

let mounted = false;
let resolveTimer = null;
let resolveAttempts = 0;

/** Reintenta resolver el nombre del cliente cuando 'clients' termine de cargar (lazy). */
function scheduleResolve() {
    if (resolveTimer) return;
    resolveTimer = setTimeout(() => {
        resolveTimer = null;
        if (getActiveClient()) { paint(); return; }
        if (getActiveClientId() && resolveAttempts++ < 10) scheduleResolve();
    }, 600);
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
}

/** Monta la barra en el topbar (idempotente). Se llama en startApp. */
export function mountClientContextBar() {
    const topbar = document.getElementById('topbar');
    if (!topbar) return;
    let bar = document.getElementById('active-client-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'active-client-bar';
        bar.className = 'active-client-bar';
        topbar.appendChild(bar);
    }
    paint();
    if (!mounted) {
        mounted = true;
        onActiveClientChange(paint);
        // Repintar al navegar: 'clients' es lazy, así el chip resuelve el nombre
        // una vez que alguna sección haya cargado la colección.
        window.addEventListener('hashchange', paint);
    }
}

function paint() {
    const bar = document.getElementById('active-client-bar');
    if (!bar) return;
    const id = getActiveClientId();
    const c = getActiveClient();

    if (c) {
        resolveAttempts = 0;
        bar.innerHTML = `
            <span class="acb-chip" title="Cliente activo">
                👤 ${esc(c.nombreCompleto)} ${esc(c.apellidosCompletos)}<span class="acb-dni"> · ${esc(c.dni || '')}</span>
            </span>
            <button type="button" class="acb-btn" id="acb-change">Cambiar</button>
            <button type="button" class="acb-btn acb-clear" id="acb-clear" title="Quitar cliente activo">✕</button>`;
        bar.querySelector('#acb-change').addEventListener('click', openClientPicker);
        bar.querySelector('#acb-clear').addEventListener('click', () => clearActiveClient());
    } else if (id) {
        // id fijado pero la colección 'clients' aún no está cargada en caché: reintentar
        scheduleResolve();
        bar.innerHTML = `
            <span class="acb-chip" title="Cliente activo">👤 Cliente activo</span>
            <button type="button" class="acb-btn" id="acb-change">Cambiar</button>
            <button type="button" class="acb-btn acb-clear" id="acb-clear" title="Quitar cliente activo">✕</button>`;
        bar.querySelector('#acb-change').addEventListener('click', openClientPicker);
        bar.querySelector('#acb-clear').addEventListener('click', () => clearActiveClient());
    } else {
        bar.innerHTML = `<button type="button" class="acb-btn acb-select" id="acb-select">👤 Seleccionar cliente</button>`;
        bar.querySelector('#acb-select').addEventListener('click', openClientPicker);
    }
}

function closePicker() {
    const ex = document.getElementById('client-picker-overlay');
    if (ex) ex.remove();
}

/** Popup de selección de cliente (búsqueda por nombre/apellido/DNI). */
export function openClientPicker() {
    closePicker();
    const overlay = document.createElement('div');
    overlay.className = 'audit-popup-overlay';
    overlay.id = 'client-picker-overlay';
    overlay.innerHTML = `
        <div class="audit-popup" style="min-width:340px;max-width:92vw;">
            <button type="button" class="audit-close" id="cp-close">&times;</button>
            <h3>👤 Seleccionar cliente</h3>
            <input type="text" id="cp-search" placeholder="Nombre, apellido o DNI..." autocomplete="off"
                   style="width:100%;padding:0.55rem;border:1px solid #374151;border-radius:6px;background:#111827;color:#f1f5f9;margin-bottom:0.5rem;">
            <div id="cp-results" style="max-height:320px;overflow:auto;"></div>
        </div>`;
    document.body.appendChild(overlay);

    const search = overlay.querySelector('#cp-search');
    const results = overlay.querySelector('#cp-results');

    const renderList = (query) => {
        const q = (query || '').trim().toLowerCase();
        let list = clientRepository.getAll();
        if (q) {
            list = list.filter(c =>
                `${c.nombreCompleto} ${c.apellidosCompletos} ${c.dni}`.toLowerCase().includes(q));
        }
        if (list.length === 0) {
            results.innerHTML = '<div style="padding:0.6rem;color:#9ca3af;">Sin resultados.</div>';
            return;
        }
        results.innerHTML = list.slice(0, 50).map(c =>
            `<div class="cp-item" data-id="${esc(c.id)}" style="padding:0.5rem 0.6rem;border-radius:6px;cursor:pointer;">
                ${esc(c.nombreCompleto)} ${esc(c.apellidosCompletos)} <span style="color:#9ca3af;">· ${esc(c.dni || '')}</span>
            </div>`).join('');
        results.querySelectorAll('.cp-item').forEach(item => {
            item.addEventListener('mouseenter', () => { item.style.background = '#1f2937'; });
            item.addEventListener('mouseleave', () => { item.style.background = ''; });
            item.addEventListener('click', () => {
                setActiveClient(item.getAttribute('data-id'));
                closePicker();
                goToFicha();
            });
        });
    };

    renderList('');
    search.addEventListener('input', () => renderList(search.value));
    overlay.querySelector('#cp-close').addEventListener('click', closePicker);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePicker(); });
    setTimeout(() => search.focus(), 50);
}

/** Navega a la Ficha del cliente (forzando re-render si ya estamos ahí). */
function goToFicha() {
    if (window.location.hash === '#fichaCliente') {
        window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else {
        window.location.hash = '#fichaCliente';
    }
}
