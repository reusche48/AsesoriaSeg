import { BaseRepository } from './baseRepository.js';

/** Evidencias por banco capturadas en una vuelta. */
export class VueltaEvidenceRepository extends BaseRepository {
    constructor() { super('vueltaEvidencias'); }
    findByVueltaId(vueltaId) { return this.findBy(e => e.vueltaId === vueltaId); }
}
export const vueltaEvidenceRepository = new VueltaEvidenceRepository();
