import { BaseRepository } from './baseRepository.js';

/** Repositorio de "vueltas" (una por cliente, abierta/cerrada). */
export class VueltaRepository extends BaseRepository {
    constructor() { super('vueltas'); }
    findByClientId(clientId) { return this.findBy(v => v.clienteId === clientId); }
    getOpenForClient(clientId) {
        return this.findBy(v => v.clienteId === clientId && v.estado === 'abierta')[0] || null;
    }
}
export const vueltaRepository = new VueltaRepository();
