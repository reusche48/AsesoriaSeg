import { describe, it, expect, beforeEach } from 'vitest';
import { registerClient } from '../services/clientService.js';
import { addBankToClient, addBankAccount } from '../services/bankService.js';
import { addCard, assignInsurance } from '../services/cardService.js';
import { createInsurance } from '../services/insuranceService.js';
import { createIncident } from '../services/incidentService.js';
import { createClaim, addClaimDetail, updateClaimDetail, calculateClaimTotal, getAvailableCoverages } from '../services/claimService.js';
import { addClaimEvent, getClaimEvents } from '../services/claimEventService.js';

/**
 * Helper: genera un DNI válido de 8 dígitos.
 */
function makeDNI(digits8) {
    return digits8;
}

/**
 * Helper: registra un cliente válido y retorna el resultado.
 */
function createValidClient(dniDigits = '10203040') {
    return registerClient({
        nombreCompleto: 'Juan',
        apellidosCompletos: 'Pérez López',
        dni: makeDNI(dniDigits),
    });
}

describe('Integración: Cliente → Banco → Cuentas → Tarjeta → Seguro con auto-aseguramiento', () => {
    beforeEach(() => localStorage.clear());

    it('flujo completo de registro y auto-aseguramiento por banco', () => {
        // 1. Registrar cliente
        const clientRes = createValidClient('10203040');
        expect(clientRes.success).toBe(true);
        const clientId = clientRes.client.id;

        // 2. Asociar un banco al cliente
        const bankRes = addBankToClient(clientId, { nombre: 'Banco Nacional' });
        expect(bankRes.success).toBe(true);
        const bankId = bankRes.bank.id;

        // 3. Crear dos cuentas bancarias en ese banco
        const acc1 = addBankAccount(clientId, bankId, 'PEN');
        expect(acc1.success).toBe(true);
        const acc2 = addBankAccount(clientId, bankId, 'USD');
        expect(acc2.success).toBe(true);

        // 4. Crear dos tarjetas, cada una vinculada a una cuenta distinta del mismo banco
        const card1Res = addCard(clientId, [acc1.account.id]);
        expect(card1Res.success).toBe(true);
        const card2Res = addCard(clientId, [acc2.account.id]);
        expect(card2Res.success).toBe(true);

        // 5. Crear un seguro con coberturas
        const insRes = createInsurance('Seguro Oro', 'Seguro premium', [
            { nombre: 'Robo', descripcion: 'Cobertura contra robo' },
            { nombre: 'Fraude', descripcion: 'Cobertura contra fraude' },
        ]);
        expect(insRes.success).toBe(true);

        // 6. Asignar seguro a la primera tarjeta → auto-aseguramiento debe cubrir la segunda
        const assignRes = assignInsurance(card1Res.card.id, insRes.insurance.id);
        expect(assignRes.success).toBe(true);
        expect(assignRes.card.seguroId).toBe(insRes.insurance.id);
        expect(assignRes.autoInsuredCards).toHaveLength(1);
        expect(assignRes.autoInsuredCards[0].id).toBe(card2Res.card.id);
        expect(assignRes.autoInsuredCards[0].seguroId).toBe(insRes.insurance.id);
    });

    it('detecta conflictos cuando tarjetas del mismo banco ya tienen otro seguro', () => {
        const clientRes = createValidClient('11223344');
        const clientId = clientRes.client.id;

        const bankRes = addBankToClient(clientId, { nombre: 'Banco Sur' });
        const bankId = bankRes.bank.id;

        const acc1 = addBankAccount(clientId, bankId, 'PEN');
        const acc2 = addBankAccount(clientId, bankId, 'USD');

        // Crear dos seguros distintos
        const ins1 = createInsurance('Seguro A', 'Desc A', [{ nombre: 'Cob A' }]);
        const ins2 = createInsurance('Seguro B', 'Desc B', [{ nombre: 'Cob B' }]);

        // Crear card1 sola y asignarle ins1 (no hay otras tarjetas aún)
        const card1 = addCard(clientId, [acc1.account.id]);
        const assign1 = assignInsurance(card1.card.id, ins1.insurance.id);
        expect(assign1.success).toBe(true);
        expect(assign1.autoInsuredCards).toHaveLength(0);

        // Crear card2 en el mismo banco (sin seguro)
        const card2 = addCard(clientId, [acc2.account.id]);

        // Asignar ins2 a card2 → auto-aseguramiento detecta card1 con ins1 → conflicto
        const assign2 = assignInsurance(card2.card.id, ins2.insurance.id);
        expect(assign2.success).toBe(true);
        expect(assign2.card.seguroId).toBe(ins2.insurance.id);
        expect(assign2.conflicts).toHaveLength(1);
        expect(assign2.conflicts[0].id).toBe(card1.card.id);
        expect(assign2.autoInsuredCards).toHaveLength(0);

        // Con forceReplace, card1 se reemplaza
        const forced = assignInsurance(card2.card.id, ins2.insurance.id, true);
        expect(forced.success).toBe(true);
        expect(forced.autoInsuredCards).toHaveLength(1);
        expect(forced.autoInsuredCards[0].id).toBe(card1.card.id);
        expect(forced.autoInsuredCards[0].seguroId).toBe(ins2.insurance.id);
        expect(forced.conflicts).toHaveLength(0);
    });
});

