import { cuadreRepository } from '../repositories/cuadreRepository.js';
import { cuadreGastoRepository } from '../repositories/cuadreGastoRepository.js';
import { rechargeRepository } from '../repositories/rechargeRepository.js';
import { rechargeItemRepository } from '../repositories/rechargeItemRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { deltasDeItem } from './rechargeService.js';

/**
 * Servicio de "Cuadre de Cuentas": concilia una recarga restándole los reclamos no
 * concluidos elegidos del cliente y los gastos, hasta que el saldo quede en 0.
 * Todo se calcula en soles; los montos en USD se convierten con el tipo de cambio del cuadre.
 */

export const MONEDAS = ['PEN', 'USD'];
const EPS = 0.005;

// ── Reclamos del cliente ───────────────────────────────────

/** Reclamos NO concluidos de un cliente (vía sus siniestros). */
export function reclamosNoConcluidosDeCliente(clienteId) {
    if (!clienteId) return [];
    const incidentIds = incidentRepository.findByClientId(clienteId).map(i => i.id);
    const claims = [];
    for (const incId of incidentIds) {
        for (const c of claimRepository.findByIncidentId(incId)) claims.push(c);
    }
    return claims
        .filter(c => c.estado !== 'Culminado')
        .map(c => ({
            id: c.id,
            bancoId: c.bancoId,
            bancoNombre: bankRepository.getById(c.bancoId)?.nombre || '—',
            estado: c.estado,
            montoTotal: Number(c.montoTotal) || 0,
        }))
        .sort((a, b) => a.bancoNombre.localeCompare(b.bancoNombre));
}

// ── Cabecera del cuadre (1:1 con la recarga) ───────────────

export function getCuadreByRecarga(recargaId) {
    return cuadreRepository.findByRecargaId(recargaId)[0] || null;
}

/** Devuelve el cuadre de la recarga; si no existe, lo crea. */
export function getOrCreateCuadre(recargaId) {
    const existing = getCuadreByRecarga(recargaId);
    if (existing) return existing;
    return cuadreRepository.save({
        recargaId,
        tipoCambio: null,
        reclamoIds: '',
        observaciones: null,
    });
}

/** Ids de reclamos elegidos en el cuadre. */
export function reclamoIdsDe(cuadre) {
    return (cuadre?.reclamoIds || '').split(',').map(s => s.trim()).filter(Boolean);
}

export function setReclamos(cuadreId, ids) {
    const csv = (Array.isArray(ids) ? ids : []).filter(Boolean).join(',');
    return cuadreRepository.update(cuadreId, { reclamoIds: csv });
}

export function setTipoCambio(cuadreId, tc) {
    const n = Number(tc);
    return cuadreRepository.update(cuadreId, { tipoCambio: Number.isFinite(n) && n > 0 ? n : null });
}

export function updateCuadre(id, data) {
    return cuadreRepository.update(id, data);
}

/** Elimina el cuadre y sus gastos (borrado admin-only + auditado en el servidor). */
export function deleteCuadre(id) {
    for (const g of cuadreGastoRepository.findByCuadreId(id)) cuadreGastoRepository.delete(g.id);
    cuadreRepository.delete(id);
    return { success: true };
}

// ── Gastos ─────────────────────────────────────────────────

export function getGastos(cuadreId) {
    return cuadreGastoRepository.findByCuadreId(cuadreId)
        .sort((a, b) => new Date(a.fecha || 0) - new Date(b.fecha || 0));
}

/** ¿El gasto es solo informativo? (no suma ni resta en el saldo) */
export function esInformativo(gasto) {
    return Number(gasto?.informativo) === 1 || gasto?.informativo === true;
}

export function addGasto(cuadreId, data) {
    if (!cuadreId) return { success: false, error: 'Cuadre inválido.' };
    if (!data.concepto || !data.concepto.trim()) return { success: false, error: 'Ingrese el concepto del gasto.' };
    const monto = Number(data.monto);
    if (!Number.isFinite(monto) || monto <= 0) return { success: false, error: 'El monto debe ser mayor a 0.' };
    const moneda = MONEDAS.includes(data.moneda) ? data.moneda : 'PEN';
    const gasto = cuadreGastoRepository.save({
        cuadreId,
        concepto: data.concepto.trim(),
        monto,
        moneda,
        fecha: data.fecha || new Date().toISOString().split('T')[0],
        evidencia: data.evidencia || null,
        observaciones: (data.observaciones || '').trim() || null,
        informativo: data.informativo ? 1 : 0,
        bancoId: data.bancoId || null,
    });
    return { success: true, gasto };
}

