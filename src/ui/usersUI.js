import { getSession, isAdmin, resetUserSecurityCode } from '../auth.js';
import { openFormModal, closeFormModal, showModalAlert, clearModalErrors } from './modalHelper.js';
import { confirmarEliminacion } from '../utils.js';

/**
 * Módulo UI para administración de usuarios, roles y permisos.
 * Solo accesible por administradores.
 */

const API_BASE = 'api.php';

const ALL_SCREENS = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'clientes', label: 'Clientes' },
    { key: 'bancos', label: 'Bancos' },
    { key: 'tarjetas', label: 'Tarjetas' },
    { key: 'seguros', label: 'Seguros' },
    { key: 'coberturas', label: 'Coberturas' },
    { key: 'siniestros', label: 'Siniestros' },
    { key: 'reclamos', label: 'Reclamos' },
    { key: 'eventos', label: 'Eventos' },
    { key: 'pendientes', label: 'Pendientes' },
    { key: 'seguimiento', label: 'Seguimiento' },
    { key: 'alertas', label: 'Alertas' },
    { key: 'usuarios', label: 'Usuarios' },
    { key: 'actividad', label: 'Actividad' },
    { key: 'adelantos', label: 'Adelantos' },
    { key: 'consultaAdelantos', label: 'Consulta Adelantos' },
    { key: 'fichaCliente', label: 'Ficha Cliente' },
    { key: 'tarjetasSinSeguro', label: 'Tarjetas Sin Seguro' },
    { key: 'recargas', label: 'Recargas' },
    { key: 'cuadre', label: 'Cuadre de Cuentas' },
];

let roles = [];
let users = [];
let rolePermissions = [];

export async function renderUsersSection(container) {
    container.innerHTML = '<div class="empty-state">Cargando...</div>';
    await loadData();
    render(container);
}

async function loadData() {
    try {
        const [rolesRes, usersRes, permsRes] = await Promise.all([
            fetch(`${API_BASE}?collection=roles`),
            fetch(`${API_BASE}?collection=users`),
            fetch(`${API_BASE}?collection=rolePermissions`),
        ]);
        roles = await rolesRes.json();
        users = await usersRes.json();
        rolePermissions = await permsRes.json();
    } catch (e) {
        console.error('Error cargando datos de usuarios:', e);
    }
}

function render(container) {
    container.innerHTML = `
        <div class="section">
            <h2 class="section-title">Gestión de Roles</h2>
            <button type="button" class="btn btn-primary" id="role-add-btn">➕ Agregar Rol</button>
            <div id="role-list" class="mt-2"></div>
        </div>

        <div class="section mt-2">
            <h2 class="section-title">Permisos por Rol</h2>
            <div class="form-row">
                <div class="form-group">
                    <label for="perm-role-select">Seleccionar Rol</label>
                    <select id="perm-role-select">
                        <option value="">-- Seleccione un rol --</option>
                        ${roles.map(r => `<option value="${esc(r.id)}">${esc(r.nombre)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div id="perm-checkboxes" style="display:none;"></div>
            <div id="perm-alert"></div>
        </div>

        <div class="section mt-2">
            <h2 class="section-title">Gestión de Usuarios</h2>
            <button type="button" class="btn btn-primary" id="user-add-btn">➕ Agregar Usuario</button>
            <div id="user-list" class="mt-2"></div>
        </div>
    `;

    container.querySelector('#role-add-btn').addEventListener('click', () => openRoleModal(container));
    container.querySelector('#user-add-btn').addEventListener('click', () => openUserModal(container, null));

    renderRoleList(container);
    renderUserList(container);
    setupPermSelector(container);
}

function openRoleModal(container) {
    const html = `
        <div class="form-row">
            <div class="form-group">
                <label>Nombre del rol *</label>
                <input type="text" id="modal-role-nombre" required placeholder="Ej: Practicante">
            </div>
            <div class="form-group">
                <label>Descripción</label>
                <input type="text" id="modal-role-descripcion" placeholder="Descripción del rol">
            </div>
        </div>
    `;

    openFormModal({
        title: 'Nuevo Rol',
        html,
        submitLabel: 'Agregar',
        onSubmit: async (form) => {
            const nombre = form.querySelector('#modal-role-nombre').value.trim();
            const descripcion = form.querySelector('#modal-role-descripcion').value.trim();
            if (!nombre) { showModalAlert('El nombre del rol es requerido.', 'danger'); return; }

            await fetch(`${API_BASE}?collection=roles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre, descripcion }),
            });
            closeFormModal();
            await loadData();
            render(container);
        }
    });
}

