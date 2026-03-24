import { getCollection, saveCollection, generateId, saveEntity, updateEntity, deleteEntity, getCurrentUser } from '../storage.js';

/**
 * Repositorio genérico base con operaciones CRUD.
 * Lecturas síncronas desde caché, escrituras async hacia API MySQL + caché.
 */
export class BaseRepository {
    /**
     * @param {string} collectionKey - Clave de la colección.
     */
    constructor(collectionKey) {
        this.collectionKey = collectionKey;
    }

    /** Retorna todos los elementos (desde caché). */
    getAll() {
        return getCollection(this.collectionKey);
    }

    /** Busca un elemento por su ID. */
    getById(id) {
        return this.getAll().find(item => item.id === id) || null;
    }

    /** Guarda una nueva entidad. Actualiza caché + API. */
    save(entity) {
        const items = this.getAll();
        const user = getCurrentUser();
        const newEntity = {
            ...entity,
            id: generateId(),
            creadoPor: user,
            fechaCreacion: new Date().toISOString(),
        };
        items.unshift(newEntity);
        saveCollection(this.collectionKey, items);
        // Persistir en MySQL (async, no bloquea)
        saveEntity(this.collectionKey, newEntity);
        return newEntity;
    }

    /** Actualiza una entidad existente. Actualiza caché + API. */
    update(id, data) {
        const items = this.getAll();
        const index = items.findIndex(item => item.id === id);
        if (index === -1) {
            throw new Error(`Entidad con ID "${id}" no encontrada en "${this.collectionKey}".`);
        }
        const user = getCurrentUser();
        items[index] = {
            ...items[index],
            ...data,
            id,
            modificadoPor: user,
            fechaModificacion: new Date().toISOString(),
        };
        saveCollection(this.collectionKey, items);
        // Persistir en MySQL (async)
        updateEntity(this.collectionKey, id, items[index]);
        return items[index];
    }

    /** Elimina una entidad. Actualiza caché + API. */
    delete(id) {
        const items = this.getAll();
        const index = items.findIndex(item => item.id === id);
        if (index === -1) {
            throw new Error(`Entidad con ID "${id}" no encontrada en "${this.collectionKey}".`);
        }
        items.splice(index, 1);
        saveCollection(this.collectionKey, items);
        // Persistir en MySQL (async)
        deleteEntity(this.collectionKey, id);
    }

    /** Busca elementos que cumplan con el predicado. */
    findBy(predicate) {
        return this.getAll().filter(predicate);
    }
}
