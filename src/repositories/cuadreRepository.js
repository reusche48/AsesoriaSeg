import { BaseRepository } from './baseRepository.js';

/**
 * Repositorio de cuadres (cabecera). Cada cuadre concilia una recarga: reclamos
 * elegidos (CSV de ids) + tipo de cambio para convertir USD a soles.
 */
export class CuadreRepository extends BaseRepository {
    constructor() {
        super('cuadres');
    }

    findByRecargaId(recargaId) {
        return this.findBy(c => c.recargaId === recargaId);
    }
}

export const cuadreRepository = new CuadreRepository();
