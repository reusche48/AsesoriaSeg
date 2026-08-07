import { rechargeRepository } from '../repositories/rechargeRepository.js';
import { rechargeItemRepository } from '../repositories/rechargeItemRepository.js';
import { cardRepository } from '../repositories/cardRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';

/**
 * Servicio de "Recargas": una recarga es una cabecera (cliente + nombre + fecha) con
 * varios ítems. Cada ítem lleva un monto SIEMPRE POSITIVO; el signo lo define su `tipo`:
 *  - 'ingreso': dinero que entra al banco → suma al total.
 *  - 'interno': traslado entre bancos del cliente (origen → destino) → NO cambia el total,
 *               solo reparte dónde está la plata.
 *  - 'salida' : dinero enviado a un tercero → resta del total por justificar (por eso NO
 *               se registra además como gasto en el Cuadre: sería contarlo dos veces).
 */

export const MONEDAS = ['PEN', 'USD'];

/** Tipos de movimiento dentro de una recarga (para el selector del modal). */
export const TIPOS_ITEM = [
    { id: 'ingreso', label: '⬇ Ingreso (entra al banco)' },
    { id: 'interno', label: '🔁 Movimiento interno (entre bancos del cliente)' },
    { id: 'salida', label: '⬆ Salida a tercero (sale del total)' },
];

const TIPOS_VALIDOS = new Set(TIPOS_ITEM.map(t => t.id));

/** Tipo del ítem; las filas antiguas (sin tipo) o un valor raro cuentan como 'ingreso'. */
export function tipoDeItem(item) {
    const t = item?.tipo;
    return TIPOS_VALIDOS.has(t) ? t : 'ingreso';
}

/**
 * ÚNICA fuente de verdad del signo de un ítem. Devuelve COEFICIENTES (no montos) para que
 * cada llamador aplique su propia conversión (a soles con tipo de cambio, o moneda nativa).
 * Invariante: la suma de los coeficientes por banco es igual a coefTotal.
 * @param {{tipo?:string, bancoId?:string, bancoDestinoId?:string}} item
 * @returns {{tipo:string, coefTotal:number, porBanco:Array<{bancoId:string, coef:number}>}}
 */
export function deltasDeItem(item) {
    const tipo = tipoDeItem(item);
    const origen = item?.bancoId || null;
    const destino = item?.bancoDestinoId || null;
    const porBanco = [];
    let coefTotal = 1;

    if (tipo === 'interno') {
        coefTotal = 0;
        // Si falta un extremo (dato incompleto) se omite esa pata en vez de romper.
        if (origen) porBanco.push({ bancoId: origen, coef: -1 });
        if (destino) porBanco.push({ bancoId: destino, coef: 1 });
    } else if (tipo === 'salida') {
        coefTotal = -1;
        if (origen) porBanco.push({ bancoId: origen, coef: -1 });
    } else {
        if (origen) porBanco.push({ bancoId: origen, coef: 1 });
    }
    return { tipo, coefTotal, porBanco };
}

/**
 * Valida y sanea el trío tipo/bancoDestinoId/destinoDetalle sobre el ítem ya fusionado
 * (existente + cambios). Al cambiar de tipo, limpia los campos del otro tipo.
 * @returns {{ok:true, campos:object}|{ok:false, error:string}}
 */
function validarDestino(merged) {
    const tipo = tipoDeItem(merged);
    if (tipo === 'interno') {
        const destino = merged.bancoDestinoId || null;
        if (!destino) return { ok: false, error: 'Elige el banco de destino del movimiento interno.' };
        if (destino === merged.bancoId) return { ok: false, error: 'El banco de destino debe ser distinto del de origen.' };
        return { ok: true, campos: { tipo, bancoDestinoId: destino, destinoDetalle: null } };
    }
    if (tipo === 'salida') {
        const detalle = (merged.destinoDetalle || '').trim();
        if (!detalle) return { ok: false, error: 'Indica a quién se envió el dinero.' };
        return { ok: true, campos: { tipo, bancoDestinoId: null, destinoDetalle: detalle } };
    }
    return { ok: true, campos: { tipo: 'ingreso', bancoDestinoId: null, destinoDetalle: null } };
}

