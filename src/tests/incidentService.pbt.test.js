import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { createIncident } from '../services/incidentService.js';
import { registerClient } from '../services/clientService.js';

// Feature: claims-monitoring-system, Property 13: Campos requeridos del siniestro
// **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

/** Generates a valid 8-digit DNI. */
const validDNIArb = fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 8 })
    .map(digits => digits.join(''));

/** Non-empty trimmed string. */
const nameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

/** Generates a valid ISO date string. */
const dateArb = fc.tuple(
    fc.integer({ min: 2000, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
).map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

/** Generates a valid police report file object. */
const validFileArb = fc.record({
    name: fc.constantFrom('report.pdf', 'photo.jpg', 'scan.png'),
    type: fc.constantFrom('application/pdf', 'image/jpeg', 'image/png'),
    dataUrl: fc.constant('data:application/pdf;base64,dGVzdA=='),
});

/** Generates a non-empty description. */
const descriptionArb = fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0);

/** Generates a valid policeReport object. */
const validPoliceReportArb = fc.tuple(validFileArb, descriptionArb).map(([file, description]) => ({
    file,
    description,
}));

/** Helper: registers a client and returns its ID. */
function createTestClient(dni) {
    const result = registerClient({
        nombreCompleto: 'Test',
        apellidosCompletos: 'User',
        dni,
    });
    return result.client.id;
}

beforeEach(() => {
    localStorage.clear();
});

describe('Propiedad 13: Campos requeridos del siniestro', () => {
    it('registro exitoso cuando todos los campos requeridos están presentes', () => {
        fc.assert(
            fc.property(validDNIArb, dateArb, validPoliceReportArb, (dni, date, policeReport) => {
                localStorage.clear();
                const clientId = createTestClient(dni);

                const result = createIncident(clientId, date, policeReport);
                expect(result.success).toBe(true);
                expect(result.incident).toBeDefined();
                expect(result.incident.clienteId).toBe(clientId);
                expect(result.incident.fecha).toBe(date);
            }),
            { numRuns: 100 },
        );
    });

    it('registro falla si falta el cliente (clientId ausente)', () => {
        fc.assert(
            fc.property(dateArb, validPoliceReportArb, (date, policeReport) => {
                localStorage.clear();
                for (const missing of [undefined, null, '']) {
                    const result = createIncident(missing, date, policeReport);
                    expect(result.success).toBe(false);
                    expect(result.errors.some(e => e.field === 'clienteId')).toBe(true);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('registro falla si el cliente no existe', () => {
        fc.assert(
            fc.property(dateArb, validPoliceReportArb, (date, policeReport) => {
                localStorage.clear();
                const result = createIncident('nonexistent-id', date, policeReport);
                expect(result.success).toBe(false);
                expect(result.errors.some(e => e.field === 'clienteId' && e.code === 'CLIENT_NOT_FOUND')).toBe(true);
            }),
            { numRuns: 100 },
        );
    });

    it('registro falla si falta la fecha', () => {
        fc.assert(
            fc.property(validDNIArb, validPoliceReportArb, (dni, policeReport) => {
                localStorage.clear();
                const clientId = createTestClient(dni);

                for (const missing of [undefined, null, '']) {
                    const result = createIncident(clientId, missing, policeReport);
                    expect(result.success).toBe(false);
                    expect(result.errors.some(e => e.field === 'fecha')).toBe(true);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('registro falla si falta la denuncia policial completa', () => {
        fc.assert(
            fc.property(validDNIArb, dateArb, (dni, date) => {
                localStorage.clear();
                const clientId = createTestClient(dni);

                for (const missing of [undefined, null]) {
                    const result = createIncident(clientId, date, missing);
                    expect(result.success).toBe(false);
                    expect(result.errors.some(e => e.field === 'denunciaArchivo')).toBe(true);
                    expect(result.errors.some(e => e.field === 'denunciaDescripcion')).toBe(true);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('registro falla si falta el archivo de denuncia policial', () => {
        fc.assert(
            fc.property(validDNIArb, dateArb, descriptionArb, (dni, date, description) => {
                localStorage.clear();
                const clientId = createTestClient(dni);

                for (const missing of [undefined, null]) {
                    const result = createIncident(clientId, date, { file: missing, description });
                    expect(result.success).toBe(false);
                    expect(result.errors.some(e => e.field === 'denunciaArchivo')).toBe(true);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('registro falla si falta la descripción de la denuncia', () => {
        fc.assert(
            fc.property(validDNIArb, dateArb, validFileArb, (dni, date, file) => {
                localStorage.clear();
                const clientId = createTestClient(dni);

                for (const missing of [undefined, null, '', '   ']) {
                    const result = createIncident(clientId, date, { file, description: missing });
                    expect(result.success).toBe(false);
                    expect(result.errors.some(e => e.field === 'denunciaDescripcion')).toBe(true);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('ausencia de cualquier campo requerido resulta en rechazo con errores', () => {
        fc.assert(
            fc.property(
                validDNIArb,
                dateArb,
                validPoliceReportArb,
                fc.constantFrom('clienteId', 'fecha', 'policeReport'),
                (dni, date, policeReport, fieldToOmit) => {
                    localStorage.clear();
                    const clientId = createTestClient(dni);

                    let result;
                    switch (fieldToOmit) {
                        case 'clienteId':
                            result = createIncident(null, date, policeReport);
                            break;
                        case 'fecha':
                            result = createIncident(clientId, null, policeReport);
                            break;
                        case 'policeReport':
                            result = createIncident(clientId, date, null);
                            break;
                    }

                    expect(result.success).toBe(false);
                    expect(result.errors.length).toBeGreaterThan(0);
                },
            ),
            { numRuns: 100 },
        );
    });
});
