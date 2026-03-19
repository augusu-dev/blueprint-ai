const DICTIONARY_STORAGE_PREFIX = 'blueprint_dictionary_';

export function getDictionaryStorageKey(spaceId) {
    return `${DICTIONARY_STORAGE_PREFIX}${spaceId || 'default'}`;
}

export function normalizeDictionaryEntry(entry) {
    const term = typeof entry?.term === 'string' ? entry.term.trim().replace(/\s+/g, ' ') : '';
    const explanation = typeof entry?.explanation === 'string' ? entry.explanation.trim() : '';
    const now = new Date().toISOString();

    return {
        id: entry?.id || crypto.randomUUID(),
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
        return Array.isArray(parsed) ? parsed.map(normalizeDictionaryEntry).filter((entry) => entry.term) : [];
    } catch {
        return [];
    }
}

export function saveDictionaryEntries(spaceId, entries) {
    const normalized = Array.isArray(entries)
        ? entries.map(normalizeDictionaryEntry).filter((entry) => entry.term)
        : [];

    localStorage.setItem(getDictionaryStorageKey(spaceId), JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent('dictionaryUpdated', { detail: { spaceId: spaceId || null } }));
    return normalized;
}

export function upsertDictionaryEntry(spaceId, nextEntry) {
    const normalized = normalizeDictionaryEntry(nextEntry);
    if (!normalized.term) return null;

    const now = new Date().toISOString();
    const entries = loadDictionaryEntries(spaceId);
    const existingIndex = entries.findIndex((entry) => entry.id === normalized.id || entry.term === normalized.term);

    if (existingIndex >= 0) {
        const existing = entries[existingIndex];
        const merged = {
            ...existing,
            ...normalized,
            id: existing.id,
            term: normalized.term || existing.term,
            explanation: normalized.explanation || existing.explanation,
            createdAt: existing.createdAt || normalized.createdAt || now,
            updatedAt: now,
            collapsed: typeof nextEntry?.collapsed === 'boolean' ? nextEntry.collapsed : existing.collapsed,
        };
        const nextEntries = [merged, ...entries.filter((_, index) => index !== existingIndex)];
        saveDictionaryEntries(spaceId, nextEntries);
        return merged;
    }

    const next = {
        ...normalized,
        createdAt: normalized.createdAt || now,
        updatedAt: now,
        collapsed: typeof nextEntry?.collapsed === 'boolean' ? nextEntry.collapsed : true,
    };
    saveDictionaryEntries(spaceId, [next, ...entries]);
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
            createdAt: entry.createdAt,
            collapsed: typeof updated?.collapsed === 'boolean' ? updated.collapsed : entry.collapsed,
        });
    });
    saveDictionaryEntries(spaceId, nextEntries);
    return nextEntries.find((entry) => entry.id === entryId) || null;
}

export function removeDictionaryEntries(spaceId, entryIds = []) {
    const ids = new Set(entryIds.filter(Boolean));
    if (ids.size === 0) return loadDictionaryEntries(spaceId);

    const nextEntries = loadDictionaryEntries(spaceId).filter((entry) => !ids.has(entry.id));
    saveDictionaryEntries(spaceId, nextEntries);
    return nextEntries;
}
