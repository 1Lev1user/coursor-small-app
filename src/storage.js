import { SCHEMA_VERSION, defaultData, normalise } from './model.js';

export const STORAGE_KEY = 'my-expenses-v1';
export const RESCUE_KEY = 'my-expenses-rescue';
export const PRE_UPDATE_KEY = `my-expenses-before-v${SCHEMA_VERSION}`;

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
 * Keeps the untouched old data under PRE_UPDATE_KEY, then writes the
 * migrated data so the update happens once. If the copy cannot be kept,
 * the old data is left in place and the app runs on the migrated copy in
 * memory until the next successful save.
 */
function finishMigration(raw, from, data, storage) {
    try {
        if (storage.getItem(PRE_UPDATE_KEY) === null) {
            storage.setItem(PRE_UPDATE_KEY, raw);
        }
        storage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
        return { status: 'ok', data, migratedFrom: from, migrationSaved: false };
    }
    return { status: 'ok', data, migratedFrom: from, migrationSaved: true };
}

export function readPreUpdateCopy(storage = globalThis.localStorage) {
    try {
        return storage?.getItem(PRE_UPDATE_KEY) ?? null;
    } catch {
        return null;
    }
}

/** Removes the pre-update copy from this device only; current data is untouched. */
export function deletePreUpdateCopy(storage = globalThis.localStorage) {
    if (storage === undefined || storage === null) {
        return false;
    }
    try {
        storage.removeItem(PRE_UPDATE_KEY);
        return true;
    } catch {
        return false;
    }
}

/** The rescue copy saved when a load could not be read, or null. */
export function readRescueCopy(storage = globalThis.localStorage) {
    try {
        return storage?.getItem(RESCUE_KEY) ?? null;
    } catch {
        return null;
    }
}

/** Removes the rescue copy from this device only; current data is untouched. */
export function deleteRescueCopy(storage = globalThis.localStorage) {
    if (storage === undefined || storage === null) {
        return false;
    }
    try {
        storage.removeItem(RESCUE_KEY);
        return true;
    } catch {
        return false;
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
            const from = versionOf(parsed);
            if (from !== null && from < SCHEMA_VERSION) {
                return finishMigration(raw, from, result.data, storage);
            }
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
        // The app always writes version first, so most saves avoid parsing
        // the whole history just to read it.
        const leading = /^\{"version":(\d+),/.exec(raw);
        const version = leading ? Number(leading[1]) : versionOf(parseStored(raw));
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
