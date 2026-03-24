import { cardRepository } from '../repositories/cardRepository.js';
import { bankAccountRepository } from '../repositories/bankAccountRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { insuranceRepository } from '../repositories/insuranceRepository.js';

/**
 * Servicio de dominio para gestión de tarjetas.
 */

const VALID_CURRENCIES = ['PEN', 'USD'];

/**
 * Registra una tarjeta con cuenta bancaria integrada.
 * Si se asigna seguro, auto-asegura todas las tarjetas del mismo cliente+banco.
 */
export function addCard(data) {
    const errors = [];

    if (!data.clienteId) {
        errors.push({ field: 'clienteId', code: 'REQUIRED_FIELD', message: 'El cliente es requerido.' });
    } else if (!clientRepository.getById(data.clienteId)) {
        errors.push({ field: 'clienteId', code: 'CLIENT_NOT_FOUND', message: 'El cliente no fue encontrado.' });
    }

    if (!data.bancoId) {
        errors.push({ field: 'bancoId', code: 'REQUIRED_FIELD', message: 'El banco es requerido.' });
    } else if (!bankRepository.getById(data.bancoId)) {
        errors.push({ field: 'bancoId', code: 'BANK_NOT_FOUND', message: 'El banco no fue encontrado.' });
    }

    // seguroId es opcional (puede ser "sin seguro")
    if (data.seguroId && !insuranceRepository.getById(data.seguroId)) {
        errors.push({ field: 'seguroId', code: 'INSURANCE_NOT_FOUND', message: 'El seguro no fue encontrado.' });
    }

    if (!data.numeroTarjeta || !data.numeroTarjeta.trim()) {
        errors.push({ field: 'numeroTarjeta', code: 'REQUIRED_FIELD', message: 'El número de tarjeta es requerido.' });
    }
    if (!data.numeroCuenta || !data.numeroCuenta.trim()) {
        errors.push({ field: 'numeroCuenta', code: 'REQUIRED_FIELD', message: 'El número de cuenta es requerido.' });
    }
    if (!data.moneda || !VALID_CURRENCIES.includes(data.moneda)) {
        errors.push({ field: 'moneda', code: 'REQUIRED_FIELD', message: 'El tipo de moneda es requerido (PEN o USD).' });
    }

    if (errors.length > 0) return { success: false, errors };

    // Si el banco ya tiene tarjetas aseguradas para este cliente, heredar el seguro
    let seguroId = data.seguroId || null;
    let evidencia = data.evidenciaSeguro || null;
    if (!seguroId) {
        const existingCards = cardRepository.findByClientId(data.clienteId)
            .filter(c => c.bancoId === data.bancoId && c.seguroId);
        if (existingCards.length > 0) {
            seguroId = existingCards[0].seguroId;
            evidencia = existingCards[0].evidenciaSeguro || evidencia;
        }
    }

    const account = bankAccountRepository.save({
        clienteId: data.clienteId,
        bancoId: data.bancoId,
        moneda: data.moneda,
        numeroCuenta: data.numeroCuenta.trim(),
    });

    const card = cardRepository.save({
        clienteId: data.clienteId,
        bancoId: data.bancoId,
        seguroId: seguroId,
        numero: data.numeroTarjeta.trim(),
        cuentaIds: [account.id],
        moneda: data.moneda,
        numeroCuenta: data.numeroCuenta.trim(),
        comentario: data.comentario || '',
        activo: data.activo !== undefined ? data.activo : true,
        evidenciaSeguro: evidencia,
        numeroCCI: data.numeroCCI ? data.numeroCCI.trim() : '',
    });

    // Si se asignó seguro, auto-asegurar las demás tarjetas del mismo cliente+banco
    if (seguroId) {
        autoInsureByBank(data.clienteId, data.bancoId, seguroId, evidencia);
    }

    return { success: true, card, account };
}

/**
 * Actualiza una tarjeta existente.
 * Si se cambia el seguro, auto-asegura todas las del mismo cliente+banco.
 */
