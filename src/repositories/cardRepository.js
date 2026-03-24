import { BaseRepository } from './baseRepository.js';

/**
 * Repositorio de tarjetas asociadas a cuentas bancarias.
 */
export class CardRepository extends BaseRepository {
    constructor() {
        super('cards');
    }

    /**
     * Busca tarjetas de un cliente.
     * @param {string} clientId
     * @returns {object[]}
     */
    findByClientId(clientId) {
        return this.findBy(card => card.clienteId === clientId);
    }

    /**
     * Busca tarjetas de un banco.
     * @param {string} bankId
     * @returns {object[]}
     */
    findByBankId(bankId) {
        return this.findBy(card => card.bancoId === bankId);
    }

    /**
     * Busca tarjetas que estén asociadas a alguna de las cuentas indicadas.
     * Útil para la regla de auto-aseguramiento por banco.
     * @param {string[]} accountIds
     * @returns {object[]}
     */
    findByAccountIds(accountIds) {
        const idSet = new Set(accountIds);
        return this.findBy(card =>
            Array.isArray(card.cuentaIds) && card.cuentaIds.some(id => idSet.has(id))
        );
    }
}

export const cardRepository = new CardRepository();
