import { getEventsWithDeadline, getDormantClaims, getPendingStepDeadlines } from './claimEventService.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { CONFIG_KEYS, DEFAULT_DIAS_DORMIDO, getConfigNumber } from './configService.js';
import { getVueltasSinDenuncia, bancosDeVuelta, bancosCerradosSet } from './vueltaService.js';
import { getPaymentStatusForClient } from './paymentService.js';
import { getCuadresPendientes } from './cuadreService.js';

/**
 * "🔥 Atender hoy": lista priorizada de lo urgente en TODO el sistema.
 * READ-ONLY (no instancia pasos — apto para el badge del menú).
 * Une: eventos Vencidos, eventos que Vencen hoy y reclamos dormidos
 * (>= umbral configurable de días sin actividad), dedupados por reclamo.
 */

const SEV = { VENCIDO: 0, VENCE_HOY: 1, DENUNCIA: 2, DORMIDO: 3, POR_HACER: 4, PAGO: 5, CUADRE: 6 };

function clienteDeClaim(claim) {
    const incident = claim ? incidentRepository.getById(claim.siniestroId) : null;
    const client = incident ? clientRepository.getById(incident.clienteId) : null;
    return {
        clienteId: client?.id || null,
        clienteNombre: client ? `${client.nombreCompleto} ${client.apellidosCompletos}` : '—',
    };
}

/**
 * @returns {{items: object[], umbral: number}}
 * item: { severidad, claimId, clienteId, clienteNombre, bancoNombre, queHacer, dias, eventoId? }
 */
