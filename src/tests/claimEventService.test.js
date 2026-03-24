import { describe, it, expect, beforeEach } from 'vitest';
import { addClaimEvent, getClaimEvents } from '../services/claimEventService.js';
import { createClaim } from '../services/claimService.js';
import { registerClient } from '../services/clientService.js';
import { addBankToClient, addBankAccount } from '../services/bankService.js';
import { createIncident } from '../services/incidentService.js';

function createTestClient(digits = '12345678') {
    return registerClient({ nombreCompleto: 'Juan', apellidosCompletos: 'Pérez', dni: digits });
}

function createClaimSetup() {
    const clientRes = createTestClient();
    const clientId = clientRes.client.id;
    const bankRes = addBankToClient(clientId, { nombre: 'BCP' });
    const bankId = bankRes.bank.id;
    addBankAccount(clientId, bankId, 'PEN');
    const incidentRes = createIncident(clientId, '2024-01-15', {
        file: { name: 'denuncia.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,abc' },
        description: 'Robo de tarjeta',
    });
    const claimRes = createClaim(incidentRes.incident.id, bankId, '2024-02-01');
    return { clientId, bankId, claimId: claimRes.claim.id };
}

beforeEach(() => { localStorage.clear(); });

describe('addClaimEvent', () => {
    it('registra un evento correctamente con fechaRegistro automática', () => {
        const { claimId } = createClaimSetup();
        const result = addClaimEvent(claimId, '2024-03-01', 'Se contactó al banco');
        expect(result.success).toBe(true);
        expect(result.event.reclamoId).toBe(claimId);
        expect(result.event.fecha).toBe('2024-03-01');
        expect(result.event.fechaRegistro).toBeDefined();
        expect(result.event.descripcion).toBe('Se contactó al banco');
        expect(result.event.evidencia).toBeNull();
    });

    it('registra un evento con evidencia', () => {
        const { claimId } = createClaimSetup();
        const result = addClaimEvent(claimId, '2024-03-01', 'Evidencia adjunta', 'data:image/png;base64,xyz');
        expect(result.success).toBe(true);
        expect(result.event.evidencia).toBe('data:image/png;base64,xyz');
    });

    it('falla si claimId no existe', () => {
        const result = addClaimEvent('nonexistent', '2024-03-01', 'Descripción');
        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'CLAIM_NOT_FOUND')).toBe(true);
    });

    it('falla si claimId está vacío', () => {
        const result = addClaimEvent('', '2024-03-01', 'Descripción');
        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.field === 'reclamoId')).toBe(true);
    });

    it('falla si fecha está vacía', () => {
        const { claimId } = createClaimSetup();
        const result = addClaimEvent(claimId, '', 'Descripción');
        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.field === 'fecha')).toBe(true);
    });

    it('falla si descripción está vacía', () => {
        const { claimId } = createClaimSetup();
        const result = addClaimEvent(claimId, '2024-03-01', '');
        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.field === 'descripcion')).toBe(true);
    });

    it('falla si descripción es solo espacios', () => {
        const { claimId } = createClaimSetup();
        const result = addClaimEvent(claimId, '2024-03-01', '   ');
        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.field === 'descripcion')).toBe(true);
    });

    it('retorna múltiples errores cuando faltan varios campos', () => {
        const result = addClaimEvent('', '', '');
        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('fechaRegistro es un ISO string válido', () => {
        const { claimId } = createClaimSetup();
        const result = addClaimEvent(claimId, '2024-03-01', 'Test');
        expect(result.success).toBe(true);
        const d = new Date(result.event.fechaRegistro);
        expect(d.toString()).not.toBe('Invalid Date');
    });
});

describe('getClaimEvents', () => {
    it('retorna eventos ordenados cronológicamente', () => {
        const { claimId } = createClaimSetup();
        addClaimEvent(claimId, '2024-03-15', 'Evento medio');
        addClaimEvent(claimId, '2024-03-01', 'Evento primero');
        addClaimEvent(claimId, '2024-03-30', 'Evento último');
        const events = getClaimEvents(claimId);
        expect(events.length).toBe(3);
        expect(events[0].descripcion).toBe('Evento primero');
        expect(events[1].descripcion).toBe('Evento medio');
        expect(events[2].descripcion).toBe('Evento último');
    });

    it('retorna array vacío si no hay eventos', () => {
        const { claimId } = createClaimSetup();
        expect(getClaimEvents(claimId)).toEqual([]);
    });

    it('retorna array vacío si el reclamo no existe', () => {
        expect(getClaimEvents('nonexistent')).toEqual([]);
    });
});
