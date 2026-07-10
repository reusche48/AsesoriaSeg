import { BaseRepository } from './baseRepository.js';

/**
 * Repositorio de recargas (cabecera). Cada recarga agrupa varios montos por banco
 * bajo un nombre, para un cliente.
 */
export class RechargeRepository extends BaseRepository {
    constructor() {
        super('recargas');
    }

    findByClientId(clientId) {
        return this.findBy(r => r.clienteId === clientId);
    }
}

export const rechargeRepository = new RechargeRepository();
