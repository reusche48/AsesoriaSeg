import { BaseRepository } from './baseRepository.js';

/**
 * Repositorio de reclamos vinculados a siniestros.
 */
export class ClaimRepository extends BaseRepository {
    constructor() {
        super('claims');
    }

    /**
     * Busca reclamos de un siniestro.
     * @param {string} incidentId
     * @returns {object[]}
     */
    findByIncidentId(incidentId) {
        return this.findBy(claim => claim.siniestroId === incidentId);
    }

    /**
     * Busca reclamos asociados a un banco.
     * @param {string} bankId
     * @returns {object[]}
     */
    findByBankId(bankId) {
        return this.findBy(claim => claim.bancoId === bankId);
    }
}

export const claimRepository = new ClaimRepository();
