import { BaseRepository } from './baseRepository.js';

/**
 * Repositorio de eventos de seguimiento de reclamos.
 */
export class ClaimEventRepository extends BaseRepository {
    constructor() {
        super('claimEvents');
    }

    /**
     * Busca eventos de un reclamo.
     * @param {string} claimId
     * @returns {object[]}
     */
    findByClaimId(claimId) {
        return this.findBy(event => event.reclamoId === claimId);
    }
}

export const claimEventRepository = new ClaimEventRepository();
