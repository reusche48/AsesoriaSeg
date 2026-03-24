import { BaseRepository } from './baseRepository.js';

/**
 * Repositorio de adelantos de dinero a clientes.
 */
export class AdvanceRepository extends BaseRepository {
    constructor() {
        super('advances');
    }

    /**
     * Busca adelantos de un cliente.
     * @param {string} clientId
     * @returns {object[]}
     */
    findByClientId(clientId) {
        return this.findBy(a => a.clienteId === clientId);
    }
}

export const advanceRepository = new AdvanceRepository();
