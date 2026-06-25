import { BaseRepository } from './baseRepository.js';

/**
 * Repositorio de pasos instanciados por reclamo (copia congelada de la plantilla).
 */
export class ClaimStepRepository extends BaseRepository {
    constructor() {
        super('claimSteps');
    }

    /** Pasos de un reclamo, ordenados. */
    findByClaimId(reclamoId) {
        return this.findBy(s => s.reclamoId === reclamoId)
            .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
    }
}

export const claimStepRepository = new ClaimStepRepository();
