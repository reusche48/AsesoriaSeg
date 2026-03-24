import { claimRepository } from '../repositories/claimRepository.js';
import { claimDetailRepository } from '../repositories/claimDetailRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { bankAccountRepository } from '../repositories/bankAccountRepository.js';
import { cardRepository } from '../repositories/cardRepository.js';
import { coverageRepository } from '../repositories/coverageRepository.js';

/**
 * Servicio de dominio para gestión de reclamos y detalles de reclamo.
 */

/**
 * Registra un reclamo vinculado a un siniestro y banco.
 * @param {string} incidentId - ID del siniestro
 * @param {string} bankId - ID del banco
 * @param {string} date - Fecha del reclamo (ISO date string)
 * @param {string} [observations] - Observaciones opcionales
 * @param {string} [evidence] - Evidencia como DataURL (opcional)
 * @returns {object} { success, claim } o { success: false, errors }
 */
export function createClaim(incidentId, bankId, date, observations, evidence) {
    const errors = [];

    // Validar incidentId
    let incident = null;
    if (!incidentId) {
        errors.push({ field: 'siniestroId', code: 'REQUIRED_FIELD', message: 'El campo siniestro es requerido.' });
    } else {
        incident = incidentRepository.getById(incidentId);
        if (!incident) {
            errors.push({ field: 'siniestroId', code: 'INCIDENT_NOT_FOUND', message: 'El siniestro no fue encontrado.' });
        }
    }

    // Validar bankId
    let bank = null;
    if (!bankId) {
        errors.push({ field: 'bancoId', code: 'REQUIRED_FIELD', message: 'El campo banco es requerido.' });
    } else {
        bank = bankRepository.getById(bankId);
        if (!bank) {
            errors.push({ field: 'bancoId', code: 'BANK_NOT_FOUND', message: 'El banco no fue encontrado.' });
        }
    }

    // Validar que el banco esté vinculado al cliente del siniestro
    if (incident && bank) {
        if (bank.clienteId !== incident.clienteId) {
            errors.push({ field: 'bancoId', code: 'BANK_NOT_LINKED', message: 'El banco no está vinculado al cliente del siniestro.' });
        }
    }

    // Validar fecha
    if (!date) {
        errors.push({ field: 'fecha', code: 'REQUIRED_FIELD', message: 'La fecha del reclamo es requerida.' });
    }

    if (errors.length > 0) {
        return { success: false, errors };
    }

    const claim = claimRepository.save({
        siniestroId: incidentId,
        bancoId: bankId,
        fecha: date,
        observaciones: observations || null,
        evidencia: evidence || null,
        montoTotal: 0,
        estado: 'Pendiente',
    });

    return { success: true, claim };
}


/**
 * Agrega un detalle de reclamo (cobertura + monto) y recalcula el total.
 * @param {string} claimId - ID del reclamo
 * @param {string} coverageId - ID de la cobertura
 * @param {number} amount - Monto a reclamar (debe ser > 0)
 * @param {string} moneda - 'PEN' o 'USD'
 * @param {number} [tipoCambio] - Tipo de cambio (requerido si moneda es USD)
 * @param {string} [evidence] - Evidencia como DataURL (opcional)
 * @returns {object} { success, detail, claimTotal } o { success: false, errors }
 */
export function addClaimDetail(claimId, coverageId, amount, moneda, tipoCambio, evidence) {
    const errors = [];

    if (!claimId) {
        errors.push({ field: 'reclamoId', code: 'REQUIRED_FIELD', message: 'El campo reclamo es requerido.' });
    } else {
        const claim = claimRepository.getById(claimId);
        if (!claim) {
            errors.push({ field: 'reclamoId', code: 'CLAIM_NOT_FOUND', message: 'El reclamo no fue encontrado.' });
        }
    }

    if (!coverageId) {
        errors.push({ field: 'coberturaId', code: 'REQUIRED_FIELD', message: 'El campo cobertura es requerido.' });
    }

    if (amount === undefined || amount === null || amount === '') {
        errors.push({ field: 'monto', code: 'REQUIRED_FIELD', message: 'El campo monto es requerido.' });
    } else if (typeof amount !== 'number' || amount <= 0) {
        errors.push({ field: 'monto', code: 'INVALID_AMOUNT', message: 'El monto debe ser un número mayor a 0.' });
    }

    const mon = moneda || 'PEN';
    if (mon === 'USD') {
        if (!tipoCambio || tipoCambio <= 0) {
            errors.push({ field: 'tipoCambio', code: 'REQUIRED_FIELD', message: 'El tipo de cambio es requerido para montos en dólares.' });
        }
    }

    if (errors.length > 0) {
        return { success: false, errors };
    }

    const montoSoles = mon === 'USD' ? amount * tipoCambio : amount;

    const detail = claimDetailRepository.save({
        reclamoId: claimId,
        coberturaId: coverageId,
        monto: amount,
        moneda: mon,
        tipoCambio: mon === 'USD' ? tipoCambio : null,
        montoSoles: montoSoles,
        evidencia: evidence || null,
    });

    const claimTotal = calculateClaimTotal(claimId);
    return { success: true, detail, claimTotal };
}

/**
 * Modifica un detalle de reclamo y recalcula el total.
 */
