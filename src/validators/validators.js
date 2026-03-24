/**
 * Validadores generales del sistema de monitoreo de reclamos.
 */

const ALLOWED_POLICE_REPORT_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];
const ALLOWED_POLICE_REPORT_MIMES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
];

/**
 * Valida que los campos requeridos estén presentes y no vacíos.
 * @param {Record<string, any>} fields - Objeto con los campos a validar.
 * @param {string[]} requiredKeys - Claves que deben estar presentes.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRequired(fields, requiredKeys) {
    const errors = [];

    for (const key of requiredKeys) {
        const value = fields[key];

        if (value === undefined || value === null) {
            errors.push(`El campo "${key}" es obligatorio.`);
        } else if (typeof value === 'string' && value.trim() === '') {
            errors.push(`El campo "${key}" no puede estar vacío.`);
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Valida formato de email.
 * Retorna válido si el email es vacío/null/undefined (campo opcional).
 * @param {string} email - Email a validar.
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateEmail(email) {
    if (email === undefined || email === null || email === '') {
        return { valid: true };
    }

    if (typeof email !== 'string') {
        return { valid: false, error: 'El correo electrónico debe ser una cadena de texto.' };
    }

    const trimmed = email.trim();
    if (trimmed === '') {
        return { valid: true };
    }

    // Basic email regex: something@something.something
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(trimmed)) {
        return { valid: false, error: 'El formato del correo electrónico no es válido.' };
    }

    return { valid: true };
}

/**
 * Valida que el archivo de denuncia policial sea PDF, JPG o PNG.
 * Acepta un objeto con propiedad `name` (extensión) y/o `type` (MIME).
 * @param {{ name?: string, type?: string }} file - Objeto archivo a validar.
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePoliceReportFile(file) {
    if (!file) {
        return { valid: false, error: 'El archivo de denuncia policial es obligatorio.' };
    }

    // Try MIME type first
    if (file.type) {
        if (ALLOWED_POLICE_REPORT_MIMES.includes(file.type.toLowerCase())) {
            return { valid: true };
        }
    }

    // Fall back to file extension
    if (file.name) {
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (extension && ALLOWED_POLICE_REPORT_EXTENSIONS.includes(extension)) {
            return { valid: true };
        }
    }

    return {
        valid: false,
        error: 'El formato del archivo no es válido. Los formatos permitidos son: PDF, JPG, PNG.',
    };
}
