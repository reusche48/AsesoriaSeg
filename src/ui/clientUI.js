import { registerClient, updateClient, deleteClient } from '../services/clientService.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { advanceRepository } from '../repositories/advanceRepository.js';
import { openFileViewer, auditLinkHtml } from '../app.js';
import { openFormModal, closeFormModal, showModalAlert, showModalFieldErrors, clearModalErrors } from './modalHelper.js';
import { uploadFile } from '../storage.js';
import { confirmarEliminacion } from '../utils.js';

let editingClientId = null;
let dniFrontalDataUrl = null;
let dniPosteriorDataUrl = null;

const SVG = {
    edit:    `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    chart:   `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    trash:   `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
    file:    `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`,
    mapPin:  `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    phone:   `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.48 2 2 0 0 1 3.58 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6A16 16 0 0 0 15.4 16.09l.96-.9a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    email:   `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
};

export function renderClientSection(container) {
    editingClientId = null;
    container.innerHTML = `
        <div class="section">
            <div style="display:flex;align-items:center;gap:0.75rem;">
                <input type="text" id="client-search-input" placeholder="Ingresa un cliente" style="flex:1;padding:0.5rem 0.75rem;border:1px solid #ccc;border-radius:4px;font-size:0.95rem;">
                <button type="button" id="btn-add-client" style="display:inline-flex;align-items:center;gap:0.4rem;white-space:nowrap;background:#0284c7;color:#fff;border:none;padding:0.48rem 1rem;border-radius:5px;font-size:0.85rem;font-weight:500;font-family:inherit;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#0369a1'" onmouseout="this.style.background='#0284c7'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Agregar
                </button>
            </div>
            <div id="search-results" class="mt-1"></div>
        </div>
    `;

    container.querySelector('#btn-add-client').addEventListener('click', () => openClientForm(container, null));
    setupSearchHandlers(container);
    showDefaultClients(container);
}

function getClientFormHtml(client) {
    const c = client || {};
    return `
        <div class="form-row">
            <div class="form-group" data-field="nombreCompleto">
                <label>Nombre completo *</label>
                <input type="text" name="nombreCompleto" value="${esc(c.nombreCompleto || '')}" required>
                <div class="error-message" data-error="nombreCompleto"></div>
            </div>
            <div class="form-group" data-field="apellidosCompletos">
                <label>Apellidos completos *</label>
                <input type="text" name="apellidosCompletos" value="${esc(c.apellidosCompletos || '')}" required>
                <div class="error-message" data-error="apellidosCompletos"></div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group" data-field="dni">
                <label>DNI *</label>
                <input type="text" name="dni" value="${esc(c.dni || '')}" maxlength="8" required ${client ? 'readonly' : ''}>
                <div class="error-message" data-error="dni"></div>
            </div>
            <div class="form-group" data-field="fechaNacimiento">
                <label>Fecha de nacimiento</label>
                <input type="date" name="fechaNacimiento" value="${c.fechaNacimiento || ''}">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Teléfono 1</label><input type="tel" name="telefono1" value="${esc(c.telefono1 || '')}"></div>
            <div class="form-group"><label>Teléfono 2</label><input type="tel" name="telefono2" value="${esc(c.telefono2 || '')}"></div>
        </div>
        <div class="form-row">
            <div class="form-group" data-field="email1">
                <label>Correo 1</label><input type="email" name="email1" value="${esc(c.email1 || '')}">
                <div class="error-message" data-error="email1"></div>
            </div>
            <div class="form-group" data-field="email2">
                <label>Correo 2</label><input type="email" name="email2" value="${esc(c.email2 || '')}">
                <div class="error-message" data-error="email2"></div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group" data-field="direccion">
                <label>Dirección</label>
                <input type="text" name="direccion" value="${esc(c.direccion || '')}" placeholder="Dirección del domicilio">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Latitud GPS</label><input type="number" name="gpsLatitud" step="0.0000001" value="${c.gpsLatitud || ''}" placeholder="-12.0463731"></div>
            <div class="form-group"><label>Longitud GPS</label><input type="number" name="gpsLongitud" step="0.0000001" value="${c.gpsLongitud || ''}" placeholder="-77.0427934"></div>
            <div class="form-group" style="display:flex;align-items:flex-end;"><button type="button" class="btn btn-secondary" id="btn-get-gps">📍 Mi ubicación</button></div>
        </div>
        <div class="form-row">
            <div class="form-group" data-field="observaciones">
                <label>Observaciones</label>
                <textarea name="observaciones" rows="3" placeholder="Notas adicionales sobre el cliente...">${esc(c.observaciones || '')}</textarea>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Foto DNI (Frontal)</label><input type="file" id="modal-dniFrontal" accept="image/*"><div id="modal-dniFrontal-preview"></div></div>
            <div class="form-group"><label>Foto DNI (Posterior)</label><input type="file" id="modal-dniPosterior" accept="image/*"><div id="modal-dniPosterior-preview"></div></div>
        </div>
    `;
}

