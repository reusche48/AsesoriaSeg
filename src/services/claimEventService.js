import { claimEventRepository } from '../repositories/claimEventRepository.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { claimStepRepository } from '../repositories/claimStepRepository.js';
import { handleEventForSteps, computeStepsState } from './claimStepService.js';

/**
 * Servicio de dominio para gestión de eventos de seguimiento de reclamos.
 */

/**
 * Registra un evento de seguimiento en un reclamo.
 * @param {string} claimId - ID del reclamo
 * @param {string} date - Fecha del evento (ISO date string)
 * @param {string} description - Descripción del evento
 * @param {string} observacion - Observación detallada del evento
 * @param {string} [evidence] - Evidencia como DataURL (opcional)
 * @param {number} [diasEspera] - Días de espera para respuesta (opcional)
 * @param {string} [tipoDias] - 'naturales' o 'laborables' (opcional)
 * @param {string} [eventoOrigenId] - ID del evento origen si es seguimiento (opcional)
 * @param {string} [stepId] - ID del paso del trámite al que pertenece el evento (opcional)
 * @returns {object} { success, event } o { success: false, errors }
 */
export function addClaimEvent(claimId, date, description, observacion, evidence, diasEspera, tipoDias, eventoOrigenId, stepId, archivos) {
    const errors = [];

    // Validar claimId
    if (!claimId) {
        errors.push({ field: 'reclamoId', code: 'REQUIRED_FIELD', message: 'El campo reclamo es requerido.' });
    } else {
        const claim = claimRepository.getById(claimId);
        if (!claim) {
            errors.push({ field: 'reclamoId', code: 'CLAIM_NOT_FOUND', message: 'El reclamo no fue encontrado.' });
        }
    }

    // Validar fecha
    if (!date) {
        errors.push({ field: 'fecha', code: 'REQUIRED_FIELD', message: 'La fecha del evento es requerida.' });
    }

    // Validar descripción
    if (!description || !description.trim()) {
        errors.push({ field: 'descripcion', code: 'REQUIRED_FIELD', message: 'La descripción del evento es requerida.' });
    }

    // Validar observación
    if (!observacion || !observacion.trim()) {
        errors.push({ field: 'observacion', code: 'REQUIRED_FIELD', message: 'La observación del evento es requerida.' });
    }

    if (errors.length > 0) {
        return { success: false, errors };
    }

    // Calcular fecha de vencimiento si hay días de espera
    let fechaVencimiento = null;
    if (diasEspera && diasEspera > 0 && date) {
        fechaVencimiento = calcularFechaVencimiento(date, diasEspera, tipoDias || 'naturales');
    }

    const event = claimEventRepository.save({
        reclamoId: claimId,
        fecha: date,
        fechaRegistro: new Date().toISOString(),
        descripcion: description,
        observacion: observacion.trim(),
        evidencia: evidence || null,
        archivos: (Array.isArray(archivos) ? archivos.filter(Boolean).join(',') : archivos) || null,
        diasEspera: diasEspera || null,
        tipoDias: tipoDias || null,
        fechaVencimiento: fechaVencimiento,
        eventoOrigenId: eventoOrigenId || null,
        stepId: stepId || null,
    });

    // Cambiar estado del reclamo según el tipo de evento
    const desc = description.trim().toLowerCase();
    if (desc === 'reclamo indemnizado') {
        claimRepository.update(claimId, { estado: 'Culminado' });
    } else if (desc === 'reclamo presentado') {
        const claim = claimRepository.getById(claimId);
        if (claim && claim.estado === 'Pendiente') {
            claimRepository.update(claimId, { estado: 'En Proceso' });
        }
    }

    // Transición de pasos del trámite (si el evento pertenece a un paso o es seguimiento)
    handleEventForSteps(event);

    return { success: true, event };
}

/**
 * Obtiene eventos de un reclamo ordenados del más reciente al más antiguo.
 * @param {string} claimId - ID del reclamo
 * @returns {object[]} Lista de eventos ordenados por fecha
 */
