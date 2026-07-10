import { BaseRepository } from './baseRepository.js';

/**
 * Repositorio de gastos de un cuadre (comida, pasajes, etc.): cada fila reduce el
 * saldo hasta cuadrar en 0.
 */
export class CuadreGastoRepository extends BaseRepository {
    constructor() {
        super('cuadreGastos');
    }

    findByCuadreId(cuadreId) {
        return this.findBy(g => g.cuadreId === cuadreId);
    }
}

export const cuadreGastoRepository = new CuadreGastoRepository();