function openClientForm(container, client) {
    editingClientId = client ? client.id : null;
    dniFrontalDataUrl = client?.dniFrontal || null;
    dniPosteriorDataUrl = client?.dniPosterior || null;

    openFormModal({
        title: client ? 'Editar Cliente' : 'Registrar Cliente',
        html: getClientFormHtml(client),
        submitLabel: client ? 'Guardar Cambios' : 'Registrar Cliente',
        onSubmit: (form) => {
            clearModalErrors();
            const fd = new FormData(form);
            const data = {
                nombreCompleto: fd.get('nombreCompleto') || '',
                apellidosCompletos: fd.get('apellidosCompletos') || '',
                dni: fd.get('dni') || '',
                fechaNacimiento: fd.get('fechaNacimiento') || '',
                telefono1: fd.get('telefono1') || '',
                telefono2: fd.get('telefono2') || '',
                email1: fd.get('email1') || '',
                email2: fd.get('email2') || '',
                direccion: fd.get('direccion') || '',
                gpsLatitud: fd.get('gpsLatitud') || '',
                gpsLongitud: fd.get('gpsLongitud') || '',
                observaciones: fd.get('observaciones') || '',
                dniFrontal: dniFrontalDataUrl,
                dniPosterior: dniPosteriorDataUrl,
            };

            let result;
            if (editingClientId) {
                result = updateClient(editingClientId, data);
            } else {
                result = registerClient(data);
            }

            if (result.success) {
                closeFormModal();
                triggerSearch(container);
            } else {
                showModalFieldErrors(result.errors);
            }
        },
        onOpen: (overlay) => {
            // GPS button
            const gpsBtn = overlay.querySelector('#btn-get-gps');
            if (gpsBtn) {
                gpsBtn.addEventListener('click', () => {
                    if (!navigator.geolocation) { alert('Su navegador no soporta geolocalización.'); return; }
                    gpsBtn.textContent = '⏳ Obteniendo...';
                    gpsBtn.disabled = true;
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            overlay.querySelector('[name="gpsLatitud"]').value = pos.coords.latitude.toFixed(7);
                            overlay.querySelector('[name="gpsLongitud"]').value = pos.coords.longitude.toFixed(7);
                            gpsBtn.textContent = '📍 Mi ubicación';
                            gpsBtn.disabled = false;
                        },
                        (err) => { alert('No se pudo obtener ubicación: ' + err.message); gpsBtn.textContent = '📍 Mi ubicación'; gpsBtn.disabled = false; },
                        { enableHighAccuracy: true, timeout: 10000 }
                    );
                });
            }
            // File inputs
            setupFileInput(overlay, '#modal-dniFrontal', '#modal-dniFrontal-preview', (url) => { dniFrontalDataUrl = url; }, container);
            setupFileInput(overlay, '#modal-dniPosterior', '#modal-dniPosterior-preview', (url) => { dniPosteriorDataUrl = url; }, container);

            // Función para guardar foto eliminada y cerrar modal
            const savePhotoAndClose = (field) => () => {
                if (editingClientId) {
                    const c = clientRepository.getById(editingClientId);
                    if (c) {
                        const data = {
                            nombreCompleto: c.nombreCompleto, apellidosCompletos: c.apellidosCompletos,
                            dni: c.dni, fechaNacimiento: c.fechaNacimiento || '',
                            telefono1: c.telefono1 || '', telefono2: c.telefono2 || '',
                            email1: c.email1 || '', email2: c.email2 || '',
                            direccion: c.direccion || '', gpsLatitud: c.gpsLatitud || '',
                            gpsLongitud: c.gpsLongitud || '', observaciones: c.observaciones || '',
                            dniFrontal: c.dniFrontal || null, dniPosterior: c.dniPosterior || null,
                        };
                        data[field] = null;
                        updateClient(editingClientId, data);
                    }
                    closeFormModal();
                    triggerSearch(container);
                }
            };

            // Show existing previews
            showPreview(overlay, '#modal-dniFrontal-preview', dniFrontalDataUrl, () => { dniFrontalDataUrl = null; }, savePhotoAndClose('dniFrontal'));
            showPreview(overlay, '#modal-dniPosterior-preview', dniPosteriorDataUrl, () => { dniPosteriorDataUrl = null; }, savePhotoAndClose('dniPosterior'));
        },
    });
}

