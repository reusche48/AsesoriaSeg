import { BaseRepository } from './baseRepository.js';

/**
 * Repositorio de seguros.
 */
export class InsuranceRepository extends BaseRepository {
    constructor() {
        super('insurances');
    }

    /**
     * Busca seguros asociados a un banco.
     * @param {string} bankId
     * @returns {object[]}
     */
    findByBankId(bankId) {
        return this.findBy(ins => ins.bancoId === bankId);
    }
}

export const insuranceRepository = new InsuranceRepository();