export function getClaimEvents(claimId) {
    const events = claimEventRepository.findByClaimId(claimId);
    return events.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

/**
 * Obtiene los últimos N eventos de todos los reclamos.
 * @param {number} limit - Cantidad máxima de eventos
 * @returns {object[]} Lista de eventos ordenados por fecha descendente
 */
export function getLatestEvents(limit = 10) {
    const all = claimEventRepository.getAll();
    return all.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, limit);
}

/**
 * Actualiza un evento de reclamo existente.
 * @param {string} eventId - ID del evento
 * @param {object} data - { reclamoId, fecha, descripcion, observacion, evidencia, diasEspera, tipoDias }
 * @returns {object} { success, event } o { success: false, errors }
 */
export function updateClaimEvent(eventId, data) {
    const errors = [];

    const existing = claimEventRepository.getById(eventId);
    if (!existing) {
        return { success: false, errors: [{ field: 'eventId', code: 'NOT_FOUND', message: 'El evento no fue encontrado.' }] };
    }

    // Validar reclamo
    const reclamoId = data.reclamoId || existing.reclamoId;
    if (!reclamoId) {
        errors.push({ field: 'reclamoId', code: 'REQUIRED_FIELD', message: 'El campo reclamo es requerido.' });
    } else {
        const claim = claimRepository.getById(reclamoId);
        if (!claim) {
            errors.push({ field: 'reclamoId', code: 'CLAIM_NOT_FOUND', message: 'El reclamo no fue encontrado.' });
        }
    }

    if (!data.fecha) {
        errors.push({ field: 'fecha', code: 'REQUIRED_FIELD', message: 'La fecha del evento es requerida.' });
    }
    if (!data.descripcion || !data.descripcion.trim()) {
        errors.push({ field: 'descripcion', code: 'REQUIRED_FIELD', message: 'La descripción del evento es requerida.' });
    }
    if (!data.observacion || !data.observacion.trim()) {
        errors.push({ field: 'observacion', code: 'REQUIRED_FIELD', message: 'La observación del evento es requerida.' });
    }

    if (errors.length > 0) {
        return { success: false, errors };
    }

    const updateData = {
        reclamoId: reclamoId,
        fecha: data.fecha,
        descripcion: data.descripcion,
        observacion: data.observacion.trim(),
    };
    if (data.evidencia !== undefined) {
        updateData.evidencia = data.evidencia || existing.evidencia;
    }
    if (data.archivos !== undefined) {
        // Se permite quedar vacío (quitar todos los adjuntos).
        updateData.archivos = (Array.isArray(data.archivos) ? data.archivos.filter(Boolean).join(',') : data.archivos) || null;
    }
    // Actualizar campos de plazo si se proporcionan
    if (data.diasEspera !== undefined) {
        updateData.diasEspera = data.diasEspera || null;
        updateData.tipoDias = data.tipoDias || null;
        if (data.diasEspera && data.diasEspera > 0 && data.fecha) {
            updateData.fechaVencimiento = calcularFechaVencimiento(data.fecha, data.diasEspera, data.tipoDias || 'naturales');
        } else {
            updateData.fechaVencimiento = null;
        }
    }

    const event = claimEventRepository.update(eventId, updateData);
    return { success: true, event };
}


/**
 * Elimina un evento y restaura la consistencia de los pasos del trámite.
 * Un evento pone su paso en 'en_curso' (o lo completa, si es informativo/seguimiento);
 * al borrarlo hay que revertir ese efecto o el paso queda "colgado" sin alertar:
 *  - Paso directo (event.stepId) que ya no tenga ningún evento → vuelve a 'pendiente'.
 *  - Seguimiento (event.eventoOrigenId) que había completado un paso 'espera' y ya no
 *    tenga otros seguimientos → ese paso vuelve a 'en_curso'.
 * @param {string} eventId
 * @returns {boolean} true si se eliminó
 */
