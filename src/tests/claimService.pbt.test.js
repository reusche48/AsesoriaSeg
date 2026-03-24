import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { createClaim, addClaimDetail, updateClaimDetail, calculateClaimTotal, getAvailableCoverages } from '../services/claimService.js';
import { registerClient } from '../services/clientService.js';
import { addBankToClient, addBankAccount } from '../services/bankService.js';
import { addCard, assignInsurance } from '../services/cardService.js';
import { createInsurance } from '../services/insuranceService.js';
import { createIncident } from '../services/incidentService.js';
import { claimRepository } from '../repositories/claimRepository.js';

// Feature: claims-monitoring-system, Property 16: Validación de reclamo vinculado a banco del cliente
// Feature: claims-monitoring-system, Property 17: Filtrado de coberturas por banco del reclamo
// Feature: claims-monitoring-system, Property 18: Cálculo automático del monto total del reclamo
// Feature: claims-monitoring-system, Property 19: Campos requeridos del detalle de reclamo
// **Validates: Requirements 8.1, 8.2, 8.3, 9.1, 9.2, 9.4, 9.5**

// --- Arbitraries ---

const validDNIArb = fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 8 })
    .map(digits => digits.join(''));

const nameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

const dateArb = fc.tuple(
    fc.integer({ min: 2000, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
).map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

const amountArb = fc.integer({ min: 1, max: 99999999 }).map(n => n / 100);

const coverageInputArb = fc.record({
    nombre: nameArb,
    descripcion: fc.string({ maxLength: 80 }),
});

const coveragesArb = fc.array(coverageInputArb, { minLength: 1, maxLength: 5 });

// --- Helpers ---

function createTestClient(dni) {
    const result = registerClient({
        nombreCompleto: 'Test',
        apellidosCompletos: 'User',
        dni,
    });
    return result.client;
}

function createTestIncident(clientId) {
    const result = createIncident(clientId, '2024-01-15', {
        file: { name: 'report.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,dGVzdA==' },
        description: 'Descripción de prueba',
    });
    return result.incident;
}

function createTestBankWithAccount(clientId, bankName) {
    const bankResult = addBankToClient(clientId, { nombre: bankName || 'Banco Test' });
    const accountResult = addBankAccount(clientId, bankResult.bank.id, 'PEN');
    return { bank: bankResult.bank, account: accountResult.account };
}

function createTestCardWithInsurance(clientId, accountId, insuranceName, coverages) {
    const cardResult = addCard(clientId, [accountId]);
    const insResult = createInsurance(insuranceName || 'Seguro Test', 'Desc', coverages || [{ nombre: 'Cobertura A', descripcion: '' }]);
    assignInsurance(cardResult.card.id, insResult.insurance.id);
    return { card: cardResult.card, insurance: insResult.insurance, coverages: insResult.coverages };
}

beforeEach(() => {
    localStorage.clear();
});

// --- Property 16: Validación de reclamo vinculado a banco del cliente ---

describe('Propiedad 16: Validación de reclamo vinculado a banco del cliente', () => {
    it('crear reclamo con banco vinculado al cliente del siniestro es exitoso', () => {
        fc.assert(
            fc.property(validDNIArb, dateArb, (dni, claimDate) => {
                localStorage.clear();
                const client = createTestClient(dni);
                const incident = createTestIncident(client.id);
                const { bank } = createTestBankWithAccount(client.id, 'Banco A');

                const result = createClaim(incident.id, bank.id, claimDate);
                expect(result.success).toBe(true);
                expect(result.claim.siniestroId).toBe(incident.id);
                expect(result.claim.bancoId).toBe(bank.id);
            }),
            { numRuns: 100 },
        );
    });

    it('crear reclamo con banco NO vinculado al cliente debe ser rechazado', () => {
        fc.assert(
            fc.property(validDNIArb, validDNIArb, dateArb, (dni1, dni2, claimDate) => {
                fc.pre(dni1 !== dni2);
                localStorage.clear();

                const client1 = createTestClient(dni1);
                const client2 = createTestClient(dni2);
                const incident = createTestIncident(client1.id);
                const { bank: otherBank } = createTestBankWithAccount(client2.id, 'Banco Otro');

                const result = createClaim(incident.id, otherBank.id, claimDate);
                expect(result.success).toBe(false);
                expect(result.errors.some(e => e.code === 'BANK_NOT_LINKED')).toBe(true);
            }),
            { numRuns: 100 },
        );
    });

    it('crear reclamo con siniestro inexistente debe ser rechazado', () => {
        fc.assert(
            fc.property(validDNIArb, dateArb, (dni, claimDate) => {
                localStorage.clear();
                const client = createTestClient(dni);
                const { bank } = createTestBankWithAccount(client.id, 'Banco A');

                const result = createClaim('nonexistent-incident', bank.id, claimDate);
                expect(result.success).toBe(false);
                expect(result.errors.some(e => e.code === 'INCIDENT_NOT_FOUND')).toBe(true);
            }),
            { numRuns: 100 },
        );
    });
});

// --- Property 17: Filtrado de coberturas por banco del reclamo ---

describe('Propiedad 17: Filtrado de coberturas por banco del reclamo', () => {
    it('coberturas disponibles corresponden exactamente al seguro del banco del reclamo', () => {
        fc.assert(
            fc.property(validDNIArb, coveragesArb, (dni, covInputs) => {
                localStorage.clear();
                const client = createTestClient(dni);
                const incident = createTestIncident(client.id);
                const { bank, account } = createTestBankWithAccount(client.id, 'Banco A');
                const { coverages: savedCoverages } = createTestCardWithInsurance(
                    client.id, account.id, 'Seguro A', covInputs
                );

                const claimResult = createClaim(incident.id, bank.id, '2024-02-01');
                expect(claimResult.success).toBe(true);

                const available = getAvailableCoverages(claimResult.claim.id);
                expect(available).toHaveLength(savedCoverages.length);

                const availableIds = new Set(available.map(c => c.id));
                for (const cov of savedCoverages) {
                    expect(availableIds.has(cov.id)).toBe(true);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('coberturas de otro banco no aparecen en las disponibles', () => {
        fc.assert(
            fc.property(validDNIArb, coveragesArb, coveragesArb, (dni, covsA, covsB) => {
                localStorage.clear();
                const client = createTestClient(dni);
                const incident = createTestIncident(client.id);

                // Banco A con seguro A
                const { bank: bankA, account: accountA } = createTestBankWithAccount(client.id, 'Banco A');
                const { coverages: covsOfA } = createTestCardWithInsurance(
                    client.id, accountA.id, 'Seguro A', covsA
                );

                // Banco B con seguro B
                const { bank: bankB, account: accountB } = createTestBankWithAccount(client.id, 'Banco B');
                createTestCardWithInsurance(client.id, accountB.id, 'Seguro B', covsB);

                // Reclamo vinculado a Banco A
                const claimResult = createClaim(incident.id, bankA.id, '2024-02-01');
                expect(claimResult.success).toBe(true);

                const available = getAvailableCoverages(claimResult.claim.id);
                const availableIds = new Set(available.map(c => c.id));

                // Solo coberturas de seguro A
                for (const cov of covsOfA) {
                    expect(availableIds.has(cov.id)).toBe(true);
                }
                // Ninguna cobertura extra
                expect(available.length).toBe(covsOfA.length);
            }),
            { numRuns: 100 },
        );
    });

    it('sin tarjetas aseguradas en el banco, no hay coberturas disponibles', () => {
        fc.assert(
            fc.property(validDNIArb, (dni) => {
                localStorage.clear();
                const client = createTestClient(dni);
                const incident = createTestIncident(client.id);
                const { bank } = createTestBankWithAccount(client.id, 'Banco Sin Seguro');

                const claimResult = createClaim(incident.id, bank.id, '2024-02-01');
                expect(claimResult.success).toBe(true);

                const available = getAvailableCoverages(claimResult.claim.id);
                expect(available).toHaveLength(0);
            }),
            { numRuns: 100 },
        );
    });
});

// --- Property 18: Cálculo automático del monto total del reclamo ---

describe('Propiedad 18: Cálculo automático del monto total del reclamo', () => {
    it('monto total es la suma exacta de todos los detalles agregados', () => {
        fc.assert(
            fc.property(
                validDNIArb,
                fc.array(amountArb, { minLength: 1, maxLength: 10 }),
                (dni, amounts) => {
                    localStorage.clear();
                    const client = createTestClient(dni);
                    const incident = createTestIncident(client.id);
                    const { bank, account } = createTestBankWithAccount(client.id, 'Banco A');
                    const { coverages } = createTestCardWithInsurance(client.id, account.id, 'Seguro A', [
                        { nombre: 'Cob1', descripcion: '' },
                    ]);

                    const claimResult = createClaim(incident.id, bank.id, '2024-03-01');
                    expect(claimResult.success).toBe(true);

                    let expectedTotal = 0;
                    for (const amount of amounts) {
                        const detailResult = addClaimDetail(claimResult.claim.id, coverages[0].id, amount);
                        expect(detailResult.success).toBe(true);
                        expectedTotal += amount;
                    }

                    const storedClaim = claimRepository.getById(claimResult.claim.id);
                    // Use approximate comparison for floating point
                    expect(storedClaim.montoTotal).toBeCloseTo(expectedTotal, 2);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('monto total se recalcula correctamente al modificar un detalle', () => {
        fc.assert(
            fc.property(validDNIArb, amountArb, amountArb, (dni, originalAmount, newAmount) => {
                localStorage.clear();
                const client = createTestClient(dni);
                const incident = createTestIncident(client.id);
                const { bank, account } = createTestBankWithAccount(client.id, 'Banco A');
                const { coverages } = createTestCardWithInsurance(client.id, account.id, 'Seguro A', [
                    { nombre: 'Cob1', descripcion: '' },
                ]);

                const claimResult = createClaim(incident.id, bank.id, '2024-03-01');
                const detailResult = addClaimDetail(claimResult.claim.id, coverages[0].id, originalAmount);
                expect(detailResult.success).toBe(true);

                const updateResult = updateClaimDetail(detailResult.detail.id, coverages[0].id, newAmount);
                expect(updateResult.success).toBe(true);

                const storedClaim = claimRepository.getById(claimResult.claim.id);
                expect(storedClaim.montoTotal).toBeCloseTo(newAmount, 2);
            }),
            { numRuns: 100 },
        );
    });

    it('monto total con múltiples detalles y una modificación', () => {
        fc.assert(
            fc.property(
                validDNIArb,
                amountArb,
                amountArb,
                amountArb,
                (dni, amount1, amount2, newAmount1) => {
                    localStorage.clear();
                    const client = createTestClient(dni);
                    const incident = createTestIncident(client.id);
                    const { bank, account } = createTestBankWithAccount(client.id, 'Banco A');
                    const { coverages } = createTestCardWithInsurance(client.id, account.id, 'Seguro A', [
                        { nombre: 'Cob1', descripcion: '' },
                    ]);

                    const claimResult = createClaim(incident.id, bank.id, '2024-03-01');
                    const d1 = addClaimDetail(claimResult.claim.id, coverages[0].id, amount1);
                    const d2 = addClaimDetail(claimResult.claim.id, coverages[0].id, amount2);

                    updateClaimDetail(d1.detail.id, coverages[0].id, newAmount1);

                    const storedClaim = claimRepository.getById(claimResult.claim.id);
                    expect(storedClaim.montoTotal).toBeCloseTo(newAmount1 + amount2, 2);
                },
            ),
            { numRuns: 100 },
        );
    });
});

// --- Property 19: Campos requeridos del detalle de reclamo ---

describe('Propiedad 19: Campos requeridos del detalle de reclamo', () => {
    it('detalle exitoso cuando cobertura y monto están presentes', () => {
        fc.assert(
            fc.property(validDNIArb, amountArb, (dni, amount) => {
                localStorage.clear();
                const client = createTestClient(dni);
                const incident = createTestIncident(client.id);
                const { bank, account } = createTestBankWithAccount(client.id, 'Banco A');
                const { coverages } = createTestCardWithInsurance(client.id, account.id, 'Seguro A', [
                    { nombre: 'Cob1', descripcion: '' },
                ]);

                const claimResult = createClaim(incident.id, bank.id, '2024-04-01');
                const detailResult = addClaimDetail(claimResult.claim.id, coverages[0].id, amount);
                expect(detailResult.success).toBe(true);
                expect(detailResult.detail.coberturaId).toBe(coverages[0].id);
                expect(detailResult.detail.monto).toBe(amount);
            }),
            { numRuns: 100 },
        );
    });

    it('detalle rechazado si falta la cobertura', () => {
        fc.assert(
            fc.property(validDNIArb, amountArb, (dni, amount) => {
                localStorage.clear();
                const client = createTestClient(dni);
                const incident = createTestIncident(client.id);
                const { bank } = createTestBankWithAccount(client.id, 'Banco A');

                const claimResult = createClaim(incident.id, bank.id, '2024-04-01');

                for (const missing of [undefined, null, '']) {
                    const result = addClaimDetail(claimResult.claim.id, missing, amount);
                    expect(result.success).toBe(false);
                    expect(result.errors.some(e => e.field === 'coberturaId')).toBe(true);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('detalle rechazado si falta el monto', () => {
        fc.assert(
            fc.property(validDNIArb, (dni) => {
                localStorage.clear();
                const client = createTestClient(dni);
                const incident = createTestIncident(client.id);
                const { bank, account } = createTestBankWithAccount(client.id, 'Banco A');
                const { coverages } = createTestCardWithInsurance(client.id, account.id, 'Seguro A', [
                    { nombre: 'Cob1', descripcion: '' },
                ]);

                const claimResult = createClaim(incident.id, bank.id, '2024-04-01');

                for (const missing of [undefined, null, '']) {
                    const result = addClaimDetail(claimResult.claim.id, coverages[0].id, missing);
                    expect(result.success).toBe(false);
                    expect(result.errors.some(e => e.field === 'monto')).toBe(true);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('detalle rechazado si el monto es <= 0', () => {
        fc.assert(
            fc.property(
                validDNIArb,
                fc.integer({ min: -10000, max: 0 }).map(n => n / 100),
                (dni, badAmount) => {
                    localStorage.clear();
                    const client = createTestClient(dni);
                    const incident = createTestIncident(client.id);
                    const { bank, account } = createTestBankWithAccount(client.id, 'Banco A');
                    const { coverages } = createTestCardWithInsurance(client.id, account.id, 'Seguro A', [
                        { nombre: 'Cob1', descripcion: '' },
                    ]);

                    const claimResult = createClaim(incident.id, bank.id, '2024-04-01');
                    const result = addClaimDetail(claimResult.claim.id, coverages[0].id, badAmount);
                    expect(result.success).toBe(false);
                    expect(result.errors.some(e => e.field === 'monto')).toBe(true);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('ausencia de cualquier campo requerido resulta en rechazo', () => {
        fc.assert(
            fc.property(
                validDNIArb,
                amountArb,
                fc.constantFrom('coberturaId', 'monto'),
                (dni, amount, fieldToOmit) => {
                    localStorage.clear();
                    const client = createTestClient(dni);
                    const incident = createTestIncident(client.id);
                    const { bank, account } = createTestBankWithAccount(client.id, 'Banco A');
                    const { coverages } = createTestCardWithInsurance(client.id, account.id, 'Seguro A', [
                        { nombre: 'Cob1', descripcion: '' },
                    ]);

                    const claimResult = createClaim(incident.id, bank.id, '2024-04-01');

                    let result;
                    if (fieldToOmit === 'coberturaId') {
                        result = addClaimDetail(claimResult.claim.id, null, amount);
                    } else {
                        result = addClaimDetail(claimResult.claim.id, coverages[0].id, null);
                    }

                    expect(result.success).toBe(false);
                    expect(result.errors.length).toBeGreaterThan(0);
                },
            ),
            { numRuns: 100 },
        );
    });
});
