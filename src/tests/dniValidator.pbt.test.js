import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateDNI } from '../validators/dniValidator.js';

// Feature: claims-monitoring-system, Property 1: Validación del DNI — 8 dígitos numéricos

/** Generates a string of exactly 8 random digits. */
const eightDigitsArb = fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 8 })
    .map(digits => digits.join(''));

describe('Propiedad 1: Validación del DNI — 8 dígitos numéricos', () => {
    it('cualquier cadena de exactamente 8 dígitos debe ser un DNI válido', () => {
        fc.assert(
            fc.property(eightDigitsArb, (dni) => {
                const result = validateDNI(dni);
                expect(result).toEqual({ valid: true });
            }),
            { numRuns: 100 },
        );
    });

    it('cadenas con longitud distinta a 8 deben ser inválidas', () => {
        fc.assert(
            fc.property(
                fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 0, maxLength: 20 })
                    .map(d => d.join(''))
                    .filter(s => s.length !== 8),
                (dni) => {
                    const result = validateDNI(dni);
                    expect(result.valid).toBe(false);
                }
            ),
            { numRuns: 100 },
        );
    });

    it('cadenas de 8 caracteres con letras deben ser inválidas', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 8, maxLength: 8 }).filter(s => !/^\d{8}$/.test(s)),
                (dni) => {
                    const result = validateDNI(dni);
                    expect(result.valid).toBe(false);
                }
            ),
            { numRuns: 100 },
        );
    });
});
