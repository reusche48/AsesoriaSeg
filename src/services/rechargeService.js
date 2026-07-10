import { rechargeRepository } from '../repositories/rechargeRepository.js';
import { rechargeItemRepository } from '../repositories/rechargeItemRepository.js';
import { cardRepository } from '../repositories/cardRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';

/**
 * Servicio de "Recargas": una recarga es una cabecera (cliente + nombre + fecha) con
 * varios ítems, cada uno = un monto en un banco (banco + monto + moneda + fecha + evidencia).
 */

export const MONEDAS = ['PEN', 'USD'];

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

/** Agrega un monto a la recarga. Requiere banco, monto > 0 y moneda válida. */
export function addItem(recargaId, data) {
    if (!recargaId) return { success: false, error: 'Recarga inválida.' };
    if (!data.bancoId) return { success: false, error: 'Debe elegir un banco.' };
    const monto = Number(data.monto);
    if (!Number.isFinite(monto) || monto <= 0) return { success: false, error: 'El monto debe ser mayor a 0.' };
    const moneda = MONEDAS.includes(data.moneda) ? data.moneda : 'PEN';
    const item = rechargeItemRepository.save({
        recargaId,
        bancoId: data.bancoId,
        monto,
        moneda,
        fecha: data.fecha || new Date().toISOString().split('T')[0],
        evidencia: data.evidencia || null,
        observaciones: (data.observaciones || '').trim() || null,
    });
    return { success: true, item };
}

export function updateItem(id, data) {
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
    const item = rechargeItemRepository.update(id, patch);
    return { success: true, item };
}

export function deleteItem(id) {
    rechargeItemRepository.delete(id);
    return { success: true };
}

/** Suma de montos por moneda de una recarga → { PEN: n, USD: n }. */
export function totalesPorMoneda(recargaId) {
    const tot = {};
    for (const it of rechargeItemRepository.findByRechargeId(recargaId)) {
        const m = it.moneda || 'PEN';
        tot[m] = (tot[m] || 0) + (Number(it.monto) || 0);
    }
    return tot;
}
