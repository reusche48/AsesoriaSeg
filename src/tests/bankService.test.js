import { describe, it, expect, beforeEach } from 'vitest';
import { addBankToClient, addBankAccount } from '../services/bankService.js';
import { registerClient } from '../services/clientService.js';

/** Helper: creates a valid client and returns the result */
function createTestClient() {
    const dni = '12345678';
    return registerClient({
        nombreCompleto: 'Juan',
        apellidosCompletos: 'Pérez',
        dni,
    });
}

beforeEach(() => {
    localStorage.clear();
});

describe('addBankToClient', () => {
    it('asocia un banco a un cliente existente', () => {
        const client = createTestClient();
        const result = addBankToClient(client.client.id, { nombre: 'BCP' });

        expect(result.success).toBe(true);
        expect(result.bank).toBeDefined();
        expect(result.bank.nombre).toBe('BCP');
        expect(result.bank.clienteId).toBe(client.client.id);
        expect(result.bank.id).toBeDefined();
    });

    it('falla si clientId no existe', () => {
        const result = addBankToClient('nonexistent-id', { nombre: 'BCP' });

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'CLIENT_NOT_FOUND')).toBe(true);
    });

    it('falla si clientId está vacío', () => {
        const result = addBankToClient('', { nombre: 'BCP' });

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'REQUIRED_FIELD' && e.field === 'clientId')).toBe(true);
    });

    it('falla si nombre del banco está vacío', () => {
        const client = createTestClient();
        const result = addBankToClient(client.client.id, { nombre: '' });

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.field === 'nombre')).toBe(true);
    });

    it('falla si bankData es null', () => {
        const client = createTestClient();
        const result = addBankToClient(client.client.id, null);

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.field === 'nombre')).toBe(true);
    });

    it('permite asociar múltiples bancos al mismo cliente', () => {
        const client = createTestClient();
        const r1 = addBankToClient(client.client.id, { nombre: 'BCP' });
        const r2 = addBankToClient(client.client.id, { nombre: 'BBVA' });

        expect(r1.success).toBe(true);
        expect(r2.success).toBe(true);
        expect(r1.bank.id).not.toBe(r2.bank.id);
    });

    it('trims el nombre del banco', () => {
        const client = createTestClient();
        const result = addBankToClient(client.client.id, { nombre: '  BCP  ' });

        expect(result.success).toBe(true);
        expect(result.bank.nombre).toBe('BCP');
    });
});

describe('addBankAccount', () => {
    it('registra una cuenta bancaria con moneda PEN', () => {
        const client = createTestClient();
        const bank = addBankToClient(client.client.id, { nombre: 'BCP' });
        const result = addBankAccount(client.client.id, bank.bank.id, 'PEN');

        expect(result.success).toBe(true);
        expect(result.account).toBeDefined();
        expect(result.account.moneda).toBe('PEN');
        expect(result.account.clienteId).toBe(client.client.id);
        expect(result.account.bancoId).toBe(bank.bank.id);
    });

    it('registra una cuenta bancaria con moneda USD', () => {
        const client = createTestClient();
        const bank = addBankToClient(client.client.id, { nombre: 'BCP' });
        const result = addBankAccount(client.client.id, bank.bank.id, 'USD');

        expect(result.success).toBe(true);
        expect(result.account.moneda).toBe('USD');
    });

    it('rechaza moneda inválida', () => {
        const client = createTestClient();
        const bank = addBankToClient(client.client.id, { nombre: 'BCP' });
        const result = addBankAccount(client.client.id, bank.bank.id, 'EUR');

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'INVALID_CURRENCY')).toBe(true);
    });

    it('falla si clientId no existe', () => {
        const result = addBankAccount('nonexistent', 'some-bank', 'PEN');

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'CLIENT_NOT_FOUND')).toBe(true);
    });

    it('falla si bankId no existe', () => {
        const client = createTestClient();
        const result = addBankAccount(client.client.id, 'nonexistent', 'PEN');

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'BANK_NOT_FOUND')).toBe(true);
    });

    it('falla si el banco no pertenece al cliente', () => {
        const client1 = createTestClient();
        // Create second client with different DNI
        const client2 = registerClient({
            nombreCompleto: 'María',
            apellidosCompletos: 'López',
            dni: '87654321',
        });
        const bank = addBankToClient(client1.client.id, { nombre: 'BCP' });
        const result = addBankAccount(client2.client.id, bank.bank.id, 'PEN');

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.code === 'BANK_NOT_LINKED')).toBe(true);
    });

    it('falla si moneda está vacía', () => {
        const client = createTestClient();
        const bank = addBankToClient(client.client.id, { nombre: 'BCP' });
        const result = addBankAccount(client.client.id, bank.bank.id, '');

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.field === 'moneda')).toBe(true);
    });

    it('permite múltiples cuentas del mismo banco', () => {
        const client = createTestClient();
        const bank = addBankToClient(client.client.id, { nombre: 'BCP' });
        const r1 = addBankAccount(client.client.id, bank.bank.id, 'PEN');
        const r2 = addBankAccount(client.client.id, bank.bank.id, 'USD');

        expect(r1.success).toBe(true);
        expect(r2.success).toBe(true);
        expect(r1.account.id).not.toBe(r2.account.id);
    });
});
