import { describe, it, expect } from 'vitest';
import {
    validateRequired,
    validateEmail,
    validatePoliceReportFile,
} from '../validators/validators.js';

describe('validateRequired', () => {
    it('returns valid when all required fields are present', () => {
        const fields = { nombre: 'Juan', apellidos: 'Pérez', dni: '123456781' };
        const result = validateRequired(fields, ['nombre', 'apellidos', 'dni']);
        expect(result).toEqual({ valid: true, errors: [] });
    });

    it('returns errors for missing fields (undefined)', () => {
        const fields = { nombre: 'Juan' };
        const result = validateRequired(fields, ['nombre', 'apellidos']);
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('apellidos');
    });

    it('returns errors for null fields', () => {
        const fields = { nombre: null };
        const result = validateRequired(fields, ['nombre']);
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('nombre');
    });

    it('returns errors for empty string fields', () => {
        const fields = { nombre: '' };
        const result = validateRequired(fields, ['nombre']);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('nombre');
    });

    it('returns errors for whitespace-only string fields', () => {
        const fields = { nombre: '   ' };
        const result = validateRequired(fields, ['nombre']);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('nombre');
    });

    it('accepts non-string truthy values (numbers, booleans)', () => {
        const fields = { count: 0, active: false };
        // 0 and false are not null/undefined and not strings, so they pass
        const result = validateRequired(fields, ['count', 'active']);
        expect(result).toEqual({ valid: true, errors: [] });
    });

    it('returns valid with empty requiredKeys', () => {
        const result = validateRequired({}, []);
        expect(result).toEqual({ valid: true, errors: [] });
    });

    it('collects multiple errors at once', () => {
        const fields = {};
        const result = validateRequired(fields, ['nombre', 'apellidos', 'dni']);
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(3);
    });
});

describe('validateEmail', () => {
    it('returns valid for a standard email', () => {
        expect(validateEmail('user@example.com')).toEqual({ valid: true });
    });

    it('returns valid for null (optional field)', () => {
        expect(validateEmail(null)).toEqual({ valid: true });
    });

    it('returns valid for undefined (optional field)', () => {
        expect(validateEmail(undefined)).toEqual({ valid: true });
    });

    it('returns valid for empty string (optional field)', () => {
        expect(validateEmail('')).toEqual({ valid: true });
    });

    it('returns valid for whitespace-only string (optional field)', () => {
        expect(validateEmail('   ')).toEqual({ valid: true });
    });

    it('rejects email without @', () => {
        const result = validateEmail('userexample.com');
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('rejects email without domain', () => {
        const result = validateEmail('user@');
        expect(result.valid).toBe(false);
    });

    it('rejects email without TLD', () => {
        const result = validateEmail('user@example');
        expect(result.valid).toBe(false);
    });

    it('rejects email with spaces', () => {
        const result = validateEmail('user @example.com');
        expect(result.valid).toBe(false);
    });

    it('rejects non-string input', () => {
        const result = validateEmail(12345);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('accepts email with subdomains', () => {
        expect(validateEmail('user@mail.example.com')).toEqual({ valid: true });
    });

    it('accepts email with plus addressing', () => {
        expect(validateEmail('user+tag@example.com')).toEqual({ valid: true });
    });
});

describe('validatePoliceReportFile', () => {
    it('accepts PDF file by MIME type', () => {
        const file = { name: 'report.pdf', type: 'application/pdf' };
        expect(validatePoliceReportFile(file)).toEqual({ valid: true });
    });

    it('accepts JPG file by MIME type', () => {
        const file = { name: 'photo.jpg', type: 'image/jpeg' };
        expect(validatePoliceReportFile(file)).toEqual({ valid: true });
    });

    it('accepts PNG file by MIME type', () => {
        const file = { name: 'scan.png', type: 'image/png' };
        expect(validatePoliceReportFile(file)).toEqual({ valid: true });
    });

    it('accepts PDF file by extension when no MIME type', () => {
        const file = { name: 'report.pdf' };
        expect(validatePoliceReportFile(file)).toEqual({ valid: true });
    });

    it('accepts JPG file by extension', () => {
        const file = { name: 'photo.jpg' };
        expect(validatePoliceReportFile(file)).toEqual({ valid: true });
    });

    it('accepts JPEG file by extension', () => {
        const file = { name: 'photo.jpeg' };
        expect(validatePoliceReportFile(file)).toEqual({ valid: true });
    });

    it('accepts PNG file by extension', () => {
        const file = { name: 'scan.png' };
        expect(validatePoliceReportFile(file)).toEqual({ valid: true });
    });

    it('accepts files with uppercase extensions', () => {
        const file = { name: 'REPORT.PDF' };
        expect(validatePoliceReportFile(file)).toEqual({ valid: true });
    });

    it('rejects unsupported file format (DOCX)', () => {
        const file = { name: 'report.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
        const result = validatePoliceReportFile(file);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('PDF, JPG, PNG');
    });

    it('rejects unsupported file format (TXT)', () => {
        const file = { name: 'notes.txt', type: 'text/plain' };
        const result = validatePoliceReportFile(file);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('formatos permitidos');
    });

    it('rejects null file', () => {
        const result = validatePoliceReportFile(null);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('rejects undefined file', () => {
        const result = validatePoliceReportFile(undefined);
        expect(result.valid).toBe(false);
    });

    it('rejects file with no name and no type', () => {
        const result = validatePoliceReportFile({});
        expect(result.valid).toBe(false);
        expect(result.error).toContain('PDF, JPG, PNG');
    });

    it('rejects GIF files', () => {
        const file = { name: 'animation.gif', type: 'image/gif' };
        const result = validatePoliceReportFile(file);
        expect(result.valid).toBe(false);
    });
});