export function deleteClaimEvent(eventId) {
    const ev = claimEventRepository.getById(eventId);
    if (!ev) return false;
    const { stepId, eventoOrigenId } = ev;
    claimEventRepository.delete(eventId);

    // 1) Paso directo del evento borrado: si ya no le quedan eventos, no puede seguir
    //    'en_curso' (ni 'completado' por informativo) → vuelve a 'pendiente'.
    if (stepId) {
        const step = claimStepRepository.getById(stepId);
        if (step && step.estado !== 'pendiente') {
            const quedanEventos = claimEventRepository.getAll().some(e => e.stepId === stepId);
            if (!quedanEventos) {
                claimStepRepository.update(stepId, { estado: 'pendiente', fechaCompletado: null });
            }
        }
    }

    // 2) Si el borrado era la respuesta (seguimiento) que había completado un paso de
    //    espera, y no queda otra respuesta, ese paso vuelve a estar esperando ('en_curso').
    if (eventoOrigenId) {
        const origin = claimEventRepository.getById(eventoOrigenId);
        const s2 = origin?.stepId ? claimStepRepository.getById(origin.stepId) : null;
        if (s2 && s2.estado === 'completado' && s2.tipoPaso === 'espera') {
            const otrosSeg = claimEventRepository.getAll().some(e => e.eventoOrigenId === eventoOrigenId);
            if (!otrosSeg) claimStepRepository.update(s2.id, { estado: 'en_curso', fechaCompletado: null });
        }
    }
    return true;
}

/**
 * Detecta reclamos activos (no Culminados) sin actividad reciente.
 * Umbral: >=7 días sin nuevo evento; reclamos sin ningún evento: >=3 días.
 * @returns {object[]} Lista ordenada por urgencia descendente
 */
export function getClaimsWithoutActivity() {
    const claims = claimRepository.getAll().filter(c => c.estado !== 'Culminado');
    const allEvents = claimEventRepository.getAll();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = claims.map(claim => {
        const claimEvents = allEvents.filter(e => e.reclamoId === claim.id);
        const latestEvent = claimEvents.slice().sort(
            (a, b) => new Date(b.fechaRegistro || b.fecha) - new Date(a.fechaRegistro || a.fecha)
        )[0] || null;

        let diasSinActividad;
        if (!latestEvent) {
            const base = new Date(claim.fecha ? claim.fecha + 'T00:00:00' : today);
            base.setHours(0, 0, 0, 0);
            diasSinActividad = Math.floor((today - base) / (1000 * 60 * 60 * 24));
            if (diasSinActividad < 3) return null;
        } else {
            const fechaUlt = new Date(latestEvent.fechaRegistro || latestEvent.fecha);
            fechaUlt.setHours(0, 0, 0, 0);
            diasSinActividad = Math.floor((today - fechaUlt) / (1000 * 60 * 60 * 24));
            if (diasSinActividad < 7) return null;
        }

        let nivelAlerta;
        if (!latestEvent)               nivelAlerta = 'Sin eventos';
        else if (diasSinActividad >= 30) nivelAlerta = 'Critico';
        else if (diasSinActividad >= 15) nivelAlerta = 'Urgente';
        else                             nivelAlerta = 'Atencion';

        return {
            ...claim,
            diasSinActividad,
            ultimaActividad: latestEvent ? (latestEvent.fechaRegistro || latestEvent.fecha) : null,
            nivelAlerta,
            ultimoEvento: latestEvent,
            totalEventos: claimEvents.length,
        };
    }).filter(Boolean);

    const order = { 'Sin eventos': 0, 'Critico': 1, 'Urgente': 2, 'Atencion': 3 };
    return result.sort((a, b) =>
        (order[a.nivelAlerta] ?? 4) - (order[b.nivelAlerta] ?? 4) ||
        b.diasSinActividad - a.diasSinActividad
    );
}

