import { describe, it, expect, beforeEach } from 'vitest';
import { BaseRepository } from '../repositories/baseRepository.js';

describe('BaseRepository', () => {
    let repo;

    beforeEach(() => {
        localStorage.clear();
        repo = new BaseRepository('test_items');
    });

    describe('getAll', () => {
        it('retorna array vacío cuando no hay datos', () => {
            expect(repo.getAll()).toEqual([]);
        });
    });

    describe('save', () => {
        it('guarda una entidad y le asigna un ID', () => {
            const entity = { name: 'Test' };
            const saved = repo.save(entity);
            expect(saved.id).toBeDefined();
            expect(saved.name).toBe('Test');
        });

        it('la entidad guardada aparece en getAll', () => {
            repo.save({ name: 'A' });
            repo.save({ name: 'B' });
            const all = repo.getAll();
            expect(all).toHaveLength(2);
            expect(all[0].name).toBe('A');
            expect(all[1].name).toBe('B');
        });
    });

    describe('getById', () => {
        it('retorna la entidad correcta por ID', () => {
            const saved = repo.save({ name: 'Find me' });
            const found = repo.getById(saved.id);
            expect(found).toEqual(saved);
        });

        it('retorna null si el ID no existe', () => {
            expect(repo.getById('nonexistent')).toBeNull();
        });
    });

    describe('update', () => {
        it('actualiza campos de una entidad existente', () => {
            const saved = repo.save({ name: 'Old', value: 1 });
            const updated = repo.update(saved.id, { name: 'New' });
            expect(updated.name).toBe('New');
            expect(updated.value).toBe(1);
            expect(updated.id).toBe(saved.id);
        });

        it('lanza error si la entidad no existe', () => {
            expect(() => repo.update('fake-id', { name: 'X' })).toThrow(
                'Entidad con ID "fake-id" no encontrada'
            );
        });

        it('no permite sobrescribir el ID', () => {
            const saved = repo.save({ name: 'Test' });
            const updated = repo.update(saved.id, { id: 'hacked', name: 'Updated' });
            expect(updated.id).toBe(saved.id);
        });
    });

    describe('delete', () => {
        it('elimina una entidad existente', () => {
            const saved = repo.save({ name: 'Delete me' });
            repo.delete(saved.id);
            expect(repo.getAll()).toHaveLength(0);
        });

        it('lanza error si la entidad no existe', () => {
            expect(() => repo.delete('fake-id')).toThrow(
                'Entidad con ID "fake-id" no encontrada'
            );
        });
    });

    describe('findBy', () => {
        it('retorna elementos que cumplen el predicado', () => {
            repo.save({ name: 'Alice', role: 'admin' });
            repo.save({ name: 'Bob', role: 'user' });
            repo.save({ name: 'Carol', role: 'admin' });

            const admins = repo.findBy(item => item.role === 'admin');
            expect(admins).toHaveLength(2);
            expect(admins.map(a => a.name)).toEqual(['Alice', 'Carol']);
        });

        it('retorna array vacío si ningún elemento cumple', () => {
            repo.save({ name: 'Alice' });
            expect(repo.findBy(item => item.name === 'Nobody')).toEqual([]);
        });
    });
});
