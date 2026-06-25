import { paymentRepository } from '../repositories/paymentRepository.js';
import { cardRepository } from '../repositories/cardRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';

/**
 * Servicio de pagos del seguro de protección de tarjetas (por banco).
 * El seguro se paga por banco; la periodicidad puede ser mensual o anual.
 */

export const PERIODICIDADES = [
    { value: 'mensual', label: 'Mensual' },
    { value: 'anual', label: 'Anual' },
];

/** Bancos del cliente que tienen al menos una tarjeta activa con seguro. */
export function bancosConSeguro(clientId) {
    const cards = cardRepository.findByClientId(clientId)
        .filter(c => c.seguroId && c.activo !== false && Number(c.activo) !== 0);
    const ids = [...new Set(cards.map(c => c.bancoId))];
    return ids.map(id => ({ id, nombre: bankRepository.getById(id)?.nombre || '—' }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export function getPaymentsForClient(clientId) {
    return paymentRepository.findByClientId(clientId)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

function parseFecha(str) {
    if (!str) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(str);
}

/** Próximo vencimiento a partir de la fecha de pago y la periodicidad. */
function proximoVencimiento(fecha, periodicidad) {
    const d = parseFecha(fecha);
    if (!d) return null;
    if (periodicidad === 'anual') d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1); // mensual
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Estado de pago por banco para un cliente.
 * @returns {Array<{bancoId,bancoNombre,ultimoPago,periodicidad,proximoVence,estado,dias}>}
 *   estado: 'al_dia' | 'vencido' | 'sin_pago'
 */
export function getPaymentStatusForClient(clientId) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return bancosConSeguro(clientId).map(banco => {
        const pagos = paymentRepository.findByClientAndBank(clientId, banco.id)
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        if (pagos.length === 0) {
            return { bancoId: banco.id, bancoNombre: banco.nombre, ultimoPago: null, periodicidad: null, proximoVence: null, estado: 'sin_pago', dias: null };
        }
        const ultimo = pagos[0];
        const venc = proximoVencimiento(ultimo.fecha, ultimo.periodicidad);
        const dias = venc ? Math.floor((venc - hoy) / 86400000) : null;
        const estado = (dias !== null && dias < 0) ? 'vencido' : 'al_dia';
        return {
            bancoId: banco.id, bancoNombre: banco.nombre,
            ultimoPago: ultimo.fecha, periodicidad: ultimo.periodicidad,
            proximoVence: venc ? venc.toISOString().split('T')[0] : null,
            estado, dias,
        };
    });
}

/** ¿El cliente está al día en TODOS los bancos con seguro? (true si no hay bancos con seguro) */
export function isPagosAlDia(clientId) {
    const st = getPaymentStatusForClient(clientId);
    if (st.length === 0) return true;
    return st.every(s => s.estado === 'al_dia');
}

/**
 * Para iniciar la vuelta: cada banco con seguro debe tener un pago dentro de
 * los últimos `days` días (regla: el seguro debe estar fresco).
 * @returns {{ok:boolean, faltan:string[]}}
 */
export function paymentsRecentForVuelta(clientId, days = 30) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const faltan = [];
    for (const banco of bancosConSeguro(clientId)) {
        const ultimo = paymentRepository.findByClientAndBank(clientId, banco.id)
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
        if (!ultimo) { faltan.push(banco.nombre); continue; }
        const d = parseFecha(ultimo.fecha); d.setHours(0, 0, 0, 0);
        if (Math.floor((hoy - d) / 86400000) > days) faltan.push(banco.nombre);
    }
    return { ok: faltan.length === 0, faltan };
}

/** Registrar un pago. */
export function registerPayment(data) {
    const errors = [];
    if (!data.clienteId) errors.push('Cliente requerido.');
    if (!data.bancoId) errors.push('Banco requerido.');
    if (!data.fecha) errors.push('Fecha del pago requerida.');
    const periodicidad = data.periodicidad === 'anual' ? 'anual' : 'mensual';
    if (errors.length) return { success: false, error: errors.join(' ') };

    const pago = paymentRepository.save({
        clienteId: data.clienteId,
        bancoId: data.bancoId,
        fecha: data.fecha,
        periodicidad,
        monto: data.monto ? Number(data.monto) : null,
        moneda: data.moneda || (data.monto ? 'PEN' : null),
        evidencia: data.evidencia || null,
        observaciones: (data.observaciones || '').trim() || null,
    });
    return { success: true, pago };
}

export function deletePayment(id) {
    paymentRepository.delete(id);
}
