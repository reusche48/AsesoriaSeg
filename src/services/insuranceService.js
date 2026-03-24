import { insuranceRepository } from '../repositories/insuranceRepository.js';
import { coverageRepository } from '../repositories/coverageRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { claimDetailRepository } from '../repositories/claimDetailRepository.js';

/**
 * Servicio de dominio para gestión de seguros y coberturas.
 */

/**
 * Crea un seguro enlazado a un banco.
 * @param {string} name - Nombre del seguro
 * @param {string} description - Descripción del seguro
 * @param {string} bankId - ID del banco asociado
 * @param {string} [polizaDataUrl] - Archivo de póliza como DataURL (opcional)
 * @returns {object} { success, insurance } o { success, errors }
 */
export function createInsurance(name, description, bankId, polizaDataUrl) {
    const errors = [];

    if (!name || (typeof name === 'string' && name.trim() === '')) {
        errors.push({ field: 'nombre', code: 'REQUIRED_FIELD', message: 'El campo nombre del seguro es requerido.' });
    }

    if (!description || (typeof description === 'string' && description.trim() === '')) {
        errors.push({ field: 'descripcion', code: 'REQUIRED_FIELD', message: 'El campo descripción del seguro es requerido.' });
    }

    if (!bankId) {
        errors.push({ field: 'bancoId', code: 'REQUIRED_FIELD', message: 'El campo banco es requerido.' });
    } else {
        const bank = bankRepository.getById(bankId);
        if (!bank) {
            errors.push({ field: 'bancoId', code: 'BANK_NOT_FOUND', message: 'El banco no fue encontrado.' });
        }
    }

    if (errors.length > 0) {
        return { success: false, errors };
    }

    const insurance = insuranceRepository.save({
        nombre: name.trim(),
        descripcion: description.trim(),
        bancoId: bankId,
        poliza: polizaDataUrl || null,
    });

    return { success: true, insurance };
}

/**
 * Agrega una cobertura a un seguro.
 * @param {string} insuranceId - ID del seguro
 * @param {string} nombre - Nombre de la cobertura
 * @param {string} descripcion - Descripción de la cobertura
 * @param {number} monto - Monto que cubre
 * @returns {object} { success, coverage } o { success, errors }
 */
export function addCoverage(insuranceId, nombre, descripcion, monto) {
    const errors = [];

    if (!insuranceId) {
        errors.push({ field: 'seguroId', code: 'REQUIRED_FIELD', message: 'El seguro es requerido.' });
    } else {
        const insurance = insuranceRepository.getById(insuranceId);
        if (!insurance) {
            errors.push({ field: 'seguroId', code: 'INSURANCE_NOT_FOUND', message: 'El seguro no fue encontrado.' });
        }
    }

    if (!nombre || (typeof nombre === 'string' && nombre.trim() === '')) {
        errors.push({ field: 'nombre', code: 'REQUIRED_FIELD', message: 'El nombre de la cobertura es requerido.' });
    }

    if (!descripcion || (typeof descripcion === 'string' && descripcion.trim() === '')) {
        errors.push({ field: 'descripcion', code: 'REQUIRED_FIELD', message: 'La descripción de la cobertura es requerida.' });
    }

    if (monto === undefined || monto === null || monto === '') {
        errors.push({ field: 'monto', code: 'REQUIRED_FIELD', message: 'El monto es requerido.' });
    } else if (typeof monto !== 'number' || monto <= 0) {
        errors.push({ field: 'monto', code: 'INVALID_AMOUNT', message: 'El monto debe ser un número mayor a 0.' });
    }

    if (errors.length > 0) {
        return { success: false, errors };
    }

    const coverage = coverageRepository.save({
        seguroId: insuranceId,
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        monto: monto,
    });

    return { success: true, coverage };
}

/**
 * Obtiene un seguro con todas sus coberturas.
 * @param {string} insuranceId
 * @returns {object|null}
 */
