import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { registerClient, findClientByDNI, searchClientsByName } from '../services/clientService.js';

// Feature: claims-monitoring-system, Property 14: Busqueda exacta por DNI
// Feature: claims-monitoring-system, Property 15: Busqueda parcial por nombre

const validDNIArb = fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 8 })
    .map(digits => digits.join(''));

const nameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

const validClientArb = fc.tuple(nameArb, nameArb, validDNIArb).map(([n, a, d]) => ({
    nombreCompleto: n, apellidosCompletos: a, dni: d,
    fechaNacimiento: null, telefono1: null, telefono2: null, email1: null, email2: null,
}));

function uniqueClientsArb(min, max) {
    return fc.array(validClientArb, { minLength: min, maxLength: max })
        .map(cs => { const s = new Set(); return cs.filter(c => { if (s.has(c.dni)) return false; s.add(c.dni); return true; }); })
        .filter(a => a.length >= min);
}

beforeEach(() => { localStorage.clear(); });

describe('Propiedad 14: Busqueda exacta por DNI', () => {
    it('retorna exactamente el cliente cuyo DNI coincide', () => {
        fc.assert(fc.property(uniqueClientsArb(1, 5), (clients) => {
            localStorage.clear();
            for (const c of clients) registerClient(c);
            for (const c of clients) {
                const f = findClientByDNI(c.dni);
                expect(f).not.toBeNull();
                expect(f.dni).toBe(c.dni);
            }
        }), { numRuns: 100 });
    });

    it('retorna null si el DNI no existe', () => {
        fc.assert(fc.property(uniqueClientsArb(1, 5), validDNIArb, (clients, sDNI) => {
            fc.pre(!clients.some(c => c.dni === sDNI));
            localStorage.clear();
            for (const c of clients) registerClient(c);
            expect(findClientByDNI(sDNI)).toBeNull();
        }), { numRuns: 100 });
    });

    it('no retorna coincidencias parciales', () => {
        fc.assert(fc.property(validClientArb, (cd) => {
            localStorage.clear();
            registerClient(cd);
            const partial = cd.dni.substring(0, 4);
            if (partial === cd.dni) return;
            expect(findClientByDNI(partial)).toBeNull();
        }), { numRuns: 100 });
    });
});

describe('Propiedad 15: Busqueda parcial por nombre', () => {
    it('retorna clientes cuyo nombre o apellido contiene la cadena', () => {
        fc.assert(fc.property(uniqueClientsArb(2, 6), (clients) => {
            localStorage.clear();
            for (const c of clients) registerClient(c);
            const t = clients[0];
            const tn = t.nombreCompleto.trim();
            if (!tn.length) return;
            const q = tn.substring(0, Math.max(1, Math.floor(tn.length / 2)));
            const res = searchClientsByName(q);
            const lq = q.toLowerCase();
            for (const r of res) {
                expect(r.nombreCompleto.toLowerCase().includes(lq) || r.apellidosCompletos.toLowerCase().includes(lq)).toBe(true);
            }
            expect(res.some(r => r.dni === t.dni)).toBe(true);
        }), { numRuns: 100 });
    });

    it('la busqueda es case-insensitive', () => {
        fc.assert(fc.property(validClientArb, (cd) => {
            localStorage.clear();
            registerClient(cd);
            const tn = cd.nombreCompleto.trim();
            if (!tn.length) return;
            const u = searchClientsByName(tn.toUpperCase());
            const l = searchClientsByName(tn.toLowerCase());
            expect(u.length).toBe(l.length);
            expect(u.every(x => l.some(y => y.dni === x.dni))).toBe(true);
        }), { numRuns: 100 });
    });

    it('no retorna clientes sin coincidencia', () => {
        fc.assert(fc.property(uniqueClientsArb(2, 6), (clients) => {
            localStorage.clear();
            for (const c of clients) registerClient(c);
            expect(searchClientsByName('___ZZZZNOTFOUND___').length).toBe(0);
        }), { numRuns: 100 });
    });

    it('busqueda por apellido retorna coincidencias', () => {
        fc.assert(fc.property(uniqueClientsArb(1, 5), (clients) => {
            localStorage.clear();
            for (const c of clients) registerClient(c);
            const t = clients[0];
            const ts = t.apellidosCompletos.trim();
            if (!ts.length) return;
            const q = ts.substring(0, Math.max(1, Math.floor(ts.length / 2)));
            expect(searchClientsByName(q).some(r => r.dni === t.dni)).toBe(true);
        }), { numRuns: 100 });
    });

    it('retorna todos los clientes que coinciden', () => {
        fc.assert(fc.property(nameArb, fc.array(validDNIArb, { minLength: 2, maxLength: 4 })
            .map(ds => { const s = new Set(); return ds.filter(d => { if (s.has(d)) return false; s.add(d); return true; }); })
            .filter(a => a.length >= 2), (name, dnis) => {
            localStorage.clear();
            for (const dni of dnis) registerClient({ nombreCompleto: name, apellidosCompletos: 'Apellido', dni, fechaNacimiento: null, telefono1: null, telefono2: null, email1: null, email2: null });
            const tn = name.trim();
            if (!tn.length) return;
            const res = searchClientsByName(tn);
            for (const dni of dnis) expect(res.some(r => r.dni === dni)).toBe(true);
        }), { numRuns: 100 });
    });
});
