import { incidentRepository } from '../repositories/incidentRepository.js';
import { claimRepository } from '../repositories/claimRepository.js';
import { claimDetailRepository } from '../repositories/claimDetailRepository.js';
import { claimEventRepository } from '../repositories/claimEventRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { bankRepository } from '../repositories/bankRepository.js';
import { validatePoliceReportFile } from '../validators/validators.js';

/**
 * Servicio de dominio para gestión de siniestros.
 */

/**
 * Extrae el formato del archivo (PDF, JPG, PNG) a partir de la extensión del nombre.
 * @param {string} fileName
 * @returns {string} Formato en mayúsculas (PDF, JPG, PNG)
 */
function extractFileFormat(fileName) {
    if (!fileName || typeof fileName !== 'string') return '';
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (ext === 'jpeg') return 'JPG';
    return ext.toUpperCase();
}

/**
 * Registra un siniestro con denuncia policial.
 * @param {string} clientId - ID del cliente existente
 * @param {string} date - Fecha del siniestro (ISO date string)
 * @param {object} policeReport - { file: { name, type, dataUrl }, description }
 * @returns {object} { success, incident } o { success: false, errors }
 */
export function createIncident(clientId, date, policeReport) {
    const errors = [];

    // Validar clientId
    if (!clientId) {
        errors.push({ field: 'clienteId', code: 'REQUIRED_FIELD', message: 'El campo cliente es requerido.' });
    } else {
        const client = clientRepository.getById(clientId);
        if (!client) {
            errors.push({ field: 'clienteId', code: 'CLIENT_NOT_FOUND', message: 'El cliente no fue encontrado.' });
        }
    }

    // Validar fecha
    if (!date) {
        errors.push({ field: 'fecha', code: 'REQUIRED_FIELD', message: 'La fecha del siniestro es requerida.' });
    }

    // Validar policeReport
    if (!policeReport) {
        errors.push({ field: 'denunciaArchivo', code: 'REQUIRED_FIELD', message: 'La denuncia policial es requerida.' });
        errors.push({ field: 'denunciaDescripcion', code: 'REQUIRED_FIELD', message: 'La descripción de la denuncia es requerida.' });
    } else {
        // Validar archivo
        if (!policeReport.file) {
            errors.push({ field: 'denunciaArchivo', code: 'REQUIRED_FIELD', message: 'El archivo de denuncia policial es requerido.' });
        } else {
            const fileValidation = validatePoliceReportFile(policeReport.file);
            if (!fileValidation.valid) {
                errors.push({ field: 'denunciaArchivo', code: 'INVALID_FILE_FORMAT', message: fileValidation.error });
            }
        }

        // Validar descripción
        if (!policeReport.description || (typeof policeReport.description === 'string' && policeReport.description.trim() === '')) {
            errors.push({ field: 'denunciaDescripcion', code: 'REQUIRED_FIELD', message: 'La descripción de la denuncia es requerida.' });
        }
    }

    if (errors.length > 0) {
        return { success: false, errors };
    }

    const formato = extractFileFormat(policeReport.file.name);

    const incident = incidentRepository.save({
        clienteId: clientId,
        fecha: date,
        denunciaDescripcion: policeReport.description.trim(),
        denunciaArchivo: policeReport.file.dataUrl || '',
        denunciaFormato: formato,
    });

    return { success: true, incident };
}

/**
 * Actualiza un siniestro existente.
 * @param {string} incidentId - ID del siniestro a actualizar
 * @param {string} date - Fecha del siniestro
 * @param {object|null} policeReport - { file: { name, dataUrl }, description } o null si no cambia archivo
 * @returns {object} { success, incident } o { success: false, errors }
 */
export function updateIncident(incidentId, date, policeReport) {
    const errors = [];

    const existing = incidentRepository.getById(incidentId);
    if (!existing) {
        errors.push({ field: 'incidentId', code: 'INCIDENT_NOT_FOUND', message: 'El siniestro no fue encontrado.' });
        return { success: false, errors };
    }

    if (!date) {
        errors.push({ field: 'fecha', code: 'REQUIRED_FIELD', message: 'La fecha del siniestro es requerida.' });
    }

    if (!policeReport || !policeReport.description || policeReport.description.trim() === '') {
        errors.push({ field: 'denunciaDescripcion', code: 'REQUIRED_FIELD', message: 'La descripción de la denuncia es requerida.' });
    }

    if (policeReport && policeReport.file) {
        const fileValidation = validatePoliceReportFile(policeReport.file);
        if (!fileValidation.valid) {
            errors.push({ field: 'denunciaArchivo', code: 'INVALID_FILE_FORMAT', message: fileValidation.error });
        }
    }

    if (errors.length > 0) {
        return { success: false, errors };
    }

    const updateData = {
        fecha: date,
        denunciaDescripcion: policeReport.description.trim(),
    };

    if (policeReport.file) {
        updateData.denunciaArchivo = policeReport.file.dataUrl || '';
        updateData.denunciaFormato = extractFileFormat(policeReport.file.name);
    }

    const incident = incidentRepository.update(incidentId, updateData);
    return { success: true, incident };
}


