import { clientRepository } from '../repositories/clientRepository.js';
import { advanceRepository } from '../repositories/advanceRepository.js';
import { openFileViewer } from '../app.js';

/**
 * Módulo UI de consulta de adelantos (solo lectura).
 */

export function renderAdvanceQuerySection(container) {
    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">Consulta de Adelantos</h2>
            <input type="text" id="advq-search" placeholder="Escriba 4+ letras para buscar cliente..." style="width:100%;padding:0.5rem 0.75rem;border:1px solid #ccc;border-radius:4px;font-size:0.95rem;">
            <div id="advq-results" class="mt-1"></div>
        </div>
    `;

    const searchInput = container.querySelector('#advq-search');
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        const resultsDiv = container.querySelector('#advq-results');

        if (query.length < 4) {
            resultsDiv.innerHTML = '';
            return;
        }

        const clients = clientRepository.getAll().filter(c => {
            const fields = [c.nombreCompleto, c.apellidosCompletos, c.dni, c.telefono1, c.email1];
            return fields.some(f => f && f.toLowerCase().includes(query));
        });

        if (clients.length === 0) {
            resultsDiv.innerHTML = '<div class="empty-state">No se encontraron clientes.</div>';
            return;
        }

        // Mostrar adelantos de todos los clientes encontrados
        let allAdvances = [];
        for (const c of clients) {
            const advs = advanceRepository.findByClientId(c.id).map(a => ({ ...a, _client: c }));
            allAdvances.push(...advs);
        }

        // Último primero
        allAdvances.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        if (allAdvances.length === 0) {
            resultsDiv.innerHTML = '<div class="empty-state">Los clientes encontrados no tienen adelantos.</div>';
            return;
        }

        const total = allAdvances.reduce((sum, a) => sum + (Number(a.montoSoles) || 0), 0);

        const rows = allAdvances.map(a => {
            const c = a._client;
            const clientName = `${c.nombreCompleto} ${c.apellidosCompletos}`;
            const monedaLabel = a.moneda === 'USD' ? 'USD' : 'PEN';
            const montoLabel = `${monedaLabel} ${formatMoney(Number(a.monto))}`;
            const montoSolesLabel = a.moneda === 'USD' ? `S/ ${formatMoney(Number(a.montoSoles))}` : '';
            const evidenciaBtn = a.evidencia
                ? `<button type="button" class="btn-icon view-ev-btn" data-idx="${esc(a.id)}" title="Ver evidencia">📎</button>`
                : '-';

            return `<tr>
                <td>${formatDate(a.fecha)}</td>
                <td>${esc(clientName)}</td>
                <td>${esc(a.concepto)}</td>
                <td style="text-align:right;font-weight:600;">${montoLabel}</td>
                <td style="text-align:right;">${montoSolesLabel}</td>
                <td>${esc(a.observaciones || '-')}</td>
                <td>${evidenciaBtn}</td>
            </tr>`;
        }).join('');

        resultsDiv.innerHTML = `
            <table class="data-table">
                <thead><tr>
                    <th>Fecha</th><th>Cliente</th><th>Concepto</th>
                    <th>Monto</th><th>En Soles</th><th>Observaciones</th><th>Evidencia</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <div style="font-weight:700;margin:0.75rem 0;font-size:1.1rem;text-align:right;">Total adelantos: S/ ${formatMoney(total)}</div>
        `;

        resultsDiv.querySelectorAll('.view-ev-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const adv = allAdvances.find(a => a.id === btn.getAttribute('data-idx'));
                if (adv?.evidencia) {
                    const fmt = adv.evidencia.startsWith('data:application/pdf') ? 'PDF' : '';
                    openFileViewer(adv.evidencia, fmt);
                }
            });
        });
    });
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
