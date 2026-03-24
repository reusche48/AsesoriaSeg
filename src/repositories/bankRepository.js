import { BaseRepository } from './baseRepository.js';

/**
 * Repositorio de bancos asociados a clientes.
 */
export class BankRepository extends BaseRepository {
    constructor() {
        super('banks');
    }

    /**
     * Busca bancos asociados a un cliente.
     * @param {string} clientId
     * @returns {object[]}
     */
    findByClientId(clientId) {
        return this.findBy(bank => bank.clienteId === clientId);
    }
}

export const bankRepository = new BankRepository();
