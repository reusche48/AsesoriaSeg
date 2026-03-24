import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { registerClient } from '../services/clientService.js';
import { clientRepository } from '../repositories/clientRepository.js';

// Feature: claims-monitoring-system, Property 2: Campos requeridos del Cliente
// Feature: claims-monitoring-system, Property 3: Unicidad del DNI
// Feature: claims-monitoring-system, Property 4: Persistencia round-trip del Cliente

/** Generates a valid 8-digit DNI. */
const validDNIArb = fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 8 })
    .map(digits => digits.join(''));

/** Generates a non-empty trimmed string suitable for name fields. */
const nameArb = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.trim().length > 0);

/** Generates optional string or null. */
const optionalStringArb = fc.oneof(
    fc.constant(null),
    fc.constant(undefined),
    fc.string({ minLength: 1, maxLength: 30 }),
);

/** Generates a valid client data object with a unique DNI. */
const validClientArb = fc.tuple(nameArb, nameArb, validDNIArb, optionalStringArb, optionalStringArb, optionalStringArb)
    .map(([nombre, apellidos, dni, fechaNac, tel1, tel2]) => ({
        nombreCompleto: nombre,
        apellidosCompletos: apellidos,
        dni,
        fechaNacimiento: fechaNac,
        telefono1: tel1,
        telefono2: tel2,
        email1: null,
        email2: null,
    }));

beforeEach(() => {
    localStorage.clear();
});

describe('Propiedad 2: Campos requeridos del Cliente', () => {
    it('registro exitoso si y solo si contiene nombre, apellidos y DNI válido', () => {
        fc.assert(
            fc.property(validClientArb, (clientData) => {
                localStorage.clear();
                const result = registerClient(clientData);
                expect(result.success).toBe(true);
                expect(result.client).toBeDefined();
            }),
            { numRuns: 100 },
        );
    });

    it('registro falla si falta nombreCompleto', () => {
        fc.assert(
            fc.property(nameArb, validDNIArb, (apellidos, dni) => {
                localStorage.clear();
                for (const missing of [undefined, null, '', '   ']) {
                    const result = registerClient({
                        nombreCompleto: missing,
                        apellidosCompletos: apellidos,
                        dni,
                    });
                    expect(result.success).toBe(false);
                    expect(result.errors.some(e => e.field === 'nombreCompleto')).toBe(true);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('registro falla si falta apellidosCompletos', () => {
        fc.assert(
            fc.property(nameArb, validDNIArb, (nombre, dni) => {
                localStorage.clear();
                for (const missing of [undefined, null, '', '   ']) {
                    const result = registerClient({
                        nombreCompleto: nombre,
                        apellidosCompletos: missing,
                        dni,
                    });
                    expect(result.success).toBe(false);
                    expect(result.errors.some(e => e.field === 'apellidosCompletos')).toBe(true);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('registro falla si falta DNI', () => {
        fc.assert(
            fc.property(nameArb, nameArb, (nombre, apellidos) => {
                localStorage.clear();
                for (const missing of [undefined, null, '', '   ']) {
                    const result = registerClient({
                        nombreCompleto: nombre,
                        apellidosCompletos: apellidos,
                        dni: missing,
                    });
                    expect(result.success).toBe(false);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('campos opcionales no afectan la validación de campos requeridos', () => {
        fc.assert(
            fc.property(
                validClientArb,
                optionalStringArb,
                optionalStringArb,
                optionalStringArb,
                optionalStringArb,
                optionalStringArb,
                (clientData, fechaNac, tel1, tel2, email1, email2) => {
                    localStorage.clear();
                    const data = {
                        ...clientData,
                        fechaNacimiento: fechaNac,
                        telefono1: tel1,
                        telefono2: tel2,
                        // Avoid email validation noise by keeping null
                        email1: null,
                        email2: null,
                    };
                    const result = registerClient(data);
                    expect(result.success).toBe(true);
                },
            ),
            { numRuns: 100 },
        );
    });
});


describe('Propiedad 3: Unicidad del DNI', () => {
    it('segundo registro con mismo DNI debe ser rechazado', () => {
        fc.assert(
            fc.property(validClientArb, nameArb, nameArb, (clientData, nombre2, apellidos2) => {
                localStorage.clear();

                const first = registerClient(clientData);
                expect(first.success).toBe(true);

                const second = registerClient({
                    nombreCompleto: nombre2,
                    apellidosCompletos: apellidos2,
                    dni: clientData.dni,
                });
                expect(second.success).toBe(false);
                expect(second.errors.some(e => e.code === 'DUPLICATE_DNI')).toBe(true);
            }),
            { numRuns: 100 },
        );
    });

    it('cantidad de clientes no incrementa al intentar registrar DNI duplicado', () => {
        fc.assert(
            fc.property(validClientArb, nameArb, nameArb, (clientData, nombre2, apellidos2) => {
                localStorage.clear();

                registerClient(clientData);
                const countBefore = clientRepository.getAll().length;

                registerClient({
                    nombreCompleto: nombre2,
                    apellidosCompletos: apellidos2,
                    dni: clientData.dni,
                });
                const countAfter = clientRepository.getAll().length;

                expect(countAfter).toBe(countBefore);
            }),
            { numRuns: 100 },
        );
    });

    it('clientes con DNIs diferentes se registran exitosamente', () => {
        fc.assert(
            fc.property(
                validClientArb,
                validClientArb,
                (client1, client2) => {
                    // Ensure different DNIs
                    fc.pre(client1.dni !== client2.dni);
                    localStorage.clear();

                    const first = registerClient(client1);
                    const second = registerClient(client2);

                    expect(first.success).toBe(true);
                    expect(second.success).toBe(true);
                    expect(clientRepository.getAll().length).toBe(2);
                },
            ),
            { numRuns: 100 },
        );
    });
});

describe('Propiedad 4: Persistencia round-trip del Cliente', () => {
    it('cliente recuperado por ID tiene todos los campos idénticos a los datos de registro', () => {
        fc.assert(
            fc.property(validClientArb, (clientData) => {
                localStorage.clear();

                const result = registerClient(clientData);
                expect(result.success).toBe(true);

                const retrieved = clientRepository.getById(result.client.id);
                expect(retrieved).not.toBeNull();
                expect(retrieved.nombreCompleto).toBe(clientData.nombreCompleto.trim());
                expect(retrieved.apellidosCompletos).toBe(clientData.apellidosCompletos.trim());
                expect(retrieved.dni).toBe(clientData.dni);
                expect(retrieved.fechaNacimiento).toBe(clientData.fechaNacimiento || null);
                expect(retrieved.telefono1).toBe(clientData.telefono1 || null);
                expect(retrieved.telefono2).toBe(clientData.telefono2 || null);
                expect(retrieved.email1).toBe(clientData.email1 || null);
                expect(retrieved.email2).toBe(clientData.email2 || null);
            }),
            { numRuns: 100 },
        );
    });

    it('cliente recuperado tiene un ID asignado', () => {
        fc.assert(
            fc.property(validClientArb, (clientData) => {
                localStorage.clear();

                const result = registerClient(clientData);
                expect(result.success).toBe(true);
                expect(typeof result.client.id).toBe('string');
                expect(result.client.id.length).toBeGreaterThan(0);
            }),
            { numRuns: 100 },
        );
    });
});