describe('Integración: Siniestro → Reclamo → Detalles con coberturas → Monto total', () => {
    beforeEach(() => localStorage.clear());

    it('flujo completo de siniestro, reclamo, detalles y cálculo de monto', () => {
        // 1. Registrar cliente
        const clientRes = createValidClient('55667788');
        const clientId = clientRes.client.id;

        // 2. Crear banco, cuenta, tarjeta y seguro con coberturas
        const bankRes = addBankToClient(clientId, { nombre: 'Banco Central' });
        const bankId = bankRes.bank.id;

        const accRes = addBankAccount(clientId, bankId, 'PEN');
        const cardRes = addCard(clientId, [accRes.account.id]);

        const insRes = createInsurance('Seguro Total', 'Cobertura completa', [
            { nombre: 'Robo', descripcion: 'Contra robo' },
            { nombre: 'Incendio', descripcion: 'Contra incendio' },
            { nombre: 'Fraude', descripcion: 'Contra fraude' },
        ]);
        assignInsurance(cardRes.card.id, insRes.insurance.id);

        // 3. Registrar siniestro
        const incidentRes = createIncident(clientId, '2025-06-01', {
            file: { name: 'denuncia.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,abc' },
            description: 'Robo de tarjeta en cajero automático',
        });
        expect(incidentRes.success).toBe(true);

        // 4. Crear reclamo vinculado al siniestro y banco del cliente
        const claimRes = createClaim(incidentRes.incident.id, bankId, '2025-06-05', 'Reclamo urgente');
        expect(claimRes.success).toBe(true);
        expect(claimRes.claim.montoTotal).toBe(0);

        // 5. Verificar coberturas disponibles (deben ser las del seguro asignado al banco)
        const coverages = getAvailableCoverages(claimRes.claim.id);
        expect(coverages).toHaveLength(3);
        const coverageNames = coverages.map(c => c.nombre).sort();
        expect(coverageNames).toEqual(['Fraude', 'Incendio', 'Robo']);

        // 6. Agregar detalles de reclamo con coberturas y montos
        const detail1 = addClaimDetail(claimRes.claim.id, coverages[0].id, 1500.50);
        expect(detail1.success).toBe(true);

        const detail2 = addClaimDetail(claimRes.claim.id, coverages[1].id, 2300.00);
        expect(detail2.success).toBe(true);

        // 7. Verificar monto total calculado automáticamente
        expect(detail2.claimTotal).toBeCloseTo(1500.50 + 2300.00, 2);

        // 8. Modificar un detalle y verificar recálculo
        const updated = updateClaimDetail(detail1.detail.id, coverages[0].id, 2000.00);
        expect(updated.success).toBe(true);
        expect(updated.claimTotal).toBeCloseTo(2000.00 + 2300.00, 2);

        // 9. Verificar que el total almacenado en el reclamo es correcto
        const finalTotal = calculateClaimTotal(claimRes.claim.id);
        expect(finalTotal).toBeCloseTo(4300.00, 2);
    });

    it('rechaza reclamo con banco no vinculado al cliente del siniestro', () => {
        const client1 = createValidClient('12121212');
        const client2 = createValidClient('34343434');

        const bank1 = addBankToClient(client1.client.id, { nombre: 'Banco A' });
        const bank2 = addBankToClient(client2.client.id, { nombre: 'Banco B' });

        const incident = createIncident(client1.client.id, '2025-07-01', {
            file: { name: 'report.jpg', type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,xyz' },
            description: 'Siniestro de prueba',
        });

        // Intentar crear reclamo con banco de otro cliente
        const claimRes = createClaim(incident.incident.id, bank2.bank.id, '2025-07-02');
        expect(claimRes.success).toBe(false);
        expect(claimRes.errors.some(e => e.code === 'BANK_NOT_LINKED')).toBe(true);
    });
});

describe('Integración: Reclamo → Eventos → Orden cronológico', () => {
    beforeEach(() => localStorage.clear());

    it('flujo completo de eventos de reclamo con orden cronológico', () => {
        // Setup: cliente, banco, siniestro, reclamo
        const clientRes = createValidClient('99887766');
        const clientId = clientRes.client.id;

        const bankRes = addBankToClient(clientId, { nombre: 'Banco Norte' });
        const bankId = bankRes.bank.id;

        const incidentRes = createIncident(clientId, '2025-08-01', {
            file: { name: 'denuncia.png', type: 'image/png', dataUrl: 'data:image/png;base64,def' },
            description: 'Incidente reportado',
        });

        const claimRes = createClaim(incidentRes.incident.id, bankId, '2025-08-05');
        expect(claimRes.success).toBe(true);
        const claimId = claimRes.claim.id;

        // Agregar eventos en orden desordenado
        const ev3 = addClaimEvent(claimId, '2025-08-20', 'Resolución final');
        expect(ev3.success).toBe(true);

        const ev1 = addClaimEvent(claimId, '2025-08-06', 'Recepción del reclamo');
        expect(ev1.success).toBe(true);

        const ev2 = addClaimEvent(claimId, '2025-08-12', 'Investigación en curso');
        expect(ev2.success).toBe(true);

        // Consultar eventos → deben estar ordenados cronológicamente
        const events = getClaimEvents(claimId);
        expect(events).toHaveLength(3);
        expect(events[0].fecha).toBe('2025-08-06');
        expect(events[1].fecha).toBe('2025-08-12');
        expect(events[2].fecha).toBe('2025-08-20');
    });

    it('permite adjuntar evidencia a eventos', () => {
        const clientRes = createValidClient('44556677');
        const clientId = clientRes.client.id;

        const bankRes = addBankToClient(clientId, { nombre: 'Banco Este' });

        const incidentRes = createIncident(clientId, '2025-09-01', {
            file: { name: 'doc.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,ghi' },
            description: 'Descripción del siniestro',
        });

        const claimRes = createClaim(incidentRes.incident.id, bankRes.bank.id, '2025-09-05');
        const claimId = claimRes.claim.id;

        const evRes = addClaimEvent(claimId, '2025-09-10', 'Evidencia adjunta', 'data:image/png;base64,evidence123');
        expect(evRes.success).toBe(true);
        expect(evRes.event.evidencia).toBe('data:image/png;base64,evidence123');

        const events = getClaimEvents(claimId);
        expect(events).toHaveLength(1);
        expect(events[0].evidencia).toBe('data:image/png;base64,evidence123');
    });
});
