import { clientRepository } from '../repositories/clientRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { claimDetailRepository } from '../repositories/claimDetailRepository.js';
import { claimEventRepository } from '../repositories/claimEventRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { cardRepository } from '../repositories/cardRepository.js';
import { insuranceRepository } from '../repositories/insuranceRepository.js';
import { coverageRepository } from '../repositories/coverageRepository.js';
import { advanceRepository } from '../repositories/advanceRepository.js';
import { openFileViewer } from '../app.js';
import { getActiveClient, setActiveClient } from '../state/clientContext.js';
import { hasAccess } from '../auth.js';

/**
 * Módulo UI — Ficha completa del cliente.
 * Busca por 4+ caracteres, muestra toda la info y permite imprimir/descargar PDF.
 */

export function renderClientProfileSection(container) {
    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">📄 Ficha del Cliente</h2>
            <div class="form-row" style="align-items:flex-end;">
                <div class="form-group" style="flex:1;">
                    <label for="profile-search">Buscar cliente (4+ letras o DNI)</label>
                    <div class="autocomplete-wrapper">
                        <input type="text" id="profile-search" placeholder="Escriba nombre, apellido o DNI..." autocomplete="off">
                        <div id="profile-search-results" class="autocomplete-results"></div>
                    </div>
                </div>
            </div>
        </div>
        <div id="profile-content"></div>
    `;

    setupSearch(container);

    // Si hay cliente activo global, precargar su ficha sin exigir nueva búsqueda
    const active = getActiveClient();
    if (active) {
        container.querySelector('#profile-search').value = `${active.nombreCompleto} ${active.apellidosCompletos} (${active.dni})`;
        showSectionSelector(container, active.id);
        renderProfile(container, active.id, null); // muestra el resumen completo de inmediato
    }
}

function setupSearch(container) {
    const searchInput = container.querySelector('#profile-search');
    const resultsDiv = container.querySelector('#profile-search-results');

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        if (query.length < 4) { resultsDiv.innerHTML = ''; resultsDiv.classList.remove('open'); return; }

        const clients = clientRepository.getAll();
        const matches = clients.filter(c => {
            const full = `${c.nombreCompleto} ${c.apellidosCompletos} ${c.dni}`.toLowerCase();
            return full.includes(query);
        });

        if (matches.length === 0) {
            resultsDiv.innerHTML = '<div class="autocomplete-item no-result">Sin resultados</div>';
            resultsDiv.classList.add('open');
            return;
        }

        resultsDiv.innerHTML = matches.map(c =>
            `<div class="autocomplete-item" data-id="${esc(c.id)}">${esc(c.nombreCompleto)} ${esc(c.apellidosCompletos)} (${esc(c.dni)})</div>`
        ).join('');
        resultsDiv.classList.add('open');

        resultsDiv.querySelectorAll('.autocomplete-item[data-id]').forEach(item => {
            item.addEventListener('click', () => {
                const clientId = item.getAttribute('data-id');
                searchInput.value = item.textContent;
                resultsDiv.innerHTML = '';
                resultsDiv.classList.remove('open');
                setActiveClient(clientId);
                showSectionSelector(container, clientId);
            });
        });
    });

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
            resultsDiv.innerHTML = '';
            resultsDiv.classList.remove('open');
        }
    });
}

const PROFILE_SECTIONS = [
    { key: 'datosPersonales', label: '👤 Datos Personales' },
    { key: 'tarjetas', label: '💳 Tarjetas' },
    { key: 'siniestrosReclamos', label: '⚠️ Siniestros y Reclamos' },
    { key: 'eventos', label: '📅 Eventos' },
    { key: 'adelantos', label: '💵 Adelantos' },
];

function showSectionSelector(container, clientId) {
    const content = container.querySelector('#profile-content');
    const checks = PROFILE_SECTIONS.map(s =>
        `<label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;">
            <input type="checkbox" class="profile-sec-check" data-key="${s.key}" checked> ${s.label}
        </label>`
    ).join('');

    content.innerHTML = `
        <div class="section" style="margin-top:1rem;">
            <h3 style="margin-bottom:0.75rem;">Seleccione las secciones a incluir:</h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.5rem;">${checks}</div>
            <div style="margin-top:1rem;display:flex;gap:0.75rem;">
                <button type="button" class="btn btn-primary" id="btn-generate-profile">📄 Generar Ficha</button>
            </div>
        </div>
        <div id="profile-result"></div>
    `;

    content.querySelector('#btn-generate-profile').addEventListener('click', () => {
        const selected = {};
        content.querySelectorAll('.profile-sec-check').forEach(chk => {
            selected[chk.getAttribute('data-key')] = chk.checked;
        });
        renderProfile(container, clientId, selected);
    });
}

function renderProfile(container, clientId, sections) {
    const content = container.querySelector('#profile-result') || container.querySelector('#profile-content');
    const client = clientRepository.getById(clientId);
    if (!client) { content.innerHTML = '<div class="empty-state">Cliente no encontrado.</div>'; return; }

    // Secciones seleccionadas (por defecto todas)
    const sec = sections || { datosPersonales: true, tarjetas: true, siniestrosReclamos: true, eventos: true, adelantos: true };

    // Recopilar toda la data relacionada
    const incidents = incidentRepository.findByClientId(clientId);
    const cards = cardRepository.findByClientId(clientId);
    const advances = advanceRepository.findByClientId(clientId);

    // Reclamos del cliente (a través de siniestros)
    const allClaims = [];
    for (const inc of incidents) {
        const claims = claimRepository.findByIncidentId(inc.id);
        for (const claim of claims) {
            const bank = bankRepository.getById(claim.bancoId);
            const details = claimDetailRepository.findByClaimId(claim.id);
            const events = claimEventRepository.findByClaimId(claim.id);
            allClaims.push({ incident: inc, claim, bank, details, events });
        }
    }

    // Construir HTML de la ficha
    let html = `<div id="profile-printable">`;

    // === DATOS PERSONALES ===
    if (sec.datosPersonales) {
    html += `
        <div class="section profile-section">
            <h3 class="profile-heading">👤 Datos Personales</h3>
            <div class="profile-grid">
                <div class="profile-field"><span class="profile-label">Nombre:</span> ${esc(client.nombreCompleto)}</div>
                <div class="profile-field"><span class="profile-label">Apellidos:</span> ${esc(client.apellidosCompletos)}</div>
                <div class="profile-field"><span class="profile-label">DNI:</span> ${esc(client.dni)}</div>
                <div class="profile-field"><span class="profile-label">Fecha Nacimiento:</span> ${formatDate(client.fechaNacimiento)}</div>
                <div class="profile-field"><span class="profile-label">Teléfono 1:</span> ${esc(client.telefono1 || '-')}</div>
                <div class="profile-field"><span class="profile-label">Teléfono 2:</span> ${esc(client.telefono2 || '-')}</div>
                <div class="profile-field"><span class="profile-label">Email 1:</span> ${esc(client.email1 || '-')}</div>
                <div class="profile-field"><span class="profile-label">Email 2:</span> ${esc(client.email2 || '-')}</div>
                <div class="profile-field" style="grid-column:1/-1;"><span class="profile-label">Dirección:</span> ${esc(client.direccion || '-')}${client.gpsLatitud && client.gpsLongitud ? ` <a href="https://www.google.com/maps?q=${client.gpsLatitud},${client.gpsLongitud}" target="_blank" class="no-print">📍 Ver mapa</a>` : ''}</div>
                <div class="profile-field" style="grid-column:1/-1;"><span class="profile-label">Observaciones:</span> ${esc(client.observaciones || '-')}</div>
            </div>`;

    // Fotos DNI / Huella / Firma
    if (client.dniFrontal || client.dniPosterior || client.huella || client.firma) {
        html += `<div class="profile-dni-photos no-print" style="margin-top:0.75rem;display:flex;gap:1rem;flex-wrap:wrap;">`;
        if (client.dniFrontal) html += `<button type="button" class="btn btn-secondary view-file-btn" data-file="${esc(client.dniFrontal)}" data-filename="DNI_frontal_${esc(client.dni || '')}">📄 DNI Frontal</button>`;
        if (client.dniPosterior) html += `<button type="button" class="btn btn-secondary view-file-btn" data-file="${esc(client.dniPosterior)}" data-filename="DNI_posterior_${esc(client.dni || '')}">📄 DNI Posterior</button>`;
        if (client.huella) html += `<button type="button" class="btn btn-secondary view-file-btn" data-file="${esc(client.huella)}" data-filename="huella_${esc(client.dni || '')}">🖐️ Huella</button>`;
        if (client.firma) html += `<button type="button" class="btn btn-secondary view-file-btn" data-file="${esc(client.firma)}" data-filename="firma_${esc(client.dni || '')}">✍️ Firma</button>`;
        html += `</div>`;
    }
    html += `</div>`;
    } // fin datosPersonales

    // === TARJETAS ===
    if (sec.tarjetas) {
    html += `<div class="section profile-section"><h3 class="profile-heading">💳 Tarjetas (${cards.length})</h3>`;
    if (cards.length === 0) {
        html += `<div class="empty-state">No tiene tarjetas registradas.</div>`;
    } else {
        html += `<div class="table-scroll"><table class="data-table"><thead><tr><th>Banco</th><th>N° Tarjeta</th><th>N° Cuenta</th><th>CCI</th><th>Moneda</th><th>Seguro</th><th>Comentario</th></tr></thead><tbody>`;
        for (const card of cards) {
            const bank = bankRepository.getById(card.bancoId);
            const ins = card.seguroId ? insuranceRepository.getById(card.seguroId) : null;
            const seguroLabel = ins ? esc(ins.nombre) : '<span style="color:red;">Sin seguro</span>';
            html += `<tr>
                <td>${bank ? esc(bank.nombre) : '-'}</td>
                <td>${esc(card.numero || '-')}</td>
                <td>${esc(card.numeroCuenta || '-')}</td>
                <td>${esc(card.numeroCCI || '-')}</td>
                <td>${esc(card.moneda || '-')}</td>
                <td>${seguroLabel}</td>
                <td>${esc(card.comentario || '-')}</td>
            </tr>`;
        }
        html += `</tbody></table></div>`;
    }
    html += `</div>`;
    } // fin tarjetas

    // === SINIESTROS Y RECLAMOS ===
    if (sec.siniestrosReclamos) {
    html += `<div class="section profile-section"><h3 class="profile-heading">⚠️ Siniestros y Reclamos (${incidents.length} siniestros, ${allClaims.length} reclamos)</h3>`;
    if (allClaims.length === 0) {
        html += `<div class="empty-state">No tiene reclamos registrados.</div>`;
    } else {
        for (const item of allClaims) {
            const bankName = item.bank ? esc(item.bank.nombre) : 'Desconocido';
            const estado = item.claim.estado || 'Pendiente';
            const estadoColor = estado === 'Pendiente' ? 'orange' : estado === 'En Proceso' ? '#1565c0' : estado === 'Culminado' ? 'green' : '#333';

            html += `<div class="profile-claim-card">
                <div class="profile-claim-header">
                    <span>🏦 ${bankName}</span>
                    <span style="color:${estadoColor};font-weight:bold;">${esc(estado)}</span>
                    <span>Fecha siniestro: ${formatDate(item.incident.fecha)}</span>
                    <span>Monto Total: S/ ${formatMoney(item.claim.montoTotal)}</span>
                </div>
                <div style="margin-top:0.4rem;font-size:0.9rem;"><span class="profile-label">Denuncia:</span> ${esc(item.incident.denunciaDescripcion || '-')}</div>`;

            // Coberturas del reclamo
            if (item.details.length > 0) {
                html += `<div class="table-scroll"><table class="data-table" style="margin-top:0.5rem;"><thead><tr><th>Cobertura</th><th>Monto</th><th>Moneda</th><th>T.C.</th><th>Mto. Soles</th></tr></thead><tbody>`;
                for (const d of item.details) {
                    const cov = coverageRepository.getById(d.coberturaId);
                    const mon = d.moneda || 'PEN';
                    const tc = mon === 'USD' && d.tipoCambio ? Number(d.tipoCambio).toFixed(3) : '-';
                    const montoSoles = d.montoSoles ? formatMoney(d.montoSoles) : formatMoney(d.monto);
                    html += `<tr>
                        <td>${cov ? esc(cov.nombre) : '-'}</td>
                        <td>${formatMoney(d.monto)}</td>
                        <td>${mon}</td>
                        <td>${tc}</td>
                        <td>${montoSoles}</td>
                    </tr>`;
                }
                html += `</tbody></table></div>`;
            }

            // Eventos del reclamo
            if (sec.eventos && item.events.length > 0) {
                html += `<div style="margin-top:0.5rem;"><strong>Eventos (${item.events.length}):</strong></div>`;
                html += `<div class="table-scroll"><table class="data-table" style="font-size:0.85rem;"><thead><tr><th>Fecha</th><th>Descripción</th><th>Observación</th></tr></thead><tbody>`;
                const sortedEvents = [...item.events].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                for (const ev of sortedEvents) {
                    html += `<tr>
                        <td>${formatDateTime(ev.fecha)}</td>
                        <td>${esc(ev.descripcion)}</td>
                        <td>${esc(ev.observacion || '-')}</td>
                    </tr>`;
                }
                html += `</tbody></table></div>`;
            }

            html += `</div>`;
        }
    }
    html += `</div>`;
    } // fin siniestrosReclamos

    // === ADELANTOS ===
    if (sec.adelantos) {
    html += `<div class="section profile-section"><h3 class="profile-heading">💵 Adelantos (${advances.length})</h3>`;
    if (advances.length === 0) {
        html += `<div class="empty-state">No tiene adelantos registrados.</div>`;
    } else {
        let totalPEN = 0, totalUSD = 0;
        html += `<div class="table-scroll"><table class="data-table"><thead><tr><th>Fecha</th><th>Monto</th><th>Moneda</th><th>Concepto</th></tr></thead><tbody>`;
        const sortedAdv = [...advances].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        for (const adv of sortedAdv) {
            const mon = adv.moneda || 'PEN';
            const monto = Number(adv.monto) || 0;
            if (mon === 'USD') totalUSD += monto; else totalPEN += monto;
            html += `<tr>
                <td>${formatDate(adv.fecha)}</td>
                <td>${formatMoney(adv.monto)}</td>
                <td>${mon}</td>
                <td>${esc(adv.concepto || '-')}</td>
            </tr>`;
        }
        html += `</tbody></table></div>`;
        html += `<div style="margin-top:0.5rem;font-weight:bold;">Total PEN: S/ ${formatMoney(totalPEN)}`;
        if (totalUSD > 0) html += ` | Total USD: $ ${formatMoney(totalUSD)}`;
        html += `</div>`;
    }
    html += `</div>`;
    } // fin adelantos

    html += `</div>`; // cierre profile-printable

    // Botones de acción (fuera del printable para no imprimirlos)
    html += `
        <div class="profile-actions no-print" style="margin-top:1rem;display:flex;gap:0.75rem;flex-wrap:wrap;">
            <button type="button" class="btn btn-primary" id="profile-print-btn">🖨️ Imprimir</button>
            <button type="button" class="btn btn-secondary" id="profile-pdf-btn">📥 Descargar PDF</button>
        </div>
    `;

    // Barra de atajos: ir a cada sección de este cliente (solo las accesibles)
    const navSections = [
        { key: 'reclamos',   label: '📑 Reclamos' },
        { key: 'eventos',    label: '📅 Eventos' },
        { key: 'tarjetas',   label: '💳 Tarjetas' },
        { key: 'siniestros', label: '⚠️ Siniestros' },
        { key: 'adelantos',  label: '💵 Adelantos' },
    ].filter(s => hasAccess(s.key));
    const navHtml = navSections.length ? `
        <div class="profile-quick-nav no-print" style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;margin-bottom:1rem;">
            <span style="color:#9ca3af;font-size:0.85rem;">Ir a este cliente en:</span>
            ${navSections.map(s => `<button type="button" class="btn btn-secondary profile-nav-btn" data-section="${s.key}">${s.label}</button>`).join('')}
        </div>` : '';

    content.innerHTML = navHtml + html;

    content.querySelectorAll('.profile-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setActiveClient(clientId);
            window.location.hash = '#' + btn.getAttribute('data-section');
        });
    });

    // Event listeners
    content.querySelectorAll('.view-file-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const file = btn.getAttribute('data-file');
            if (file) openFileViewer(file, '', btn.getAttribute('data-filename') || null);
        });
    });

    content.querySelector('#profile-print-btn').addEventListener('click', () => printProfile(client));
    content.querySelector('#profile-pdf-btn').addEventListener('click', () => downloadPDF(client));
}

/**
 * Imprime la ficha usando window.print()
 */
function printProfile(client) {
    const printable = document.getElementById('profile-printable');
    if (!printable) return;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Ficha - ${esc(client.nombreCompleto)} ${esc(client.apellidosCompletos)}</title>`);
    printWindow.document.write(`<style>${getPrintStyles()}</style></head><body>`);
    printWindow.document.write(`<h1 style="text-align:center;margin-bottom:0.5rem;">Ficha del Cliente</h1>`);
    printWindow.document.write(`<p style="text-align:center;color:#666;margin-bottom:1.5rem;">Generado: ${new Date().toLocaleDateString('es-PE', { day:'numeric', month:'long', year:'numeric' })} ${new Date().toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' })}</p>`);

    // Clonar contenido sin los elementos no-print
    const clone = printable.cloneNode(true);
    clone.querySelectorAll('.no-print').forEach(el => el.remove());
    printWindow.document.write(clone.innerHTML);

    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 300);
}

/**
 * Descarga la ficha como PDF usando window.print() en una ventana nueva
 * (el navegador permite guardar como PDF desde el diálogo de impresión)
 */
function downloadPDF(client) {
    // Usamos la misma lógica de impresión — el usuario puede elegir "Guardar como PDF"
    printProfile(client);
}

function getPrintStyles() {
    return `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #333; padding: 20px; }
        h1 { font-size: 18px; }
        h3 { font-size: 14px; margin-bottom: 8px; border-bottom: 2px solid #1976d2; padding-bottom: 4px; color: #1976d2; }
        .section, .profile-section { margin-bottom: 16px; }
        .profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
        .profile-field { padding: 3px 0; }
        .profile-label { font-weight: bold; }
        .profile-claim-card { border: 1px solid #ddd; border-radius: 4px; padding: 8px; margin-bottom: 8px; }
        .profile-claim-header { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; margin-bottom: 4px; }
        .data-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .data-table th, .data-table td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; }
        .data-table th { background: #f5f5f5; font-weight: bold; }
        .empty-state { color: #999; font-style: italic; padding: 8px 0; }
        .no-print { display: none !important; }
    `;
}

function esc(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatMoney(value) {
    const num = Number(value) || 0;
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-PE') + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}
