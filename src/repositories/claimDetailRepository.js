import { BaseRepository } from './baseRepository.js';

/**
 * Repositorio de detalles de reclamo.
 */
export class ClaimDetailRepository extends BaseRepository {
    constructor() {
        super('claimDetails');
    }

    /**
     * Busca detalles de un reclamo.
     * @param {string} claimId
     * @returns {object[]}
     */
    findByClaimId(claimId) {
        return this.findBy(detail => detail.reclamoId === claimId);
    }
}

export const claimDetailRepository = new ClaimDetailRepository();
