import { getCollection, saveCollection, saveEntity, updateEntity } from '../storage.js';

/**
 * Configuración del sistema persistida en el servidor (tabla `configuracion`).
 * El `id` de cada fila ES la clave (ej. 'dias_dormido'). NO usa BaseRepository
 * porque su save() generaría un UUID y pisaría el id=clave.
 */

export const CONFIG_KEYS = {
    DIAS_DORMIDO: 'dias_dormido',
};

export const DEFAULT_DIAS_DORMIDO = 15;

/** Valor crudo de una clave de configuración (o default si no existe/está vacía). */
export function getConfigValue(clave, def = null) {
    const row = getCollection('config').find(c => c.id === clave);
    return (row && row.valor != null && row.valor !== '') ? row.valor : def;
}

/** Valor numérico positivo de una clave (o default). */
export function getConfigNumber(clave, def) {
    const n = Number(getConfigValue(clave, def));
    return Number.isFinite(n) && n > 0 ? n : def;
}

/** Guarda una clave de configuración (caché + servidor). */
export async function setConfigValue(clave, valor) {
    const items = getCollection('config');
    const existing = items.find(c => c.id === clave);
    const row = { id: clave, valor: String(valor) };
    if (existing) {
        existing.valor = row.valor;
        saveCollection('config', items);
        await updateEntity('config', clave, row);
    } else {
        items.unshift(row);
        saveCollection('config', items);
        try {
            await saveEntity('config', row);
        } catch (e) {
            // Carrera: otro dispositivo creó la clave (PK duplicada) → actualizar.
            await updateEntity('config', clave, row);
        }
    }
}
