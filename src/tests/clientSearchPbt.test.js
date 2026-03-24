import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { registerClient, findClientByDNI, searchClientsByName } from '../services/clientService.js';

// Feature: claims-monitoring-system, Property 14: Busqueda exacta por DNI
// Feature: claims-monitoring-system, Property 15: Busqueda parcial por nombre

const validDNIArb = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 8 })
  .map(d => d.join(''));

const nameArb = fc
  .stringMatching(/^[a-zA-Z]+$/, { minLength: 1, maxLength: 50 });

function makeClient(nombre, apellidos, dni) {
  return {
    nombreCompleto: nombre,
    apellidosCompletos: apellidos,
    dni,
    fechaNacimiento: null,
    telefono1: null,
    telefono2: null,
    email1: null,
    email2: null,
  };
}

const validClientArb = fc
  .tuple(nameArb, nameArb, validDNIArb)
  .map(([n, a, d]) => makeClient(n, a, d));

function uniqueClientsArb(minLen, maxLen) {
  return fc
    .array(validClientArb, { minLength: minLen, maxLength: maxLen })
    .map(cs => {
      const seen = new Set();
      return cs.filter(c => {
        if (seen.has(c.dni)) return false;
        seen.add(c.dni);
        return true;
      });
    })
    .filter(a => a.length >= minLen);
}

beforeEach(() => {
  localStorage.clear();
});

describe('Propiedad 14: Busqueda exacta por DNI', () => {
  it('retorna exactamente el cliente cuyo DNI coincide', () => {
    fc.assert(
      fc.property(uniqueClientsArb(1, 5), (clients) => {
        localStorage.clear();
        for (const c of clients) registerClient(c);
        for (const c of clients) {
          const found = findClientByDNI(c.dni);
          expect(found).not.toBeNull();
          expect(found.dni).toBe(c.dni);
          expect(found.nombreCompleto).toBe(c.nombreCompleto.trim());
          expect(found.apellidosCompletos).toBe(c.apellidosCompletos.trim());
        }
      }),
      { numRuns: 100 },
    );
  });

  it('retorna null si el DNI no existe en el sistema', () => {
    fc.assert(
      fc.property(uniqueClientsArb(1, 5), validDNIArb, (clients, searchDNI) => {
        fc.pre(!clients.some(c => c.dni === searchDNI));
        localStorage.clear();
        for (const c of clients) registerClient(c);
        const found = findClientByDNI(searchDNI);
        expect(found).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('no retorna coincidencias parciales de DNI', () => {
    fc.assert(
      fc.property(validClientArb, (clientData) => {
        localStorage.clear();
        registerClient(clientData);
        const partial = clientData.dni.substring(0, 4);
        const found = findClientByDNI(partial);
        // 4-char substring should not match an 8-digit DNI
        expect(found).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});

describe('Propiedad 15: Busqueda parcial por nombre', () => {
  it('retorna clientes cuyo nombre o apellido contiene la cadena (case-insensitive)', () => {
    fc.assert(
      fc.property(uniqueClientsArb(2, 6), (clients) => {
        localStorage.clear();
        for (const c of clients) registerClient(c);
        const target = clients[0];
        const tn = target.nombreCompleto.trim();
        if (!tn.length) return;
        const query = tn.substring(0, Math.max(1, Math.floor(tn.length / 2)));
        const results = searchClientsByName(query);
        const lq = query.toLowerCase();
        for (const r of results) {
          const inName = r.nombreCompleto.toLowerCase().includes(lq);
          const inSurname = r.apellidosCompletos.toLowerCase().includes(lq);
          expect(inName || inSurname).toBe(true);
        }
        expect(results.some(r => r.dni === target.dni)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('la busqueda es case-insensitive', () => {
    fc.assert(
      fc.property(validClientArb, (clientData) => {
        localStorage.clear();
        registerClient(clientData);
        const tn = clientData.nombreCompleto.trim();
        if (!tn.length) return;
        const upper = searchClientsByName(tn.toUpperCase());
        const lower = searchClientsByName(tn.toLowerCase());
        expect(upper.length).toBe(lower.length);
        expect(upper.every(u => lower.some(l => l.dni === u.dni))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('no retorna clientes que no coinciden', () => {
    fc.assert(
      fc.property(uniqueClientsArb(2, 6), (clients) => {
        localStorage.clear();
        for (const c of clients) registerClient(c);
        const results = searchClientsByName('___ZZZZNOTFOUND___');
        expect(results.length).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('busqueda por apellido tambien retorna coincidencias', () => {
    fc.assert(
      fc.property(uniqueClientsArb(1, 5), (clients) => {
        localStorage.clear();
        for (const c of clients) registerClient(c);
        const target = clients[0];
        const ts = target.apellidosCompletos.trim();
        if (!ts.length) return;
        const query = ts.substring(0, Math.max(1, Math.floor(ts.length / 2)));
        const results = searchClientsByName(query);
        expect(results.some(r => r.dni === target.dni)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('retorna todos los clientes que coinciden, no solo el primero', () => {
    fc.assert(
      fc.property(
        nameArb,
        fc.array(validDNIArb, { minLength: 2, maxLength: 4 })
          .map(ds => {
            const s = new Set();
            return ds.filter(d => {
              if (s.has(d)) return false;
              s.add(d);
              return true;
            });
          })
          .filter(a => a.length >= 2),
        (sharedName, dnis) => {
          localStorage.clear();
          for (const dni of dnis) {
            registerClient(makeClient(sharedName, 'Apellido', dni));
          }
          const tn = sharedName.trim();
          if (!tn.length) return;
          const results = searchClientsByName(tn);
          for (const dni of dnis) {
            expect(results.some(r => r.dni === dni)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