function openUserModal(container, userId) {
    const editing = userId ? users.find(u => u.id === userId) : null;

    const html = `
        <div class="form-row">
            <div class="form-group">
                <label>Usuario *</label>
                <input type="text" id="modal-user-usuario" required placeholder="Nombre de usuario" value="${editing ? esc(editing.usuario) : ''}">
            </div>
            <div class="form-group">
                <label>Contraseña ${editing ? '' : '*'}</label>
                <input type="text" id="modal-user-clave" ${editing ? '' : 'required'} placeholder="${editing ? '(dejar vacío para no cambiar)' : 'Contraseña'}">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Nombre completo *</label>
                <input type="text" id="modal-user-nombre" required placeholder="Nombre y apellidos" value="${editing ? esc(editing.nombreCompleto) : ''}">
            </div>
            <div class="form-group">
                <label>Rol *</label>
                <select id="modal-user-rol" required>
                    <option value="">-- Seleccione un rol --</option>
                    ${roles.map(r => `<option value="${esc(r.id)}" ${editing && editing.rolId === r.id ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Estado</label>
                <select id="modal-user-activo">
                    <option value="1" ${editing && editing.activo ? 'selected' : ''}>Activo</option>
                    <option value="0" ${editing && !editing.activo ? 'selected' : ''}>Inactivo</option>
                </select>
            </div>
        </div>
    `;

    openFormModal({
        title: editing ? 'Editar Usuario' : 'Nuevo Usuario',
        html,
        submitLabel: editing ? 'Actualizar' : 'Agregar',
        onSubmit: async (form) => {
            const data = {
                usuario: form.querySelector('#modal-user-usuario').value.trim(),
                nombreCompleto: form.querySelector('#modal-user-nombre').value.trim(),
                rolId: form.querySelector('#modal-user-rol').value,
                activo: form.querySelector('#modal-user-activo').value === '1',
            };
            const clave = form.querySelector('#modal-user-clave').value.trim();

            if (!data.usuario || !data.nombreCompleto || !data.rolId) {
                showModalAlert('Usuario, nombre completo y rol son requeridos.', 'danger');
                return;
            }

            if (editing) {
                if (clave) data.clave = clave;
                await fetch(`${API_BASE}?collection=users&id=${userId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                });
            } else {
                if (!clave) { showModalAlert('La contraseña es requerida para nuevos usuarios.', 'danger'); return; }
                data.clave = clave;
                await fetch(`${API_BASE}?collection=users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                });
            }
            closeFormModal();
            await loadData();
            render(container);
        }
    });
}

function renderRoleList(container) {
    const list = container.querySelector('#role-list');
    if (roles.length === 0) {
        list.innerHTML = '<div class="empty-state">No hay roles registrados.</div>';
        return;
    }
    const rows = roles.map(r => `
        <tr>
            <td>${esc(r.nombre)}</td>
            <td>${esc(r.descripcion || '-')}</td>
            <td>
                <button type="button" class="btn-icon danger delete-role-btn" data-id="${esc(r.id)}" title="Eliminar">🗑️</button>
            </td>
        </tr>
    `).join('');
    list.innerHTML = `<table class="data-table"><thead><tr><th>Nombre</th><th>Descripción</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table>`;

    list.querySelectorAll('.delete-role-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const usersWithRole = users.filter(u => u.rolId === id);
            if (usersWithRole.length > 0) {
                alert('No se puede eliminar el rol porque tiene usuarios asignados.');
                return;
            }
            if (await confirmarEliminacion('¿Eliminar este rol y sus permisos?')) {
                await fetch(`${API_BASE}?collection=roles&id=${id}`, { method: 'DELETE' });
                await loadData();
                render(container);
            }
        });
    });
}

function renderUserList(container) {
    const list = container.querySelector('#user-list');
    if (users.length === 0) {
        list.innerHTML = '<div class="empty-state">No hay usuarios registrados.</div>';
        return;
    }
    const rows = users.map(u => {
        const rol = roles.find(r => r.id === u.rolId);
        const estadoLabel = u.activo ? '<span style="color:green;">Activo</span>' : '<span style="color:red;">Inactivo</span>';
        return `
            <tr>
                <td>${esc(u.usuario)}</td>
                <td>${esc(u.nombreCompleto)}</td>
                <td>${rol ? esc(rol.nombre) : '-'}</td>
                <td>${estadoLabel}</td>
                <td>
                    <button type="button" class="btn-icon primary edit-user-btn" data-id="${esc(u.id)}" title="Editar">✏️</button>
                    <button type="button" class="btn-icon reset-pwd-btn" style="background:#ff8f00;color:#fff;" data-id="${esc(u.id)}" title="Resetear contraseña a 4321">🔑</button>
                    <button type="button" class="btn-icon reset-2fa-btn" style="background:#7c3aed;color:#fff;" data-id="${esc(u.id)}" title="Quitar código de seguridad (si lo olvidó)">🔒</button>
                    <button type="button" class="btn-icon danger delete-user-btn" data-id="${esc(u.id)}" title="Eliminar">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');
    list.innerHTML = `<table class="data-table"><thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table>`;

    list.querySelectorAll('.edit-user-btn').forEach(btn => {
        btn.addEventListener('click', () => openUserModal(container, btn.getAttribute('data-id')));
    });
    list.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (await confirmarEliminacion('¿Eliminar este usuario?')) {
                await fetch(`${API_BASE}?collection=users&id=${btn.getAttribute('data-id')}`, { method: 'DELETE' });
                await loadData();
                render(container);
            }
        });
    });
    list.querySelectorAll('.reset-2fa-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.getAttribute('data-id');
            const user = users.find(u => u.id === userId);
            const nombre = user ? user.usuario : '';
            if (await confirmarEliminacion(`¿Quitar el código de seguridad de "${nombre}"? Podrá entrar solo con su contraseña y configurar uno nuevo.`, { titulo: '🔒 Quitar código', confirmLabel: 'Quitar' })) {
                const ok = await resetUserSecurityCode(userId);
                alert(ok ? 'Código de seguridad quitado.' : 'No se pudo quitar el código.');
            }
        });
    });
    list.querySelectorAll('.reset-pwd-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.getAttribute('data-id');
            const user = users.find(u => u.id === userId);
            const nombre = user ? user.usuario : '';
            if (await confirmarEliminacion(`¿Resetear la contraseña de "${nombre}" a 4321?`, { titulo: '🔑 Resetear contraseña', confirmLabel: 'Resetear', confirmColor: '#b45309' })) {
                try {
                    const res = await fetch(`${API_BASE}?action=resetPassword`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId }),
                    });
                    const data = await res.json();
                    if (res.ok && data.success) {
                        alert('Contraseña reseteada a 4321.');
                        await loadData();
                        render(container);
                    } else {
                        alert(data.error || 'Error al resetear contraseña.');
                    }
                } catch (e) {
                    alert('Error de conexión.');
                }
            }
        });
    });
}

