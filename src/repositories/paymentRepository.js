import { BaseRepository } from './baseRepository.js';

/**
 * Repositorio de pagos del seguro (por cliente y banco).
 */
export class PaymentRepository extends BaseRepository {
    constructor() {
        super('payments');
    }

    findByClientId(clientId) {
        return this.findBy(p => p.clienteId === clientId);
    }

    findByClientAndBank(clientId, bankId) {
        return this.findBy(p => p.clienteId === clientId && p.bancoId === bankId);
    }
}

export const paymentRepository = new PaymentRepository();
