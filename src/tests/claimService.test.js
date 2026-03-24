import { describe, it, expect, beforeEach } from 'vitest';
import { createClaim, addClaimDetail, updateClaimDetail, calculateClaimTotal, getAvailableCoverages } from '../services/claimService.js';
import { registerClient } from '../services/clientService.js';
import { addBankToClient, addBankAccount } from '../services/bankService.js';
import { addCard, assignInsurance } from '../services/cardService.js';
import { createInsurance } from '../services/insuranceService.js';
import { createIncident } from '../services/incidentService.js';

/** Helper: creates a valid client */
function createTestClient(digits = '12345678') {
    return registerClient({
        nombreCompleto: 'Juan',
        apellidosCompletos: 'Pérez',
        dni: digits,
    });
}

/** Helper: creates a full setup (client, bank, account, incident) */
function createFullSetup() {
    const clientRes = createTestClient();
    const clientId = clientRes.client.id;

    const bankRes = addBankToClient(clientId, { nombre: 'BCP' });
    const bankId = bankRes.bank.id;

    const accountRes = addBankAccount(clientId, bankId, 'PEN');
    const accountId = accountRes.account.id;

    const incidentRes = createIncident(clientId, '2024-01-15', {
        file: { name: 'denuncia.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,abc' },
        description: 'Robo de tarjeta',
    });
    const incidentId = incidentRes.incident.id;

    return { clientId, bankId, accountId, incidentId };
}

beforeEach(() => {
    localStorage.clear();
});

describe('createClaim', () => {
    it('crea un reclamo vinculado a siniestro y banco correctamente', () => {
        const { incidentId, bankId } = createFullSetup();
        const result = createClaim(incidentId, bankId, '2024-02-01', 'Observación test');

        expect(result.success).toBe(true);
        expect(result.claim).toBeDefined();
        expect(result.claim.siniestroId).toBe(incidentId);
        expect(result.claim.bancoId).toBe(bankId);
        expect(result.claim.fecha).toBe('2024-02-01');
        expect(result.claim.observaciones).toBe('Observación test');
        expect(result.claim.montoTotal).toBe(0);
        expect(result.claim.id).toBeDefined();
    });

    it('crea un reclamo sin observaciones ni evidencia', () => {
        const { incidentId, bankId } = createFullSetup();
        const result = createClaim(incidentId, bankId, '2024-02-01');

        expect(result.success).toBe(true);
        expect(result.claim.observaciones).toBeNull();
        expect(result.claim.evidencia).toBeNull();
    });

    it('crea un reclamo con evidencia', () => {
        const { incidentId, bankId } = createFullSetup();
        const result = createClaim(incidentId, bankId, '2024-02-01', null, 'data:image/png;base64,xyz');

        expect(result.success).toBe(true);
        expect(result.claim.evidencia).toBe('data:image/png;base64,xyz');
    });

    it('falla si siniestro no existe', () => {
        const { bankId } = createFullSetup();
        const result = createClaim('nonexistent', bankId, '2024-02-01');

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'INCIDENT_NOT_FOUND')).toBe(true);
    });

    it('falla si banco no existe', () => {
        const { incidentId } = createFullSetup();
        const result = createClaim(incidentId, 'nonexistent', '2024-02-01');

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'BANK_NOT_FOUND')).toBe(true);
    });

    it('falla si banco no está vinculado al cliente del siniestro', () => {
        const { incidentId } = createFullSetup();
        // Create a second client with a different bank
        const client2 = createTestClient('87654321');
        const bank2 = addBankToClient(client2.client.id, { nombre: 'BBVA' });

        const result = createClaim(incidentId, bank2.bank.id, '2024-02-01');

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'BANK_NOT_LINKED')).toBe(true);
    });

    it('falla si fecha está vacía', () => {
        const { incidentId, bankId } = createFullSetup();
        const result = createClaim(incidentId, bankId, '');

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.field === 'fecha')).toBe(true);
    });

    it('falla si siniestroId está vacío', () => {
        const { bankId } = createFullSetup();
        const result = createClaim('', bankId, '2024-02-01');

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.field === 'siniestroId')).toBe(true);
    });

    it('falla si bancoId está vacío', () => {
        const { incidentId } = createFullSetup();
        const result = createClaim(incidentId, '', '2024-02-01');

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.field === 'bancoId')).toBe(true);
    });
});

describe('addClaimDetail', () => {
    it('agrega un detalle de reclamo y recalcula total', () => {
        const { incidentId, bankId } = createFullSetup();
        const claim = createClaim(incidentId, bankId, '2024-02-01');
        const result = addClaimDetail(claim.claim.id, 'cov-1', 500);

        expect(result.success).toBe(true);
        expect(result.detail).toBeDefined();
        expect(result.detail.reclamoId).toBe(claim.claim.id);
        expect(result.detail.coberturaId).toBe('cov-1');
        expect(result.detail.monto).toBe(500);
        expect(result.claimTotal).toBe(500);
    });

    it('acumula montos de múltiples detalles', () => {
        const { incidentId, bankId } = createFullSetup();
        const claim = createClaim(incidentId, bankId, '2024-02-01');
        addClaimDetail(claim.claim.id, 'cov-1', 300);
        const result = addClaimDetail(claim.claim.id, 'cov-2', 200);

        expect(result.claimTotal).toBe(500);
    });

    it('falla si reclamo no existe', () => {
        const result = addClaimDetail('nonexistent', 'cov-1', 100);

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'CLAIM_NOT_FOUND')).toBe(true);
    });

    it('falla si coberturaId está vacío', () => {
        const { incidentId, bankId } = createFullSetup();
        const claim = createClaim(incidentId, bankId, '2024-02-01');
        const result = addClaimDetail(claim.claim.id, '', 100);

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.field === 'coberturaId')).toBe(true);
    });

    it('falla si monto es 0', () => {
        const { incidentId, bankId } = createFullSetup();
        const claim = createClaim(incidentId, bankId, '2024-02-01');
        const result = addClaimDetail(claim.claim.id, 'cov-1', 0);

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'INVALID_AMOUNT')).toBe(true);
    });

    it('falla si monto es negativo', () => {
        const { incidentId, bankId } = createFullSetup();
        const claim = createClaim(incidentId, bankId, '2024-02-01');
        const result = addClaimDetail(claim.claim.id, 'cov-1', -50);

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'INVALID_AMOUNT')).toBe(true);
    });

    it('permite adjuntar evidencia al detalle', () => {
        const { incidentId, bankId } = createFullSetup();
        const claim = createClaim(incidentId, bankId, '2024-02-01');
        const result = addClaimDetail(claim.claim.id, 'cov-1', 100, 'data:image/png;base64,abc');

        expect(result.success).toBe(true);
        expect(result.detail.evidencia).toBe('data:image/png;base64,abc');
    });
});

