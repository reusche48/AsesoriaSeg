import { vueltaRepository } from '../repositories/vueltaRepository.js';
import { vueltaEvidenceRepository } from '../repositories/vueltaEvidenceRepository.js';
import { blockingCodeRepository } from '../repositories/blockingCodeRepository.js';
import { cardRepository } from '../repositories/cardRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { getPaymentStatusForClient } from './paymentService.js';

/**
 * Servicio de "La Vuelta".
 * - Una vuelta cubre solo los bancos cuyo seguro está AL DÍA en ese momento.
 * - Un cliente puede tener VARIAS vueltas (cada una cubre bancos distintos):
 *   los bancos que faltan por pagar se hacen en otra vuelta más adelante.
 * - No se cierra hasta registrar un código de bloqueo por cada banco de la vuelta.
 */

export const TIPOS_EVIDENCIA = [
    { value: 'retiro_cajero', label: 'Retiro de cajero' },
    { value: 'compra', label: 'Compra' },
    { value: 'transferencia', label: 'Transferencia' },
    { value: 'otro', label: 'Otro' },
];

export function getVueltas(clientId) {
    return vueltaRepository.findByClientId(clientId).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}
export function getOpenVueltas(clientId) {
    return getVueltas(clientId).filter(v => v.estado === 'abierta');
}

function parseBancoIds(vuelta) {
    return (vuelta.bancoIds || '').split(',').map(s => s.trim()).filter(Boolean);
}
/** Bancos (id+nombre) que cubre una vuelta. */
export function bancosDeVuelta(vuelta) {
    return parseBancoIds(vuelta).map(id => ({ id, nombre: bankRepository.getById(id)?.nombre || '—' }));
}
/** Conjunto de bancoIds incluidos en cualquier vuelta del cliente (abierta o cerrada). */
function bancosEnVueltas(clientId) {
    const set = new Set();
    getVueltas(clientId).forEach(v => parseBancoIds(v).forEach(id => set.add(id)));
    return set;
}
/** Conjunto de bancoIds cubiertos por vueltas YA CERRADAS (su seguro ya no se exige). */
export function bancosCerradosSet(clientId) {
    const set = new Set();
    getVueltas(clientId).filter(v => v.estado === 'cerrada').forEach(v => parseBancoIds(v).forEach(id => set.add(id)));
    return set;
}

/** Bancos elegibles para una NUEVA vuelta: seguro al día y aún no incluidos en otra vuelta. */
export function eligibleBanks(clientId) {
    const yaEnVuelta = bancosEnVueltas(clientId);
    return getPaymentStatusForClient(clientId)
        .filter(s => s.estado === 'al_dia' && !yaEnVuelta.has(s.bancoId))
        .map(s => ({ id: s.bancoId, nombre: s.bancoNombre }));
}

export function tarjetasDeBanco(clientId, bancoId) {
    return cardRepository.findByClientId(clientId)
        .filter(c => c.bancoId === bancoId && c.activo !== false && Number(c.activo) !== 0);
}

/** ¿Se puede iniciar una nueva vuelta? (basta con que haya bancos elegibles). */
export function canStartVuelta(clientId) {
    const elig = eligibleBanks(clientId);
    if (elig.length === 0) {
        return { ok: false, motivo: 'No hay bancos con el seguro al día pendientes de vuelta. Registra el pago en “Pagos Seguro” para habilitarlos.' };
    }
    return { ok: true, bancos: elig };
}

export function startVuelta(clientId, fecha) {
    const elig = eligibleBanks(clientId);
    if (elig.length === 0) return { success: false, error: 'No hay bancos con seguro al día pendientes de vuelta.' };
    const v = vueltaRepository.save({
        clienteId: clientId,
        fecha: fecha || new Date().toISOString().split('T')[0],
        estado: 'abierta',
        fechaCierre: null,
        denunciaEvidencia: null,
        denunciaFecha: null,
        bancoIds: elig.map(b => b.id).join(','),
        observaciones: null,
    });
    return { success: true, vuelta: v };
}

export function updateVuelta(vueltaId, data) { return vueltaRepository.update(vueltaId, data); }

// ── Evidencias ──
export function getEvidencias(vueltaId) {
    return vueltaEvidenceRepository.findByVueltaId(vueltaId).sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
}
export function addEvidencia(vueltaId, data) {
    if (!data.bancoId) return { success: false, error: 'Banco requerido.' };
    if (!data.tipo) return { success: false, error: 'Tipo de evidencia requerido.' };
    const e = vueltaEvidenceRepository.save({
        vueltaId, bancoId: data.bancoId, tipo: data.tipo,
        evidencia: data.evidencia || null, fecha: data.fecha || null, hora: data.hora || null,
        concepto: (data.concepto || '').trim() || null,
    });
    return { success: true, evidencia: e };
}
export function deleteEvidencia(id) { vueltaEvidenceRepository.delete(id); }

// ── Códigos de bloqueo ──
export function getBlockingCodes(vueltaId) { return blockingCodeRepository.findByVueltaId(vueltaId); }
export function addBlockingCode(vueltaId, data) {
    if (!data.bancoId) return { success: false, error: 'Banco requerido.' };
    if (!data.codigo || !data.codigo.trim()) return { success: false, error: 'Código de bloqueo requerido.' };
    const c = blockingCodeRepository.save({
        vueltaId, bancoId: data.bancoId, codigo: data.codigo.trim(),
        tarjetaIds: Array.isArray(data.tarjetaIds) ? data.tarjetaIds.join(',') : (data.tarjetaIds || null),
        observacion: (data.observacion || '').trim() || null,
    });
    return { success: true, codigo: c };
}
export function deleteBlockingCode(id) { blockingCodeRepository.delete(id); }

/** ¿Se puede cerrar? Cada banco de la vuelta debe tener al menos un código de bloqueo. */
export function canCloseVuelta(vuelta) {
    const bancos = bancosDeVuelta(vuelta);
    const conCodigo = new Set(getBlockingCodes(vuelta.id).map(c => c.bancoId));
    const faltan = bancos.filter(b => !conCodigo.has(b.id)).map(b => b.nombre);
    if (faltan.length) return { ok: false, motivo: 'Falta registrar código de bloqueo en: ' + faltan.join(', ') };
    return { ok: true };
}

export function closeVuelta(vueltaId) {
    const v = vueltaRepository.getById(vueltaId);
    if (!v) return { success: false, error: 'Vuelta no encontrada.' };
    const chk = canCloseVuelta(v);
    if (!chk.ok) return { success: false, error: chk.motivo };
    vueltaRepository.update(vueltaId, { estado: 'cerrada', fechaCierre: new Date().toISOString() });
    return { success: true };
}
