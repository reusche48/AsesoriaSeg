import { claimRepository } from '../repositories/claimRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { getClaimEvents } from '../services/claimEventService.js';
import { openFileViewer } from '../app.js';

import { claimEventRepository } from '../repositories/claimEventRepository.js';

/**
 * Módulo UI para seguimiento de reclamos en proceso.
 */

let currentSearchQuery = '';

/**
 * Renderiza la sección de seguimiento de reclamos en proceso.
 * @param {HTMLElement} container
 */
export function renderTrackingSection(container) {
    currentSearchQuery = '';

    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">Seguimiento de Reclamos</h2>
            <div class="form-group">
                <input type="text" id="tracking-search" placeholder="Buscar por cliente, banco, observación... (mín. 4 caracteres)" aria-label="Buscar en seguimiento" style="width:100%;">
            </div>
            <div id="tracking-list-content"></div>
        </div>
        <div class="section mt-2" id="tracking-detail-section" style="display:none;">
            <h2 class="section-title">Eventos del Reclamo</h2>
            <div id="tracking-detail-info"></div>
            <div id="tracking-event-list"></div>
        </div>
    `;

    const searchInput = container.querySelector('#tracking-search');
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        if (query.length >= 4 || query.length === 0) {
            currentSearchQuery = query;
            refreshTrackingList(container);
        }
    });

    refreshTrackingList(container);
}

function refreshTrackingList(container) {
    const content = container.querySelector('#tracking-list-content');
    let claims = claimRepository.getAll();

    // Filtrar por búsqueda
    if (currentSearchQuery.length >= 4) {
        claims = claims.filter(claim => {
            const incident = incidentRepository.getById(claim.siniestroId);
            const client = incident ? clientRepository.getById(incident.clienteId) : null;
            const bank = bankRepository.getById(claim.bancoId);

            const clientName = client ? `${client.nombreCompleto} ${client.apellidosCompletos}`.toLowerCase() : '';
            const bankName = bank ? bank.nombre.toLowerCase() : '';
            const fecha = (claim.fecha || '').toLowerCase();
            const estado = (claim.estado || '').toLowerCase();

            // Buscar en eventos (observaciones y descripciones)
            const events = claimEventRepository.findByClaimId(claim.id) || [];
            const eventMatch = events.some(ev =>
                (ev.observacion || '').toLowerCase().includes(currentSearchQuery) ||
                (ev.descripcion || '').toLowerCase().includes(currentSearchQuery)
            );

            return clientName.includes(currentSearchQuery) ||
                   bankName.includes(currentSearchQuery) ||
                   fecha.includes(currentSearchQuery) ||
                   estado.includes(currentSearchQuery) ||
                   eventMatch;
        });
    }

    // Ordenar: En Proceso primero, luego Pendiente, luego Culminado
    const estadoOrden = { 'En Proceso': 0, 'Pendiente': 1, 'Culminado': 2 };
    claims.sort((a, b) => (estadoOrden[a.estado] ?? 3) - (estadoOrden[b.estado] ?? 3));

    if (claims.length === 0) {
        content.innerHTML = '<div class="empty-state">No hay reclamos registrados.</div>';
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rows = claims.map(claim => {
        const incident = incidentRepository.getById(claim.siniestroId);
        const client = incident ? clientRepository.getById(incident.clienteId) : null;
        const bank = bankRepository.getById(claim.bancoId);
        const clientName = client ? `${escapeHtml(client.nombreCompleto)} ${escapeHtml(client.apellidosCompletos)}` : 'Desconocido';
        const bankName = bank ? escapeHtml(bank.nombre) : 'Desconocido';

        let diasTranscurridos = 0;
        const fechaReclamo = new Date(claim.fecha);
        fechaReclamo.setHours(0, 0, 0, 0);
        diasTranscurridos = Math.floor((today - fechaReclamo) / (1000 * 60 * 60 * 24));
        if (diasTranscurridos < 0) diasTranscurridos = 0;

        const diasStyle = diasTranscurridos > 30 ? 'color:red;font-weight:bold;' :
                          diasTranscurridos > 15 ? 'color:orange;font-weight:bold;' : '';

        const estadoStyle = claim.estado === 'En Proceso' ? 'color:#1565c0;font-weight:bold;' :
                            claim.estado === 'Pendiente' ? 'color:#e65100;font-weight:bold;' :
                            claim.estado === 'Culminado' ? 'color:#2e7d32;font-weight:bold;' : '';

        return `
            <tr>
                <td>${clientName}</td>
                <td>${bankName}</td>
                <td>${formatDate(claim.fecha)}</td>
                <td>${formatMoney(claim.montoTotal)}</td>
                <td style="${estadoStyle}">${escapeHtml(claim.estado)}</td>
                <td style="${diasStyle}">${diasTranscurridos}</td>
                <td><button type="button" class="btn-icon primary view-detail-btn" data-claim-id="${escapeHtml(claim.id)}" title="Ver detalle">🔍</button></td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Cliente</th>
                    <th>Banco</th>
                    <th>Fecha</th>
                    <th>Monto Total</th>
                    <th>Estado</th>
                    <th>Días Transcurridos</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    content.querySelectorAll('.view-detail-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const claimId = btn.getAttribute('data-claim-id');
            showClaimDetail(container, claimId);
        });
    });
}