export function updateCard(cardId, data) {
    const errors = [];
    const existing = cardRepository.getById(cardId);
    if (!existing) return { success: false, errors: [{ field: 'cardId', code: 'CARD_NOT_FOUND', message: 'La tarjeta no fue encontrada.' }] };

    if (!data.bancoId) errors.push({ field: 'bancoId', code: 'REQUIRED_FIELD', message: 'El banco es requerido.' });
    if (!data.numeroTarjeta || !data.numeroTarjeta.trim()) errors.push({ field: 'numeroTarjeta', code: 'REQUIRED_FIELD', message: 'El número de tarjeta es requerido.' });
    if (!data.numeroCuenta || !data.numeroCuenta.trim()) errors.push({ field: 'numeroCuenta', code: 'REQUIRED_FIELD', message: 'El número de cuenta es requerido.' });
    if (!data.moneda || !VALID_CURRENCIES.includes(data.moneda)) errors.push({ field: 'moneda', code: 'REQUIRED_FIELD', message: 'El tipo de moneda es requerido (PEN o USD).' });

    if (errors.length > 0) return { success: false, errors };

    const seguroId = data.seguroId || null;

    const card = cardRepository.update(cardId, {
        bancoId: data.bancoId,
        seguroId: seguroId,
        numero: data.numeroTarjeta.trim(),
        numeroCuenta: data.numeroCuenta.trim(),
        numeroCCI: data.numeroCCI ? data.numeroCCI.trim() : '',
        moneda: data.moneda,
        comentario: data.comentario || '',
        activo: data.activo !== undefined ? data.activo : true,
        evidenciaSeguro: data.evidenciaSeguro || null,
    });

    if (existing.cuentaIds && existing.cuentaIds[0]) {
        try {
            bankAccountRepository.update(existing.cuentaIds[0], {
                bancoId: data.bancoId, moneda: data.moneda, numeroCuenta: data.numeroCuenta.trim(),
            });
        } catch (e) { /* cuenta puede no existir */ }
    }

    // Auto-asegurar todas las tarjetas del mismo cliente+banco
    if (seguroId) {
        autoInsureByBank(existing.clienteId, data.bancoId, seguroId, data.evidenciaSeguro || null);
    }

    return { success: true, card };
}

/**
 * Auto-asegura todas las tarjetas de un cliente en un banco específico.
 */
function autoInsureByBank(clienteId, bancoId, seguroId, evidenciaSeguro) {
    const cards = cardRepository.findByClientId(clienteId)
        .filter(c => c.bancoId === bancoId && (c.seguroId !== seguroId || !c.evidenciaSeguro));
    for (const c of cards) {
        const updateData = { seguroId };
        if (evidenciaSeguro) updateData.evidenciaSeguro = evidenciaSeguro;
        cardRepository.update(c.id, updateData);
    }
}

/**
 * Retorna tarjetas sin seguro asignado.
 */
export function getUninsuredCards() {
    return cardRepository.getAll().filter(c => !c.seguroId);
}

export function assignInsurance(cardId, insuranceId, evidenciaSeguro, forceReplace = false) {
    const card = cardRepository.getById(cardId);
    if (!card) return { success: false, errors: [{ field: 'cardId', code: 'CARD_NOT_FOUND', message: 'La tarjeta no fue encontrada.' }] };
    if (card.seguroId && card.seguroId !== insuranceId && !forceReplace) {
        return { success: false, errors: [{ field: 'seguroId', code: 'INSURANCE_ALREADY_ASSIGNED', message: 'La tarjeta ya posee un seguro asignado.' }] };
    }
    cardRepository.update(cardId, { seguroId: insuranceId, evidenciaSeguro: evidenciaSeguro || null });
    // Auto-asegurar las demás del mismo cliente+banco
    autoInsureByBank(card.clienteId, card.bancoId, insuranceId, evidenciaSeguro || null);
    return { success: true, card: cardRepository.getById(cardId) };
}

export function deleteCard(cardId) {
    const existing = cardRepository.getById(cardId);
    if (!existing) return { success: false, errors: [{ field: 'cardId', code: 'CARD_NOT_FOUND', message: 'La tarjeta no fue encontrada.' }] };
    if (existing.cuentaIds && existing.cuentaIds[0]) {
        try { bankAccountRepository.delete(existing.cuentaIds[0]); } catch (e) { }
    }
    cardRepository.delete(cardId);
    return { success: true };
}
