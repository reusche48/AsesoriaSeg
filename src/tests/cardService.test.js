import { describe, it, expect, beforeEach } from 'vitest';
import { addCard, assignInsurance } from '../services/cardService.js';
import { addBankToClient, addBankAccount } from '../services/bankService.js';
import { registerClient } from '../services/clientService.js';

/** Helper: creates a valid client and returns the result */
function createTestClient(digits = '12345678') {
    return registerClient({
        nombreCompleto: 'Juan',
        apellidosCompletos: 'Pérez',
        dni: digits,
    });
}

/** Helper: creates a client with a bank and accounts, returns all entities */
function createClientWithBankAndAccounts(digits = '12345678') {
    const clientResult = createTestClient(digits);
    const clientId = clientResult.client.id;
    const bankResult = addBankToClient(clientId, { nombre: 'BCP' });
    const bankId = bankResult.bank.id;
    const acc1 = addBankAccount(clientId, bankId, 'PEN');
    const acc2 = addBankAccount(clientId, bankId, 'USD');
    return { clientId, bankId, acc1: acc1.account, acc2: acc2.account };
}

beforeEach(() => {
    localStorage.clear();
});

describe('addCard', () => {
    it('asocia una tarjeta a cuentas válidas del mismo cliente', () => {
        const { clientId, acc1, acc2 } = createClientWithBankAndAccounts();
        const result = addCard(clientId, [acc1.id, acc2.id]);

        expect(result.success).toBe(true);
        expect(result.card).toBeDefined();
        expect(result.card.clienteId).toBe(clientId);
        expect(result.card.cuentaIds).toEqual([acc1.id, acc2.id]);
        expect(result.card.seguroId).toBeNull();
        expect(result.card.id).toBeDefined();
    });

    it('falla cuando las cuentas pertenecen a diferentes clientes', () => {
        const setup1 = createClientWithBankAndAccounts('12345678');
        const setup2 = createClientWithBankAndAccounts('87654321');

        const result = addCard(setup1.clientId, [setup1.acc1.id, setup2.acc1.id]);

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'ACCOUNT_NOT_OWNED')).toBe(true);
    });

    it('falla cuando accountIds está vacío', () => {
        const { clientId } = createClientWithBankAndAccounts();
        const result = addCard(clientId, []);

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'REQUIRED_FIELD' && e.field === 'cuentaIds')).toBe(true);
    });

    it('falla cuando clientId no existe', () => {
        const result = addCard('nonexistent', ['some-account']);

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'CLIENT_NOT_FOUND')).toBe(true);
    });

    it('falla cuando clientId está vacío', () => {
        const result = addCard('', ['some-account']);

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'REQUIRED_FIELD' && e.field === 'clientId')).toBe(true);
    });

    it('falla cuando una cuenta no existe', () => {
        const { clientId } = createClientWithBankAndAccounts();
        const result = addCard(clientId, ['nonexistent-account']);

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'ACCOUNT_NOT_FOUND')).toBe(true);
    });

    it('permite crear tarjeta con una sola cuenta', () => {
        const { clientId, acc1 } = createClientWithBankAndAccounts();
        const result = addCard(clientId, [acc1.id]);

        expect(result.success).toBe(true);
        expect(result.card.cuentaIds).toEqual([acc1.id]);
    });
});

