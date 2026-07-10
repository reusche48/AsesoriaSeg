import { BaseRepository } from './baseRepository.js';

/**
 * Repositorio de ítems de recarga: cada fila es un monto por banco dentro de una
 * recarga (banco + monto + moneda + fecha + evidencia opcional).
 */
export class RechargeItemRepository extends BaseRepository {
    constructor() {
        super('recargaItems');
    }

    findByRechargeId(recargaId) {
        return this.findBy(i => i.recargaId === recargaId);
    }
}

export const rechargeItemRepository = new RechargeItemRepository();