export function getAtenderHoy() {
    const umbral = getConfigNumber(CONFIG_KEYS.DIAS_DORMIDO, DEFAULT_DIAS_DORMIDO);
    const items = [];

    // 1) Eventos con plazo (no respondidos): Vencido / Vence hoy = urgente;
    //    Pendiente = "📋 Por hacer" con su cuenta regresiva. Así, un plazo recién
    //    puesto en un evento (p. ej. "tienen 7 días para responder") se ve de una,
    //    igual que los pasos por hacer — no solo cuando ya venció.
    const eventos = getEventsWithDeadline().filter(e => !e.respondido &&
        (e.estadoAlerta === 'Vencido' || e.estadoAlerta === 'Vence hoy' || e.estadoAlerta === 'Pendiente'));
    const claimsConAlertaEvento = new Set();
    for (const e of eventos) {
        const claim = claimRepository.getById(e.reclamoId);
        const { clienteId, clienteNombre } = clienteDeClaim(claim);
        claimsConAlertaEvento.add(e.reclamoId);
        // Mostrar SOLO la observación que escribió el usuario (recortada). Antes se
        // anteponía e.descripcion (el nombre del paso), pero es redundante en la alerta.
        const obs = (e.observacion || '').trim();
        const detalle = obs.length > 90 ? obs.slice(0, 90) + '…' : obs;
        const sever = e.estadoAlerta === 'Vencido' ? SEV.VENCIDO
            : e.estadoAlerta === 'Vence hoy' ? SEV.VENCE_HOY
            : SEV.POR_HACER; // Pendiente dentro de plazo: visible con su cuenta regresiva
        items.push({
            severidad: sever,
            claimId: e.reclamoId,
            clienteId, clienteNombre,
            bancoNombre: claim ? (bankRepository.getById(claim.bancoId)?.nombre || '—') : '—',
            queHacer: detalle || 'Revisar respuesta del banco',
            dias: Math.abs(e.diasRestantes ?? 0),
            eventoId: e.id,
        });
    }

    // 1b) Paso ACTUAL pendiente cuyo plazo (desde que se activó) ya venció / vence hoy.
    //     El reloj arranca al completar el paso anterior; el plazo es el de "Pasos por Banco".
    for (const sp of getPendingStepDeadlines()) {
        if (claimsConAlertaEvento.has(sp.claimId)) continue; // dedup con eventos vencidos
        claimsConAlertaEvento.add(sp.claimId);
        const claim = claimRepository.getById(sp.claimId);
        const { clienteId, clienteNombre } = clienteDeClaim(claim);
        const sever = sp.estadoAlerta === 'Vencido' ? SEV.VENCIDO
            : sp.estadoAlerta === 'Vence hoy' ? SEV.VENCE_HOY
            : SEV.POR_HACER; // dentro de plazo: se muestra con su cuenta regresiva
        items.push({
            severidad: sever,
            claimId: sp.claimId,
            clienteId, clienteNombre,
            bancoNombre: claim ? (bankRepository.getById(claim.bancoId)?.nombre || '—') : '—',
            queHacer: `Paso por hacer: ${sp.pasoNombre}`,
            dias: Math.abs(sp.diasRestantes),
            eventoId: null,
        });
    }

    // 2) Vueltas cerradas SIN denuncia: "Subir denuncia" (desaparece al subirla)
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    for (const v of getVueltasSinDenuncia()) {
        const client = clientRepository.getById(v.clienteId);
        const base = new Date((v.fechaCierre || v.fecha + 'T00:00:00'));
        base.setHours(0, 0, 0, 0);
        items.push({
            severidad: SEV.DENUNCIA,
            claimId: null,
            vueltaId: v.id,
            clienteId: v.clienteId,
            clienteNombre: client ? `${client.nombreCompleto} ${client.apellidosCompletos}` : '—',
            bancoNombre: bancosDeVuelta(v).map(b => b.nombre).join(', ') || '—',
            queHacer: `📄 Subir la denuncia de la vuelta del ${v.fecha}`,
            dias: Math.max(0, Math.floor((hoy - base) / 86400000)),
            eventoId: null,
        });
    }

    // 3) Reclamos dormidos (dedup: si ya aparece por evento vencido, no repetir)
    for (const c of getDormantClaims(umbral)) {
        if (claimsConAlertaEvento.has(c.id)) continue;
        const { clienteId, clienteNombre } = clienteDeClaim(c);
        let queHacer;
        if (c.tramiteCompleto) queHacer = '✅ Culminar reclamo (trámite completo sin cerrar)';
        else if (c.pasoActualNombre) queHacer = `Paso pendiente: ${c.pasoActualNombre}`;
        else if (c.sinPasos) queHacer = 'Sin pasos configurados — registrar evento';
        else queHacer = 'Retomar el trámite';
        items.push({
            severidad: SEV.DORMIDO,
            claimId: c.id,
            clienteId, clienteNombre,
            bancoNombre: bankRepository.getById(c.bancoId)?.nombre || '—',
            queHacer,
            dias: c.diasSinActividad,
            eventoId: null,
        });
    }

    // 4) Pagos del seguro que NO están al día (vencidos o sin pago registrado), por banco.
    //    Un pago borrado deja al cliente fuera de cobertura → debe verse aquí.
    //    Se excluyen los bancos ya cubiertos por una vuelta cerrada (no se les exige pago).
    for (const client of clientRepository.getAll()) {
        const cerrados = bancosCerradosSet(client.id);
        for (const s of getPaymentStatusForClient(client.id)) {
            // Bloqueado (tarjetas ya bloqueadas) o al día → no alerta de pago.
            if (s.estado === 'al_dia' || s.estado === 'bloqueado' || cerrados.has(s.bancoId)) continue;
            const vencido = s.estado === 'vencido';
            items.push({
                severidad: SEV.PAGO,
                claimId: null,
                clienteId: client.id,
                clienteNombre: `${client.nombreCompleto} ${client.apellidosCompletos}`,
                bancoNombre: s.bancoNombre,
                queHacer: vencido ? 'Pago del seguro vencido' : 'Falta registrar el pago del seguro',
                dias: vencido ? Math.abs(s.dias) : null,
                tipo: 'pago',
                eventoId: null,
            });
        }
    }

    // 5) Cuadres de cuentas que aún no cuadran (saldo ≠ 0 o falta el tipo de cambio).
    for (const c of getCuadresPendientes()) {
        const queHacer = c.faltaTipoCambio
            ? 'Falta cuadrar cuentas: ingresa el tipo de cambio'
            : `Falta cuadrar cuentas · saldo S/ ${Math.abs(c.saldo).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        items.push({
            severidad: SEV.CUADRE,
            claimId: null,
            clienteId: c.clienteId,
            clienteNombre: c.clienteNombre,
            bancoNombre: c.recargaNombre,
            queHacer,
            dias: null,
            tipo: 'cuadre',
            eventoId: null,
        });
    }

    items.sort((a, b) => a.severidad - b.severidad || (b.dias || 0) - (a.dias || 0));
    // "urgentes" = lo realmente pendiente/atrasado (excluye los pasos aún dentro de
    // plazo, "Por hacer", pagos y cuadres). El badge rojo del menú usa este conteo.
    const urgentes = items.filter(i => i.severidad <= SEV.DORMIDO).length;
    return { items, umbral, urgentes };
}
