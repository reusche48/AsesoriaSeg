/**
 * Módulo UI para consulta de actividad de usuarios en el sistema.
 * Muestra registros creados/modificados en un rango de fechas.
 */

const API_BASE = 'api.php';

export async function renderActivitySection(container) {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">📝 Actividad del Sistema</h2>
            <div class="form-row">
                <div class="form-group">
                    <label for="act-desde">Fecha inicio</label>
                    <input type="date" id="act-desde" value="${todayStr}">
                </div>
                <div class="form-group">
                    <label for="act-hasta">Fecha fin</label>
                    <input type="date" id="act-hasta" value="${todayStr}">
                </div>
            </div>
            <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
                <button type="button" class="btn btn-primary" id="act-search-btn">Consultar</button>
                <input type="text" id="act-filter" placeholder="Filtrar por usuario, entidad, acción..." style="flex:1;min-width:200px;padding:0.5rem 0.75rem;border:1px solid #ccc;border-radius:4px;font-size:0.9rem;">
            </div>
            <div id="act-results" class="mt-2"></div>
        </div>
    `;

    const searchBtn = container.querySelector('#act-search-btn');
    const filterInput = container.querySelector('#act-filter');
    let allData = [];

    searchBtn.addEventListener('click', async () => {
        const desde = container.querySelector('#act-desde').value;
        const hasta = container.querySelector('#act-hasta').value;
        if (!desde || !hasta) { alert('Seleccione ambas fechas.'); return; }

        const resultsDiv = container.querySelector('#act-results');
        resultsDiv.innerHTML = '<div class="empty-state">Consultando...</div>';

        try {
            const res = await fetch(`${API_BASE}?action=activity&desde=${desde}&hasta=${hasta}`);
            const parsed = await res.json();
            allData = Array.isArray(parsed) ? parsed : (parsed.data || []);
            filterInput.value = '';
            renderTable(container, allData);
        } catch (e) {
            console.error('Error actividad:', e);
            resultsDiv.innerHTML = '<div class="alert alert-error">Error al consultar actividad.</div>';
        }
    });

    filterInput.addEventListener('input', () => {
        const q = filterInput.value.trim().toLowerCase();
        if (!q) { renderTable(container, allData); return; }
        const filtered = allData.filter(r =>
            (r.usuario || '').toLowerCase().includes(q) ||
            (r.entidad || '').toLowerCase().includes(q) ||
            (r.accion || '').toLowerCase().includes(q) ||
            (r.equipo || '').toLowerCase().includes(q)
        );
        renderTable(container, filtered);
    });

    // Consultar automáticamente al cargar
    searchBtn.click();
}

function renderTable(container, data) {
    const resultsDiv = container.querySelector('#act-results');

    if (!data || data.length === 0) {
        resultsDiv.innerHTML = '<div class="empty-state">No se encontró actividad en el rango seleccionado.</div>';
        return;
    }

    const rows = data.map(r => {
        const fecha = formatFecha(r.fecha);
        const accionStyle = r.accion === 'Creación'
            ? 'color:#2e7d32;font-weight:bold;'
            : 'color:#e65100;font-weight:bold;';

        return `
            <tr>
                <td>${esc(fecha)}</td>
                <td>${esc(r.usuario || '-')}</td>
                <td style="${accionStyle}">${esc(r.accion)}</td>
                <td>${esc(r.entidad)}</td>
                <td style="font-size:0.75rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(r.equipo || '')}">${esc(r.equipo || '-')}</td>
            </tr>
        `;
    }).join('');

    resultsDiv.innerHTML = `
        <div style="margin-bottom:0.5rem;font-size:0.85rem;color:#666;">${data.length} registro(s) encontrado(s)</div>
        <table class="data-table">
            <thead>
                <tr>
                    <th>Fecha y Hora</th>
                    <th>Usuario</th>
                    <th>Acción</th>
                    <th>Entidad</th>
                    <th>Equipo</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function formatFecha(str) {
    if (!str) return '-';
    const d = new Date(str);
    if (isNaN(d)) return str;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function esc(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
