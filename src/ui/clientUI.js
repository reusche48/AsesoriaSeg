import { registerClient, updateClient, deleteClient } from '../services/clientService.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { openFileViewer, auditLinkHtml } from '../app.js';
import { openFormModal, closeFormModal, showModalAlert, showModalFieldErrors, clearModalErrors } from './modalHelper.js';
import { uploadFile } from '../storage.js';

let editingClientId = null;
let dniFrontalDataUrl = null;
let dniPosteriorDataUrl = null;

export function renderClientSection(container) {
    editingClientId = null;
    container.innerHTML = `
        <div class="section">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                <h2 class="section-title" style="margin:0;">Clientes</h2>
                <button type="button" class="btn btn-primary" id="btn-add-client">➕ Agregar Cliente</button>
            </div>
            <input type="text" id="client-search-input" placeholder="Escriba 4+ letras para buscar..." style="width:100%;padding:0.5rem 0.75rem;border:1px solid #ccc;border-radius:4px;font-size:0.95rem;margin-top:0.75rem;">
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
        if (query.length < 4) { showDefaultClients(container); return; }
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
    if (input && input.value.trim().length >= 4) { input.dispatchEvent(new Event('input')); }
    else { showDefaultClients(container); }
}

function renderClientTable(mainContainer, tableContainer, clients) {
    const rows = clients.map(c => {
        const fotoBtns = [];
        if (c.dniFrontal) fotoBtns.push(`<button type="button" class="btn-icon view-photo-btn" data-photo="${esc(c.dniFrontal)}" title="Ver DNI Frontal">📄</button>`);
        if (c.dniPosterior) fotoBtns.push(`<button type="button" class="btn-icon view-photo-btn" data-photo="${esc(c.dniPosterior)}" title="Ver DNI Posterior">📄</button>`);
        const fotoCell = fotoBtns.length > 0 ? fotoBtns.join(' ') : '-';
        const gpsLink = (c.gpsLatitud && c.gpsLongitud)
            ? `<a href="https://www.google.com/maps?q=${c.gpsLatitud},${c.gpsLongitud}" target="_blank" title="${esc(c.direccion || 'Ver en mapa')}" style="text-decoration:none;">📍</a>`
            : '';
        const dirCell = c.direccion ? `<span title="${esc(c.direccion)}">${esc(c.direccion.length > 25 ? c.direccion.substring(0, 25) + '...' : c.direccion)}</span> ${gpsLink}` : '-';
        return `<tr>
            <td>${esc(c.dni)}</td>
            <td>${esc(c.nombreCompleto)}</td>
            <td>${esc(c.apellidosCompletos)}</td>
            <td>${esc(c.telefono1 || '-')}</td>
            <td>${esc(c.email1 || '-')}</td>
            <td>${dirCell}</td>
            <td class="actions">${fotoCell}</td>
            <td>${auditLinkHtml(c)}</td>
            <td class="actions">
                <button type="button" class="btn-icon primary edit-client-btn" data-id="${esc(c.id)}" title="Editar">✏️</button>
                <button type="button" class="btn-icon danger delete-client-btn" data-id="${esc(c.id)}" data-name="${esc(c.nombreCompleto)} ${esc(c.apellidosCompletos)}" title="Eliminar">🗑️</button>
            </td>
        </tr>`;
    }).join('');

    tableContainer.innerHTML = `
        <table class="data-table">
            <thead><tr>
                <th>DNI</th><th>Nombre</th><th>Apellidos</th><th>Teléfono</th>
                <th>Email</th><th>Dirección</th><th>DNI Foto</th><th>Registro</th><th>Acciones</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
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
    tableContainer.querySelectorAll('.delete-client-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            if (confirm(`¿Está seguro de eliminar al cliente "${name}"?`)) {
                const result = deleteClient(id);
                if (result.success) { triggerSearch(mainContainer); }
                else { alert(result.errors[0].message); }
            }
        });
    });
}

function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
