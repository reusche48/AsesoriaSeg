import { vueltaRepository } from '../repositories/vueltaRepository.js';
import { vueltaEvidenceRepository } from '../repositories/vueltaEvidenceRepository.js';
import { blockingCodeRepository } from '../repositories/blockingCodeRepository.js';
import { cardRepository } from '../repositories/cardRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { paymentsRecentForVuelta } from './paymentService.js';

/**
 * Servicio de "La Vuelta": una por cliente, agrupa evidencias por banco,
 * códigos de bloqueo y la denuncia. No se cierra sin códigos de bloqueo;
 * no se inicia si el seguro no está pagado dentro de los últimos 30 días.
 */

export const TIPOS_EVIDENCIA = [
    { value: 'retiro_cajero', label: 'Retiro de cajero' },
    { value: 'compra', label: 'Compra' },
    { value: 'transferencia', label: 'Transferencia' },
    { value: 'otro', label: 'Otro' },
];

/** Bancos donde el cliente tiene tarjetas activas. */
export function bancosConTarjetas(clientId) {
    const cards = cardRepository.findByClientId(clientId).filter(c => c.activo !== false && Number(c.activo) !== 0);
    const ids = [...new Set(cards.map(c => c.bancoId))];
    return ids.map(id => ({ id, nombre: bankRepository.getById(id)?.nombre || '—' }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export function tarjetasDeBanco(clientId, bancoId) {
    return cardRepository.findByClientId(clientId)
        .filter(c => c.bancoId === bancoId && c.activo !== false && Number(c.activo) !== 0);
}

export function getOpenVuelta(clientId) { return vueltaRepository.getOpenForClient(clientId); }
export function getVueltas(clientId) {
    return vueltaRepository.findByClientId(clientId).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

/** Estado de la vuelta del cliente: 'ninguna' | 'abierta' | 'cerrada'. */
export function getVueltaState(clientId) {
    const vs = vueltaRepository.findByClientId(clientId);
    if (vs.some(v => v.estado === 'abierta')) return 'abierta';
    if (vs.some(v => v.estado === 'cerrada')) return 'cerrada';
    return 'ninguna';
}

/** ¿Se puede iniciar una vuelta? Valida pagos recientes (30 días) y que no haya otra abierta. */
export function canStartVuelta(clientId) {
    if (getOpenVuelta(clientId)) return { ok: false, motivo: 'Ya hay una vuelta abierta para este cliente.' };
    const pr = paymentsRecentForVuelta(clientId, 30);
    if (!pr.ok) return { ok: false, motivo: 'El seguro debe estar pagado (últimos 30 días). Falta pago reciente en: ' + pr.faltan.join(', ') };
    return { ok: true };
}

export function startVuelta(clientId, fecha) {
    const chk = canStartVuelta(clientId);
    if (!chk.ok) return { success: false, error: chk.motivo };
    const v = vueltaRepository.save({
        clienteId: clientId,
        fecha: fecha || new Date().toISOString().split('T')[0],
        estado: 'abierta',
        fechaCierre: null,
        denunciaEvidencia: null,
        denunciaFecha: null,
        observaciones: null,
    });
    return { success: true, vuelta: v };
}

export function updateVuelta(vueltaId, data) {
    return vueltaRepository.update(vueltaId, data);
}

// ── Evidencias ──
export function getEvidencias(vueltaId) {
    return vueltaEvidenceRepository.findByVueltaId(vueltaId)
        .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
}
export function addEvidencia(vueltaId, data) {
    if (!data.bancoId) return { success: false, error: 'Banco requerido.' };
    if (!data.tipo) return { success: false, error: 'Tipo de evidencia requerido.' };
    const e = vueltaEvidenceRepository.save({
        vueltaId,
        bancoId: data.bancoId,
        tipo: data.tipo,
        evidencia: data.evidencia || null,
        fecha: data.fecha || null,
        hora: data.hora || null,
        concepto: (data.concepto || '').trim() || null,
    });
    return { success: true, evidencia: e };
}
export function deleteEvidencia(id) { vueltaEvidenceRepository.delete(id); }

// ── Códigos de bloqueo ──
export function getBlockingCodes(vueltaId) {
    return blockingCodeRepository.findByVueltaId(vueltaId);
}
export function addBlockingCode(vueltaId, data) {
    if (!data.bancoId) return { success: false, error: 'Banco requerido.' };
    if (!data.codigo || !data.codigo.trim()) return { success: false, error: 'Código de bloqueo requerido.' };
    const c = blockingCodeRepository.save({
        vueltaId,
        bancoId: data.bancoId,
        codigo: data.codigo.trim(),
        tarjetaIds: Array.isArray(data.tarjetaIds) ? data.tarjetaIds.join(',') : (data.tarjetaIds || null),
        observacion: (data.observacion || '').trim() || null,
    });
    return { success: true, codigo: c };
}
export function deleteBlockingCode(id) { blockingCodeRepository.delete(id); }

/** ¿Se puede cerrar? Cada banco con tarjetas debe tener al menos un código de bloqueo. */
export function canCloseVuelta(vueltaId, clientId) {
    const bancos = bancosConTarjetas(clientId);
    const codes = getBlockingCodes(vueltaId);
    const bancosConCodigo = new Set(codes.map(c => c.bancoId));
    const faltan = bancos.filter(b => !bancosConCodigo.has(b.id)).map(b => b.nombre);
    if (faltan.length) return { ok: false, motivo: 'Falta registrar código de bloqueo en: ' + faltan.join(', ') };
    return { ok: true };
}

export function closeVuelta(vueltaId, clientId) {
    const chk = canCloseVuelta(vueltaId, clientId);
    if (!chk.ok) return { success: false, error: chk.motivo };
    vueltaRepository.update(vueltaId, { estado: 'cerrada', fechaCierre: new Date().toISOString() });
    return { success: true };
}