export function updateGasto(id, data) {
    const patch = {};
    if (data.concepto !== undefined) {
        if (!data.concepto.trim()) return { success: false, error: 'El concepto no puede quedar vacío.' };
        patch.concepto = data.concepto.trim();
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
    if (data.informativo !== undefined) patch.informativo = data.informativo ? 1 : 0;
    if (data.bancoId !== undefined) patch.bancoId = data.bancoId || null;
    const gasto = cuadreGastoRepository.update(id, patch);
    return { success: true, gasto };
}

export function deleteGasto(id) {
    cuadreGastoRepository.delete(id);
    return { success: true };
}

/**
 * Bancos presentes en la recarga (para asignar gastos por banco). Incluye los bancos que
 * solo RECIBIERON un movimiento interno: ahí también hay plata que justificar.
 */
export function bancosDeRecarga(recargaId) {
    const items = rechargeItemRepository.findByRechargeId(recargaId);
    const map = new Map();
    for (const i of items) {
        for (const d of deltasDeItem(i).porBanco) {
            if (!map.has(d.bancoId)) {
                map.set(d.bancoId, { id: d.bancoId, nombre: bankRepository.getById(d.bancoId)?.nombre || '—' });
            }
        }
    }
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// ── Cálculo del saldo ──────────────────────────────────────

/**
 * Calcula el saldo del cuadre en soles: disponible − gastos (los gastos informativos
 * NO suman ni restan). Disponible = ingresos − salidas a terceros; los movimientos
 * internos no cambian el total, solo reparten entre bancos.
 * Los reclamos ya no intervienen en el saldo.
 * @returns {{recargaSoles, ingresosSoles, salidasSoles, reclamosSoles, gastosSoles, saldo,
 *            cuadrado, faltaTipoCambio, hayUSD,
 *            porBanco: Array<{bancoId, bancoNombre, recargaSoles, gastosSoles, diff}>}}
 */
export function computeSaldo(cuadre) {
    const tc = Number(cuadre?.tipoCambio) || null;
    const items = rechargeItemRepository.findByRechargeId(cuadre.recargaId);
    const gastosAll = cuadreGastoRepository.findByCuadreId(cuadre.id);
    // Solo los gastos NO informativos afectan el saldo y el desglose.
    const gastos = gastosAll.filter(g => !esInformativo(g));

    const hayUSD = items.some(i => i.moneda === 'USD') || gastos.some(g => g.moneda === 'USD');
    const aSoles = (monto, moneda) => {
        const n = Number(monto) || 0;
        if (moneda === 'USD') return tc ? n * tc : 0; // sin TC no se puede convertir
        return n;
    };

    // Total disponible = ingresos − salidas (el signo lo da deltasDeItem, no el monto).
    let ingresosSoles = 0, salidasSoles = 0;
    for (const i of items) {
        const m = aSoles(i.monto, i.moneda);
        const coef = deltasDeItem(i).coefTotal;
        if (coef > 0) ingresosSoles += m;
        else if (coef < 0) salidasSoles += m;
    }
    const recargaSoles = ingresosSoles - salidasSoles;
    const gastosSoles = gastos.reduce((s, g) => s + aSoles(g.monto, g.moneda), 0);

    // Desglose por banco: recarga (de los items) menos gastos (los gastos reales con bancoId)
    const bancosMap = new Map();
    const ensure = (bancoId) => {
        if (!bancosMap.has(bancoId)) {
            bancosMap.set(bancoId, {
                bancoId,
                bancoNombre: bankRepository.getById(bancoId)?.nombre || '—',
                recargaSoles: 0,
                gastosSoles: 0,
            });
        }
        return bancosMap.get(bancoId);
    };
    for (const i of items) {
        const m = aSoles(i.monto, i.moneda);
        for (const d of deltasDeItem(i).porBanco) ensure(d.bancoId).recargaSoles += d.coef * m;
    }
    for (const g of gastos) { if (g.bancoId) ensure(g.bancoId).gastosSoles += aSoles(g.monto, g.moneda); }

    const faltaTipoCambio = hayUSD && !tc;
    const saldo = recargaSoles - gastosSoles;
    const cuadrado = !faltaTipoCambio && Math.abs(saldo) < EPS;

    return {
        recargaSoles, ingresosSoles, salidasSoles,
        reclamosSoles: 0, gastosSoles, saldo, cuadrado, faltaTipoCambio, hayUSD,
        porBanco: [...bancosMap.values()]
            .map(b => ({ ...b, diff: b.recargaSoles - b.gastosSoles }))
            .sort((a, b) => a.bancoNombre.localeCompare(b.bancoNombre)),
    };
}

/** Cuadres que aún NO cuadran (saldo ≠ 0 o falta tipo de cambio) — para las alertas. */
export function getCuadresPendientes() {
    const out = [];
    for (const cuadre of cuadreRepository.getAll()) {
        const recarga = rechargeRepository.getById(cuadre.recargaId);
        if (!recarga) continue; // recarga borrada
        const r = computeSaldo(cuadre);
        if (r.cuadrado) continue;
        const cli = clientRepository.getById(recarga.clienteId);
        out.push({
            cuadreId: cuadre.id,
            recargaId: recarga.id,
            recargaNombre: recarga.nombre || '(sin nombre)',
            clienteId: recarga.clienteId,
            clienteNombre: cli ? `${cli.nombreCompleto || ''} ${cli.apellidosCompletos || ''}`.trim() : '—',
            saldo: r.saldo,
            faltaTipoCambio: r.faltaTipoCambio,
        });
    }
    return out;
}
