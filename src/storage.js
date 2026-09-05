import { defaultData, normalise } from './model.js';

export const STORAGE_KEY = 'my-expenses-v1';

export function load(storage = globalThis.localStorage) {
    if (storage === undefined || storage === null) {
        return defaultData();
    }

    try {
        const stored = storage.getItem(STORAGE_KEY);
        if (stored === null) {
            return defaultData();
        }

        const result = normalise(JSON.parse(stored));
        return result.ok ? result.data : defaultData();
    } catch {
        return defaultData();
    }
}

export function save(data, storage = globalThis.localStorage) {
    if (storage === undefined || storage === null) {
        return false;
    }

    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(data));
        return true;
    } catch {
        return false;
    }
}

export async function requestPersistence(nav = globalThis.navigator) {
    try {
        if (
            nav === undefined
            || nav === null
            || nav.storage === undefined
            || typeof nav.storage.persist !== 'function'
        ) {
            return false;
        }

        if (
            typeof nav.storage.persisted === 'function'
            && await nav.storage.persisted()
        ) {
            return true;
        }

        return await nav.storage.persist() === true;
    } catch {
        return false;
    }
}