function setupFileInput(overlay, inputSel, previewSel, onLoad, container) {
    const input = overlay.querySelector(inputSel);
    if (!input) return;
    input.addEventListener('change', async () => {
        const file = input.files[0];
        if (file) {
            try {
                const url = await uploadFile(file);
                onLoad(url);
                showPreview(overlay, previewSel, url, () => { onLoad(null); });
            } catch (err) {
                alert('Error al subir archivo: ' + err.message);
                input.value = '';
            }
        }
    });
}

function showPreview(ctx, selector, dataUrl, onDelete, saveAndClose) {
    const el = ctx.querySelector(selector);
    if (el && dataUrl) {
        el.innerHTML = `<div style="display:inline-flex;align-items:flex-start;gap:0.3rem;margin-top:0.25rem;">
            <img src="${dataUrl}" style="max-width:120px;max-height:80px;border-radius:4px;cursor:pointer;">
            <button type="button" class="btn-icon danger btn-remove-foto" title="Eliminar foto" style="font-size:0.75rem;padding:2px 5px;">❌</button>
        </div>`;
        el.querySelector('img').addEventListener('click', () => openFileViewer(dataUrl));
        el.querySelector('.btn-remove-foto').addEventListener('click', () => {
            if (!confirm('¿Está seguro de eliminar esta foto?')) return;
            if (onDelete) onDelete();
            el.innerHTML = '';
            const inputId = selector.replace('-preview', '');
            const input = ctx.querySelector(inputId);
            if (input) input.value = '';
            if (saveAndClose) saveAndClose();
        });
    } else if (el) { el.innerHTML = ''; }
}

function showDefaultClients(container) {
    const resultsDiv = container.querySelector('#search-results');
    const allClients = clientRepository.getAll();
    const last10 = allClients.slice(0, 10);
    if (last10.length > 0) {
        renderClientTable(container, resultsDiv, last10);
    } else {
        resultsDiv.innerHTML = '<div class="empty-state">No hay clientes registrados.</div>';
    }
}

function setupSearchHandlers(container) {
    const searchInput = container.querySelector('#client-search-input');
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        const resultsDiv = container.querySelector('#search-results');
        if (query.length < 3) { showDefaultClients(container); return; }
        const matches = clientRepository.getAll().filter(c => {
            const fields = [c.nombreCompleto, c.apellidosCompletos, c.dni, c.telefono1, c.telefono2, c.email1, c.email2, c.fechaNacimiento, c.direccion];
            return fields.some(f => f && f.toLowerCase().includes(query));
        });
        if (matches.length > 0) { renderClientTable(container, resultsDiv, matches); }
        else { resultsDiv.innerHTML = '<div class="empty-state">No se encontraron resultados.</div>'; }
    });
}

function triggerSearch(container) {
    const input = container.querySelector('#client-search-input');
    if (input && input.value.trim().length >= 3) { input.dispatchEvent(new Event('input')); }
    else { showDefaultClients(container); }
}

function truncCell(val, n = 12) {
    const s = val ? String(val) : '-';
    if (s.length > n) return `<span title="${esc(s)}">${esc(s.substring(0, n))}…</span>`;
    return esc(s);
}

