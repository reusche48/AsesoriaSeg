import { getCollection, saveCollection, generateId, saveEntity, updateEntity, deleteEntity, getCurrentUser, isAdminUser } from '../storage.js';

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
        // Persistir en MySQL (async) — notifica si falla
        saveEntity(this.collectionKey, newEntity).catch(err => {
            console.error(`[Repo] Error guardando en "${this.collectionKey}":`, err);
            this._notifyWriteError('guardar');
        });
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
        // Persistir en MySQL (async) — notifica si falla
        updateEntity(this.collectionKey, id, items[index]).catch(err => {
            console.error(`[Repo] Error actualizando en "${this.collectionKey}":`, err);
            this._notifyWriteError('actualizar');
        });
        return items[index];
    }

    /** Elimina una entidad. Actualiza caché + API. Solo admin puede eliminar (el servidor lo exige). */
    delete(id) {
        const items = this.getAll();
        const index = items.findIndex(item => item.id === id);
        if (index === -1) {
            throw new Error(`Entidad con ID "${id}" no encontrada en "${this.collectionKey}".`);
        }
        const admin = isAdminUser();
        const removed = items[index];

        // Solo el admin remueve del caché de inmediato; el no-admin verá el item intacto
        if (admin) {
            items.splice(index, 1);
            saveCollection(this.collectionKey, items);
        }

        // El servidor aplica la regla y registra el intento (eliminado / denegado)
        deleteEntity(this.collectionKey, id).then(res => {
            if (res && res.ok) return;
            if (res && res.status === 403) {
                // No-admin: eliminación denegada (ya quedó registrada en el log)
                this._notifyDeleteDenied();
            } else {
                // Error real: si removimos optimistamente, revertir
                if (admin) {
                    const cur = this.getAll();
                    if (!cur.some(i => i.id === id)) { cur.splice(index, 0, removed); saveCollection(this.collectionKey, cur); }
                }
                this._notifyWriteError('eliminar');
            }
        }).catch(() => {
            if (admin) {
                const cur = this.getAll();
                if (!cur.some(i => i.id === id)) { cur.splice(index, 0, removed); saveCollection(this.collectionKey, cur); }
            }
            this._notifyWriteError('eliminar');
        });
    }

    /** Muestra un toast cuando un no-admin intenta eliminar (denegado + registrado) */
    _notifyDeleteDenied() {
        if (typeof document === 'undefined') return; // entorno de tests (Node)
        const existing = document.getElementById('write-error-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'write-error-toast';
        toast.style.cssText = 'position:fixed;bottom:1rem;right:1rem;background:#b45309;color:#fff;padding:0.75rem 1rem;border-radius:6px;z-index:99999;font-size:0.9rem;box-shadow:0 4px 12px rgba(0,0,0,0.3);max-width:340px;';
        toast.textContent = '🚫 Solo un administrador puede eliminar. Tu intento quedó registrado en el log.';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 6000);
    }

    /** Muestra un toast de error si una escritura a la API falla */
    _notifyWriteError(accion) {
        if (typeof document === 'undefined') return; // entorno de tests (Node)
        const existing = document.getElementById('write-error-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'write-error-toast';
        toast.style.cssText = 'position:fixed;bottom:1rem;right:1rem;background:#c62828;color:#fff;padding:0.9rem 1.1rem;border-radius:8px;z-index:99999;font-size:0.92rem;line-height:1.35;box-shadow:0 4px 14px rgba(0,0,0,0.4);max-width:360px;';
        toast.innerHTML = `<strong>⚠️ No se pudo ${accion} en el servidor.</strong><br>
            Revisa tu conexión y <u>vuelve a intentarlo</u>.<br>
            <span style="font-size:0.82rem;opacity:0.9;">No recargues la página: perderías este cambio.</span>`;
        document.body.appendChild(toast);
        setTimeout(() => { toast.remove(); }, 12000);
    }

    /** Busca elementos que cumplan con el predicado. */
    findBy(predicate) {
        return this.getAll().filter(predicate);
    }
}