describe('updateClaimDetail', () => {
    it('actualiza un detalle de reclamo y recalcula total', () => {
        const { incidentId, bankId } = createFullSetup();
        const claim = createClaim(incidentId, bankId, '2024-02-01');
        const detail = addClaimDetail(claim.claim.id, 'cov-1', 300);
        const result = updateClaimDetail(detail.detail.id, 'cov-2', 500);

        expect(result.success).toBe(true);
        expect(result.detail.coberturaId).toBe('cov-2');
        expect(result.detail.monto).toBe(500);
        expect(result.claimTotal).toBe(500);
    });

    it('falla si detalle no existe', () => {
        const result = updateClaimDetail('nonexistent', 'cov-1', 100);

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'CLAIM_DETAIL_NOT_FOUND')).toBe(true);
    });

    it('falla si coberturaId está vacío', () => {
        const { incidentId, bankId } = createFullSetup();
        const claim = createClaim(incidentId, bankId, '2024-02-01');
        const detail = addClaimDetail(claim.claim.id, 'cov-1', 300);
        const result = updateClaimDetail(detail.detail.id, '', 100);

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.field === 'coberturaId')).toBe(true);
    });

    it('falla si monto es 0', () => {
        const { incidentId, bankId } = createFullSetup();
        const claim = createClaim(incidentId, bankId, '2024-02-01');
        const detail = addClaimDetail(claim.claim.id, 'cov-1', 300);
        const result = updateClaimDetail(detail.detail.id, 'cov-1', 0);

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'INVALID_AMOUNT')).toBe(true);
    });
});

describe('calculateClaimTotal', () => {
    it('calcula el total como suma de todos los detalles', () => {
        const { incidentId, bankId } = createFullSetup();
        const claim = createClaim(incidentId, bankId, '2024-02-01');
        addClaimDetail(claim.claim.id, 'cov-1', 100);
        addClaimDetail(claim.claim.id, 'cov-2', 250);
        addClaimDetail(claim.claim.id, 'cov-3', 150);

        const total = calculateClaimTotal(claim.claim.id);
        expect(total).toBe(500);
    });

    it('retorna 0 si no hay detalles', () => {
        const { incidentId, bankId } = createFullSetup();
        const claim = createClaim(incidentId, bankId, '2024-02-01');

        const total = calculateClaimTotal(claim.claim.id);
        expect(total).toBe(0);
    });
});

describe('getAvailableCoverages', () => {
    it('retorna coberturas del seguro asociado al banco del reclamo', () => {
        const { clientId, bankId, accountId, incidentId } = createFullSetup();

        // Create insurance with coverages
        const insRes = createInsurance('Seguro Oro', 'Seguro premium', [
            { nombre: 'Robo', descripcion: 'Cobertura por robo' },
            { nombre: 'Fraude', descripcion: 'Cobertura por fraude' },
        ]);

        // Create card linked to account and assign insurance
        const cardRes = addCard(clientId, [accountId]);
        assignInsurance(cardRes.card.id, insRes.insurance.id);

        // Create claim
        const claimRes = createClaim(incidentId, bankId, '2024-02-01');

        const coverages = getAvailableCoverages(claimRes.claim.id);
        expect(coverages.length).toBe(2);
        expect(coverages.some(c => c.nombre === 'Robo')).toBe(true);
        expect(coverages.some(c => c.nombre === 'Fraude')).toBe(true);
    });

    it('retorna array vacío si el reclamo no existe', () => {
        const coverages = getAvailableCoverages('nonexistent');
        expect(coverages).toEqual([]);
    });

    it('retorna array vacío si no hay tarjetas con seguro', () => {
        const { incidentId, bankId } = createFullSetup();
        const claimRes = createClaim(incidentId, bankId, '2024-02-01');

        const coverages = getAvailableCoverages(claimRes.claim.id);
        expect(coverages).toEqual([]);
    });

    it('retorna array vacío si no hay cuentas bancarias', () => {
        // Create client with bank but no accounts
        const clientRes = createTestClient('11111111');
        const bankRes = addBankToClient(clientRes.client.id, { nombre: 'Interbank' });
        const incidentRes = createIncident(clientRes.client.id, '2024-01-15', {
            file: { name: 'denuncia.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,abc' },
            description: 'Robo',
        });
        const claimRes = createClaim(incidentRes.incident.id, bankRes.bank.id, '2024-02-01');

        const coverages = getAvailableCoverages(claimRes.claim.id);
        expect(coverages).toEqual([]);
    });
});