function renderClientTable(mainContainer, tableContainer, clients) {
    const rows = clients.map((c, idx) => {
        const fotoBtns = [];
        if (c.dniFrontal) fotoBtns.push(`<button type="button" class="btn-icon view-photo-btn" data-photo="${esc(c.dniFrontal)}" title="Ver DNI Frontal">${SVG.file}</button>`);
        if (c.dniPosterior) fotoBtns.push(`<button type="button" class="btn-icon view-photo-btn" data-photo="${esc(c.dniPosterior)}" title="Ver DNI Posterior">${SVG.file}</button>`);
        const fotoCell = fotoBtns.length > 0 ? `<div class="actions-wrap">${fotoBtns.join('')}</div>` : '-';
        const gpsLink = (c.gpsLatitud && c.gpsLongitud)
            ? `<a href="https://www.google.com/maps?q=${c.gpsLatitud},${c.gpsLongitud}" target="_blank" title="${esc(c.direccion || 'Ver en mapa')}" class="btn-icon" style="text-decoration:none;">${SVG.mapPin}</a>`
            : '';
        const dirCell = c.direccion
            ? `${truncCell(c.direccion)} ${gpsLink}`
            : '-';
        return `<tr>
            <td style="color:#94a3b8;font-size:0.78rem;width:36px;text-align:center;">${idx + 1}</td>
            <td>${esc(c.dni)}</td>
            <td>${truncCell(c.nombreCompleto)}</td>
            <td>${truncCell(c.apellidosCompletos)}</td>
            <td>${truncCell(c.telefono1 || '-')}</td>
            <td>${truncCell(c.email1 || '-')}</td>
            <td>${dirCell}</td>
            <td class="actions">${fotoCell}</td>
            <td>${auditLinkHtml(c)}</td>
            <td class="actions">
                <div class="actions-wrap">
                    <button type="button" class="btn-icon primary edit-client-btn" data-id="${esc(c.id)}" title="Editar">${SVG.edit}</button>
                    <button type="button" class="btn-icon purple summary-client-btn" data-id="${esc(c.id)}" title="Resumen financiero">${SVG.chart}</button>
                    <button type="button" class="btn-icon danger delete-client-btn" data-id="${esc(c.id)}" data-name="${esc(c.nombreCompleto)} ${esc(c.apellidosCompletos)}" title="Eliminar">${SVG.trash}</button>
                </div>
            </td>
        </tr>`;
    }).join('');

    const cards = clients.map((c) => {
        const fotoBtns = [];
        if (c.dniFrontal) fotoBtns.push(`<button type="button" class="btn-icon view-photo-btn" data-photo="${esc(c.dniFrontal)}" title="Ver DNI Frontal">${SVG.file}</button>`);
        if (c.dniPosterior) fotoBtns.push(`<button type="button" class="btn-icon view-photo-btn" data-photo="${esc(c.dniPosterior)}" title="Ver DNI Posterior">${SVG.file}</button>`);
        const gpsLink = (c.gpsLatitud && c.gpsLongitud)
            ? `<a href="https://www.google.com/maps?q=${c.gpsLatitud},${c.gpsLongitud}" target="_blank" class="btn-icon" style="text-decoration:none;">${SVG.mapPin}</a>`
            : '';
        const metaParts = [`DNI: ${esc(c.dni)}`];
        if (c.fechaNacimiento) metaParts.push(`Nac: ${esc(c.fechaNacimiento)}`);
        const phones = [c.telefono1, c.telefono2].filter(Boolean).map(esc).join(' | ');
        const emails = [c.email1, c.email2].filter(Boolean).map(esc).join(' | ');
        return `<div class="client-card">
            <div class="client-card-left">
                <div class="client-card-name">${esc(c.nombreCompleto)} ${esc(c.apellidosCompletos)}</div>
                <div class="client-card-meta">${metaParts.join(' | ')}</div>
                ${phones ? `<div class="client-card-row"><span class="client-card-icon">${SVG.phone}</span>${phones}</div>` : ''}
                ${emails ? `<div class="client-card-row"><span class="client-card-icon">${SVG.email}</span>${emails}</div>` : ''}
                ${c.direccion ? `<div class="client-card-row"><span class="client-card-icon">${SVG.mapPin}</span>${esc(c.direccion)} ${gpsLink}</div>` : ''}
            </div>
            <div class="client-card-actions">
                <button type="button" class="btn-icon primary edit-client-btn" data-id="${esc(c.id)}" title="Editar">${SVG.edit}</button>
                <button type="button" class="btn-icon purple summary-client-btn" data-id="${esc(c.id)}" title="Resumen financiero">${SVG.chart}</button>
                <button type="button" class="btn-icon danger delete-client-btn" data-id="${esc(c.id)}" data-name="${esc(c.nombreCompleto)} ${esc(c.apellidosCompletos)}" title="Eliminar">${SVG.trash}</button>
            </div>
        </div>`;
    }).join('');

    tableContainer.innerHTML = `
        <div class="client-table-view">
            <div class="table-scroll"><table class="data-table">
                <thead><tr>
                    <th style="width:36px;text-align:center;">#</th>
                    <th>DNI</th><th>Nombre</th><th>Apellidos</th><th>Teléfono</th>
                    <th>Email</th><th>Dirección</th><th>DNI Foto</th><th>Registro</th><th class="actions">Acciones</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table></div>
        </div>
        <div class="client-cards-view">${cards}</div>
    `;

    tableContainer.querySelectorAll('.view-photo-btn').forEach(btn => {
        btn.addEventListener('click', () => { const p = btn.getAttribute('data-photo'); if (p) openFileViewer(p); });
    });
    tableContainer.querySelectorAll('.edit-client-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const client = clients.find(c => c.id === btn.getAttribute('data-id'));
            if (client) openClientForm(mainContainer, client);
        });
    });
    tableContainer.querySelectorAll('.summary-client-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const client = clients.find(c => c.id === btn.getAttribute('data-id'));
            if (client) openClientSummaryModal(client);
        });
    });
    tableContainer.querySelectorAll('.delete-client-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            if (await confirmarEliminacion(`¿Está seguro de eliminar al cliente "${name}"?`)) {
                const result = deleteClient(id);
                if (result.success) { triggerSearch(mainContainer); }
                else { alert(result.errors[0].message); }
            }
        });
    });
}