/** Bancos donde el cliente tiene al menos una tarjeta activa (para elegir en la recarga). */
export function bancosDeCliente(clientId) {
    const cards = cardRepository.findByClientId(clientId)
        .filter(c => c.activo !== false && Number(c.activo) !== 0);
    const ids = [...new Set(cards.map(c => c.bancoId))];
    return ids.map(id => ({ id, nombre: bankRepository.getById(id)?.nombre || '—' }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// ── Cabeceras ──────────────────────────────────────────────

/** Todas las recargas, de la más reciente a la más antigua. */
export function getAllRecargas() {
    return rechargeRepository.getAll().slice()
        .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
}

export function getRecargasByClient(clientId) {
    return rechargeRepository.findByClientId(clientId)
        .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
}

/** Busca por nombre de la recarga o por nombre del cliente. */
export function searchRecargas(query) {
    const q = (query || '').toString().trim().toLowerCase();
    const todas = getAllRecargas();
    if (!q) return todas;
    return todas.filter(r => {
        const cli = clientRepository.getById(r.clienteId);
        const nombreCli = cli ? `${cli.nombreCompleto || ''} ${cli.apellidosCompletos || ''}` : '';
        return `${r.nombre || ''} ${nombreCli}`.toLowerCase().includes(q);
    });
}

export function getRecarga(id) {
    return rechargeRepository.getById(id);
}

/** Crea una recarga (cabecera). Requiere cliente y nombre. */
export function createRecarga(data) {
    if (!data.clienteId) return { success: false, error: 'Debe elegir un cliente.' };
    if (!clientRepository.getById(data.clienteId)) return { success: false, error: 'El cliente no existe.' };
    if (!data.nombre || !data.nombre.trim()) return { success: false, error: 'Debe ingresar un nombre para la recarga.' };
    const recarga = rechargeRepository.save({
        clienteId: data.clienteId,
        nombre: data.nombre.trim(),
        fecha: data.fecha || new Date().toISOString().split('T')[0],
        observaciones: (data.observaciones || '').trim() || null,
    });
    return { success: true, recarga };
}

export function updateRecarga(id, data) {
    const patch = {};
    if (data.nombre !== undefined) {
        if (!data.nombre.trim()) return { success: false, error: 'El nombre no puede quedar vacío.' };
        patch.nombre = data.nombre.trim();
    }
    if (data.fecha !== undefined) patch.fecha = data.fecha || null;
    if (data.observaciones !== undefined) patch.observaciones = (data.observaciones || '').trim() || null;
    const recarga = rechargeRepository.update(id, patch);
    return { success: true, recarga };
}

/** Elimina la recarga y todos sus ítems (borrado admin-only + auditado en el servidor). */
export function deleteRecarga(id) {
    for (const it of rechargeItemRepository.findByRechargeId(id)) {
        rechargeItemRepository.delete(it.id);
    }
    rechargeRepository.delete(id);
    return { success: true };
}

// ── Ítems (montos por banco) ───────────────────────────────

export function getItems(recargaId) {
    return rechargeItemRepository.findByRechargeId(recargaId)
        .sort((a, b) => new Date(a.fecha || 0) - new Date(b.fecha || 0));
}

/** Agrega un monto/movimiento a la recarga. Requiere banco, monto > 0 y moneda válida. */
export function addItem(recargaId, data) {
    if (!recargaId) return { success: false, error: 'Recarga inválida.' };
    if (!data.bancoId) return { success: false, error: 'Debe elegir un banco.' };
    const monto = Number(data.monto);
    if (!Number.isFinite(monto) || monto <= 0) return { success: false, error: 'El monto debe ser mayor a 0.' };
    const moneda = MONEDAS.includes(data.moneda) ? data.moneda : 'PEN';
    const destino = validarDestino(data);
    if (!destino.ok) return { success: false, error: destino.error };
    const item = rechargeItemRepository.save({
        recargaId,
        bancoId: data.bancoId,
        ...destino.campos,
        monto,
        moneda,
        fecha: data.fecha || new Date().toISOString().split('T')[0],
        evidencia: data.evidencia || null,
        observaciones: (data.observaciones || '').trim() || null,
    });
    return { success: true, item };
}

export function updateItem(id, data) {
    const existing = rechargeItemRepository.getById(id);
    if (!existing) return { success: false, error: 'El monto no existe.' };
    const patch = {};
    if (data.bancoId !== undefined) {
        if (!data.bancoId) return { success: false, error: 'Debe elegir un banco.' };
        patch.bancoId = data.bancoId;
    }
    if (data.monto !== undefined) {
        const monto = Number(data.monto);
        if (!Number.isFinite(monto) || monto <= 0) return { success: false, error: 'El monto debe ser mayor a 0.' };
        patch.monto = monto;
    }
    if (data.moneda !== undefined) patch.moneda = MONEDAS.includes(data.moneda) ? data.moneda : 'PEN';
    if (data.fecha !== undefined) patch.fecha = data.fecha || null;
    if (data.evidencia !== undefined) patch.evidencia = data.evidencia || null;
    if (data.observaciones !== undefined) patch.observaciones = (data.observaciones || '').trim() || null;
    // tipo/destino son interdependientes: se validan sobre el ítem fusionado y se escriben
    // siempre los tres campos, para que el saneo persista al cambiar de tipo.
    const destino = validarDestino({ ...existing, ...data, ...patch });
    if (!destino.ok) return { success: false, error: destino.error };
    Object.assign(patch, destino.campos);
    const item = rechargeItemRepository.update(id, patch);
    return { success: true, item };
}

export function deleteItem(id) {
    rechargeItemRepository.delete(id);
    return { success: true };
}

/**
 * Neto disponible por moneda (ingresos − salidas; los movimientos internos no cambian el
 * total, solo reparten) → { PEN: n, USD: n }.
 */
export function totalesPorMoneda(recargaId) {
    const tot = {};
    for (const it of rechargeItemRepository.findByRechargeId(recargaId)) {
        const m = it.moneda || 'PEN';
        tot[m] = (tot[m] || 0) + deltasDeItem(it).coefTotal * (Number(it.monto) || 0);
    }
    return tot;
}

/**
 * Cuánta plata quedó en cada banco (aplicando ingresos, movimientos internos y salidas).
 * @returns {Array<{bancoId, nombre, montos: Record<string, number>}>} ordenado por banco
 */
export function distribucionPorBanco(recargaId) {
    const map = new Map();
    for (const it of rechargeItemRepository.findByRechargeId(recargaId)) {
        const moneda = it.moneda || 'PEN';
        const monto = Number(it.monto) || 0;
        for (const d of deltasDeItem(it).porBanco) {
            if (!map.has(d.bancoId)) {
                map.set(d.bancoId, {
                    bancoId: d.bancoId,
                    nombre: bankRepository.getById(d.bancoId)?.nombre || '—',
                    montos: {},
                });
            }
            const b = map.get(d.bancoId);
            b.montos[moneda] = (b.montos[moneda] || 0) + d.coef * monto;
        }
    }
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/**
 * Desglose por moneda para la cabecera del editor.
 * @returns {Record<string, {ingresos:number, internos:number, salidas:number, disponible:number}>}
 */
export function resumenPorMoneda(recargaId) {
    const out = {};
    for (const it of rechargeItemRepository.findByRechargeId(recargaId)) {
        const m = it.moneda || 'PEN';
        const monto = Number(it.monto) || 0;
        const r = out[m] || (out[m] = { ingresos: 0, internos: 0, salidas: 0, disponible: 0 });
        const tipo = tipoDeItem(it);
        if (tipo === 'interno') r.internos += monto;
        else if (tipo === 'salida') r.salidas += monto;
        else r.ingresos += monto;
        r.disponible = r.ingresos - r.salidas;
    }
    return out;
}