function showClaimDetail(container, claimId) {
    const section = container.querySelector('#tracking-detail-section');
    section.style.display = '';

    const claim = claimRepository.getById(claimId);
    const incident = claim ? incidentRepository.getById(claim.siniestroId) : null;
    const client = incident ? clientRepository.getById(incident.clienteId) : null;
    const bank = claim ? bankRepository.getById(claim.bancoId) : null;

    const infoDiv = container.querySelector('#tracking-detail-info');
    infoDiv.innerHTML = `<div class="alert alert-success">
        Reclamo: ${escapeHtml(claimId.substring(0, 8))} —
        Cliente: ${client ? escapeHtml(client.nombreCompleto + ' ' + client.apellidosCompletos) : 'N/A'} —
        Banco: ${bank ? escapeHtml(bank.nombre) : 'N/A'} —
        Fecha: ${claim ? formatDate(claim.fecha) : 'N/A'}
    </div>`;

    const events = getClaimEvents(claimId);
    const eventListDiv = container.querySelector('#tracking-event-list');

    if (events.length === 0) {
        eventListDiv.innerHTML = '<div class="empty-state">No hay eventos registrados para este reclamo.</div>';
        return;
    }

    const eventRows = events.map(ev => {
        const fechaObj = new Date(ev.fecha);
        const fechaStr = fechaObj.toLocaleDateString('es-PE') + ' ' + fechaObj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
        const regObj = new Date(ev.fechaRegistro);
        const regStr = regObj.toLocaleDateString('es-PE') + ' ' + regObj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const evidenciaBtn = ev.evidencia
            ? `<button type="button" class="btn-icon view-evidence-btn" title="Ver evidencia" data-file="${escapeHtml(ev.evidencia)}">📎</button>`
            : '-';
        return `
            <tr>
                <td>${escapeHtml(fechaStr)}</td>
                <td>${escapeHtml(regStr)}</td>
                <td>${escapeHtml(ev.descripcion)}</td>
                <td>${escapeHtml(ev.observacion || '')}</td>
                <td>${evidenciaBtn}</td>
            </tr>
        `;
    }).join('');

    eventListDiv.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Fecha y Hora</th>
                    <th>Fecha Registro</th>
                    <th>Descripción</th>
                    <th>Observación</th>
                    <th>Evidencia</th>
                </tr>
            </thead>
            <tbody>${eventRows}</tbody>
        </table>
    `;

    eventListDiv.querySelectorAll('.view-evidence-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const file = btn.getAttribute('data-file');
            if (file) openFileViewer(file);
        });
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatMoney(value) {
    const num = Number(value) || 0;
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
}
