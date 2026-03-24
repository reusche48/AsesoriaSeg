import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { createInsurance, getInsuranceWithCoverages } from '../services/insuranceService.js';

// Feature: claims-monitoring-system, Property 10: Seguro debe contener al menos una cobertura
// Feature: claims-monitoring-system, Property 11: Round-trip de seguro con coberturas

/** Generates a non-empty trimmed string. */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 60 })
    .filter(s => s.trim().length > 0);

/** Generates a single coverage object. */
const coverageArb = fc.record({
    nombre: nonEmptyStringArb,
    descripcion: fc.string({ maxLength: 80 }),
});

/** Generates a non-empty array of coverages (1 to 5). */
const coveragesArb = fc.array(coverageArb, { minLength: 1, maxLength: 5 });

beforeEach(() => {
    localStorage.clear();
});

describe('Propiedad 10: Seguro debe contener al menos una cobertura', () => {
    it('crear seguro sin coberturas debe ser rechazado', () => {
        fc.assert(
            fc.property(nonEmptyStringArb, nonEmptyStringArb, (name, desc) => {
                localStorage.clear();

                for (const empty of [[], null, undefined]) {
                    const result = createInsurance(name, desc, empty);
                    expect(result.success).toBe(false);
                    expect(result.errors.some(e => e.code === 'MIN_COVERAGES')).toBe(true);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('crear seguro con al menos una cobertura debe ser exitoso', () => {
        fc.assert(
            fc.property(nonEmptyStringArb, nonEmptyStringArb, coveragesArb, (name, desc, coverages) => {
                localStorage.clear();

                const result = createInsurance(name, desc, coverages);
                expect(result.success).toBe(true);
                expect(result.insurance).toBeDefined();
                expect(result.coverages.length).toBe(coverages.length);
            }),
            { numRuns: 100 },
        );
    });
});

describe('Propiedad 11: Round-trip de seguro con coberturas', () => {
    it('seguro consultado retorna exactamente las mismas coberturas con datos intactos', () => {
        fc.assert(
            fc.property(nonEmptyStringArb, nonEmptyStringArb, coveragesArb, (name, desc, coverages) => {
                localStorage.clear();

                const created = createInsurance(name, desc, coverages);
                expect(created.success).toBe(true);

                const retrieved = getInsuranceWithCoverages(created.insurance.id);
                expect(retrieved).not.toBeNull();
                expect(retrieved.nombre).toBe(name.trim());
                expect(retrieved.descripcion).toBe(desc.trim());
                expect(retrieved.coberturas).toHaveLength(coverages.length);

                for (let i = 0; i < coverages.length; i++) {
                    const original = coverages[i];
                    const saved = retrieved.coberturas.find(c => c.nombre === original.nombre && c.descripcion === (original.descripcion || ''));
                    expect(saved).toBeDefined();
                    expect(saved.seguroId).toBe(created.insurance.id);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('seguro consultado tiene un ID asignado y coberturas con IDs', () => {
        fc.assert(
            fc.property(nonEmptyStringArb, nonEmptyStringArb, coveragesArb, (name, desc, coverages) => {
                localStorage.clear();

                const created = createInsurance(name, desc, coverages);
                expect(created.success).toBe(true);

                const retrieved = getInsuranceWithCoverages(created.insurance.id);
                expect(typeof retrieved.id).toBe('string');
                expect(retrieved.id.length).toBeGreaterThan(0);

                for (const cov of retrieved.coberturas) {
                    expect(typeof cov.id).toBe('string');
                    expect(cov.id.length).toBeGreaterThan(0);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('consultar seguro inexistente retorna null', () => {
        fc.assert(
            fc.property(fc.uuid(), (fakeId) => {
                localStorage.clear();
                const result = getInsuranceWithCoverages(fakeId);
                expect(result).toBeNull();
            }),
            { numRuns: 100 },
        );
    });
});