/**
 * Agrega un banco al siniestro creando un reclamo con estado Pendiente.
 * @param {string} incidentId - ID del siniestro
 * @param {string} bankId - ID del banco
 * @returns {object} { success, claim } o { success: false, errors }
 */
export function addIncidentBank(incidentId, bankId) {
    const errors = [];

    let incident = null;
    if (!incidentId) {
        errors.push({ field: 'siniestroId', code: 'REQUIRED_FIELD', message: 'El siniestro es requerido.' });
    } else {
        incident = incidentRepository.getById(incidentId);
        if (!incident) {
            errors.push({ field: 'siniestroId', code: 'INCIDENT_NOT_FOUND', message: 'El siniestro no fue encontrado.' });
        }
    }

    if (!bankId) {
        errors.push({ field: 'bancoId', code: 'REQUIRED_FIELD', message: 'El banco es requerido.' });
    } else {
        const bank = bankRepository.getById(bankId);
        if (!bank) {
            errors.push({ field: 'bancoId', code: 'BANK_NOT_FOUND', message: 'El banco no fue encontrado.' });
        }
    }

    // Verificar duplicado en CLAIM
    if (errors.length === 0) {
        const existing = claimRepository.findByIncidentId(incidentId)
            .find(c => c.bancoId === bankId);
        if (existing) {
            errors.push({ field: 'bancoId', code: 'DUPLICATE', message: 'Este banco ya fue agregado al siniestro.' });
        }
    }

    if (errors.length > 0) {
        return { success: false, errors };
    }

    const claim = claimRepository.save({
        siniestroId: incidentId,
        bancoId: bankId,
        fecha: incident.fecha,
        observaciones: null,
        evidencia: null,
        montoTotal: 0,
        estado: 'Pendiente',
    });

    return { success: true, claim };
}

/**
 * Obtiene los reclamos (bancos) asociados a un siniestro.
 * @param {string} incidentId
 * @returns {object[]}
 */
export function getIncidentBanks(incidentId) {
    return claimRepository.findByIncidentId(incidentId);
}

/**
 * Obtiene todos los reclamos pendientes con días de retraso.
 * @returns {object[]} Lista con { siniestro, cliente, banco, estado, diasRetraso }
 */
export function getPendingClaimBanks() {
    const pendingClaims = claimRepository.getAll().filter(c => c.estado === 'Pendiente');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return pendingClaims.map(claim => {
        const incident = incidentRepository.getById(claim.siniestroId);
        const bank = bankRepository.getById(claim.bancoId);
        const client = incident ? clientRepository.getById(incident.clienteId) : null;

        const fechaSiniestro = incident ? new Date(incident.fecha) : null;
        let diasRetraso = 0;
        if (fechaSiniestro) {
            fechaSiniestro.setHours(0, 0, 0, 0);
            diasRetraso = Math.floor((today - fechaSiniestro) / (1000 * 60 * 60 * 24));
            if (diasRetraso < 0) diasRetraso = 0;
        }

        return {
            id: claim.id,
            siniestroId: claim.siniestroId,
            bancoId: claim.bancoId,
            fechaSiniestro: incident ? incident.fecha : '',
            clienteNombre: client ? `${client.nombreCompleto} ${client.apellidosCompletos}` : 'Desconocido',
            bancoNombre: bank ? bank.nombre : 'Desconocido',
            estado: claim.estado,
            diasRetraso,
        };
    });
}

/**
 * Elimina un reclamo solo si no tiene eventos asociados.
 * También elimina sus detalles (coberturas reclamadas).
 * @param {string} claimId - ID del reclamo
 * @returns {object} { success } o { success: false, message }
 */
export function deleteClaim(claimId) {
    const claim = claimRepository.getById(claimId);
    if (!claim) {
        return { success: false, message: 'El reclamo no fue encontrado.' };
    }

    const events = claimEventRepository.findByClaimId(claimId);
    if (events.length > 0) {
        return { success: false, message: 'No se puede eliminar el reclamo porque tiene eventos registrados.' };
    }

    // Eliminar detalles del reclamo primero
    const details = claimDetailRepository.findByClaimId(claimId);
    for (const detail of details) {
        claimDetailRepository.delete(detail.id);
    }

    claimRepository.delete(claimId);
    return { success: true };
}