export function getInsuranceWithCoverages(insuranceId) {
    const insurance = insuranceRepository.getById(insuranceId);
    if (!insurance) return null;
    const coverages = coverageRepository.findByInsuranceId(insuranceId);
    return { ...insurance, coberturas: coverages };
}

/**
 * Actualiza un seguro existente.
 */
export function updateInsurance(insuranceId, name, description, bankId, polizaDataUrl) {
    const errors = [];

    const existing = insuranceRepository.getById(insuranceId);
    if (!existing) {
        return { success: false, errors: [{ field: 'id', code: 'NOT_FOUND', message: 'El seguro no fue encontrado.' }] };
    }

    if (!name || name.trim() === '') {
        errors.push({ field: 'nombre', code: 'REQUIRED_FIELD', message: 'El campo nombre del seguro es requerido.' });
    }
    if (!description || description.trim() === '') {
        errors.push({ field: 'descripcion', code: 'REQUIRED_FIELD', message: 'El campo descripción del seguro es requerido.' });
    }
    if (!bankId) {
        errors.push({ field: 'bancoId', code: 'REQUIRED_FIELD', message: 'El campo banco es requerido.' });
    }

    if (errors.length > 0) {
        return { success: false, errors };
    }

    const updateData = {
        nombre: name.trim(),
        descripcion: description.trim(),
        bancoId: bankId,
    };
    if (polizaDataUrl !== undefined) {
        updateData.poliza = polizaDataUrl || existing.poliza;
    }

    const insurance = insuranceRepository.update(insuranceId, updateData);
    return { success: true, insurance };
}

/**
 * Elimina un seguro y sus coberturas asociadas.
 */
export function deleteInsurance(insuranceId) {
    const existing = insuranceRepository.getById(insuranceId);
    if (!existing) {
        return { success: false, errors: [{ field: 'id', code: 'NOT_FOUND', message: 'El seguro no fue encontrado.' }] };
    }

    // Eliminar coberturas asociadas
    const coverages = coverageRepository.findByInsuranceId(insuranceId);
    for (const cov of coverages) {
        coverageRepository.delete(cov.id);
    }

    insuranceRepository.delete(insuranceId);
    return { success: true };
}

/**
 * Actualiza una cobertura existente.
 */
export function updateCoverage(coverageId, data) {
    const errors = [];
    const existing = coverageRepository.getById(coverageId);
    if (!existing) return { success: false, errors: [{ field: 'id', code: 'NOT_FOUND', message: 'La cobertura no fue encontrada.' }] };

    if (!data.nombre || data.nombre.trim() === '') errors.push({ field: 'nombre', code: 'REQUIRED_FIELD', message: 'El nombre es requerido.' });
    if (!data.descripcion || data.descripcion.trim() === '') errors.push({ field: 'descripcion', code: 'REQUIRED_FIELD', message: 'La descripción es requerida.' });
    const monto = typeof data.monto === 'number' ? data.monto : parseFloat(data.monto);
    if (!monto || monto <= 0) errors.push({ field: 'monto', code: 'INVALID_AMOUNT', message: 'El monto debe ser mayor a 0.' });

    if (errors.length > 0) return { success: false, errors };

    const coverage = coverageRepository.update(coverageId, {
        nombre: data.nombre.trim(),
        descripcion: data.descripcion.trim(),
        monto: monto,
    });
    return { success: true, coverage };
}

/**
 * Elimina una cobertura si no está en uso en detalles de reclamo.
 */
export function deleteCoverage(coverageId) {
    const existing = coverageRepository.getById(coverageId);
    if (!existing) return { success: false, error: 'La cobertura no fue encontrada.' };

    // Verificar si está en uso en claimDetails
    const allDetails = claimDetailRepository.getAll();
    const inUse = allDetails.some(d => d.coberturaId === coverageId);
    if (inUse) return { success: false, error: 'No se puede eliminar: la cobertura está siendo usada en reclamos.' };

    coverageRepository.delete(coverageId);
    return { success: true };
}
