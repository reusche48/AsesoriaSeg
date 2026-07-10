import { stepTemplateRepository } from '../repositories/stepTemplateRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { esOpcional } from './claimStepService.js';

/**
 * Servicio de plantillas de pasos del trámite por banco.
 * tipoPaso: 'informativo' (sin plazo) | 'espera' (plazo + alerta) | 'peticion_parcial' (no cierra hasta marcar completo).
 */

export const TIPOS_PASO = [
    { value: 'espera', label: 'Espera respuesta (con plazo/alerta)' },
    { value: 'informativo', label: 'Informativo (sin plazo)' },
    { value: 'peticion_parcial', label: 'Petición por partes (no cierra hasta completar)' },
];

/** Plantillas de un banco ordenadas. bankId null/'' = generales. */
export function getTemplates(bankId) {
    return bankId ? stepTemplateRepository.findByBankId(bankId) : stepTemplateRepository.findGenerales();
}

function normalize(data) {
    const tipoPaso = ['informativo', 'espera', 'peticion_parcial'].includes(data.tipoPaso) ? data.tipoPaso : 'espera';
    const dias = data.diasEspera ? parseInt(data.diasEspera) : null;
    return {
        bancoId: data.bancoId || null,
        orden: Number(data.orden) || 0,
        nombre: (data.nombre || '').trim(),
        descripcion: (data.descripcion || '').trim() || null,
        diasEspera: tipoPaso === 'informativo' ? null : (dias || null),
        tipoDias: tipoPaso === 'informativo' ? null : (data.tipoDias || 'naturales'),
        requiereRespuesta: tipoPaso === 'espera' || tipoPaso === 'peticion_parcial',
        tipoPaso,
        opcional: esOpcional(data) ? 1 : 0,
        activo: data.activo === false ? false : true,
    };
}

export function createStepTemplate(data) {
    if (!data.nombre || !data.nombre.trim()) {
        return { success: false, error: 'El nombre del paso es requerido.' };
    }
    const t = stepTemplateRepository.save(normalize(data));
    return { success: true, template: t };
}

export function updateStepTemplate(id, data) {
    if (!data.nombre || !data.nombre.trim()) {
        return { success: false, error: 'El nombre del paso es requerido.' };
    }
    const t = stepTemplateRepository.update(id, normalize(data));
    return { success: true, template: t };
}

export function deleteStepTemplate(id) {
    stepTemplateRepository.delete(id);
}

/** Sube el orden de los pasos automáticamente (siguiente número libre) para un banco. */
export function nextOrden(bankId) {
    const list = getTemplates(bankId);
    return list.length ? Math.max(...list.map(t => Number(t.orden) || 0)) + 1 : 1;
}

// ──────────────────────────────────────────────
// Precarga de plantillas reales (BCP / Interbank)
// ──────────────────────────────────────────────
const SEEDS = {
    bcp: [
        { nombre: 'Presentar reclamo', descripcion: 'Presentar el reclamo y vigilar el correo de respuesta.', tipoPaso: 'espera', diasEspera: 15, tipoDias: 'naturales' },
        { nombre: 'Presentar documentación solicitada', descripcion: 'Enviar la documentación que pida el banco/aseguradora.', tipoPaso: 'espera', diasEspera: 15, tipoDias: 'naturales' },
        { nombre: 'Esperar respuesta / revisar correo', descripcion: 'Revisar el correo en busca de la respuesta.', tipoPaso: 'espera', diasEspera: 15, tipoDias: 'naturales' },
        { nombre: 'Cobro de cheque / aprobación del siniestro', descripcion: 'El proceso termina al cobrar el cheque o aprobarse el siniestro.', tipoPaso: 'informativo' },
        { nombre: 'Reiterativos / Indecopi / DEFASEG', descripcion: 'Si lo niegan: reiterar por correo o escalar a Indecopi/DEFASEG hasta desistir y dar de baja.', tipoPaso: 'espera', diasEspera: 15, tipoDias: 'naturales' },
    ],
    interbank: [
        { nombre: 'Presentar reclamo + pedir fecha/hora del movimiento y código de bloqueo', descripcion: 'Al presentar el reclamo, adelantarse a solicitar fecha/hora del movimiento y el código de bloqueo.', tipoPaso: 'espera', diasEspera: 15, tipoDias: 'laborables' },
        { nombre: 'Solicitar reclamo membretado por el banco', descripcion: 'La aseguradora pide el reclamo con membrete del banco.', tipoPaso: 'espera', diasEspera: 15, tipoDias: 'laborables' },
        { nombre: 'Solicitar movimientos (soles, dólares, retiro cajero)', descripcion: 'El banco entrega por partes; no cerrar hasta tener todo. Demora ~15 días hábiles.', tipoPaso: 'peticion_parcial', diasEspera: 15, tipoDias: 'laborables' },
        { nombre: 'Documentación final solicitada', descripcion: 'Presentar la documentación final que soliciten.', tipoPaso: 'espera', diasEspera: 15, tipoDias: 'laborables' },
        { nombre: 'Evento informativo', descripcion: 'Registro informativo, no espera respuesta.', tipoPaso: 'informativo' },
    ],
};

function findBankByName(name) {
    const n = name.toLowerCase();
    return bankRepository.getAll().find(b => (b.nombre || '').toLowerCase().includes(n)) || null;
}

/**
 * Precarga las plantillas de BCP e Interbank si el banco existe y aún no tiene pasos.
 * @returns {{seeded:string[], skipped:string[]}}
 */
export function seedBancoTemplates() {
    const result = { seeded: [], skipped: [] };
    const mapping = [['BCP', SEEDS.bcp], ['Interbank', SEEDS.interbank]];
    for (const [bankName, steps] of mapping) {
        const bank = findBankByName(bankName);
        if (!bank) { result.skipped.push(`${bankName} (banco no existe)`); continue; }
        const existing = stepTemplateRepository.findByBankId(bank.id);
        if (existing.length > 0) { result.skipped.push(`${bank.nombre} (ya tiene pasos)`); continue; }
        steps.forEach((s, i) => {
            stepTemplateRepository.save(normalize({ ...s, bancoId: bank.id, orden: i + 1 }));
        });
        result.seeded.push(bank.nombre);
    }
    return result;
}
