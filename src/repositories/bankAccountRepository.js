import { BaseRepository } from './baseRepository.js';

/**
 * Repositorio de cuentas bancarias.
 */
export class BankAccountRepository extends BaseRepository {
    constructor() {
        super('bankAccounts');
    }

    /**
     * Busca cuentas bancarias de un cliente.
     * @param {string} clientId
     * @returns {object[]}
     */
    findByClientId(clientId) {
        return this.findBy(account => account.clienteId === clientId);
    }

    /**
     * Busca cuentas bancarias de un banco.
     * @param {string} bankId
     * @returns {object[]}
     */
    findByBankId(bankId) {
        return this.findBy(account => account.bancoId === bankId);
    }

    /**
     * Busca cuentas bancarias de un cliente en un banco específico.
     * @param {string} clientId
     * @param {string} bankId
     * @returns {object[]}
     */
    findByClientAndBank(clientId, bankId) {
        return this.findBy(account => account.clienteId === clientId && account.bancoId === bankId);
    }
}

export const bankAccountRepository = new BankAccountRepository();
