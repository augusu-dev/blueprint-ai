const DICTIONARY_STORAGE_PREFIX = 'blueprint_dictionary_';

function getStorageKeys() {
    return Object.keys(localStorage).filter((key) => key.startsWith(DICTIONARY_STORAGE_PREFIX));
}

export function getDictionaryStorageKey(spaceId) {
    return `${DICTIONARY_STORAGE_PREFIX}${spaceId || 'default'}`;
}

export function normalizeDictionaryEntry(entry, fallbackSpaceId = null) {
    const term = typeof entry?.term === 'string' ? entry.term.trim().replace(/\s+/g, ' ') : '';
    const explanation = typeof entry?.explanation === 'string' ? entry.explanation.trim() : '';
    const now = new Date().toISOString();
    const rawSpaceId = typeof entry?.spaceId === 'string' && entry.spaceId.trim()
        ? entry.spaceId.trim()
        : (fallbackSpaceId || 'default');

    return {
        id: entry?.id || crypto.randomUUID(),
        spaceId: rawSpaceId,
        term,
        explanation,
        createdAt: entry?.createdAt || now,
        updatedAt: entry?.updatedAt || entry?.createdAt || now,
        collapsed: typeof entry?.collapsed === 'boolean' ? entry.collapsed : true,
    };
}

export function loadDictionaryEntries(spaceId) {
    try {
        const raw = localStorage.getItem(getDictionaryStorageKey(spaceId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed
                .map((entry) => normalizeDictionaryEntry(entry, spaceId))
                .filter((entry) => entry.term)
            : [];
    } catch {
        return [];
    }
}

export function loadAllDictionaryEntries() {
    return getStorageKeys().flatMap((storageKey) => {
        const spaceId = storageKey.replace(DICTIONARY_STORAGE_PREFIX, '') || 'default';
        return loadDictionaryEntries(spaceId);
    });
}

export function saveDictionaryEntries(spaceId, entries) {
    const normalized = Array.isArray(entries)
        ? entries
            .map((entry) => normalizeDictionaryEntry(entry, spaceId))
            .filter((entry) => entry.term)
        : [];

    localStorage.setItem(getDictionaryStorageKey(spaceId), JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent('dictionaryUpdated', { detail: { spaceId: spaceId || null } }));
    return normalized;
}

export function upsertDictionaryEntry(spaceId, nextEntry) {
    const normalized = normalizeDictionaryEntry(nextEntry, nextEntry?.spaceId || spaceId);
    if (!normalized.term) return null;

    const targetSpaceId = normalized.spaceId;
    const now = new Date().toISOString();
    const entries = loadDictionaryEntries(targetSpaceId);
    const existingIndex = entries.findIndex((entry) => entry.id === normalized.id || entry.term === normalized.term);

    if (existingIndex >= 0) {
        const existing = entries[existingIndex];
        const merged = {
            ...existing,
            ...normalized,
            id: existing.id,
            spaceId: targetSpaceId,
            term: normalized.term || existing.term,
            explanation: normalized.explanation || existing.explanation,
            createdAt: existing.createdAt || normalized.createdAt || now,
            updatedAt: now,
            collapsed: typeof nextEntry?.collapsed === 'boolean' ? nextEntry.collapsed : existing.collapsed,
        };
        saveDictionaryEntries(targetSpaceId, [merged, ...entries.filter((_, index) => index !== existingIndex)]);
        return merged;
    }

    const next = {
        ...normalized,
        spaceId: targetSpaceId,
        createdAt: normalized.createdAt || now,
        updatedAt: now,
        collapsed: typeof nextEntry?.collapsed === 'boolean' ? nextEntry.collapsed : true,
    };
    saveDictionaryEntries(targetSpaceId, [next, ...entries]);
    return next;
}

export function updateDictionaryEntry(spaceId, entryId, updater) {
    const entries = loadDictionaryEntries(spaceId);
    const nextEntries = entries.map((entry) => {
        if (entry.id !== entryId) return entry;
        const updated = typeof updater === 'function' ? updater(entry) : { ...entry, ...updater };
        return normalizeDictionaryEntry({
            ...updated,
            id: entry.id,
            spaceId,
            createdAt: entry.createdAt,
            collapsed: typeof updated?.collapsed === 'boolean' ? updated.collapsed : entry.collapsed,
        }, spaceId);
    });
    saveDictionaryEntries(spaceId, nextEntries);
    return nextEntries.find((entry) => entry.id === entryId) || null;
}

export function updateDictionaryEntryById(entryId, updater) {
    const existing = loadAllDictionaryEntries().find((entry) => entry.id === entryId);
    if (!existing) return null;
    return updateDictionaryEntry(existing.spaceId, entryId, updater);
}

export function removeDictionaryEntries(spaceId, entryIds = []) {
    const ids = new Set(entryIds.filter(Boolean));
    if (ids.size === 0) return loadDictionaryEntries(spaceId);

    const nextEntries = loadDictionaryEntries(spaceId).filter((entry) => !ids.has(entry.id));
    saveDictionaryEntries(spaceId, nextEntries);
    return nextEntries;
}

export function removeDictionaryEntriesById(entryIds = []) {
    const ids = new Set(entryIds.filter(Boolean));
    if (ids.size === 0) return loadAllDictionaryEntries();

    const grouped = loadAllDictionaryEntries().reduce((accumulator, entry) => {
        const bucket = accumulator.get(entry.spaceId) || [];
        if (!ids.has(entry.id)) {
            bucket.push(entry);
        }
        accumulator.set(entry.spaceId, bucket);
        return accumulator;
    }, new Map());

    const seenSpaceIds = new Set(loadAllDictionaryEntries().map((entry) => entry.spaceId));
    seenSpaceIds.forEach((spaceId) => {
        saveDictionaryEntries(spaceId, grouped.get(spaceId) || []);
    });

    return loadAllDictionaryEntries();
}
