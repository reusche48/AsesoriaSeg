import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { addClaimEvent, getClaimEvents } from '../services/claimEventService.js';
import { createClaim } from '../services/claimService.js';
import { registerClient } from '../services/clientService.js';
import { addBankToClient, addBankAccount } from '../services/bankService.js';
import { createIncident } from '../services/incidentService.js';

const validDNIArb = fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 8 })
    .map(digits => digits.join(''));

const dateArb = fc.tuple(
    fc.integer({ min: 2000, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
).map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

const descriptionArb = fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0);

function createClaimSetup(dni) {
    const client = registerClient({ nombreCompleto: 'Test', apellidosCompletos: 'User', dni }).client;
    const bankRes = addBankToClient(client.id, { nombre: 'Banco Test' });
    addBankAccount(client.id, bankRes.bank.id, 'PEN');
    const incidentRes = createIncident(client.id, '2024-01-15', {
        file: { name: 'denuncia.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,abc' },
        description: 'Descripción del siniestro',
    });
    return createClaim(incidentRes.incident.id, bankRes.bank.id, '2024-02-01').claim.id;
}

beforeEach(() => { localStorage.clear(); });

describe('Propiedad 20: Campos requeridos del evento de reclamo', () => {
    it('registro exitoso con todos los campos y fechaRegistro automática', () => {
        fc.assert(fc.property(validDNIArb, dateArb, descriptionArb, (dni, date, description) => {
            localStorage.clear();
            const claimId = createClaimSetup(dni);
            const result = addClaimEvent(claimId, date, description);
            expect(result.success).toBe(true);
            expect(result.event.fecha).toBe(date);
            expect(result.event.fechaRegistro).toBeDefined();
            expect(result.event.descripcion).toBe(description);
        }), { numRuns: 100 });
    });

    it('registro exitoso con evidencia opcional', () => {
        fc.assert(fc.property(validDNIArb, dateArb, descriptionArb, (dni, date, description) => {
            localStorage.clear();
            const claimId = createClaimSetup(dni);
            const result = addClaimEvent(claimId, date, description, 'data:image/png;base64,abc123');
            expect(result.success).toBe(true);
            expect(result.event.evidencia).toBe('data:image/png;base64,abc123');
        }), { numRuns: 100 });
    });

    it('falla si falta el reclamo', () => {
        fc.assert(fc.property(dateArb, descriptionArb, (date, description) => {
            localStorage.clear();
            for (const missing of [undefined, null, '']) {
                const result = addClaimEvent(missing, date, description);
                expect(result.success).toBe(false);
                expect(result.errors.some(e => e.field === 'reclamoId')).toBe(true);
            }
        }), { numRuns: 100 });
    });

    it('falla si el reclamo no existe', () => {
        fc.assert(fc.property(dateArb, descriptionArb, (date, description) => {
            localStorage.clear();
            const result = addClaimEvent('nonexistent-claim', date, description);
            expect(result.success).toBe(false);
            expect(result.errors.some(e => e.code === 'CLAIM_NOT_FOUND')).toBe(true);
        }), { numRuns: 100 });
    });

    it('falla si falta la fecha', () => {
        fc.assert(fc.property(validDNIArb, descriptionArb, (dni, description) => {
            localStorage.clear();
            const claimId = createClaimSetup(dni);
            for (const missing of [undefined, null, '']) {
                const result = addClaimEvent(claimId, missing, description);
                expect(result.success).toBe(false);
                expect(result.errors.some(e => e.field === 'fecha')).toBe(true);
            }
        }), { numRuns: 100 });
    });

    it('falla si falta la descripción', () => {
        fc.assert(fc.property(validDNIArb, dateArb, (dni, date) => {
            localStorage.clear();
            const claimId = createClaimSetup(dni);
            for (const missing of [undefined, null, '', '   ']) {
                const result = addClaimEvent(claimId, date, missing);
                expect(result.success).toBe(false);
                expect(result.errors.some(e => e.field === 'descripcion')).toBe(true);
            }
        }), { numRuns: 100 });
    });

    it('ausencia de cualquier campo requerido resulta en rechazo', () => {
        fc.assert(fc.property(validDNIArb, dateArb, descriptionArb, fc.constantFrom('reclamoId', 'fecha', 'descripcion'), (dni, date, description, field) => {
            localStorage.clear();
            const claimId = createClaimSetup(dni);
            let result;
            switch (field) {
                case 'reclamoId': result = addClaimEvent(null, date, description); break;
                case 'fecha': result = addClaimEvent(claimId, null, description); break;
                case 'descripcion': result = addClaimEvent(claimId, date, null); break;
            }
            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        }), { numRuns: 100 });
    });
});

describe('Propiedad 21: Ordenamiento cronológico de eventos', () => {
    it('eventos se retornan ordenados por fecha ascendente', () => {
        fc.assert(fc.property(validDNIArb, fc.array(dateArb, { minLength: 1, maxLength: 10 }), (dni, dates) => {
            localStorage.clear();
            const claimId = createClaimSetup(dni);
            for (let i = 0; i < dates.length; i++) {
                expect(addClaimEvent(claimId, dates[i], `Evento ${i}`).success).toBe(true);
            }
            const events = getClaimEvents(claimId);
            expect(events.length).toBe(dates.length);
            for (let i = 1; i < events.length; i++) {
                expect(new Date(events[i - 1].fecha).getTime()).toBeLessThanOrEqual(new Date(events[i].fecha).getTime());
            }
        }), { numRuns: 100 });
    });

    it('un solo evento siempre está ordenado', () => {
        fc.assert(fc.property(validDNIArb, dateArb, descriptionArb, (dni, date, description) => {
            localStorage.clear();
            const claimId = createClaimSetup(dni);
            addClaimEvent(claimId, date, description);
            const events = getClaimEvents(claimId);
            expect(events.length).toBe(1);
            expect(events[0].fecha).toBe(date);
        }), { numRuns: 100 });
    });

    it('reclamo sin eventos retorna lista vacía', () => {
        fc.assert(fc.property(validDNIArb, (dni) => {
            localStorage.clear();
            const claimId = createClaimSetup(dni);
            expect(getClaimEvents(claimId)).toEqual([]);
        }), { numRuns: 100 });
    });
});
