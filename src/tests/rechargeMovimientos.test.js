import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
    deltasDeItem, tipoDeItem, addItem, updateItem, createRecarga,
    totalesPorMoneda, resumenPorMoneda, distribucionPorBanco,
} from '../services/rechargeService.js';
import { computeSaldo, bancosDeRecarga, getOrCreateCuadre, addGasto } from '../services/cuadreService.js';
import { registerClient } from '../services/clientService.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { rechargeItemRepository } from '../repositories/rechargeItemRepository.js';

beforeEach(() => {
    localStorage.clear();
});

// El caché de los repositorios sobrevive a localStorage.clear(), así que cada escenario
// necesita un DNI distinto para no chocar con la validación de DNI duplicado.
let dniSeq = 10000000;

/** Cliente + 2 bancos + recarga vacía. */
function escenarioBase() {
    const cli = registerClient({ nombreCompleto: 'Ana', apellidosCompletos: 'Torres', dni: String(++dniSeq) });
    const clienteId = cli.client.id;
    const bcp = bankRepository.save({ nombre: 'BCP', clienteId });
    const inter = bankRepository.save({ nombre: 'Interbank', clienteId });
    const rec = createRecarga({ clienteId, nombre: 'Lote QA', fecha: '2026-08-01' });
    return { clienteId, bcp, inter, recarga: rec.recarga };
}

describe('deltasDeItem — signo por tipo', () => {
    it('ingreso: +1 al total, +1 al banco', () => {
        const d = deltasDeItem({ tipo: 'ingreso', bancoId: 'b1' });
        expect(d.coefTotal).toBe(1);
        expect(d.porBanco).toEqual([{ bancoId: 'b1', coef: 1 }]);
    });

    it('interno: 0 al total, −1 origen y +1 destino', () => {
        const d = deltasDeItem({ tipo: 'interno', bancoId: 'b1', bancoDestinoId: 'b2' });
        expect(d.coefTotal).toBe(0);
        expect(d.porBanco).toEqual([{ bancoId: 'b1', coef: -1 }, { bancoId: 'b2', coef: 1 }]);
    });

    it('salida: −1 al total, −1 al banco origen', () => {
        const d = deltasDeItem({ tipo: 'salida', bancoId: 'b1' });
        expect(d.coefTotal).toBe(-1);
        expect(d.porBanco).toEqual([{ bancoId: 'b1', coef: -1 }]);
    });

    it('ítem antiguo sin tipo y tipo desconocido cuentan como ingreso', () => {
        expect(tipoDeItem({ bancoId: 'b1' })).toBe('ingreso');
        expect(tipoDeItem({ tipo: 'basura', bancoId: 'b1' })).toBe('ingreso');
        expect(deltasDeItem({ bancoId: 'b1' })).toEqual(deltasDeItem({ tipo: 'ingreso', bancoId: 'b1' }));
        expect(deltasDeItem({ tipo: 'basura', bancoId: 'b1' })).toEqual(deltasDeItem({ tipo: 'ingreso', bancoId: 'b1' }));
    });

    it('interno sin destino: no rompe, deja una sola pata', () => {
        const d = deltasDeItem({ tipo: 'interno', bancoId: 'b1' });
        expect(d.coefTotal).toBe(0);
        expect(d.porBanco).toEqual([{ bancoId: 'b1', coef: -1 }]);
    });

    it('invariante: la suma de los coeficientes por banco es igual a coefTotal', () => {
        fc.assert(fc.property(
            fc.record({
                tipo: fc.constantFrom('ingreso', 'interno', 'salida', 'basura', undefined),
                bancoId: fc.constantFrom('b1', 'b2', '', undefined),
                bancoDestinoId: fc.constantFrom('b1', 'b2', '', undefined),
            }),
            (item) => {
                const d = deltasDeItem(item);
                // Solo se cumple cuando no falta ninguna pata (dato completo).
                const patasEsperadas = d.tipo === 'interno' ? 2 : 1;
                if (d.porBanco.length !== patasEsperadas) return true;
                const suma = d.porBanco.reduce((s, x) => s + x.coef, 0);
                return suma === d.coefTotal;
            },
        ));
    });
});

