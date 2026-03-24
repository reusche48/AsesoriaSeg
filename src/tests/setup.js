/**
 * Setup para tests: provee un mock de localStorage para entorno Node.
 */
const store = {};

const localStorageMock = {
    getItem(key) {
        return store[key] ?? null;
    },
    setItem(key, value) {
        store[key] = String(value);
    },
    removeItem(key) {
        delete store[key];
    },
    clear() {
        for (const key of Object.keys(store)) {
            delete store[key];
        }
    },
    get length() {
        return Object.keys(store).length;
    },
    key(index) {
        return Object.keys(store)[index] ?? null;
    },
};

globalThis.localStorage = localStorageMock;