describe('assignInsurance', () => {
    it('asigna seguro a tarjeta sin seguro previo', () => {
        const { clientId, acc1 } = createClientWithBankAndAccounts();
        const cardResult = addCard(clientId, [acc1.id]);

        const result = assignInsurance(cardResult.card.id, 'seguro-1');

        expect(result.success).toBe(true);
        expect(result.card.seguroId).toBe('seguro-1');
        expect(result.autoInsuredCards).toEqual([]);
        expect(result.conflicts).toEqual([]);
    });

    it('aplica auto-aseguramiento por banco a tarjetas sin seguro', () => {
        const { clientId, acc1, acc2 } = createClientWithBankAndAccounts();
        const card1 = addCard(clientId, [acc1.id]);
        const card2 = addCard(clientId, [acc2.id]);

        const result = assignInsurance(card1.card.id, 'seguro-1');

        expect(result.success).toBe(true);
        expect(result.card.seguroId).toBe('seguro-1');
        expect(result.autoInsuredCards).toHaveLength(1);
        expect(result.autoInsuredCards[0].id).toBe(card2.card.id);
        expect(result.autoInsuredCards[0].seguroId).toBe('seguro-1');
    });

    it('detecta conflictos cuando tarjeta del mismo banco tiene seguro diferente', () => {
        const { clientId, acc1, acc2 } = createClientWithBankAndAccounts();
        const card1 = addCard(clientId, [acc1.id]);
        const card2 = addCard(clientId, [acc2.id]);

        // Assign seguro-old to card2 — auto-insurance also assigns seguro-old to card1
        assignInsurance(card2.card.id, 'seguro-old');

        // Now create a third card in the same bank, without insurance
        const acc3 = addBankAccount(clientId, acc1.bancoId, 'PEN');
        const card3 = addCard(clientId, [acc3.account.id]);

        // Assign seguro-new to card3 — card1 and card2 have seguro-old, so they are conflicts
        const result = assignInsurance(card3.card.id, 'seguro-new');

        expect(result.success).toBe(true);
        expect(result.card.seguroId).toBe('seguro-new');
        expect(result.conflicts).toHaveLength(2);
        const conflictIds = result.conflicts.map(c => c.id);
        expect(conflictIds).toContain(card1.card.id);
        expect(conflictIds).toContain(card2.card.id);
    });

    it('reemplaza seguros en conflicto cuando forceReplace=true', () => {
        const { clientId, acc1, acc2 } = createClientWithBankAndAccounts();
        const card1 = addCard(clientId, [acc1.id]);
        const card2 = addCard(clientId, [acc2.id]);

        // Assign seguro-old to card2 — auto-insurance also assigns to card1
        assignInsurance(card2.card.id, 'seguro-old');

        // Create a third card in the same bank
        const acc3 = addBankAccount(clientId, acc1.bancoId, 'PEN');
        const card3 = addCard(clientId, [acc3.account.id]);

        // Force replace: card1 and card2 have seguro-old, should be replaced
        const result = assignInsurance(card3.card.id, 'seguro-new', true);

        expect(result.success).toBe(true);
        expect(result.card.seguroId).toBe('seguro-new');
        expect(result.autoInsuredCards).toHaveLength(2);
        const autoIds = result.autoInsuredCards.map(c => c.id);
        expect(autoIds).toContain(card1.card.id);
        expect(autoIds).toContain(card2.card.id);
        expect(result.autoInsuredCards.every(c => c.seguroId === 'seguro-new')).toBe(true);
        expect(result.conflicts).toEqual([]);
    });

    it('retorna error INSURANCE_ALREADY_ASSIGNED si la tarjeta ya tiene seguro diferente', () => {
        const { clientId, acc1 } = createClientWithBankAndAccounts();
        const card = addCard(clientId, [acc1.id]);

        assignInsurance(card.card.id, 'seguro-1');
        const result = assignInsurance(card.card.id, 'seguro-2');

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'INSURANCE_ALREADY_ASSIGNED')).toBe(true);
    });

    it('permite reasignar el mismo seguro sin error', () => {
        const { clientId, acc1 } = createClientWithBankAndAccounts();
        const card = addCard(clientId, [acc1.id]);

        assignInsurance(card.card.id, 'seguro-1');
        const result = assignInsurance(card.card.id, 'seguro-1');

        expect(result.success).toBe(true);
        expect(result.card.seguroId).toBe('seguro-1');
    });

    it('falla si cardId no existe', () => {
        const result = assignInsurance('nonexistent', 'seguro-1');

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'CARD_NOT_FOUND')).toBe(true);
    });

    it('falla si cardId está vacío', () => {
        const result = assignInsurance('', 'seguro-1');

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'REQUIRED_FIELD' && e.field === 'cardId')).toBe(true);
    });

    it('falla si insuranceId está vacío', () => {
        const result = assignInsurance('some-card', '');

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'REQUIRED_FIELD' && e.field === 'insuranceId')).toBe(true);
    });
});
