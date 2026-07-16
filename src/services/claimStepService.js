import { claimStepRepository } from '../repositories/claimStepRepository.js';
import { stepTemplateRepository } from '../repositories/stepTemplateRepository.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { claimEventRepository } from '../repositories/claimEventRepository.js';

/**
 * Servicio de pasos instanciados por reclamo.
 * Estados de paso: 'pendiente' (nada hecho) | 'en_curso' (evento registrado, esperando) | 'completado'.
 */

/**
 * ¿El paso/plantilla es opcional (no bloquea el avance de etapa)?
 * OJO: MySQL devuelve "0"/"1" como string y "0" es truthy — usar siempre este helper.
 */
export function esOpcional(s) {
    return s?.opcional === true || Number(s?.opcional) === 1;
}

/**
 * Lógica de etapa (PURA, read-only — no escribe ni instancia nada).
 * Etapa = parte entera del orden; los pasos de una misma etapa van en paralelo.
 * Los pasos OPCIONALES no bloquean: la etapa actual es la mínima con pasos
 * OBLIGATORIOS incompletos; los opcionales de etapas ya alcanzadas siguen
 * accionables pero no detienen el avance.
 * @param {object[]} steps - pasos del reclamo (decorados o crudos)
 * @returns {{pasosActuales: object[], pasoActual: object|null, tramiteCompleto: boolean, opcionalesPendientes: object[]}}
 */
export function computeStepsState(steps) {
    const incompletos = steps.filter(s => s.estado !== 'completado');
    const obligatorios = incompletos.filter(s => !esOpcional(s));
    const stageOf = s => Math.floor(Number(s.orden) || 0);
    const minStage = obligatorios.length ? Math.min(...obligatorios.map(stageOf)) : null;
    const tramiteCompleto = obligatorios.length === 0;
    const pasosActuales = tramiteCompleto
        ? incompletos.slice() // solo quedan opcionales: accionables, sin bloquear
        : incompletos.filter(s =>
            (!esOpcional(s) && stageOf(s) === minStage) ||
            (esOpcional(s) && stageOf(s) <= minStage));
    // pasoActual: preferir el obligatorio de menor orden
    pasosActuales.sort((a, b) => ((esOpcional(a) ? 1 : 0) - (esOpcional(b) ? 1 : 0)) || ((Number(a.orden) || 0) - (Number(b.orden) || 0)));
    return {
        pasosActuales,
        pasoActual: pasosActuales[0] || null,
        tramiteCompleto,
        opcionalesPendientes: incompletos.filter(s => esOpcional(s)),
    };
}

/**
 * Instancia (idempotente) los pasos del reclamo copiando las plantillas activas
 * del banco del reclamo. Si ya hay pasos, los devuelve sin recrearlos.
 */
export function ensureClaimSteps(claimId) {
    const claim = claimRepository.getById(claimId);
    if (!claim) return [];
    const existing = claimStepRepository.findByClaimId(claimId);

    // No reabrir pasos en reclamos ya culminados.
    if (claim.estado === 'Culminado' && existing.length > 0) return existing;

    // Sincroniza: instancia las plantillas del banco que aún NO estén en el reclamo.
    // Así, si agregas un paso nuevo a la plantilla, aparece en los reclamos en curso,
    // sin alterar los pasos ya existentes (que conservan su estado/progreso).
    const templates = stepTemplateRepository.findByBankId(claim.bancoId).filter(t => t.activo !== false);
    const yaInstanciadas = new Set(existing.map(s => s.plantillaId));
    let huboCambios = false;

    // a) Instancia las plantillas del banco que aún NO estén en el reclamo.
    templates.forEach(t => {
        if (yaInstanciadas.has(t.id)) return;
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
            opcional: esOpcional(t) ? 1 : 0,
            estado: 'pendiente',
            fechaCompletado: null,
        });
        huboCambios = true;
    });

    // b) Refleja en los pasos NO completados los cambios de presentación de su plantilla
    //    (orden, nombre, descripción). Los pasos completados quedan congelados.
    const tplById = new Map(templates.map(t => [t.id, t]));
    existing.forEach(s => {
        if (s.estado === 'completado') return;
        const t = tplById.get(s.plantillaId);
        if (!t) return;
        const cambios = {};
        if ((Number(s.orden) || 0) !== (Number(t.orden) || 0)) cambios.orden = t.orden;
        if ((s.nombre || '') !== (t.nombre || '')) cambios.nombre = t.nombre;
        if ((s.descripcion || '') !== (t.descripcion || '')) cambios.descripcion = t.descripcion || null;
        if ((esOpcional(s) ? 1 : 0) !== (esOpcional(t) ? 1 : 0)) cambios.opcional = esOpcional(t) ? 1 : 0;
        if (Object.keys(cambios).length) { claimStepRepository.update(s.id, cambios); huboCambios = true; }
    });

    // c) Quita los pasos cuya plantilla fue BORRADA/desactivada en "Pasos por Banco",
    //    pero SOLO si están 'pendiente' y sin eventos (no se pierde ningún avance).
    //    Resguardo: si la colección de plantillas no está cargada (getAll vacío), no
    //    se borra nada para evitar una eliminación masiva por datos incompletos.
    if (stepTemplateRepository.getAll().length > 0) {
        const activeTplIds = new Set(templates.map(t => t.id));
        existing.forEach(s => {
            if (!s.plantillaId || activeTplIds.has(s.plantillaId)) return; // plantilla sigue activa o paso sin plantilla
            if (s.estado !== 'pendiente') return;                          // conservar pasos con avance/completados
            if (claimEventRepository.getAll().some(e => e.stepId === s.id)) return; // conservar si tiene eventos
            claimStepRepository.delete(s.id);
            huboCambios = true;
        });
    }

    return huboCambios ? claimStepRepository.findByClaimId(claimId) : existing;
}

/** Marca un paso como completado manualmente (petición parcial / informativo). */
export function markStepComplete(stepId) {
    claimStepRepository.update(stepId, { estado: 'completado', fechaCompletado: new Date().toISOString() });
}

/** Reabre un paso completado por error. Vuelve a 'en_curso' si ya tiene eventos, o a 'pendiente' si no. */
export function reopenStep(stepId) {
    const tieneEventos = claimEventRepository.getAll().some(e => e.stepId === stepId);
    claimStepRepository.update(stepId, { estado: tieneEventos ? 'en_curso' : 'pendiente', fechaCompletado: null });
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
