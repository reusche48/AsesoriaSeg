import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { addBankToClient, addBankAccount } from '../services/bankService.js';
import { registerClient } from '../services/clientService.js';

// Feature: claims-monitoring-system, Property 5: Moneda de cuenta bancaria restringida a PEN/USD

/** Generates a valid 8-digit DNI. */
const validDNIArb = fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 8 })
    .map(digits => digits.join(''));

/** Generates a non-empty trimmed string suitable for name fields. */
const nameArb = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.trim().length > 0);

/** Helper: creates a valid client + bank and returns { clientId, bankId }. */
function createClientAndBank() {
    const dni = '12345678';
    const clientResult = registerClient({
        nombreCompleto: 'Test',
        apellidosCompletos: 'User',
        dni,
    });
    const bankResult = addBankToClient(clientResult.client.id, { nombre: 'TestBank' });
    return { clientId: clientResult.client.id, bankId: bankResult.bank.id };
}

/** Generates a currency string that is NOT 'PEN' or 'USD'. */
const invalidCurrencyArb = fc.string({ minLength: 1, maxLength: 10 })
    .filter(s => s !== 'PEN' && s !== 'USD');

beforeEach(() => {
    localStorage.clear();
});

describe('Propiedad 5: Moneda de cuenta bancaria restringida a PEN/USD', () => {
    it('acepta PEN como moneda válida', () => {
        fc.assert(
            fc.property(nameArb, nameArb, validDNIArb, (nombre, apellidos, dni) => {
                localStorage.clear();
                const client = registerClient({ nombreCompleto: nombre, apellidosCompletos: apellidos, dni });
                if (!client.success) return; // skip if DNI collision etc.
                const bank = addBankToClient(client.client.id, { nombre: 'Banco' });

                const result = addBankAccount(client.client.id, bank.bank.id, 'PEN');
                expect(result.success).toBe(true);
                expect(result.account.moneda).toBe('PEN');
            }),
            { numRuns: 100 },
        );
    });

    it('acepta USD como moneda válida', () => {
        fc.assert(
            fc.property(nameArb, nameArb, validDNIArb, (nombre, apellidos, dni) => {
                localStorage.clear();
                const client = registerClient({ nombreCompleto: nombre, apellidosCompletos: apellidos, dni });
                if (!client.success) return;
                const bank = addBankToClient(client.client.id, { nombre: 'Banco' });

                const result = addBankAccount(client.client.id, bank.bank.id, 'USD');
                expect(result.success).toBe(true);
                expect(result.account.moneda).toBe('USD');
            }),
            { numRuns: 100 },
        );
    });

    it('rechaza cualquier moneda diferente a PEN o USD', () => {
        fc.assert(
            fc.property(invalidCurrencyArb, (currency) => {
                localStorage.clear();
                const { clientId, bankId } = createClientAndBank();

                const result = addBankAccount(clientId, bankId, currency);
                expect(result.success).toBe(false);
                expect(result.errors.some(e => e.code === 'INVALID_CURRENCY')).toBe(true);
            }),
            { numRuns: 100 },
        );
    });

    it('solo PEN y USD son aceptados entre todas las monedas posibles', () => {
        fc.assert(
            fc.property(
                fc.oneof(
                    fc.constant('PEN'),
                    fc.constant('USD'),
                    invalidCurrencyArb,
                ),
                (currency) => {
                    localStorage.clear();
                    const { clientId, bankId } = createClientAndBank();

                    const result = addBankAccount(clientId, bankId, currency);

                    if (currency === 'PEN' || currency === 'USD') {
                        expect(result.success).toBe(true);
                        expect(result.account.moneda).toBe(currency);
                    } else {
                        expect(result.success).toBe(false);
                        expect(result.errors.some(e => e.code === 'INVALID_CURRENCY')).toBe(true);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });
});
