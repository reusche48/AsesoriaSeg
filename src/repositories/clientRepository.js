import { BaseRepository } from './baseRepository.js';

/**
 * Repositorio de clientes con búsqueda por DNI y nombre.
 */
export class ClientRepository extends BaseRepository {
    constructor() {
        super('clients');
    }

    /**
     * Busca un cliente por DNI (coincidencia exacta).
     * @param {string} dni
     * @returns {object|null}
     */
    findByDNI(dni) {
        return this.findBy(client => client.dni === dni)[0] || null;
    }

    /**
     * Busca clientes cuyo nombre completo o apellidos contengan
     * la cadena de búsqueda (case-insensitive).
     * @param {string} name
     * @returns {object[]}
     */
    searchByName(name) {
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return [];
        }
        const query = name.toLowerCase().trim();
        return this.findBy(client => {
            const fullName = (client.nombreCompleto || '').toLowerCase();
            const lastName = (client.apellidosCompletos || '').toLowerCase();
            return fullName.includes(query) || lastName.includes(query);
        });
    }
}

export const clientRepository = new ClientRepository();
