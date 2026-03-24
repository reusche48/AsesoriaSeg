import { describe, it, expect, beforeEach } from 'vitest';
import { BankRepository } from '../repositories/bankRepository.js';
import { BankAccountRepository } from '../repositories/bankAccountRepository.js';
import { CardRepository } from '../repositories/cardRepository.js';

describe('BankRepository', () => {
    let repo;

    beforeEach(() => {
        localStorage.clear();
        repo = new BankRepository();
    });

    it('usa la clave de colección "banks"', () => {
        expect(repo.collectionKey).toBe('banks');
    });

    describe('findByClientId', () => {
        it('retorna bancos del cliente indicado', () => {
            repo.save({ nombre: 'BCP', clienteId: 'c1' });
            repo.save({ nombre: 'BBVA', clienteId: 'c1' });
            repo.save({ nombre: 'Interbank', clienteId: 'c2' });

            const result = repo.findByClientId('c1');
            expect(result).toHaveLength(2);
            expect(result.map(b => b.nombre)).toEqual(['BCP', 'BBVA']);
        });

        it('retorna array vacío si el cliente no tiene bancos', () => {
            repo.save({ nombre: 'BCP', clienteId: 'c1' });
            expect(repo.findByClientId('c99')).toEqual([]);
        });
    });
});

describe('BankAccountRepository', () => {
    let repo;

    beforeEach(() => {
        localStorage.clear();
        repo = new BankAccountRepository();
    });

    it('usa la clave de colección "bankAccounts"', () => {
        expect(repo.collectionKey).toBe('bankAccounts');
    });

    describe('findByClientId', () => {
        it('retorna cuentas del cliente indicado', () => {
            repo.save({ clienteId: 'c1', bancoId: 'b1', moneda: 'PEN' });
            repo.save({ clienteId: 'c2', bancoId: 'b1', moneda: 'USD' });

            expect(repo.findByClientId('c1')).toHaveLength(1);
        });
    });

    describe('findByBankId', () => {
        it('retorna cuentas del banco indicado', () => {
            repo.save({ clienteId: 'c1', bancoId: 'b1', moneda: 'PEN' });
            repo.save({ clienteId: 'c1', bancoId: 'b2', moneda: 'USD' });
            repo.save({ clienteId: 'c2', bancoId: 'b1', moneda: 'PEN' });

            expect(repo.findByBankId('b1')).toHaveLength(2);
        });
    });

    describe('findByClientAndBank', () => {
        it('retorna cuentas de un cliente en un banco específico', () => {
            repo.save({ clienteId: 'c1', bancoId: 'b1', moneda: 'PEN' });
            repo.save({ clienteId: 'c1', bancoId: 'b1', moneda: 'USD' });
            repo.save({ clienteId: 'c1', bancoId: 'b2', moneda: 'PEN' });
            repo.save({ clienteId: 'c2', bancoId: 'b1', moneda: 'PEN' });

            const result = repo.findByClientAndBank('c1', 'b1');
            expect(result).toHaveLength(2);
            result.forEach(acc => {
                expect(acc.clienteId).toBe('c1');
                expect(acc.bancoId).toBe('b1');
            });
        });

        it('retorna array vacío si no hay coincidencias', () => {
            repo.save({ clienteId: 'c1', bancoId: 'b1', moneda: 'PEN' });
            expect(repo.findByClientAndBank('c1', 'b99')).toEqual([]);
        });
    });
});

describe('CardRepository', () => {
    let repo;

    beforeEach(() => {
        localStorage.clear();
        repo = new CardRepository();
    });

    it('usa la clave de colección "cards"', () => {
        expect(repo.collectionKey).toBe('cards');
    });

    describe('findByClientId', () => {
        it('retorna tarjetas del cliente indicado', () => {
            repo.save({ numero: '1111', clienteId: 'c1', cuentaIds: ['a1'], seguroId: null });
            repo.save({ numero: '2222', clienteId: 'c2', cuentaIds: ['a2'], seguroId: null });

            expect(repo.findByClientId('c1')).toHaveLength(1);
            expect(repo.findByClientId('c1')[0].numero).toBe('1111');
        });
    });

    describe('findByAccountIds', () => {
        it('retorna tarjetas vinculadas a alguna de las cuentas indicadas', () => {
            repo.save({ numero: '1111', clienteId: 'c1', cuentaIds: ['a1', 'a2'], seguroId: null });
            repo.save({ numero: '2222', clienteId: 'c1', cuentaIds: ['a3'], seguroId: null });
            repo.save({ numero: '3333', clienteId: 'c1', cuentaIds: ['a2', 'a4'], seguroId: null });

            const result = repo.findByAccountIds(['a1', 'a4']);
            expect(result).toHaveLength(2);
            expect(result.map(c => c.numero).sort()).toEqual(['1111', '3333']);
        });

        it('retorna array vacío si ninguna tarjeta coincide', () => {
            repo.save({ numero: '1111', clienteId: 'c1', cuentaIds: ['a1'], seguroId: null });
            expect(repo.findByAccountIds(['a99'])).toEqual([]);
        });

        it('maneja tarjetas sin cuentaIds gracefully', () => {
            repo.save({ numero: '1111', clienteId: 'c1', seguroId: null });
            expect(repo.findByAccountIds(['a1'])).toEqual([]);
        });
    });
});
