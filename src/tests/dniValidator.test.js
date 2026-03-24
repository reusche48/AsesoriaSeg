import { describe, it, expect } from 'vitest';
import { validateDNI } from '../validators/dniValidator.js';

describe('validateDNI', () => {
    it('returns valid for a correct 8-digit DNI', () => {
        const result = validateDNI('12345678');
        expect(result).toEqual({ valid: true });
    });

    it('returns valid for DNI with all zeros', () => {
        const result = validateDNI('00000000');
        expect(result).toEqual({ valid: true });
    });

    it('rejects non-string input', () => {
        const result = validateDNI(12345678);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('rejects DNI with less than 8 digits', () => {
        const result = validateDNI('1234567');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('8 dígitos');
    });

    it('rejects DNI with more than 8 digits', () => {
        const result = validateDNI('123456789');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('8 dígitos');
    });

    it('rejects DNI with non-numeric characters', () => {
        const result = validateDNI('1234567A');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('8 dígitos');
    });

    it('rejects empty string', () => {
        const result = validateDNI('');
        expect(result.valid).toBe(false);
    });

    it('rejects DNI with spaces', () => {
        const result = validateDNI('1234 678');
        expect(result.valid).toBe(false);
    });
});