export function updateClaimDetail(claimDetailId, coverageId, amount, moneda, tipoCambio, evidence) {
    const errors = [];

    let existingDetail = null;
    if (!claimDetailId) {
        errors.push({ field: 'detalleReclamoId', code: 'REQUIRED_FIELD', message: 'El campo detalle de reclamo es requerido.' });
    } else {
        existingDetail = claimDetailRepository.getById(claimDetailId);
        if (!existingDetail) {
            errors.push({ field: 'detalleReclamoId', code: 'CLAIM_DETAIL_NOT_FOUND', message: 'El detalle de reclamo no fue encontrado.' });
        }
    }

    if (!coverageId) {
        errors.push({ field: 'coberturaId', code: 'REQUIRED_FIELD', message: 'El campo cobertura es requerido.' });
    }

    if (amount === undefined || amount === null || amount === '') {
        errors.push({ field: 'monto', code: 'REQUIRED_FIELD', message: 'El campo monto es requerido.' });
    } else if (typeof amount !== 'number' || amount <= 0) {
        errors.push({ field: 'monto', code: 'INVALID_AMOUNT', message: 'El monto debe ser un número mayor a 0.' });
    }

    const mon = moneda || 'PEN';
    if (mon === 'USD') {
        if (!tipoCambio || tipoCambio <= 0) {
            errors.push({ field: 'tipoCambio', code: 'REQUIRED_FIELD', message: 'El tipo de cambio es requerido para montos en dólares.' });
        }
    }

    if (errors.length > 0) {
        return { success: false, errors };
    }

    const montoSoles = mon === 'USD' ? amount * tipoCambio : amount;

    const detail = claimDetailRepository.update(claimDetailId, {
        coberturaId: coverageId,
        monto: amount,
        moneda: mon,
        tipoCambio: mon === 'USD' ? tipoCambio : null,
        montoSoles: montoSoles,
        evidencia: evidence !== undefined ? (evidence || null) : existingDetail.evidencia,
    });

    const claimTotal = calculateClaimTotal(existingDetail.reclamoId);
    return { success: true, detail, claimTotal };
}

/**
 * Calcula el monto total del reclamo como la suma de todos los detalles.
 * Actualiza el campo montoTotal del reclamo.
 * @param {string} claimId - ID del reclamo
 * @returns {number} Monto total calculado
 */
export function calculateClaimTotal(claimId) {
    const details = claimDetailRepository.findByClaimId(claimId);
    const total = details.reduce((sum, detail) => sum + (Number(detail.montoSoles) || Number(detail.monto) || 0), 0);

    claimRepository.update(claimId, { montoTotal: total });

    return total;
}

/**
 * Obtiene las coberturas disponibles para un reclamo según el seguro del banco.
 * Lógica:
 * 1. Obtener el reclamo → bancoId
 * 2. Obtener el siniestro del reclamo → clienteId
 * 3. Buscar cuentas bancarias del cliente en ese banco
 * 4. Buscar tarjetas vinculadas a esas cuentas
 * 5. Recopilar seguroId únicos de esas tarjetas
 * 6. Obtener coberturas de cada seguro
 * 7. Retornar todas las coberturas (deduplicadas)
 * @param {string} claimId - ID del reclamo
 * @returns {object[]} Lista de coberturas disponibles
 */
export function getAvailableCoverages(claimId) {
    const claim = claimRepository.getById(claimId);
    if (!claim) {
        return [];
    }

    const incident = incidentRepository.getById(claim.siniestroId);
    if (!incident) {
        return [];
    }

    // Buscar cuentas bancarias del cliente en el banco del reclamo
    const accounts = bankAccountRepository.findByClientAndBank(incident.clienteId, claim.bancoId);
    if (accounts.length === 0) {
        return [];
    }

    // Buscar tarjetas vinculadas a esas cuentas
    const accountIds = accounts.map(a => a.id);
    const cards = cardRepository.findByAccountIds(accountIds);
    if (cards.length === 0) {
        return [];
    }

    // Recopilar seguroId únicos (filtrar nulls)
    const insuranceIds = [...new Set(
        cards.map(c => c.seguroId).filter(id => id != null)
    )];

    if (insuranceIds.length === 0) {
        return [];
    }

    // Obtener coberturas de cada seguro y deduplicar por id
    const allCoverages = [];
    const seenIds = new Set();

    for (const insuranceId of insuranceIds) {
        const coverages = coverageRepository.findByInsuranceId(insuranceId);
        for (const cov of coverages) {
            if (!seenIds.has(cov.id)) {
                seenIds.add(cov.id);
                allCoverages.push(cov);
            }
        }
    }

    return allCoverages;
}

/**
 * Elimina un detalle de reclamo y recalcula el total.
 * @param {string} claimDetailId - ID del detalle
 * @returns {object} { success, claimTotal } o { success: false, errors }
 */
export function deleteClaimDetail(claimDetailId) {
    const detail = claimDetailRepository.getById(claimDetailId);
    if (!detail) {
        return { success: false, errors: [{ field: 'detalleReclamoId', code: 'NOT_FOUND', message: 'El detalle no fue encontrado.' }] };
    }
    const claimId = detail.reclamoId;
    claimDetailRepository.delete(claimDetailId);
    const claimTotal = calculateClaimTotal(claimId);
    return { success: true, claimTotal };
}
