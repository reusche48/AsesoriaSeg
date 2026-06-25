import { claimEventRepository } from '../repositories/claimEventRepository.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { handleEventForSteps } from './claimStepService.js';

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
export function addClaimEvent(claimId, date, description, observacion, evidence, diasEspera, tipoDias, eventoOrigenId, stepId) {
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
 * Calcula la fecha de vencimiento sumando días naturales o laborables.
 * @param {string} fechaBase - Fecha base ISO
 * @param {number} dias - Cantidad de días
 * @param {string} tipo - 'naturales' o 'laborables'
 * @returns {string} Fecha ISO de vencimiento
 */
function calcularFechaVencimiento(fechaBase, dias, tipo) {
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
    const withDeadline = all.filter(ev => ev.fechaVencimiento);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return withDeadline.map(ev => {
        const venc = new Date(ev.fechaVencimiento);
        venc.setHours(0, 0, 0, 0);
        const diffMs = venc - today;
        const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        // Verificar si tiene evento de seguimiento (respuesta)
        const seguimientos = all.filter(e => e.eventoOrigenId === ev.id);
        const respondido = seguimientos.length > 0;

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
