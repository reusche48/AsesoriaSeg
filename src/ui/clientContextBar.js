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

// ── Clientes recientes (los últimos con los que trabajaste) ──
const RECENT_KEY = 'recent_client_ids';
const RECENT_MAX = 6;

function getRecentIds() {
    try {
        const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
        return Array.isArray(raw) ? raw.filter(x => typeof x === 'string') : [];
    } catch (e) { return []; }
}

/** Registra un cliente como "recién usado" (queda primero en la lista). */
function pushRecent(id) {
    if (!id) return;
    try {
        const list = [id, ...getRecentIds().filter(x => x !== id)].slice(0, RECENT_MAX);
        localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch (e) { /* ignore */ }
}

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
        // Al cambiar de cliente, recordarlo como reciente (venga del selector, de
        // Alertas → "Ir a Guía", etc.) para ofrecerlo primero la próxima vez.
        onActiveClientChange(() => { pushRecent(getActiveClientId()); paint(); });
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

    const itemHtml = (c) =>
        `<div class="cp-item" data-id="${esc(c.id)}" style="padding:0.5rem 0.6rem;border-radius:6px;cursor:pointer;">
            ${esc(c.nombreCompleto)} ${esc(c.apellidosCompletos)} <span style="color:#9ca3af;">· ${esc(c.dni || '')}</span>
        </div>`;
    const tituloHtml = (txt) =>
        `<div style="padding:0.35rem 0.6rem;color:#64748b;font-size:0.72rem;font-weight:700;letter-spacing:0.03em;">${txt}</div>`;

    const renderList = (query) => {
        const q = (query || '').trim().toLowerCase();
        const all = clientRepository.getAll();

        if (q) {
            const list = all.filter(c =>
                `${c.nombreCompleto} ${c.apellidosCompletos} ${c.dni}`.toLowerCase().includes(q));
            results.innerHTML = list.length
                ? list.slice(0, 50).map(itemHtml).join('')
                : '<div style="padding:0.6rem;color:#9ca3af;">Sin resultados.</div>';
        } else {
            // Sin búsqueda: primero los clientes recientes (los últimos que trabajaste).
            const recientes = getRecentIds().map(id => all.find(c => c.id === id)).filter(Boolean);
            const recientesIds = new Set(recientes.map(c => c.id));
            const otros = all.filter(c => !recientesIds.has(c.id));
            if (all.length === 0) {
                results.innerHTML = '<div style="padding:0.6rem;color:#9ca3af;">Sin resultados.</div>';
            } else {
                results.innerHTML =
                    (recientes.length ? tituloHtml('⭐ RECIENTES') + recientes.map(itemHtml).join('')
                        + `<div style="border-top:1px solid #1f2937;margin:0.35rem 0;"></div>` + tituloHtml('TODOS LOS CLIENTES') : '')
                    + otros.slice(0, 50).map(itemHtml).join('');
            }
        }

        results.querySelectorAll('.cp-item').forEach(item => {
            item.addEventListener('mouseenter', () => { item.style.background = '#1f2937'; });
            item.addEventListener('mouseleave', () => { item.style.background = ''; });
            item.addEventListener('click', () => {
                const id = item.getAttribute('data-id');
                pushRecent(id);
                setActiveClient(id);
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
