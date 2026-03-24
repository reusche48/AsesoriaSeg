import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { addCard, assignInsurance } from '../services/cardService.js';
import { addBankToClient, addBankAccount } from '../services/bankService.js';
import { registerClient } from '../services/clientService.js';
import { cardRepository } from '../repositories/cardRepository.js';

// Feature: claims-monitoring-system, Property 7: Restricción de un seguro por tarjeta
// Feature: claims-monitoring-system, Property 8: Auto-aseguramiento por banco
// Feature: claims-monitoring-system, Property 9: Detección de conflictos en auto-aseguramiento
// Feature: claims-monitoring-system, Property 22: Asociación de tarjeta a cuentas del mismo cliente

/** Generates a valid 8-digit DNI. */
const validDNIArb = fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 8 })
    .map(digits => digits.join(''));

/** Generates a non-empty trimmed string suitable for name fields. */
const nameArb = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.trim().length > 0);

/** Generates a currency value. */
const currencyArb = fc.constantFrom('PEN', 'USD');

/** Generates a non-empty insurance ID string. */
const insuranceIdArb = fc.string({ minLength: 1, maxLength: 20 })
    .filter(s => s.trim().length > 0)
    .map(s => `seguro-${s}`);

/**
 * Helper: registers a client with a unique DNI and returns { clientId }.
 * Uses a provided DNI to ensure uniqueness across calls.
 */
function createClient(dni) {
    const result = registerClient({
        nombreCompleto: 'Test',
        apellidosCompletos: 'User',
        dni,
    });
    return result.success ? { clientId: result.client.id } : null;
}

/**
 * Helper: creates a client with a bank and N accounts in that bank.
 */
function createClientWithBankAndAccounts(dni, numAccounts = 2) {
    const client = createClient(dni);
    if (!client) return null;
    const bank = addBankToClient(client.clientId, { nombre: 'TestBank' });
    const accounts = [];
    for (let i = 0; i < numAccounts; i++) {
        const currency = i % 2 === 0 ? 'PEN' : 'USD';
        const acc = addBankAccount(client.clientId, bank.bank.id, currency);
        accounts.push(acc.account);
    }
    return { clientId: client.clientId, bankId: bank.bank.id, accounts };
}

beforeEach(() => {
    localStorage.clear();
});

describe('Propiedad 7: Restricción de un seguro por tarjeta', () => {
    it('tarjeta con seguro asignado rechaza un segundo seguro diferente sin forceReplace', () => {
        fc.assert(
            fc.property(validDNIArb, insuranceIdArb, insuranceIdArb, (dni, seguro1, seguro2) => {
                fc.pre(seguro1 !== seguro2);
                localStorage.clear();

                const setup = createClientWithBankAndAccounts(dni, 1);
                if (!setup) return;

                const card = addCard(setup.clientId, [setup.accounts[0].id]);
                expect(card.success).toBe(true);

                const assign1 = assignInsurance(card.card.id, seguro1);
                expect(assign1.success).toBe(true);

                const assign2 = assignInsurance(card.card.id, seguro2);
                expect(assign2.success).toBe(false);
                expect(assign2.errors.some(e => e.code === 'INSURANCE_ALREADY_ASSIGNED')).toBe(true);
            }),
            { numRuns: 100 },
        );
    });

    it('seguro original permanece sin cambios tras intento de asignar segundo seguro', () => {
        fc.assert(
            fc.property(validDNIArb, insuranceIdArb, insuranceIdArb, (dni, seguro1, seguro2) => {
                fc.pre(seguro1 !== seguro2);
                localStorage.clear();

                const setup = createClientWithBankAndAccounts(dni, 1);
                if (!setup) return;

                const card = addCard(setup.clientId, [setup.accounts[0].id]);
                assignInsurance(card.card.id, seguro1);

                // Intentar asignar segundo seguro (debe fallar)
                assignInsurance(card.card.id, seguro2);

                // Verificar que el seguro original permanece
                const stored = cardRepository.getById(card.card.id);
                expect(stored.seguroId).toBe(seguro1);
            }),
            { numRuns: 100 },
        );
    });

    it('reasignar el mismo seguro no genera error', () => {
        fc.assert(
            fc.property(validDNIArb, insuranceIdArb, (dni, seguro) => {
                localStorage.clear();

                const setup = createClientWithBankAndAccounts(dni, 1);
                if (!setup) return;

                const card = addCard(setup.clientId, [setup.accounts[0].id]);
                assignInsurance(card.card.id, seguro);

                const result = assignInsurance(card.card.id, seguro);
                expect(result.success).toBe(true);
                expect(result.card.seguroId).toBe(seguro);
            }),
            { numRuns: 100 },
        );
    });
});

