import { clientRepository } from '../repositories/clientRepository.js';
import { validateDNI } from '../validators/dniValidator.js';
import { validateRequired, validateEmail } from '../validators/validators.js';

/**
 * Servicio de dominio para gestión de clientes.
 */

/**
 * Registra un nuevo cliente con validación de DNI, campos requeridos y unicidad.
 * @param {object} clientData
 * @returns {object} Cliente registrado o error de validación.
 */
export function registerClient(clientData) {
    const errors = [];

    // Validar campos requeridos
    const { valid: reqValid, errors: reqErrors } = validateRequired(
        clientData,
        ['nombreCompleto', 'apellidosCompletos', 'dni']
    );
    if (!reqValid) {
        for (const msg of reqErrors) {
            errors.push({ field: msg.includes('nombreCompleto') ? 'nombreCompleto' : msg.includes('apellidosCompletos') ? 'apellidosCompletos' : 'dni', code: 'REQUIRED_FIELD', message: msg });
        }
    }

    // Validar DNI (formato y dígito verificador)
    if (clientData.dni !== undefined && clientData.dni !== null && clientData.dni !== '') {
        const dniResult = validateDNI(clientData.dni);
        if (!dniResult.valid) {
            errors.push({ field: 'dni', code: 'INVALID_DNI', message: dniResult.error });
        }
    }

    // Validar emails opcionales
    if (clientData.email1) {
        const emailResult = validateEmail(clientData.email1);
        if (!emailResult.valid) {
            errors.push({ field: 'email1', code: 'INVALID_EMAIL', message: emailResult.error });
        }
    }
    if (clientData.email2) {
        const emailResult = validateEmail(clientData.email2);
        if (!emailResult.valid) {
            errors.push({ field: 'email2', code: 'INVALID_EMAIL', message: emailResult.error });
        }
    }

    if (errors.length > 0) {
        return { success: false, errors };
    }

    // Validar unicidad de DNI
    const existing = clientRepository.findByDNI(clientData.dni);
    if (existing) {
        return {
            success: false,
            errors: [{ field: 'dni', code: 'DUPLICATE_DNI', message: 'El Cliente ya se encuentra registrado con este DNI.' }]
        };
    }

    // Persistir cliente
    const client = clientRepository.save({
        nombreCompleto: clientData.nombreCompleto.trim(),
        apellidosCompletos: clientData.apellidosCompletos.trim(),
        dni: clientData.dni,
        fechaNacimiento: clientData.fechaNacimiento || null,
        telefono1: clientData.telefono1 || null,
        telefono2: clientData.telefono2 || null,
        email1: clientData.email1 || null,
        email2: clientData.email2 || null,
        direccion: clientData.direccion || null,
        gpsLatitud: clientData.gpsLatitud || null,
        gpsLongitud: clientData.gpsLongitud || null,
        observaciones: clientData.observaciones || null,
        dniFrontal: clientData.dniFrontal || null,
        dniPosterior: clientData.dniPosterior || null,
    });

    return { success: true, client };
}

/**
 * Busca un cliente por DNI (coincidencia exacta).
 * @param {string} dni
 * @returns {object|null}
 */
export function findClientByDNI(dni) {
    return clientRepository.findByDNI(dni);
}

/**
 * Busca clientes por nombre (coincidencia parcial, case-insensitive).
 * @param {string} name
 * @returns {object[]}
 */
export function searchClientsByName(name) {
    return clientRepository.searchByName(name);
}

/**
 * Actualiza los datos de un cliente existente.
 * @param {string} clientId - ID del cliente
 * @param {object} clientData - Datos a actualizar
 * @returns {object} { success, client } o { success: false, errors }
 */
export function updateClient(clientId, clientData) {
    const errors = [];

    const existing = clientRepository.getById(clientId);
    if (!existing) {
        return { success: false, errors: [{ field: 'id', code: 'NOT_FOUND', message: 'Cliente no encontrado.' }] };
    }

    if (!clientData.nombreCompleto || !clientData.nombreCompleto.trim()) {
        errors.push({ field: 'nombreCompleto', code: 'REQUIRED_FIELD', message: 'El campo nombre completo es requerido.' });
    }
    if (!clientData.apellidosCompletos || !clientData.apellidosCompletos.trim()) {
        errors.push({ field: 'apellidosCompletos', code: 'REQUIRED_FIELD', message: 'El campo apellidos completos es requerido.' });
    }

    if (clientData.email1) {
        const emailResult = validateEmail(clientData.email1);
        if (!emailResult.valid) {
            errors.push({ field: 'email1', code: 'INVALID_EMAIL', message: emailResult.error });
        }
    }
    if (clientData.email2) {
        const emailResult = validateEmail(clientData.email2);
        if (!emailResult.valid) {
            errors.push({ field: 'email2', code: 'INVALID_EMAIL', message: emailResult.error });
        }
    }

    if (errors.length > 0) {
        return { success: false, errors };
    }

    const client = clientRepository.update(clientId, {
        nombreCompleto: clientData.nombreCompleto.trim(),
        apellidosCompletos: clientData.apellidosCompletos.trim(),
        fechaNacimiento: clientData.fechaNacimiento || null,
        telefono1: clientData.telefono1 || null,
        telefono2: clientData.telefono2 || null,
        email1: clientData.email1 || null,
        email2: clientData.email2 || null,
        direccion: clientData.direccion || null,
        gpsLatitud: clientData.gpsLatitud || null,
        gpsLongitud: clientData.gpsLongitud || null,
        observaciones: clientData.observaciones || null,
        dniFrontal: clientData.dniFrontal !== undefined ? clientData.dniFrontal : (existing.dniFrontal || null),
        dniPosterior: clientData.dniPosterior !== undefined ? clientData.dniPosterior : (existing.dniPosterior || null),
    });

    return { success: true, client };
}

/**
 * Elimina un cliente por su ID.
 * @param {string} clientId
 * @returns {object} { success } o { success: false, errors }
 */
export function deleteClient(clientId) {
    const existing = clientRepository.getById(clientId);
    if (!existing) {
        return { success: false, errors: [{ field: 'id', code: 'NOT_FOUND', message: 'Cliente no encontrado.' }] };
    }
    clientRepository.delete(clientId);
    return { success: true };
}
