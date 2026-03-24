import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { registerClient } from '../services/clientService.js';
import { addBankToClient, addBankAccount } from '../services/bankService.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { bankAccountRepository } from '../repositories/bankAccountRepository.js';

// Feature: claims-monitoring-system, Property 6: Multiplicidad de entidades asociadas

/** Generates a valid 8-digit DNI. */
const validDNIArb = fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 8 })
    .map(digits => digits.join(''));

/** Non-empty trimmed string for names. */
const nameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

/** Bank name generator. */
const bankNameArb = fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0);

/** Currency generator. */
const currencyArb = fc.constantFrom('PEN', 'USD');

/** Helper: register a fresh client and return its id. */
function createClient(dni) {
    const result = registerClient({ nombreCompleto: 'Test', apellidosCompletos: 'User', dni });
    return result.client.id;
}

beforeEach(() => {
    localStorage.clear();
});

describe('Propiedad 6: Multiplicidad de entidades asociadas', () => {
    it('asociar N bancos a un cliente resulta en exactamente N bancos almacenados', () => {
        fc.assert(
            fc.property(
                validDNIArb,
                fc.integer({ min: 1, max: 10 }),
                (dni, n) => {
                    localStorage.clear();
                    const clientId = createClient(dni);

                    for (let i = 0; i < n; i++) {
                        const before = bankRepository.findByClientId(clientId).length;
                        const result = addBankToClient(clientId, { nombre: `Banco ${i}` });
                        expect(result.success).toBe(true);
                        const after = bankRepository.findByClientId(clientId).length;
                        // Each addition increments count by exactly 1
                        expect(after).toBe(before + 1);
                    }

                    expect(bankRepository.findByClientId(clientId).length).toBe(n);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('asociar M cuentas bancarias a un cliente resulta en exactamente M cuentas', () => {
        fc.assert(
            fc.property(
                validDNIArb,
                fc.integer({ min: 1, max: 10 }),
                fc.array(currencyArb, { minLength: 1, maxLength: 10 }),
                (dni, _n, currencies) => {
                    localStorage.clear();
                    const clientId = createClient(dni);
                    const bank = addBankToClient(clientId, { nombre: 'Banco' });
                    const bankId = bank.bank.id;

                    const m = currencies.length;
                    for (let i = 0; i < m; i++) {
                        const before = bankAccountRepository.findByClientId(clientId).length;
                        const result = addBankAccount(clientId, bankId, currencies[i]);
                        expect(result.success).toBe(true);
                        const after = bankAccountRepository.findByClientId(clientId).length;
                        expect(after).toBe(before + 1);
                    }

                    expect(bankAccountRepository.findByClientId(clientId).length).toBe(m);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('agregar una entidad incrementa el conteo en exactamente 1', () => {
        fc.assert(
            fc.property(
                validDNIArb,
                bankNameArb,
                currencyArb,
                (dni, bankName, currency) => {
                    localStorage.clear();
                    const clientId = createClient(dni);

                    // Banks: 0 -> 1
                    const banksBefore = bankRepository.findByClientId(clientId).length;
                    expect(banksBefore).toBe(0);
                    const bankResult = addBankToClient(clientId, { nombre: bankName });
                    expect(bankResult.success).toBe(true);
                    expect(bankRepository.findByClientId(clientId).length).toBe(1);

                    // Accounts: 0 -> 1
                    const accountsBefore = bankAccountRepository.findByClientId(clientId).length;
                    expect(accountsBefore).toBe(0);
                    const accResult = addBankAccount(clientId, bankResult.bank.id, currency);
                    expect(accResult.success).toBe(true);
                    expect(bankAccountRepository.findByClientId(clientId).length).toBe(1);
                },
            ),
            { numRuns: 100 },
        );
    });
});
