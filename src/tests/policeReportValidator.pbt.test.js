import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validatePoliceReportFile } from '../validators/validators.js';

// Feature: claims-monitoring-system, Property 12: Validación de formato de denuncia policial
// **Validates: Requirements 6.3, 6.5**

const VALID_MIMES = ['application/pdf', 'image/jpeg', 'image/png'];
const VALID_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];

/** Generates a random invalid MIME type (not in the valid set). */
const invalidMimeArb = fc
    .tuple(
        fc.constantFrom('text', 'audio', 'video', 'application', 'multipart', 'font'),
        fc.constantFrom('plain', 'html', 'xml', 'csv', 'gif', 'bmp', 'webp', 'svg', 'mp3', 'ogg', 'zip', 'rar', 'doc', 'xls'),
    )
    .map(([type, subtype]) => `${type}/${subtype}`)
    .filter(mime => !VALID_MIMES.includes(mime.toLowerCase()));

/** Generates a random file extension that is NOT in the valid set. */
const invalidExtensionArb = fc.constantFrom(
    'gif', 'bmp', 'webp', 'svg', 'tiff', 'doc', 'docx', 'xls',
    'xlsx', 'txt', 'csv', 'html', 'xml', 'zip', 'rar', 'mp3',
    'mp4', 'avi', 'mov', 'exe', 'bat', 'sh', 'py', 'js',
);

describe('Propiedad 12: Validación de formato de denuncia policial', () => {
    it('Archivos con MIME type válido siempre son aceptados', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...VALID_MIMES),
                fc.string({ minLength: 1, maxLength: 20 }),
                (mime, name) => {
                    const result = validatePoliceReportFile({ type: mime, name });
                    expect(result).toEqual({ valid: true });
                },
            ),
            { numRuns: 100 },
        );
    });

    it('Archivos con extensión válida (case-insensitive) siempre son aceptados', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...VALID_EXTENSIONS),
                fc.boolean(),
                (ext, upperCase) => {
                    const finalExt = upperCase ? ext.toUpperCase() : ext;
                    const result = validatePoliceReportFile({ name: `report.${finalExt}` });
                    expect(result).toEqual({ valid: true });
                },
            ),
            { numRuns: 100 },
        );
    });

    it('Archivos con MIME type y extensión inválidos siempre son rechazados', () => {
        fc.assert(
            fc.property(
                invalidMimeArb,
                invalidExtensionArb,
                (mime, ext) => {
                    const result = validatePoliceReportFile({ type: mime, name: `file.${ext}` });
                    expect(result.valid).toBe(false);
                    expect(result.error).toBeDefined();
                },
            ),
            { numRuns: 100 },
        );
    });

    it('Archivos rechazados siempre incluyen mensaje con formatos permitidos', () => {
        fc.assert(
            fc.property(
                invalidMimeArb,
                invalidExtensionArb,
                (mime, ext) => {
                    const result = validatePoliceReportFile({ type: mime, name: `file.${ext}` });
                    expect(result.valid).toBe(false);
                    expect(result.error).toMatch(/PDF/i);
                    expect(result.error).toMatch(/JPG/i);
                    expect(result.error).toMatch(/PNG/i);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('Archivos null, undefined o vacíos siempre son rechazados', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(null, undefined, '', 0, false),
                (file) => {
                    const result = validatePoliceReportFile(file);
                    expect(result.valid).toBe(false);
                    expect(result.error).toBeDefined();
                },
            ),
            { numRuns: 100 },
        );
    });
});
