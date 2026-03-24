import { BaseRepository } from './baseRepository.js';

/**
 * Repositorio de siniestros reportados por clientes.
 */
export class IncidentRepository extends BaseRepository {
    constructor() {
        super('incidents');
    }

    /**
     * Busca siniestros de un cliente.
     * @param {string} clientId
     * @returns {object[]}
     */
    findByClientId(clientId) {
        return this.findBy(incident => incident.clienteId === clientId);
    }
}

export const incidentRepository = new IncidentRepository();
