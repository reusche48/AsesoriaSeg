import { cardRepository } from '../repositories/cardRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { claimStepRepository } from '../repositories/claimStepRepository.js';
import { getEventsWithDeadline } from './claimEventService.js';
import { ensureClaimSteps } from './claimStepService.js';
import { getPaymentStatusForClient } from './paymentService.js';
import { getVueltaState } from './vueltaService.js';

/**
 * Motor de "siguiente acción" (la secretaria): qué hacer ahora por cliente y banco.
 */

function claimsOfClient(clientId) {
    const incidents = incidentRepository.findByClientId(clientId);
    return incidents.flatMap(i => claimRepository.findByIncidentId(i.id));
}

/** Pasos generales (1-5) derivados del estado del cliente. */
export function getGeneralStepsForClient(clientId) {
    const cards = cardRepository.findByClientId(clientId);
    const conSeguro = cards.filter(c => c.seguroId && c.activo !== false && Number(c.activo) !== 0);
    const claims = claimsOfClient(clientId);

    const vueltaState = getVueltaState(clientId);

    // Paso 3: estado real de pagos del seguro por banco. Tras la vuelta cerrada ya no se exige.
    let pagoEstado, pagoDetalle;
    if (vueltaState === 'cerrada') {
        pagoEstado = 'hecho'; pagoDetalle = 'Ya no se exige (vuelta cerrada)';
    } else {
        const pagosSt = getPaymentStatusForClient(clientId);
        const pagosPend = pagosSt.filter(s => s.estado !== 'al_dia');
        if (pagosSt.length === 0) { pagoEstado = 'hecho'; pagoDetalle = 'Sin seguros que pagar'; }
        else if (pagosPend.length === 0) { pagoEstado = 'hecho'; pagoDetalle = 'Todos los bancos al día'; }
        else { pagoEstado = 'pendiente'; pagoDetalle = 'Falta pagar: ' + pagosPend.map(v => v.bancoNombre).join(', '); }
    }

    // Paso 4: estado de la vuelta
    const vueltaCfg = {
        ninguna: { estado: 'pendiente', detalle: 'Aún no se inicia la vuelta' },
        abierta: { estado: 'pendiente', detalle: 'Vuelta en curso — completar evidencias/códigos y cerrar' },
        cerrada: { estado: 'hecho', detalle: 'Vuelta cerrada' },
    }[vueltaState];

    return [
        { orden: 1, label: 'Registrar cliente', estado: 'hecho', detalle: '', hash: '#clientes' },
        {
            orden: 2, label: 'Registrar tarjetas y asignar seguro',
            estado: conSeguro.length > 0 ? 'hecho' : 'pendiente',
            detalle: `${conSeguro.length}/${cards.length} tarjeta(s) con seguro`, hash: '#tarjetas',
        },
        { orden: 3, label: 'Verificar pagos del seguro', estado: pagoEstado, detalle: pagoDetalle, hash: '#pagos' },
        { orden: 4, label: 'La vuelta (evidencias por banco + códigos de bloqueo)', estado: vueltaCfg.estado, detalle: vueltaCfg.detalle, hash: '#vuelta' },
        {
            orden: 5, label: 'Iniciar reclamos por banco',
            estado: claims.length > 0 ? 'hecho' : 'pendiente',
            detalle: `${claims.length} reclamo(s)`, hash: '#reclamos',
        },
    ];
}

/** Alerta del paso a partir de sus eventos con plazo (el más urgente no respondido). */
function stepAlert(stepId, evd) {
    const evs = evd.filter(e => e.stepId === stepId);
    if (!evs.length) return null;
    const pend = evs.filter(e => !e.respondido);
    return pend[0] || evs[0]; // getEventsWithDeadline ya viene ordenado por urgencia
}

/** Describe la acción recomendada de un paso (texto + urgencia). */
export function describeAccion(paso) {
    if (!paso) return { texto: 'Trámite al día', urgente: false, color: '#10b981' };
    if (paso.estado === 'pendiente') {
        return { texto: `Hacer: ${paso.nombre}`, urgente: false, color: '#3b82f6' };
    }
    // en_curso
    if (paso.tipoPaso === 'peticion_parcial') {
        return { texto: 'Petición por partes abierta — registrar lo recibido o marcar completo', urgente: true, color: '#d97706' };
    }
    if (paso.tipoPaso === 'informativo') {
        return { texto: `Registrar: ${paso.nombre}`, urgente: false, color: '#3b82f6' };
    }
    // espera
    const a = paso.estadoAlerta;
    if (a === 'Vencido') return { texto: `Vencido — revisar correo: ${paso.nombre}`, urgente: true, color: '#ef4444' };
    if (a === 'Vence hoy') return { texto: `Hoy vence — revisar correo: ${paso.nombre}`, urgente: true, color: '#f59e0b' };
    if (a === 'Pendiente') return { texto: `Esperando respuesta — vence en ${paso.diasRestantes} día(s)`, urgente: false, color: '#3b82f6' };
    return { texto: `Esperando respuesta: ${paso.nombre}`, urgente: false, color: '#3b82f6' };
}

/**
 * Estado de los pasos de un reclamo (instancia idempotente + alerta por paso).
 * OJO: instancia pasos (escribe) la primera vez. No usar en el conteo del badge.
 */
export function getClaimStepsState(claimId) {
    const steps = ensureClaimSteps(claimId);
    const evd = getEventsWithDeadline();
    let pasoActual = null;
    const decorated = steps.map(s => {
        const alerta = s.tipoPaso === 'espera' ? stepAlert(s.id, evd) : null;
        const o = { ...s, estadoAlerta: alerta?.estadoAlerta || null, diasRestantes: alerta?.diasRestantes ?? null };
        if (!pasoActual && s.estado !== 'completado') pasoActual = o;
        return o;
    });
    return { steps: decorated, pasoActual };
}

/** Siguiente acción por cliente: pasos generales + estado del trámite por banco. */
export function getNextActionsForClient(clientId) {
    const generales = getGeneralStepsForClient(clientId);
    const claims = claimsOfClient(clientId);
    const porBanco = claims.map(claim => {
        const { steps, pasoActual } = getClaimStepsState(claim.id);
        const bank = bankRepository.getById(claim.bancoId);
        return {
            claimId: claim.id,
            bancoId: claim.bancoId,
            bancoNombre: bank?.nombre || '—',
            estadoReclamo: claim.estado || 'Pendiente',
            fechaReclamo: claim.fecha,
            steps,
            pasoActual,
            sinPasos: steps.length === 0,
            accion: describeAccion(pasoActual),
        };
    });
    return { generales, porBanco };
}

/**
 * Conteo de acciones pendientes para el badge. READ-ONLY (no instancia pasos).
 * Cuenta pasos en curso vencidos/que vencen hoy + peticiones parciales abiertas.
 */
export function getAllPendingActions() {
    const evd = getEventsWithDeadline();
    const steps = claimStepRepository.getAll().filter(s => s.estado === 'en_curso');
    let n = 0;
    for (const s of steps) {
        if (s.tipoPaso === 'peticion_parcial') { n++; continue; }
        const a = stepAlert(s.id, evd);
        if (a && (a.estadoAlerta === 'Vencido' || a.estadoAlerta === 'Vence hoy')) n++;
    }
    return n;
}
