import { getPendingClaimBanks } from '../services/incidentService.js';

/**
 * Módulo UI para consulta de reclamos pendientes por banco.
 */

/**
 * Renderiza la sección de consulta de reclamos pendientes.
 * @param {HTMLElement} container
 */
export function renderPendingClaimsSection(container) {
    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">Consulta de Reclamos Pendientes</h2>
            <div id="pending-claims-content"></div>
        </div>
    `;

    refreshPendingList(container);
}

function refreshPendingList(container) {
    const content = container.querySelector('#pending-claims-content');
    const pending = getPendingClaimBanks();

    if (pending.length === 0) {
        content.innerHTML = '<div class="empty-state">No hay reclamos pendientes.</div>';
        return;
    }

    const rows = pending.map(item => {
        const diasStyle = item.diasRetraso > 30 ? 'color:red;font-weight:bold;' :
                          item.diasRetraso > 15 ? 'color:orange;font-weight:bold;' : '';
        return `
            <tr>
                <td>${escapeHtml(item.clienteNombre)}</td>
                <td>${formatDate(item.fechaSiniestro)}</td>
                <td>${escapeHtml(item.bancoNombre)}</td>
                <td>${escapeHtml(item.estado)}</td>
                <td style="${diasStyle}">${item.diasRetraso}</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Cliente</th>
                    <th>Fecha Siniestro</th>
                    <th>Banco</th>
                    <th>Estado</th>
                    <th>Días de Retraso</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
}