function setupPermSelector(container) {
    const select = container.querySelector('#perm-role-select');
    const checkboxDiv = container.querySelector('#perm-checkboxes');

    select.addEventListener('change', () => {
        const rolId = select.value;
        if (!rolId) { checkboxDiv.style.display = 'none'; return; }

        const currentPerms = rolePermissions.filter(p => p.rolId === rolId && (p.acceso === 1 || p.acceso === '1' || p.acceso === true));
        const allowedScreens = currentPerms.map(p => p.pantalla);

        checkboxDiv.style.display = '';
        checkboxDiv.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:0.5rem;margin:1rem 0;">
                ${ALL_SCREENS.map(s => `
                    <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;">
                        <input type="checkbox" class="perm-check" data-screen="${esc(s.key)}" ${allowedScreens.includes(s.key) ? 'checked' : ''}>
                        ${esc(s.label)}
                    </label>
                `).join('')}
            </div>
            <button type="button" class="btn btn-primary" id="save-perms-btn">Guardar Permisos</button>
        `;

        checkboxDiv.querySelector('#save-perms-btn').addEventListener('click', async () => {
            const existingPerms = rolePermissions.filter(p => p.rolId === rolId);
            for (const p of existingPerms) {
                await fetch(`${API_BASE}?collection=rolePermissions&id=${p.id}`, { method: 'DELETE' });
            }
            const checks = checkboxDiv.querySelectorAll('.perm-check');
            for (const chk of checks) {
                if (chk.checked) {
                    await fetch(`${API_BASE}?collection=rolePermissions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ rolId, pantalla: chk.getAttribute('data-screen'), acceso: 1 }),
                    });
                }
            }
            const alertDiv = container.querySelector('#perm-alert');
            alertDiv.innerHTML = '<div class="alert alert-success">Permisos guardados exitosamente.</div>';
            setTimeout(() => { alertDiv.innerHTML = ''; }, 3000);
            await loadData();
        });
    });
}

function esc(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
