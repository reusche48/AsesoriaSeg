import { bankRepository } from '../repositories/bankRepository.js';
import { bankAccountRepository } from '../repositories/bankAccountRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { insuranceRepository } from '../repositories/insuranceRepository.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { cardRepository } from '../repositories/cardRepository.js';

/**
 * Servicio de dominio para gestión de bancos y cuentas bancarias.
 */

const VALID_CURRENCIES = ['PEN', 'USD'];

/**
 * Crea un banco (entidad independiente).
 * @param {string} nombre - Nombre del banco
 * @returns {object} { success, bank } o { success, errors }
 */
export function createBank(nombre) {
    const errors = [];

    if (!nombre || (typeof nombre === 'string' && nombre.trim() === '')) {
        errors.push({ field: 'nombre', code: 'REQUIRED_FIELD', message: 'El campo nombre del banco es requerido.' });
    }

    if (errors.length > 0) {
        return { success: false, errors };
    }

    const bank = bankRepository.save({
        nombre: nombre.trim(),
    });

    return { success: true, bank };
}

/**
 * @deprecated Usar createBank en su lugar. Mantenido por compatibilidad.
 */
export function addBankToClient(clientId, bankData) {
    return createBank(bankData?.nombre);
}

/**
 * Registra una cuenta bancaria para un cliente en un banco específico.
 * @param {string} clientId
 * @param {string} bankId
 * @param {string} currency - 'PEN' o 'USD'
 * @param {string} [numeroCuenta]
 * @returns {object} { success, account } o { success, errors }
 */
export function addBankAccount(clientId, bankId, currency, numeroCuenta) {
    const errors = [];

    // Validar clientId
    if (!clientId) {
        errors.push({ field: 'clientId', code: 'REQUIRED_FIELD', message: 'El campo clientId es requerido.' });
    } else {
        const client = clientRepository.getById(clientId);
        if (!client) {
            errors.push({ field: 'clientId', code: 'CLIENT_NOT_FOUND', message: 'El cliente no fue encontrado.' });
        }
    }

    // Validar bankId
    if (!bankId) {
        errors.push({ field: 'bankId', code: 'REQUIRED_FIELD', message: 'El campo bankId es requerido.' });
    } else {
        const bank = bankRepository.getById(bankId);
        if (!bank) {
            errors.push({ field: 'bankId', code: 'BANK_NOT_FOUND', message: 'El banco no fue encontrado.' });
        }
    }

    // Validar moneda
    if (!currency) {
        errors.push({ field: 'moneda', code: 'REQUIRED_FIELD', message: 'El campo moneda es requerido.' });
    } else if (!VALID_CURRENCIES.includes(currency)) {
        errors.push({ field: 'moneda', code: 'INVALID_CURRENCY', message: 'La moneda debe ser PEN o USD.' });
    }

    if (errors.length > 0) {
        return { success: false, errors };
    }

    const account = bankAccountRepository.save({
        clienteId: clientId,
        bancoId: bankId,
        moneda: currency,
        numeroCuenta: numeroCuenta || '',
    });

    return { success: true, account };
}

/**
 * Actualiza el nombre de un banco.
 * @param {string} bankId
 * @param {string} nombre
 * @returns {object} { success, bank } o { success, errors }
 */
export function updateBank(bankId, nombre) {
    const errors = [];
    if (!nombre || nombre.trim() === '') {
        errors.push({ field: 'nombre', code: 'REQUIRED_FIELD', message: 'El nombre del banco es requerido.' });
    }
    if (errors.length > 0) return { success: false, errors };

    const bank = bankRepository.update(bankId, { nombre: nombre.trim() });
    return { success: true, bank };
}

/**
 * Verifica si un banco está siendo usado en otras tablas.
 * @param {string} bankId
 * @returns {string[]} Lista de entidades que lo usan
 */
function getBankDependencies(bankId) {
    const deps = [];
    if (insuranceRepository.findByBankId(bankId).length > 0) deps.push('Seguros');
    if (claimRepository.findByBankId(bankId).length > 0) deps.push('Reclamos');
    if (bankAccountRepository.findByBankId(bankId).length > 0) deps.push('Cuentas Bancarias');
    if (cardRepository.findByBankId(bankId).length > 0) deps.push('Tarjetas');
    return deps;
}

/**
 * Elimina un banco solo si no está siendo usado.
 * @param {string} bankId
 * @returns {object} { success } o { success, message }
 */
export function deleteBank(bankId) {
    const deps = getBankDependencies(bankId);
    if (deps.length > 0) {
        return { success: false, message: `No se puede eliminar el banco porque está siendo usado en: ${deps.join(', ')}.` };
    }
    bankRepository.delete(bankId);
    return { success: true };
}
