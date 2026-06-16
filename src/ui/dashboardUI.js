import { clientRepository } from '../repositories/clientRepository.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { claimEventRepository } from '../repositories/claimEventRepository.js';
import { advanceRepository } from '../repositories/advanceRepository.js';
import { getEventsWithDeadline, getClaimsWithoutActivity } from '../services/claimEventService.js';

/**
 * Módulo UI para el Dashboard con gráficos y resumen general.
 */

export function renderDashboardSection(container) {
    const stats = calcularEstadisticas();

    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">📊 Dashboard</h2>
            <div class="dashboard-cards">
                <div class="dash-card dash-card-blue">
                    <div class="dash-card-icon">👤</div>
                    <div class="dash-card-value">${stats.totalClientes}</div>
                    <div class="dash-card-label">Clientes</div>
                </div>
                <div class="dash-card dash-card-orange">
                    <div class="dash-card-icon">📑</div>
                    <div class="dash-card-value">${stats.reclamosActivos}</div>
                    <div class="dash-card-label">Reclamos Activos</div>
                </div>
                <div class="dash-card dash-card-green">
                    <div class="dash-card-icon">💰</div>
                    <div class="dash-card-value">S/ ${formatMoney(stats.montoEnProceso)}</div>
                    <div class="dash-card-label">Monto en Proceso</div>
                </div>
                <div class="dash-card dash-card-red">
                    <div class="dash-card-icon">🔔</div>
                    <div class="dash-card-value">${stats.alertasVencidas}</div>
                    <div class="dash-card-label">Alertas Vencidas</div>
                </div>
                <div class="dash-card" style="background:${stats.reclamosCriticos > 0 ? '#450a0a' : '#1f2937'};border:1px solid ${stats.reclamosCriticos > 0 ? '#ef4444' : '#374151'};">
                    <div class="dash-card-icon">🚨</div>
                    <div class="dash-card-value" style="color:${stats.reclamosCriticos > 0 ? '#ef4444' : '#f1f5f9'};">${stats.reclamosCriticos}</div>
                    <div class="dash-card-label">Sin Atención Crítica</div>
                </div>
                <div class="dash-card dash-card-purple">
                    <div class="dash-card-icon">💵</div>
                    <div class="dash-card-value">S/ ${formatMoney(stats.totalAdelantos)}</div>
                    <div class="dash-card-label">Adelantos Entregados</div>
                </div>
            </div>
        </div>

        <div class="dashboard-charts">
            <div class="section dash-chart-box">
                <h3 class="section-title">Reclamos por Estado</h3>
                <canvas id="chart-estados" height="260"></canvas>
            </div>
            <div class="section dash-chart-box">
                <h3 class="section-title">Montos por Banco (S/)</h3>
                <canvas id="chart-bancos" height="260"></canvas>
            </div>
        </div>

        <div class="section mt-2">
            <h3 class="section-title">🚨 Reclamos que Necesitan Atención</h3>
            <div id="dashboard-sin-actividad"></div>
        </div>

        <div class="section mt-2">
            <h3 class="section-title">Últimos Eventos Registrados</h3>
            <div id="dashboard-eventos"></div>
        </div>
    `;

    renderChartEstados(stats);
    renderChartBancos(stats);
    renderSinActividad(container, stats);
    renderUltimosEventos(container, stats);
}

function calcularEstadisticas() {
    const clientes = clientRepository.getAll();
    const reclamos = claimRepository.getAll();
    const bancos = bankRepository.getAll();
    const eventos = claimEventRepository.getAll();
    const alertas = getEventsWithDeadline();

    // Conteo por estado
    const porEstado = { Pendiente: 0, 'En Proceso': 0, Culminado: 0 };
    for (const r of reclamos) {
        const est = r.estado || 'Pendiente';
        porEstado[est] = (porEstado[est] || 0) + 1;
    }

    // Reclamos activos (no culminados)
    const reclamosActivos = reclamos.filter(r => r.estado !== 'Culminado').length;

    // Monto en proceso
    const montoEnProceso = reclamos
        .filter(r => r.estado !== 'Culminado')
        .reduce((sum, r) => sum + (Number(r.montoTotal) || 0), 0);

    // Alertas vencidas
    const alertasVencidas = alertas.filter(a => a.estadoAlerta === 'Vencido').length;

    // Reclamos sin actividad
    const sinActividad = getClaimsWithoutActivity();
    const reclamosCriticos = sinActividad.filter(i => i.nivelAlerta === 'Critico' || i.nivelAlerta === 'Sin eventos').length;

    // Total adelantos
    const adelantos = advanceRepository.getAll();
    const totalAdelantos = adelantos.reduce((sum, a) => sum + (Number(a.montoSoles) || 0), 0);

    // Montos por banco
    const montoPorBanco = {};
    for (const r of reclamos) {
        const banco = bancos.find(b => b.id === r.bancoId);
        const nombre = banco ? banco.nombre : 'Sin banco';
        montoPorBanco[nombre] = (montoPorBanco[nombre] || 0) + (Number(r.montoTotal) || 0);
    }

    // Últimos 5 eventos
    const ultimosEventos = eventos
        .sort((a, b) => new Date(b.fechaRegistro || b.fecha) - new Date(a.fechaRegistro || a.fecha))
        .slice(0, 5);

    return {
        totalClientes: clientes.length,
        reclamosActivos,
        montoEnProceso,
        alertasVencidas,
        totalAdelantos,
        porEstado,
        montoPorBanco,
        ultimosEventos,
        sinActividad,
        reclamosCriticos,
    };
}

function renderChartEstados(stats) {
    const ctx = document.getElementById('chart-estados');
    if (!ctx || typeof Chart === 'undefined') return;

    const labels = Object.keys(stats.porEstado);
    const data = Object.values(stats.porEstado);
    const colors = ['#ff9800', '#1565c0', '#2e7d32'];

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 13 } } },
            }
        }
    });
}

function renderChartBancos(stats) {
    const ctx = document.getElementById('chart-bancos');
    if (!ctx || typeof Chart === 'undefined') return;

    const entries = Object.entries(stats.montoPorBanco).sort((a, b) => b[1] - a[1]);
    const labels = entries.map(e => e[0]);
    const data = entries.map(e => e[1]);
    const colors = ['#1565c0', '#2e7d32', '#ff9800', '#e53935', '#7b1fa2', '#00838f', '#ef6c00', '#4527a0'];

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Monto (S/)',
                data,
                backgroundColor: colors.slice(0, data.length),
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (v) => 'S/ ' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 0 }),
                    }
                },
                x: {
                    ticks: { font: { size: 11 } }
                }
            }
        }
    });
}

function renderSinActividad(container, stats) {
    const div = container.querySelector('#dashboard-sin-actividad');
    if (!div) return;

    const items = stats.sinActividad.slice(0, 10);
    if (items.length === 0) {
        div.innerHTML = '<div class="empty-state" style="color:#10b981;">✅ Todos los reclamos tienen actividad reciente.</div>';
        return;
    }

    const nivelCfg = {
        'Sin eventos': { color: '#ef4444', label: 'Sin eventos' },
        'Critico':     { color: '#dc2626', label: '🔴 Crítico'  },
        'Urgente':     { color: '#d97706', label: '🟠 Urgente'  },
        'Atencion':    { color: '#ca8a04', label: '🟡 Atención' },
    };

    const rows = items.map(item => {
        const incident = incidentRepository.getById(item.siniestroId);
        const client = incident ? clientRepository.getById(incident.clienteId) : null;
        const bank = bankRepository.getById(item.bancoId);
        const clientName = client ? `${client.nombreCompleto} ${client.apellidosCompletos}` : '-';
        const bankName = bank ? bank.nombre : '-';
        const cfg = nivelCfg[item.nivelAlerta] || nivelCfg['Atencion'];
        const diasText = item.nivelAlerta === 'Sin eventos'
            ? `${item.diasSinActividad}d sin eventos`
            : `${item.diasSinActividad} días sin actividad`;

        return `<tr>
            <td>${esc(clientName)}</td>
            <td>${esc(bankName)}</td>
            <td>${esc(item.estado || 'Pendiente')}</td>
            <td style="color:${cfg.color};font-weight:700;">${esc(cfg.label)}</td>
            <td style="color:${cfg.color};font-weight:700;">${diasText}</td>
        </tr>`;
    }).join('');

    div.innerHTML = `
        <table class="data-table">
            <thead><tr>
                <th>Cliente</th><th>Banco</th><th>Estado</th><th>Nivel</th><th>Sin actividad</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
        ${stats.sinActividad.length > 10 ? `<p style="font-size:0.82rem;color:#9ca3af;margin-top:0.5rem;">Mostrando los 10 más críticos. Ver todos en <a href="#alertas" style="color:#7c3aed;">Alertas → Reclamos sin Actividad</a>.</p>` : ''}
    `;
}

function renderUltimosEventos(container, stats) {
    const div = container.querySelector('#dashboard-eventos');
    if (!div) return;

    if (stats.ultimosEventos.length === 0) {
        div.innerHTML = '<div class="empty-state">No hay eventos registrados.</div>';
        return;
    }

    const rows = stats.ultimosEventos.map(ev => {
        const claim = claimRepository.getById(ev.reclamoId);
        const incident = claim ? incidentRepository.getById(claim.siniestroId) : null;
        const client = incident ? clientRepository.getById(incident.clienteId) : null;
        const clientName = client ? `${client.nombreCompleto} ${client.apellidosCompletos}` : '-';
        const fecha = formatFecha(ev.fechaRegistro || ev.fecha);

        return `<tr>
            <td>${esc(fecha)}</td>
            <td>${esc(clientName)}</td>
            <td>${esc(ev.descripcion)}</td>
            <td>${esc(ev.observacion || '-')}</td>
        </tr>`;
    }).join('');

    div.innerHTML = `
        <table class="data-table">
            <thead><tr><th>Fecha</th><th>Cliente</th><th>Descripción</th><th>Observación</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatFecha(str) {
    if (!str) return '-';
    const d = new Date(str);
    if (isNaN(d)) return str;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
