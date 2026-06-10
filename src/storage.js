/**
 * Adaptador de almacenamiento con API MySQL + caché local.
 * Mantiene un caché en memoria sincronizado con el backend MySQL.
 * Las lecturas son síncronas (desde caché), las escrituras son async (hacia API + caché).
 */

const API_BASE = 'api.php';
const cache = {};
const loadedKeys = new Set();

/** Obtiene el nombre de usuario actual desde la sesión en localStorage */
export function getCurrentUser() {
    try {
        const session = JSON.parse(localStorage.getItem('auth_session'));
        return session?.user?.usuario || null;
    } catch (e) { return null; }
}

/** Construye headers incluyendo el usuario actual para auditoría */
function buildHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const user = getCurrentUser();
    if (user) headers['X-Usuario'] = user;
    return headers;
}

/**
 * Carga inicial de una colección desde la API al caché.
 * @param {string} key
 */
async function loadCollection(key) {
    try {
        const res = await fetch(`${API_BASE}?collection=${key}`);
        cache[key] = res.ok ? await res.json() : [];
    } catch (err) {
        console.error(`Error cargando colección "${key}":`, err);
        cache[key] = [];
    }
    loadedKeys.add(key);
}

// Solo tablas livianas al login (banks ~1s, insurances ~3s, coverages ~3s)
const ESSENTIAL_COLLECTIONS = ['banks', 'insurances', 'coverages'];
// clients y cards se cargan lazy: son tablas grandes y lentas (30s+ sin índice)
const SECTION_COLLECTIONS = {
    clientes:          ['clients'],
    bancos:            ['bankAccounts'],
    tarjetas:          ['clients', 'cards', 'bankAccounts'],
    seguros:           [],
    coberturas:        [],
    siniestros:        ['clients', 'incidents'],
    reclamos:          ['clients', 'incidents', 'claims', 'claimDetails'],
    eventos:           ['clients', 'incidents', 'claims', 'claimEvents'],
    pendientes:        ['clients', 'incidents', 'claims', 'claimEvents'],
    seguimiento:       ['clients', 'incidents', 'claims', 'claimEvents'],
    alertas:           ['clients', 'incidents', 'claims', 'claimEvents'],
    adelantos:         ['clients', 'advances'],
    consultaAdelantos: ['clients', 'advances'],
    fichaCliente:      ['clients', 'cards', 'incidents', 'claims', 'claimDetails', 'claimEvents', 'advances', 'bankAccounts'],
    dashboard:         ['clients', 'cards', 'incidents', 'claims', 'claimEvents', 'advances'],
    actividad:         [],
    usuarios:          [],
    tarjetasSinSeguro: ['clients', 'cards'],
};

/**
 * Carga las colecciones esenciales al iniciar la app.
 * Las colecciones pesadas se cargan por sección con loadSectionData().
 */
export async function initStorage() {
    await Promise.all(ESSENTIAL_COLLECTIONS.map(loadCollection));
}

/**
 * Carga las colecciones necesarias para una sección específica.
 * Solo carga las que no están aún en caché.
 * @param {string} section - Nombre de la sección (hash de la ruta)
 */
export async function loadSectionData(section) {
    const needed = SECTION_COLLECTIONS[section] || [];
    const toLoad = needed.filter(k => !loadedKeys.has(k));
    if (toLoad.length > 0) {
        await Promise.all(toLoad.map(loadCollection));
    }
}

/**
 * Carga una lista específica de colecciones (forzado, ignora caché).
 * @param {string[]} keys
 */
export async function loadCollections(keys) {
    await Promise.all(keys.map(loadCollection));
}

/**
 * Retorna un array desde el caché para la clave dada.
 * @param {string} key
 * @returns {any[]}
 */
export function getCollection(key) {
    return cache[key] || [];
}

/**
 * Guarda la colección completa en el caché.
 * (Las escrituras individuales se hacen via saveEntity/updateEntity/deleteEntity)
 * @param {string} key
 * @param {any[]} data
 */
export function saveCollection(key, data) {
    cache[key] = data;
}

/**
 * Genera un UUID v4.
 * @returns {string}
 */
export function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Guarda una entidad nueva en la API y actualiza el caché.
 * @param {string} key - Colección
 * @param {object} entity - Entidad con id ya asignado
 */
export async function saveEntity(key, entity) {
    try {
        const res = await fetch(`${API_BASE}?collection=${key}`, {
            method: 'POST',
            headers: buildHeaders(),
            body: JSON.stringify(entity),
        });
        if (!res.ok) {
            const err = await res.json();
            console.error(`Error guardando en "${key}":`, err);
        }
    } catch (err) {
        console.error(`Error de red guardando en "${key}":`, err);
    }
}

/**
 * Actualiza una entidad en la API y el caché.
 * @param {string} key - Colección
 * @param {string} id - ID de la entidad
 * @param {object} data - Campos a actualizar
 */
export async function updateEntity(key, id, data) {
    try {
        const res = await fetch(`${API_BASE}?collection=${key}&id=${id}`, {
            method: 'PUT',
            headers: buildHeaders(),
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            const err = await res.json();
            console.error(`Error actualizando en "${key}":`, err);
        }
    } catch (err) {
        console.error(`Error de red actualizando en "${key}":`, err);
    }
}

/**
 * Sube un archivo al servidor y retorna la URL relativa.
 * @param {File} file - Archivo a subir
 * @returns {Promise<string>} URL relativa del archivo (ej: 'uploads/abc123.pdf')
 */
export async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    try {
        const res = await fetch(`${API_BASE}?action=upload`, {
            method: 'POST',
            body: formData,
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Error al subir el archivo.');
        }
        const data = await res.json();
        return data.url;
    } catch (err) {
        console.error('Error subiendo archivo:', err);
        throw err;
    }
}

/**
 * Elimina una entidad de la API y el caché.
 * @param {string} key - Colección
 * @param {string} id - ID de la entidad
 */
export async function deleteEntity(key, id) {
    try {
        const res = await fetch(`${API_BASE}?collection=${key}&id=${id}`, {
            method: 'DELETE',
        });
        if (!res.ok) {
            const err = await res.json();
            console.error(`Error eliminando en "${key}":`, err);
        }
    } catch (err) {
        console.error(`Error de red eliminando en "${key}":`, err);
    }
}
