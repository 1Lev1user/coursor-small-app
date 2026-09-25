import { SCHEMA_VERSION, defaultData, normalise } from './model.js';

export const STORAGE_KEY = 'my-expenses-v1';
export const RESCUE_KEY = 'my-expenses-rescue';

function parseStored(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
}

function versionOf(parsed) {
    return parsed !== null
        && typeof parsed === 'object'
        && typeof parsed.version === 'number'
        ? parsed.version
        : null;
}

function keepRescueCopy(raw, storage) {
    try {
        if (storage.getItem(RESCUE_KEY) === null) {
            storage.setItem(RESCUE_KEY, raw);
        }
    } catch {
        // The caller still gets the raw text and can offer a download.
    }
}

/*
 * Reads saved data and says whether it can be used.
 * status 'ok': data is usable (or nothing was saved yet).
 * status 'newer': saved by a newer app version; this copy must not write.
 * status 'unreadable': damaged or unknown format; raw text is kept aside.
 */
export function open(storage = globalThis.localStorage) {
    if (storage === undefined || storage === null) {
        return { status: 'ok', data: defaultData() };
    }

    let raw;
    try {
        raw = storage.getItem(STORAGE_KEY);
    } catch {
        return { status: 'ok', data: defaultData() };
    }
    if (raw === null) {
        return { status: 'ok', data: defaultData() };
    }

    const parsed = parseStored(raw);
    if (parsed !== undefined) {
        const result = normalise(parsed);
        if (result.ok) {
            return { status: 'ok', data: result.data };
        }
    }

    keepRescueCopy(raw, storage);
    const version = versionOf(parsed);
    if (version !== null && version > SCHEMA_VERSION) {
        return { status: 'newer', data: defaultData(), raw, version };
    }
    return { status: 'unreadable', data: defaultData(), raw };
}

export function load(storage = globalThis.localStorage) {
    return open(storage).data;
}

export function storedIsNewer(storage = globalThis.localStorage) {
    if (storage === undefined || storage === null) {
        return false;
    }
    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (raw === null) {
            return false;
        }
        const version = versionOf(parseStored(raw));
        return version !== null && version > SCHEMA_VERSION;
    } catch {
        return false;
    }
}

export function save(data, storage = globalThis.localStorage) {
    if (storage === undefined || storage === null) {
        return false;
    }

    // An older copy of the app left open must never overwrite newer data.
    if (storedIsNewer(storage)) {
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