describe('Propiedad 8: Auto-aseguramiento por banco', () => {
    it('al asignar seguro a una tarjeta, todas las tarjetas del mismo banco quedan aseguradas', () => {
        fc.assert(
            fc.property(
                validDNIArb,
                fc.integer({ min: 2, max: 5 }),
                insuranceIdArb,
                (dni, numCards, seguro) => {
                    localStorage.clear();

                    const setup = createClientWithBankAndAccounts(dni, numCards);
                    if (!setup) return;

                    // Crear una tarjeta por cada cuenta
                    const cards = setup.accounts.map(acc => {
                        const result = addCard(setup.clientId, [acc.id]);
                        return result.card;
                    });

                    // Asignar seguro a la primera tarjeta
                    const result = assignInsurance(cards[0].id, seguro);
                    expect(result.success).toBe(true);

                    // Todas las tarjetas del banco deben tener el mismo seguro
                    for (const card of cards) {
                        const stored = cardRepository.getById(card.id);
                        expect(stored.seguroId).toBe(seguro);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    it('reporta exactamente (N-1) tarjetas adicionales aseguradas', () => {
        fc.assert(
            fc.property(
                validDNIArb,
                fc.integer({ min: 2, max: 5 }),
                insuranceIdArb,
                (dni, numCards, seguro) => {
                    localStorage.clear();

                    const setup = createClientWithBankAndAccounts(dni, numCards);
                    if (!setup) return;

                    const cards = setup.accounts.map(acc => {
                        const result = addCard(setup.clientId, [acc.id]);
                        return result.card;
                    });

                    const result = assignInsurance(cards[0].id, seguro);
                    expect(result.success).toBe(true);
                    expect(result.autoInsuredCards).toHaveLength(numCards - 1);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('tarjetas de bancos diferentes no se auto-aseguran', () => {
        fc.assert(
            fc.property(validDNIArb, insuranceIdArb, (dni, seguro) => {
                localStorage.clear();

                const client = createClient(dni);
                if (!client) return;

                // Crear dos bancos diferentes
                const bank1 = addBankToClient(client.clientId, { nombre: 'Banco1' });
                const bank2 = addBankToClient(client.clientId, { nombre: 'Banco2' });

                const acc1 = addBankAccount(client.clientId, bank1.bank.id, 'PEN');
                const acc2 = addBankAccount(client.clientId, bank2.bank.id, 'PEN');

                const card1 = addCard(client.clientId, [acc1.account.id]);
                const card2 = addCard(client.clientId, [acc2.account.id]);

                // Asignar seguro solo a card1
                const result = assignInsurance(card1.card.id, seguro);
                expect(result.success).toBe(true);
                expect(result.autoInsuredCards).toHaveLength(0);

                // card2 no debe tener seguro
                const storedCard2 = cardRepository.getById(card2.card.id);
                expect(storedCard2.seguroId).toBeNull();
            }),
            { numRuns: 100 },
        );
    });
});

describe('Propiedad 9: Detección de conflictos en auto-aseguramiento', () => {
    it('identifica tarjetas con seguro diferente como conflictos', () => {
        fc.assert(
            fc.property(validDNIArb, insuranceIdArb, insuranceIdArb, (dni, seguroOld, seguroNew) => {
                fc.pre(seguroOld !== seguroNew);
                localStorage.clear();

                const setup = createClientWithBankAndAccounts(dni, 3);
                if (!setup) return;

                // Crear 3 tarjetas en el mismo banco
                const card1 = addCard(setup.clientId, [setup.accounts[0].id]);
                const card2 = addCard(setup.clientId, [setup.accounts[1].id]);
                const card3 = addCard(setup.clientId, [setup.accounts[2].id]);

                // Asignar seguroOld a card1 (auto-asegura card2 y card3)
                assignInsurance(card1.card.id, seguroOld);

                // Crear una nueva cuenta y tarjeta sin seguro
                const newAcc = addBankAccount(setup.clientId, setup.bankId, 'PEN');
                const card4 = addCard(setup.clientId, [newAcc.account.id]);

                // Asignar seguroNew a card4 — card1, card2, card3 tienen seguroOld → conflictos
                const result = assignInsurance(card4.card.id, seguroNew);
                expect(result.success).toBe(true);
                expect(result.conflicts).toHaveLength(3);

                const conflictIds = result.conflicts.map(c => c.id);
                expect(conflictIds).toContain(card1.card.id);
                expect(conflictIds).toContain(card2.card.id);
                expect(conflictIds).toContain(card3.card.id);
            }),
            { numRuns: 100 },
        );
    });

    it('conflictos no se reemplazan sin forceReplace', () => {
        fc.assert(
            fc.property(validDNIArb, insuranceIdArb, insuranceIdArb, (dni, seguroOld, seguroNew) => {
                fc.pre(seguroOld !== seguroNew);
                localStorage.clear();

                const setup = createClientWithBankAndAccounts(dni, 2);
                if (!setup) return;

                const card1 = addCard(setup.clientId, [setup.accounts[0].id]);
                const card2 = addCard(setup.clientId, [setup.accounts[1].id]);

                // Asignar seguroOld a card1 (auto-asegura card2)
                assignInsurance(card1.card.id, seguroOld);

                // Nueva tarjeta sin seguro
                const newAcc = addBankAccount(setup.clientId, setup.bankId, 'USD');
                const card3 = addCard(setup.clientId, [newAcc.account.id]);

                // Asignar seguroNew a card3 sin forceReplace
                assignInsurance(card3.card.id, seguroNew);

                // card1 y card2 deben conservar seguroOld
                expect(cardRepository.getById(card1.card.id).seguroId).toBe(seguroOld);
                expect(cardRepository.getById(card2.card.id).seguroId).toBe(seguroOld);
            }),
            { numRuns: 100 },
        );
    });

    it('con forceReplace, los conflictos se reemplazan y no quedan en la lista de conflictos', () => {
        fc.assert(
            fc.property(validDNIArb, insuranceIdArb, insuranceIdArb, (dni, seguroOld, seguroNew) => {
                fc.pre(seguroOld !== seguroNew);
                localStorage.clear();

                const setup = createClientWithBankAndAccounts(dni, 2);
                if (!setup) return;

                const card1 = addCard(setup.clientId, [setup.accounts[0].id]);
                const card2 = addCard(setup.clientId, [setup.accounts[1].id]);

                assignInsurance(card1.card.id, seguroOld);

                const newAcc = addBankAccount(setup.clientId, setup.bankId, 'PEN');
                const card3 = addCard(setup.clientId, [newAcc.account.id]);

                // forceReplace = true
                const result = assignInsurance(card3.card.id, seguroNew, true);
                expect(result.success).toBe(true);
                expect(result.conflicts).toHaveLength(0);
                expect(result.autoInsuredCards).toHaveLength(2);

                // Todas las tarjetas deben tener seguroNew
                expect(cardRepository.getById(card1.card.id).seguroId).toBe(seguroNew);
                expect(cardRepository.getById(card2.card.id).seguroId).toBe(seguroNew);
                expect(cardRepository.getById(card3.card.id).seguroId).toBe(seguroNew);
            }),
            { numRuns: 100 },
        );
    });
});

describe('Propiedad 22: Asociación de tarjeta a cuentas del mismo cliente', () => {
    it('permite asociar tarjeta a múltiples cuentas del mismo cliente', () => {
        fc.assert(
            fc.property(
                validDNIArb,
                fc.integer({ min: 1, max: 4 }),
                (dni, numAccounts) => {
                    localStorage.clear();

                    const setup = createClientWithBankAndAccounts(dni, numAccounts);
                    if (!setup) return;

                    const accountIds = setup.accounts.map(a => a.id);
                    const result = addCard(setup.clientId, accountIds);

                    expect(result.success).toBe(true);
                    expect(result.card.cuentaIds).toEqual(accountIds);
                    expect(result.card.clienteId).toBe(setup.clientId);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('rechaza asociar tarjeta a cuentas de diferentes clientes', () => {
        fc.assert(
            fc.property(validDNIArb, validDNIArb, (dni1, dni2) => {
                fc.pre(dni1 !== dni2);
                localStorage.clear();

                const setup1 = createClientWithBankAndAccounts(dni1, 1);
                const setup2 = createClientWithBankAndAccounts(dni2, 1);
                if (!setup1 || !setup2) return;

                // Intentar asociar tarjeta del cliente1 con cuenta del cliente2
                const result = addCard(setup1.clientId, [setup1.accounts[0].id, setup2.accounts[0].id]);

                expect(result.success).toBe(false);
                expect(result.errors.some(e => e.code === 'ACCOUNT_NOT_OWNED')).toBe(true);
            }),
            { numRuns: 100 },
        );
    });

    it('todas las cuentas asociadas a una tarjeta creada pertenecen al mismo cliente', () => {
        fc.assert(
            fc.property(
                validDNIArb,
                fc.integer({ min: 1, max: 4 }),
                (dni, numAccounts) => {
                    localStorage.clear();

                    const setup = createClientWithBankAndAccounts(dni, numAccounts);
                    if (!setup) return;

                    const accountIds = setup.accounts.map(a => a.id);
                    const result = addCard(setup.clientId, accountIds);
                    if (!result.success) return;

                    // Verificar que todas las cuentas pertenecen al cliente
                    const stored = cardRepository.getById(result.card.id);
                    expect(stored.clienteId).toBe(setup.clientId);
                    for (const accId of stored.cuentaIds) {
                        const acc = setup.accounts.find(a => a.id === accId);
                        expect(acc).toBeDefined();
                        expect(acc.clienteId).toBe(setup.clientId);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });
});
