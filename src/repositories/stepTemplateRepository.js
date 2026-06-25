import { BaseRepository } from './baseRepository.js';

/**
 * Repositorio de plantillas de pasos del trámite (por banco o generales).
 */
export class StepTemplateRepository extends BaseRepository {
    constructor() {
        super('stepTemplates');
    }

    /** Plantillas de un banco específico, ordenadas. */
    findByBankId(bankId) {
        return this.findBy(t => t.bancoId === bankId)
            .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
    }

    /** Plantillas generales (sin banco). */
    findGenerales() {
        return this.findBy(t => !t.bancoId)
            .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
    }
}

export const stepTemplateRepository = new StepTemplateRepository();
