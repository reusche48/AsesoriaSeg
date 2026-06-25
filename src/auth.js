/**
 * Módulo de autenticación y control de acceso.
 * Maneja login, sesión en localStorage y permisos por pantalla.
 */

const API_BASE = 'api.php';
const SESSION_KEY = 'auth_session';
const SESSION_DURATION = 3 * 60 * 60 * 1000; // 3 horas en milisegundos

let currentSession = null;

/**
 * Intenta iniciar sesión con usuario y contraseña.
 * @param {string} usuario
 * @param {string} clave
 * @returns {Promise<object>} { success, user, permisos } o { success: false, error }
 */
export async function login(usuario, clave) {
    try {
        const res = await fetch(`${API_BASE}?action=login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, clave }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
            currentSession = { user: data.user, permisos: data.permisos, token: data.token, loginAt: Date.now() };
            localStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
            return { success: true, ...currentSession };
        }
        return { success: false, error: data.error || 'Error de autenticación' };
    } catch (err) {
        return { success: false, error: 'Error de conexión al servidor.' };
    }
}

/** Cierra la sesión actual. */
export function logout() {
    currentSession = null;
    localStorage.removeItem(SESSION_KEY);
}

/** Restaura la sesión desde localStorage. Expira después de 3 horas. */
export function restoreSession() {
    try {
        const stored = localStorage.getItem(SESSION_KEY);
        if (stored) {
            const session = JSON.parse(stored);
            // Verificar expiración
            if (session.loginAt && (Date.now() - session.loginAt) > SESSION_DURATION) {
                logout();
                return null;
            }
            currentSession = session;
            return currentSession;
        }
    } catch (e) { /* ignore */ }
    return null;
}

/** Verifica si la sesión sigue vigente. Si expiró, cierra sesión. */
export function isSessionExpired() {
    if (!currentSession || !currentSession.loginAt) return true;
    return (Date.now() - currentSession.loginAt) > SESSION_DURATION;
}

/** Retorna la sesión actual o null. */
export function getSession() {
    return currentSession;
}

/** Lista maestra de todas las pantallas del sistema */
const ALL_SCREEN_KEYS = [
    'dashboard', 'clientes', 'bancos', 'tarjetas', 'seguros', 'coberturas',
    'siniestros', 'reclamos', 'eventos', 'pendientes', 'seguimiento',
    'alertas', 'usuarios', 'actividad', 'adelantos', 'consultaAdelantos',
    'fichaCliente',
    'tarjetasSinSeguro',
    'plantillasPasos', 'guia', 'pagos', 'vuelta',
];

/** Verifica si el usuario tiene acceso a una pantalla. */
export function hasAccess(pantalla) {
    if (!currentSession) return false;
    if (currentSession.user?.rolNombre === 'Administrador') return true;
    if (!currentSession.permisos) return false;
    return currentSession.permisos.includes(pantalla);
}

/** Retorna la lista de pantallas permitidas. */
export function getAllowedScreens() {
    if (!currentSession) return [];
    if (currentSession.user?.rolNombre === 'Administrador') return ALL_SCREEN_KEYS;
    return currentSession.permisos || [];
}

/** Verifica si el usuario actual es admin. */
export function isAdmin() {
    return currentSession?.user?.rolNombre === 'Administrador';
}