describe('escenario real: 20.000 BCP, 5.000 interno a Interbank, 3.000 salida', () => {
    function cargar() {
        const e = escenarioBase();
        addItem(e.recarga.id, { bancoId: e.bcp.id, monto: 20000, moneda: 'PEN', tipo: 'ingreso' });
        addItem(e.recarga.id, { bancoId: e.bcp.id, monto: 5000, moneda: 'PEN', tipo: 'interno', bancoDestinoId: e.inter.id });
        addItem(e.recarga.id, { bancoId: e.bcp.id, monto: 3000, moneda: 'PEN', tipo: 'salida', destinoDetalle: 'BBVA de Juan Pérez' });
        return e;
    }

    it('el total disponible es 17.000 (20.000 − 3.000)', () => {
        const e = cargar();
        expect(totalesPorMoneda(e.recarga.id)).toEqual({ PEN: 17000 });
        expect(resumenPorMoneda(e.recarga.id)).toEqual({
            PEN: { ingresos: 20000, internos: 5000, salidas: 3000, disponible: 17000 },
        });
    });

    it('el cuadre reparte BCP 12.000 e Interbank 5.000, y suma el total', () => {
        const e = cargar();
        const cuadre = getOrCreateCuadre(e.recarga.id);
        const r = computeSaldo(cuadre);

        expect(r.ingresosSoles).toBe(20000);
        expect(r.salidasSoles).toBe(3000);
        expect(r.recargaSoles).toBe(17000);

        const porBanco = Object.fromEntries(r.porBanco.map(b => [b.bancoNombre, b.recargaSoles]));
        expect(porBanco).toEqual({ BCP: 12000, Interbank: 5000 });

        const suma = r.porBanco.reduce((s, b) => s + b.recargaSoles, 0);
        expect(suma).toBe(r.recargaSoles);
    });

    it('con gastos por 17.000 el cuadre cierra en cero', () => {
        const e = cargar();
        const cuadre = getOrCreateCuadre(e.recarga.id);
        addGasto(cuadre.id, { concepto: 'Devolución BCP', monto: 12000, moneda: 'PEN', bancoId: e.bcp.id });
        addGasto(cuadre.id, { concepto: 'Devolución Interbank', monto: 5000, moneda: 'PEN', bancoId: e.inter.id });

        const r = computeSaldo(cuadre);
        expect(r.saldo).toBe(0);
        expect(r.cuadrado).toBe(true);
        expect(r.porBanco.every(b => Math.abs(b.diff) < 0.005)).toBe(true);
    });

    it('distribucionPorBanco dice cuánto quedó en cada banco', () => {
        const e = cargar();
        const d = distribucionPorBanco(e.recarga.id);
        expect(d.map(b => [b.nombre, b.montos.PEN])).toEqual([['BCP', 12000], ['Interbank', 5000]]);
    });

    it('bancosDeRecarga incluye Interbank, que solo recibió el movimiento interno', () => {
        const e = cargar();
        const nombres = bancosDeRecarga(e.recarga.id).map(b => b.nombre).sort();
        expect(nombres).toEqual(['BCP', 'Interbank']);
    });
});

describe('caso real: dos ingresos al BCP y un traslado a Mi Banco', () => {
    it('el total es la suma de los ingresos y el interno solo reparte', () => {
        const e = escenarioBase();
        addItem(e.recarga.id, { bancoId: e.bcp.id, monto: 18000, moneda: 'PEN', tipo: 'ingreso' });
        addItem(e.recarga.id, { bancoId: e.bcp.id, monto: 19500, moneda: 'PEN', tipo: 'ingreso' });
        addItem(e.recarga.id, { bancoId: e.bcp.id, monto: 14500, moneda: 'PEN', tipo: 'interno', bancoDestinoId: e.inter.id });

        expect(totalesPorMoneda(e.recarga.id)).toEqual({ PEN: 37500 });
        const d = distribucionPorBanco(e.recarga.id);
        expect(d.map(b => [b.nombre, b.montos.PEN])).toEqual([['BCP', 23000], ['Interbank', 14500]]);
    });
});

describe('compatibilidad con datos existentes', () => {
    it('ítems antiguos (sin tipo) dan el mismo total y desglose que antes', () => {
        const e = escenarioBase();
        // Simula filas viejas: guardadas directo, sin la columna tipo.
        rechargeItemRepository.save({ recargaId: e.recarga.id, bancoId: e.bcp.id, monto: 1000, moneda: 'PEN', fecha: '2026-08-01' });
        rechargeItemRepository.save({ recargaId: e.recarga.id, bancoId: e.bcp.id, monto: 2500, moneda: 'PEN', fecha: '2026-08-01' });
        rechargeItemRepository.save({ recargaId: e.recarga.id, bancoId: e.inter.id, monto: 500, moneda: 'PEN', fecha: '2026-08-01' });

        expect(totalesPorMoneda(e.recarga.id)).toEqual({ PEN: 4000 });
        const r = computeSaldo(getOrCreateCuadre(e.recarga.id));
        expect(r.recargaSoles).toBe(4000);
        expect(Object.fromEntries(r.porBanco.map(b => [b.bancoNombre, b.recargaSoles])))
            .toEqual({ BCP: 3500, Interbank: 500 });
    });
});

describe('validaciones de tipo/destino', () => {
    it('interno sin banco destino falla', () => {
        const e = escenarioBase();
        const r = addItem(e.recarga.id, { bancoId: e.bcp.id, monto: 100, moneda: 'PEN', tipo: 'interno' });
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/destino/i);
    });

    it('interno con destino igual al origen falla', () => {
        const e = escenarioBase();
        const r = addItem(e.recarga.id, { bancoId: e.bcp.id, monto: 100, moneda: 'PEN', tipo: 'interno', bancoDestinoId: e.bcp.id });
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/distinto/i);
    });

    it('salida sin detalle de a quién falla', () => {
        const e = escenarioBase();
        const r = addItem(e.recarga.id, { bancoId: e.bcp.id, monto: 100, moneda: 'PEN', tipo: 'salida' });
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/quién/i);
    });

    it('cambiar de interno a ingreso limpia el banco destino', () => {
        const e = escenarioBase();
        const add = addItem(e.recarga.id, { bancoId: e.bcp.id, monto: 5000, moneda: 'PEN', tipo: 'interno', bancoDestinoId: e.inter.id });
        const upd = updateItem(add.item.id, { tipo: 'ingreso' });

        expect(upd.success).toBe(true);
        expect(upd.item.tipo).toBe('ingreso');
        expect(upd.item.bancoDestinoId).toBeNull();
        expect(totalesPorMoneda(e.recarga.id)).toEqual({ PEN: 5000 });
    });

    it('el monto sigue teniendo que ser mayor a 0 en los tres tipos', () => {
        const e = escenarioBase();
        for (const tipo of ['ingreso', 'interno', 'salida']) {
            const r = addItem(e.recarga.id, {
                bancoId: e.bcp.id, monto: 0, moneda: 'PEN', tipo,
                bancoDestinoId: e.inter.id, destinoDetalle: 'x',
            });
            expect(r.success).toBe(false);
        }
    });
});
