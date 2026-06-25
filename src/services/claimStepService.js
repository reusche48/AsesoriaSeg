import { claimStepRepository } from '../repositories/claimStepRepository.js';
import { stepTemplateRepository } from '../repositories/stepTemplateRepository.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { claimEventRepository } from '../repositories/claimEventRepository.js';

/**
 * Servicio de pasos instanciados por reclamo.
 * Estados de paso: 'pendiente' (nada hecho) | 'en_curso' (evento registrado, esperando) | 'completado'.
 */

/**
 * Instancia (idempotente) los pasos del reclamo copiando las plantillas activas
 * del banco del reclamo. Si ya hay pasos, los devuelve sin recrearlos.
 */
export function ensureClaimSteps(claimId) {
    const existing = claimStepRepository.findByClaimId(claimId);
    if (existing.length > 0) return existing;
    const claim = claimRepository.getById(claimId);
    if (!claim) return [];
    const templates = stepTemplateRepository.findByBankId(claim.bancoId).filter(t => t.activo !== false);
    templates.forEach(t => {
        claimStepRepository.save({
            reclamoId: claimId,
            plantillaId: t.id,
            orden: t.orden,
            nombre: t.nombre,
            descripcion: t.descripcion || null,
            diasEspera: t.diasEspera || null,
            tipoDias: t.tipoDias || null,
            requiereRespuesta: t.requiereRespuesta ? 1 : 0,
            tipoPaso: t.tipoPaso || 'espera',
            estado: 'pendiente',
            fechaCompletado: null,
        });
    });
    return claimStepRepository.findByClaimId(claimId);
}

/** Marca un paso como completado manualmente (petición parcial / informativo). */
export function markStepComplete(stepId) {
    claimStepRepository.update(stepId, { estado: 'completado', fechaCompletado: new Date().toISOString() });
}

/** Reabre un paso (por si se marcó por error). */
export function reopenStep(stepId) {
    claimStepRepository.update(stepId, { estado: 'en_curso', fechaCompletado: null });
}

/**
 * Aplica transiciones de estado de paso al registrar un evento.
 * Llamado por addClaimEvent. `event` ya guardado (tiene stepId y eventoOrigenId).
 */
export function handleEventForSteps(event) {
    if (!event) return;
    const now = new Date().toISOString();

    // 1) Evento directo de un paso
    if (event.stepId) {
        const step = claimStepRepository.getById(event.stepId);
        if (step && step.estado !== 'completado') {
            if (step.tipoPaso === 'informativo') {
                claimStepRepository.update(step.id, { estado: 'completado', fechaCompletado: now });
            } else if (step.estado === 'pendiente') {
                claimStepRepository.update(step.id, { estado: 'en_curso' });
            }
        }
    }

    // 2) Seguimiento (respuesta): completa el paso 'espera' del evento origen
    if (event.eventoOrigenId) {
        const origin = claimEventRepository.getById(event.eventoOrigenId);
        const stepId = origin?.stepId;
        if (stepId) {
            const step = claimStepRepository.getById(stepId);
            if (step && step.estado !== 'completado' && step.tipoPaso === 'espera') {
                claimStepRepository.update(step.id, { estado: 'completado', fechaCompletado: now });
            }
        }
    }
}
