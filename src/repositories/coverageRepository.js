import { BaseRepository } from './baseRepository.js';

/**
 * Repositorio de coberturas asociadas a seguros.
 */
export class CoverageRepository extends BaseRepository {
    constructor() {
        super('coverages');
    }

    /**
     * Busca coberturas asociadas a un seguro.
     * @param {string} insuranceId
     * @returns {object[]}
     */
    findByInsuranceId(insuranceId) {
        return this.findBy(coverage => coverage.seguroId === insuranceId);
    }
}

export const coverageRepository = new CoverageRepository();
