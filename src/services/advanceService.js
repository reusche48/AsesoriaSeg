import { advanceRepository } from '../repositories/advanceRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';

/**
 * Servicio de dominio para gestión de adelantos a clientes.
 */

/**
 * Registra un adelanto de dinero a un cliente.
 */
export function createAdvance(data) {
    const errors = [];

    if (!data.clienteId) {
        errors.push({ field: 'clienteId', message: 'El cliente es requerido.' });
    } else if (!clientRepository.getById(data.clienteId)) {
        errors.push({ field: 'clienteId', message: 'El cliente no fue encontrado.' });
    }

    if (!data.fecha) {
        errors.push({ field: 'fecha', message: 'La fecha es requerida.' });
    }

    const monto = Number(data.monto);
    if (!data.monto || isNaN(monto) || monto <= 0) {
        errors.push({ field: 'monto', message: 'El monto debe ser mayor a 0.' });
    }

    if (!data.concepto || !data.concepto.trim()) {
        errors.push({ field: 'concepto', message: 'El concepto es requerido.' });
    }

    const moneda = data.moneda || 'PEN';
    if (moneda === 'USD' && (!data.tipoCambio || Number(data.tipoCambio) <= 0)) {
        errors.push({ field: 'tipoCambio', message: 'El tipo de cambio es requerido para USD.' });
    }

    if (errors.length > 0) return { success: false, errors };

    const montoSoles = moneda === 'USD' ? monto * Number(data.tipoCambio) : monto;

    const advance = advanceRepository.save({
        clienteId: data.clienteId,
        fecha: data.fecha,
        monto,
        moneda,
        tipoCambio: moneda === 'USD' ? Number(data.tipoCambio) : null,
        montoSoles,
        concepto: data.concepto.trim(),
        observaciones: data.observaciones?.trim() || null,
        evidencia: data.evidencia || null,
    });

    return { success: true, advance };
}

/**
 * Actualiza un adelanto existente.
 */
export function updateAdvance(id, data) {
    const errors = [];
    const existing = advanceRepository.getById(id);
    if (!existing) return { success: false, errors: [{ field: 'id', message: 'Adelanto no encontrado.' }] };

    if (!data.fecha) errors.push({ field: 'fecha', message: 'La fecha es requerida.' });

    const monto = Number(data.monto);
    if (!data.monto || isNaN(monto) || monto <= 0) {
        errors.push({ field: 'monto', message: 'El monto debe ser mayor a 0.' });
    }

    if (!data.concepto || !data.concepto.trim()) {
        errors.push({ field: 'concepto', message: 'El concepto es requerido.' });
    }

    const moneda = data.moneda || 'PEN';
    if (moneda === 'USD' && (!data.tipoCambio || Number(data.tipoCambio) <= 0)) {
        errors.push({ field: 'tipoCambio', message: 'El tipo de cambio es requerido para USD.' });
    }

    if (errors.length > 0) return { success: false, errors };

    const montoSoles = moneda === 'USD' ? monto * Number(data.tipoCambio) : monto;

    const advance = advanceRepository.update(id, {
        clienteId: data.clienteId || existing.clienteId,
        fecha: data.fecha,
        monto,
        moneda,
        tipoCambio: moneda === 'USD' ? Number(data.tipoCambio) : null,
        montoSoles,
        concepto: data.concepto.trim(),
        observaciones: data.observaciones?.trim() || null,
        evidencia: data.evidencia !== undefined ? (data.evidencia || existing.evidencia) : existing.evidencia,
    });

    return { success: true, advance };
}

/**
 * Elimina un adelanto.
 */
export function deleteAdvance(id) {
    const existing = advanceRepository.getById(id);
    if (!existing) return { success: false, message: 'Adelanto no encontrado.' };
    advanceRepository.delete(id);
    return { success: true };
}

/**
 * Obtiene adelantos de un cliente.
 */
export function getClientAdvances(clientId) {
    return advanceRepository.findByClientId(clientId);
}

/**
 * Calcula el total de adelantos (en soles) de un cliente.
 */
export function getClientAdvanceTotal(clientId) {
    const advances = advanceRepository.findByClientId(clientId);
    return advances.reduce((sum, a) => sum + (Number(a.montoSoles) || 0), 0);
}
