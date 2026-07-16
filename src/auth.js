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
            // 2º factor: el servidor pide el código de seguridad antes de entregar el token.
            if (data.twofa) {
                return { success: true, twofa: true, challenge: data.challenge, challengeToken: data.challengeToken };
            }
            currentSession = { user: data.user, permisos: data.permisos, token: data.token, loginAt: Date.now() };
            localStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
            return { success: true, ...currentSession };
        }
        return { success: false, error: data.error || 'Error de autenticación' };
    } catch (err) {
        return { success: false, error: 'Error de conexión al servidor.' };
    }
}

/**
 * Paso 2 del login: verifica el código de seguridad (2º factor).
 * @returns {Promise<{success:true}|{decoy:true}|{success:false,error:string}>}
 */
export async function verifySecurityCode(challengeToken, codigo) {
    try {
        const res = await fetch(`${API_BASE}?action=login2fa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ challengeToken, codigo }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
            currentSession = { user: data.user, permisos: data.permisos, token: data.token, loginAt: Date.now() };
            localStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
            return { success: true };
        }
        if (data.decoy) return { decoy: true };
        return { success: false, error: data.error || 'No se pudo verificar el código.' };
    } catch (err) {
        return { success: false, error: 'Error de conexión al servidor.' };
    }
}

/** ¿El usuario logueado tiene código de seguridad configurado? */
export async function getSecurityCodeStatus() {
    try {
        const res = await fetch(`${API_BASE}?action=securityCodeStatus`);
        const data = await res.json();
        return !!data.configured;
    } catch (e) { return false; }
}

/** Configura la regla (offsets) del propio usuario. */
export async function setSecurityCode(offsets) {
    try {
        const res = await fetch(`${API_BASE}?action=setSecurityCode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ offsets }),
        });
        const data = await res.json();
        return res.ok && data.success ? { success: true } : { success: false, error: data.error || 'Error al guardar.' };
    } catch (e) { return { success: false, error: 'Error de conexión.' }; }
}

/** Desactiva el 2º factor del propio usuario. */
export async function disableSecurityCode() {
    try {
        const res = await fetch(`${API_BASE}?action=setSecurityCode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ disable: true }),
        });
        const data = await res.json();
        return res.ok && data.success;
    } catch (e) { return false; }
}

/** (Admin) Resetea/borra el código de seguridad de un usuario. */
export async function resetUserSecurityCode(userId) {
    try {
        const res = await fetch(`${API_BASE}?action=resetSecurityCode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
        });
        const data = await res.json();
        return res.ok && data.success;
    } catch (e) { return false; }
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

/**
 * Verifica si la sesión sigue vigente, releyendo SIEMPRE localStorage.
 * Importante con varias pestañas: si el usuario volvió a iniciar sesión en otra
 * pestaña, esta pestaña se re-sincroniza en lugar de borrar la sesión nueva
 * (antes, una pestaña vieja "expiraba" cada 60s y pateaba a todas al login).
 */
export function isSessionExpired() {
    try {
        const stored = localStorage.getItem(SESSION_KEY);
        if (!stored) return true; // no hay sesión guardada
        const session = JSON.parse(stored);
        if (!session.loginAt) return true;
        if ((Date.now() - session.loginAt) > SESSION_DURATION) return true;
        currentSession = session; // re-sincronizar la copia en memoria de esta pestaña
        return false;
    } catch (e) {
        return true;
    }
}

/** Retorna la sesión actual o null. */
export function getSession() {
    return currentSession;
}

/** Lista maestra de todas las pantallas del sistema */
const ALL_SCREEN_KEYS = [
    'dashboard', 'clientes', 'bancos', 'tarjetas', 'seguros', 'coberturas',
    'siniestros', 'reclamos', 'pendientes', 'seguimiento',
    'alertas', 'usuarios', 'actividad', 'adelantos', 'consultaAdelantos',
    'fichaCliente',
    'tarjetasSinSeguro',
    'plantillasPasos', 'guia', 'pagos', 'vuelta', 'recargas', 'cuadre',
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
