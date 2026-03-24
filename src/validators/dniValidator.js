/**
 * Validador de DNI peruano.
 *
 * El DNI consta de exactamente 8 dígitos numéricos.
 */

/**
 * Valida un DNI peruano (8 dígitos numéricos, sin dígito verificador).
 * @param {string} dni - DNI a validar.
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateDNI(dni) {
    if (typeof dni !== 'string') {
        return { valid: false, error: 'El DNI debe ser una cadena de texto.' };
    }

    if (!/^\d{8}$/.test(dni)) {
        return { valid: false, error: 'El DNI debe tener exactamente 8 dígitos numéricos.' };
    }

    return { valid: true };
}