function openClientSummaryModal(client) {
    const clientName = `${client.nombreCompleto} ${client.apellidosCompletos}`;

    // Claims: obtener siniestros del cliente → reclamos
    const incidents = incidentRepository.getAll().filter(i => i.clienteId === client.id);
    const incidentIds = incidents.map(i => i.id);
    const claims = claimRepository.getAll().filter(c => incidentIds.includes(c.siniestroId));

    const totalReclamado = claims.reduce((s, c) => s + (Number(c.montoTotal) || 0), 0);
    const claimsRows = claims.map(c => {
        const bank = bankRepository.getById(c.bancoId);
        const estado = c.estado || 'Pendiente';
        const colors = { 'Pendiente': '#e65100', 'En Proceso': '#1565c0', 'Culminado': '#2e7d32' };
        return `<tr>
            <td>${bank ? esc(bank.nombre) : '-'}</td>
            <td><span style="color:${colors[estado]||'#333'};font-weight:600;">${esc(estado)}</span></td>
            <td style="text-align:right;">S/ ${fmtMoney(c.montoTotal)}</td>
        </tr>`;
    }).join('');

    // Advances
    const advances = advanceRepository.getAll().filter(a => a.clienteId === client.id);
    const totalAdelantado = advances.reduce((s, a) => s + (Number(a.montoSoles) || 0), 0);
    const saldo = totalReclamado - totalAdelantado;

    const html = `
        <div style="margin-bottom:1rem;">
            <h4 style="margin:0 0 0.5rem;color:#1565c0;">Resumen por Reclamos</h4>
            ${claims.length === 0
                ? '<p style="color:#888;">Sin reclamos registrados.</p>'
                : `<table class="data-table"><thead><tr><th>Banco</th><th>Estado</th><th>Monto Total</th></tr></thead><tbody>${claimsRows}</tbody></table>`}
        </div>
        <div style="background:#f5f5f5;border-radius:6px;padding:0.75rem 1rem;margin-top:0.5rem;display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;text-align:center;">
            <div><div style="font-size:0.78rem;color:#666;">Total Reclamado</div><div style="font-size:1.15rem;font-weight:700;color:#1565c0;">S/ ${fmtMoney(totalReclamado)}</div></div>
            <div><div style="font-size:0.78rem;color:#666;">Total Adelantado</div><div style="font-size:1.15rem;font-weight:700;color:#e65100;">S/ ${fmtMoney(totalAdelantado)}</div></div>
            <div><div style="font-size:0.78rem;color:#666;">Saldo Pendiente</div><div style="font-size:1.15rem;font-weight:700;color:${saldo > 0 ? '#2e7d32' : '#888'};">S/ ${fmtMoney(saldo)}</div></div>
        </div>
        <p style="font-size:0.8rem;color:#888;margin-top:0.5rem;">* Los montos están expresados en Soles (PEN).</p>
    `;

    openFormModal({
        title: `📊 Ficha Financiera — ${esc(clientName)}`,
        html,
        submitLabel: 'Cerrar',
        onSubmit: () => closeFormModal(),
    });
}

function fmtMoney(v) { return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
