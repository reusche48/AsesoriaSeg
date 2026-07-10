import { vueltaRepository } from '../repositories/vueltaRepository.js';
import { vueltaEvidenceRepository } from '../repositories/vueltaEvidenceRepository.js';
import { blockingCodeRepository } from '../repositories/blockingCodeRepository.js';
import { cardRepository } from '../repositories/cardRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { getPaymentStatusForClient } from './paymentService.js';
import { createClaim } from './claimService.js';
import { loadCollections } from '../storage.js';

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

/** Todas las vueltas (de todos los clientes), más recientes primero. */
export function getAllVueltas() {
    return vueltaRepository.getAll().slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}
/** Vueltas abiertas de todos los clientes (para retomar y subir evidencias pendientes). */
export function getAllOpenVueltas() {
    return getAllVueltas().filter(v => v.estado === 'abierta');
}
/** Últimas N vueltas de todos los clientes (cualquier estado). */
export function getRecentVueltas(limit = 10) {
    return getAllVueltas().slice(0, limit);
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

/** Evidencias registradas en las vueltas del cliente para un banco dado (para consultarlas desde Reclamos). */
export function evidenciasDeBancoCliente(clienteId, bancoId) {
    const out = [];
    for (const v of getVueltas(clienteId)) {
        if (!parseBancoIds(v).includes(bancoId)) continue;
        for (const e of getEvidencias(v.id)) {
            if (e.bancoId === bancoId) out.push({ ...e, vueltaFecha: v.fecha });
        }
    }
    return out;
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
/** Edita una evidencia. La foto/PDF solo se reemplaza si se sube una nueva (evidencia truthy). */
export function updateEvidencia(id, data) {
    if (data.tipo !== undefined && !data.tipo) return { success: false, error: 'Tipo de evidencia requerido.' };
    const patch = {};
    if (data.tipo !== undefined) patch.tipo = data.tipo;
    if (data.fecha !== undefined) patch.fecha = data.fecha || null;
    if (data.hora !== undefined) patch.hora = data.hora || null;
    if (data.concepto !== undefined) patch.concepto = (data.concepto || '').trim() || null;
    if (data.evidencia) patch.evidencia = data.evidencia; // solo reemplaza si subieron una nueva
    const e = vueltaEvidenceRepository.update(id, patch);
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
        fecha: data.fecha || null,
        hora: data.hora || null,
        evidencia: data.evidencia || null,
    });
    return { success: true, codigo: c };
}
export function updateBlockingCode(id, data) {
    if (!blockingCodeRepository.getById(id)) return { success: false, error: 'Código no encontrado.' };
    if (!data.codigo || !data.codigo.trim()) return { success: false, error: 'Código de bloqueo requerido.' };
    const c = blockingCodeRepository.update(id, {
        codigo: data.codigo.trim(),
        tarjetaIds: Array.isArray(data.tarjetaIds) ? data.tarjetaIds.join(',') : (data.tarjetaIds || null),
        observacion: (data.observacion || '').trim() || null,
        fecha: data.fecha || null,
        hora: data.hora || null,
        evidencia: data.evidencia || null,
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

export async function closeVuelta(vueltaId) {
    const v = vueltaRepository.getById(vueltaId);
    if (!v) return { success: false, error: 'Vuelta no encontrada.' };
    const chk = canCloseVuelta(v);
    if (!chk.ok) return { success: false, error: chk.motivo };
    vueltaRepository.update(vueltaId, { estado: 'cerrada', fechaCierre: new Date().toISOString() });
    return await ensureSiniestroForVuelta(vueltaId);
}

/**
 * "La vuelta ES el siniestro": si la vuelta tiene denuncia y aún no está amarrada,
 * crea el siniestro automáticamente (con la denuncia de la vuelta) y los reclamos
 * de sus bancos. Se usa al cerrar la vuelta Y al subir la denuncia después del cierre.
 */
export async function ensureSiniestroForVuelta(vueltaId) {
    // La sección Vuelta no carga estas colecciones: recargarlas del servidor evita
    // crear duplicados por caché vacío/viejo (o por otro dispositivo).
    try { await loadCollections(['incidents', 'claims', 'claimSteps', 'stepTemplates']); } catch (e) { /* seguir con caché */ }
    let v = vueltaRepository.getById(vueltaId);
    if (!v) return { success: false, error: 'Vuelta no encontrada.' };

    let siniestroCreado = false;
    if (!v.siniestroId && v.denunciaEvidencia) {
        const ext = String(v.denunciaEvidencia).split('?')[0].split('#')[0].split('.').pop().toLowerCase();
        const incident = incidentRepository.save({
            clienteId: v.clienteId,
            fecha: v.denunciaFecha || v.fecha,
            denunciaDescripcion: `Generado automáticamente desde la vuelta del ${v.fecha}.`,
            denunciaArchivo: v.denunciaEvidencia,
            denunciaFormato: ext === 'jpeg' ? 'JPG' : ext.toUpperCase(),
        });
        updateVuelta(vueltaId, { siniestroId: incident.id });
        siniestroCreado = true;
    }

    const reclamosCreados = autoCreateClaimsForVuelta(vueltaRepository.getById(vueltaId) || v);
    return { success: true, reclamosCreados, clienteId: v.clienteId, siniestroCreado };
}

/** Vueltas cerradas que aún no tienen denuncia (para la alerta "Subir denuncia"). READ-ONLY. */
export function getVueltasSinDenuncia() {
    return vueltaRepository.getAll().filter(v => v.estado === 'cerrada' && !v.denunciaEvidencia);
}

/**
 * Camino inverso: al registrar un SINIESTRO, crea automáticamente los reclamos de
 * los bancos que ya están en las vueltas del cliente (sin volver a pedir los bancos).
 * Async: recarga colecciones para no duplicar por caché viejo.
 * @returns {Promise<{claimId:string, bancoId:string, bancoNombre:string}[]>}
 */
export async function autoCreateClaimsFromVueltas(clienteId, incidentId, vueltaIds = null) {
    try { await loadCollections(['claims', 'claimSteps', 'stepTemplates', 'vueltas', 'incidents']); } catch (e) { /* seguir con caché */ }
    // Idempotencia POR siniestro: un mismo banco puede tener reclamo en otro siniestro del cliente.
    const yaConReclamo = new Set(claimRepository.getAll()
        .filter(c => c.siniestroId === incidentId).map(c => c.bancoId));
    // Regla: 1 siniestro ↔ 1 vuelta. Solo se usan vueltas SIN amarrar (o ya amarradas
    // a ESTE siniestro), y al usarlas quedan amarradas (siniestroId).
    const bancos = new Map();
    const vueltasUsadas = [];
    for (const v of getVueltas(clienteId)) {
        if (vueltaIds && !vueltaIds.includes(v.id)) continue;
        if (v.siniestroId && v.siniestroId !== incidentId) continue; // amarrada a otro siniestro
        vueltasUsadas.push(v);
        for (const b of bancosDeVuelta(v)) if (!bancos.has(b.id)) bancos.set(b.id, b);
    }
    const creados = [];
    for (const b of bancos.values()) {
        if (yaConReclamo.has(b.id)) continue;
        const r = createClaim(incidentId, b.id, new Date().toISOString().split('T')[0],
            'Creado automáticamente desde la vuelta del cliente.');
        if (r.success) creados.push({ claimId: r.claim.id, bancoId: b.id, bancoNombre: b.nombre });
    }
    // Registrar el amarre en la(s) vuelta(s) usadas
    for (const v of vueltasUsadas) {
        if (!v.siniestroId) updateVuelta(v.id, { siniestroId: incidentId });
    }
    return creados;
}

/**
 * Al cerrar la vuelta: crea automáticamente el reclamo de cada banco de la vuelta
 * que aún no tenga reclamo (requiere que el cliente tenga un siniestro registrado).
 * @returns {{claimId:string, bancoId:string, bancoNombre:string}[]} reclamos creados
 */
function autoCreateClaimsForVuelta(v) {
    let incident = null;
    if (v.siniestroId) {
        // La vuelta ya está amarrada (o se acaba de amarrar): usar ESE siniestro.
        incident = incidentRepository.getById(v.siniestroId);
    } else {
        // Sin amarre: usar un siniestro del cliente que NO tenga vuelta todavía (regla 1↔1).
        const incidents = incidentRepository.findByClientId(v.clienteId)
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        const siniestrosAmarrados = new Set(getVueltas(v.clienteId).filter(x => x.siniestroId).map(x => x.siniestroId));
        incident = incidents.find(i => !siniestrosAmarrados.has(i.id)) || null;
        if (incident) updateVuelta(v.id, { siniestroId: incident.id }); // amarrar
    }
    if (!incident) return []; // sin siniestro: no hay qué reclamar todavía

    // Idempotencia por siniestro: crear solo los reclamos que falten.
    const yaConReclamo = new Set(claimRepository.getAll()
        .filter(c => c.siniestroId === incident.id).map(c => c.bancoId));
    const creados = [];
    for (const b of bancosDeVuelta(v)) {
        if (yaConReclamo.has(b.id)) continue;
        const r = createClaim(incident.id, b.id, new Date().toISOString().split('T')[0],
            'Creado automáticamente al cerrar la vuelta.');
        if (r.success) creados.push({ claimId: r.claim.id, bancoId: b.id, bancoNombre: b.nombre });
    }
    return creados;
}

/** ¿La vuelta ya tiene reclamos hechos (vía su siniestro)? */
export function vueltaTieneReclamos(vuelta) {
    if (!vuelta || !vuelta.siniestroId) return false;
    return claimRepository.findByIncidentId(vuelta.siniestroId).length > 0;
}

/**
/**
 * ¿Se puede eliminar la vuelta? Solo si está ABIERTA y SIN información:
 * sin evidencias, sin códigos de bloqueo y sin reclamos.
 */
export function puedeEliminarVuelta(vuelta) {
    if (!vuelta || vuelta.estado !== 'abierta') return false;
    if (getEvidencias(vuelta.id).length > 0) return false;
    if (getBlockingCodes(vuelta.id).length > 0) return false;
    if (vueltaTieneReclamos(vuelta)) return false;
    return true;
}

/**
 * Elimina una vuelta SOLO si está abierta y sin información (sin evidencias, sin códigos de
 * bloqueo, sin reclamos). Async: recarga claims/incidents del servidor para no borrar una
 * vuelta que ya tenga reclamos creados desde otro dispositivo. El borrado es admin-only (servidor).
 */
export async function deleteVuelta(vueltaId) {
    try { await loadCollections(['claims', 'incidents']); } catch (e) { /* seguir con caché */ }
    const v = vueltaRepository.getById(vueltaId);
    if (!v) return { success: false, error: 'Vuelta no encontrada.' };
    if (v.estado !== 'abierta') {
        return { success: false, error: 'Solo se puede eliminar una vuelta abierta (en curso). Si estaba cerrada, reábrela primero.' };
    }
    if (getEvidencias(vueltaId).length > 0) {
        return { success: false, error: 'No se puede eliminar: la vuelta tiene evidencias. Bórralas primero.' };
    }
    if (getBlockingCodes(vueltaId).length > 0) {
        return { success: false, error: 'No se puede eliminar: la vuelta tiene códigos de bloqueo. Bórralos primero.' };
    }
    if (vueltaTieneReclamos(v)) {
        return { success: false, error: 'No se puede eliminar: la vuelta ya tiene reclamos.' };
    }
    // Borrar el siniestro auto-generado si quedó vacío y ninguna otra vuelta lo usa.
    if (v.siniestroId) {
        const sinReclamos = claimRepository.findByIncidentId(v.siniestroId).length === 0;
        const otraVuelta = vueltaRepository.getAll().some(x => x.id !== vueltaId && x.siniestroId === v.siniestroId);
        if (sinReclamos && !otraVuelta) incidentRepository.delete(v.siniestroId);
    }
    vueltaRepository.delete(vueltaId);
    return { success: true };
}

/**
 * Quita un banco de una vuelta SOLO si en ese banco no se hizo nada: sin evidencias,
 * sin código de bloqueo y sin reclamo. Devuelve el banco a "elegible" para otra vuelta.
 */
export function removeBancoFromVuelta(vueltaId, bancoId) {
    const v = vueltaRepository.getById(vueltaId);
    if (!v) return { success: false, error: 'Vuelta no encontrada.' };
    const bancos = parseBancoIds(v);
    if (!bancos.includes(bancoId)) return { success: false, error: 'El banco no está en esta vuelta.' };
    if (getEvidencias(vueltaId).some(e => e.bancoId === bancoId)) {
        return { success: false, error: 'No se puede quitar: el banco tiene evidencias. Bórralas primero.' };
    }
    if (getBlockingCodes(vueltaId).some(c => c.bancoId === bancoId)) {
        return { success: false, error: 'No se puede quitar: el banco tiene código de bloqueo. Bórralo primero.' };
    }
    if (v.siniestroId && claimRepository.findByIncidentId(v.siniestroId).some(c => c.bancoId === bancoId)) {
        return { success: false, error: 'No se puede quitar: el banco ya tiene un reclamo.' };
    }
    vueltaRepository.update(vueltaId, { bancoIds: bancos.filter(id => id !== bancoId).join(',') });
    return { success: true };
}

/**
 * Vuelve a agregar un banco a una vuelta en curso. Solo bancos ELEGIBLES del cliente
 * (seguro al día y no incluidos en otra vuelta) — así se recupera un banco quitado por error.
 */
export function addBancoToVuelta(vueltaId, bancoId) {
    const v = vueltaRepository.getById(vueltaId);
    if (!v) return { success: false, error: 'Vuelta no encontrada.' };
    if (v.estado !== 'abierta') return { success: false, error: 'Solo se pueden agregar bancos a una vuelta en curso.' };
    const bancos = parseBancoIds(v);
    if (bancos.includes(bancoId)) return { success: false, error: 'El banco ya está en la vuelta.' };
    if (!eligibleBanks(v.clienteId).some(b => b.id === bancoId)) {
        return { success: false, error: 'Ese banco no está disponible (debe tener el seguro al día y no estar en otra vuelta).' };
    }
    vueltaRepository.update(vueltaId, { bancoIds: [...bancos, bancoId].join(',') });
    return { success: true };
}

/** Reabre una vuelta cerrada para volver a editarla (agregar/quitar evidencias y códigos). */
export function reopenVuelta(vueltaId) {
    const v = vueltaRepository.getById(vueltaId);
    if (!v) return { success: false, error: 'Vuelta no encontrada.' };
    vueltaRepository.update(vueltaId, { estado: 'abierta', fechaCierre: null });
    return { success: true };
}