/**
 * Plazos de los pasos ACTUALES pendientes de cada reclamo activo. El reloj de un
 * paso arranca cuando se completó el paso anterior (o la fecha del reclamo si es el
 * primero); el plazo es el diasEspera/tipoDias configurado en "Pasos por Banco".
 * READ-ONLY. Devuelve el paso actual pendiente apenas se activa (con su cuenta
 * regresiva), y su estado según el plazo (Pendiente / Vence hoy / Vencido).
 * @returns {{claimId:string, pasoNombre:string, estadoAlerta:'Vencido'|'Vence hoy'|'Pendiente', diasRestantes:number}[]}
 */
export function getPendingStepDeadlines() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const claims = claimRepository.getAll().filter(c => c.estado !== 'Culminado');
    // Índice de pasos por reclamo (una sola pasada)
    const stepsByClaim = new Map();
    for (const s of claimStepRepository.getAll()) {
        const arr = stepsByClaim.get(s.reclamoId);
        if (arr) arr.push(s); else stepsByClaim.set(s.reclamoId, [s]);
    }
    // Pasos que YA tienen un evento con plazo propio: ese evento ya alerta por
    // getEventsWithDeadline, así que no los volvemos a contar aquí. Un paso 'en_curso'
    // cuyo evento fue borrado (o que nunca tuvo plazo) NO está en este set → se trata
    // como pendiente y recupera su alerta con el plazo de "Pasos por Banco".
    const stepsConEventoPlazo = new Set();
    for (const e of claimEventRepository.getAll()) {
        if (e.stepId && e.fechaVencimiento) stepsConEventoPlazo.add(e.stepId);
    }
    const out = [];
    for (const claim of claims) {
        const steps = stepsByClaim.get(claim.id) || [];
        if (!steps.length) continue;
        const st = computeStepsState(steps);
        if (st.tramiteCompleto) continue;
        // Activación = última fecha en que se completó un paso (cuando el actual pasó a serlo);
        // si aún no hay pasos completados, se cuenta desde la fecha del reclamo.
        const completadas = steps.filter(s => s.estado === 'completado' && s.fechaCompletado)
            .map(s => s.fechaCompletado).sort();
        const activacion = completadas.length ? completadas[completadas.length - 1]
            : (claim.fecha ? claim.fecha + 'T00:00:00' : null);
        if (!activacion) continue;
        const base = String(activacion).slice(0, 10);
        for (const paso of st.pasosActuales) {
            if (paso.estado === 'completado') continue;      // no debería (son incompletos), defensivo
            if (stepsConEventoPlazo.has(paso.id)) continue;  // ya alerta por su propio evento con plazo
            const dias = Number(paso.diasEspera);
            if (!Number.isFinite(dias) || dias <= 0) continue; // sin plazo → lo cubre "dormido"
            const venc = calcularFechaVencimiento(base, dias, paso.tipoDias);
            const v = new Date(venc); v.setHours(0, 0, 0, 0);
            const diasRestantes = Math.ceil((v - today) / 86400000);
            out.push({
                claimId: claim.id,
                pasoNombre: paso.nombre,
                estadoAlerta: diasRestantes < 0 ? 'Vencido' : diasRestantes === 0 ? 'Vence hoy' : 'Pendiente',
                diasRestantes,
            });
        }
    }
    return out;
}

/**
 * Reclamos "dormidos": activos con >= umbral días sin ningún evento.
 * READ-ONLY (no instancia pasos). Incluye el paso actual (si hay pasos) y si el
 * trámite ya está completo (solo falta culminar — también es un caso olvidado).
 * @param {number} umbral - días sin actividad para considerarlo dormido
 * @returns {object[]} ordenados por días sin actividad descendente
 */
