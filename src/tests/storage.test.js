import { describe, it, expect, beforeEach } from 'vitest';
import { getCollection, saveCollection, generateId } from '../storage.js';

describe('storage adapter', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe('getCollection', () => {
        it('retorna array vacío si la clave no existe', () => {
            expect(getCollection('nonexistent')).toEqual([]);
        });

        it('retorna el array guardado previamente', () => {
            const data = [{ id: '1', name: 'test' }];
            localStorage.setItem('items', JSON.stringify(data));
            expect(getCollection('items')).toEqual(data);
        });

        it('retorna array vacío si el valor no es un array válido', () => {
            localStorage.setItem('bad', '"not an array"');
            expect(getCollection('bad')).toEqual([]);
        });

        it('retorna array vacío si el JSON es inválido', () => {
            localStorage.setItem('corrupt', '{broken json');
            expect(getCollection('corrupt')).toEqual([]);
        });
    });

    describe('saveCollection', () => {
        it('guarda un array y puede ser recuperado', () => {
            const data = [{ id: '1' }, { id: '2' }];
            saveCollection('test', data);
            expect(JSON.parse(localStorage.getItem('test'))).toEqual(data);
        });

        it('sobrescribe datos existentes', () => {
            saveCollection('test', [{ id: '1' }]);
            saveCollection('test', [{ id: '2' }]);
            expect(JSON.parse(localStorage.getItem('test'))).toEqual([{ id: '2' }]);
        });
    });

    describe('generateId', () => {
        it('genera un string con formato UUID v4', () => {
            const id = generateId();
            expect(id).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
            );
        });

        it('genera IDs únicos', () => {
            const ids = new Set(Array.from({ length: 100 }, () => generateId()));
            expect(ids.size).toBe(100);
        });
    });
});
