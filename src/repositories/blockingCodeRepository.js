import { BaseRepository } from './baseRepository.js';

/** Códigos de bloqueo de tarjetas registrados en una vuelta. */
export class BlockingCodeRepository extends BaseRepository {
    constructor() { super('blockingCodes'); }
    findByVueltaId(vueltaId) { return this.findBy(c => c.vueltaId === vueltaId); }
}
export const blockingCodeRepository = new BlockingCodeRepository();