export function getDormantClaims(umbral) {
    const claims = claimRepository.getAll().filter(c => c.estado !== 'Culminado');
    // Índice de eventos por reclamo en una sola pasada (evita O(reclamos × eventos))
    const eventsByClaim = new Map();
    for (const e of claimEventRepository.getAll()) {
        const arr = eventsByClaim.get(e.reclamoId);
        if (arr) arr.push(e); else eventsByClaim.set(e.reclamoId, [e]);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = [];
    for (const claim of claims) {
        const evs = eventsByClaim.get(claim.id) || [];
        const latest = evs.slice().sort(
            (a, b) => new Date(b.fechaRegistro || b.fecha) - new Date(a.fechaRegistro || a.fecha)
        )[0] || null;
        const base = latest
            ? new Date(latest.fechaRegistro || latest.fecha)
            : new Date(claim.fecha ? claim.fecha + 'T00:00:00' : today);
        base.setHours(0, 0, 0, 0);
        const diasSinActividad = Math.floor((today - base) / 86400000);
        if (diasSinActividad < umbral) continue;

        const steps = claimStepRepository.findByClaimId(claim.id);
        const st = steps.length ? computeStepsState(steps) : null;
        result.push({
            ...claim,
            diasSinActividad,
            pasoActualNombre: st?.pasoActual?.nombre || null,
            tramiteCompleto: st?.tramiteCompleto || false,
            sinPasos: steps.length === 0,
        });
    }
    return result.sort((a, b) => b.diasSinActividad - a.diasSinActividad);
}

/**
 * Calcula la fecha de vencimiento sumando días naturales o laborables.
 * @param {string} fechaBase - Fecha base ISO
 * @param {number} dias - Cantidad de días
 * @param {string} tipo - 'naturales' o 'laborables'
 * @returns {string} Fecha ISO de vencimiento
 */
export function calcularFechaVencimiento(fechaBase, dias, tipo) {
    const fecha = new Date(fechaBase);
    if (tipo === 'laborables') {
        let added = 0;
        while (added < dias) {
            fecha.setDate(fecha.getDate() + 1);
            const day = fecha.getDay();
            if (day !== 0 && day !== 6) { // No sábado ni domingo
                added++;
            }
        }
    } else {
        fecha.setDate(fecha.getDate() + dias);
    }
    return fecha.toISOString().split('T')[0];
}

/**
 * Obtiene todos los eventos que tienen plazo de vencimiento.
 * Calcula días restantes y estado (pendiente/vencido/respondido).
 * @returns {object[]} Lista de eventos con info de vencimiento
 */
export function getEventsWithDeadline() {
    const all = claimEventRepository.getAll();
    // Excluir eventos de reclamos Culminados: un trámite cerrado ya no debe alertar.
    const culminados = new Set(claimRepository.getAll().filter(c => c.estado === 'Culminado').map(c => c.id));
    const withDeadline = all.filter(ev => ev.fechaVencimiento && !culminados.has(ev.reclamoId));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return withDeadline.map(ev => {
        const venc = new Date(ev.fechaVencimiento);
        venc.setHours(0, 0, 0, 0);
        const diffMs = venc - today;
        const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        // Verificar si tiene evento de seguimiento (respuesta). También cuenta como
        // respondido si su paso del trámite ya fue marcado como completado en la Guía
        // (para que la alerta no siga sonando tras cerrar el paso).
        const seguimientos = all.filter(e => e.eventoOrigenId === ev.id);
        let respondido = seguimientos.length > 0;
        if (!respondido && ev.stepId) {
            const paso = claimStepRepository.getById(ev.stepId);
            if (paso && paso.estado === 'completado') respondido = true;
        }

        let estado;
        if (respondido) {
            estado = 'Respondido';
        } else if (diasRestantes < 0) {
            estado = 'Vencido';
        } else if (diasRestantes === 0) {
            estado = 'Vence hoy';
        } else {
            estado = 'Pendiente';
        }

        return {
            ...ev,
            diasRestantes,
            estadoAlerta: estado,
            respondido,
            seguimientos,
        };
    }).sort((a, b) => {
        // Vencidos primero, luego por días restantes ascendente
        const order = { 'Vencido': 0, 'Vence hoy': 1, 'Pendiente': 2, 'Respondido': 3 };
        return (order[a.estadoAlerta] ?? 4) - (order[b.estadoAlerta] ?? 4) || a.diasRestantes - b.diasRestantes;
    });
}
