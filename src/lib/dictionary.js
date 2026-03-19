const DICTIONARY_STORAGE_PREFIX = 'blueprint_dictionary_';
const DICTIONARY_SOURCE_KINDS = new Set(['dictionary', 'explanation']);

function getStorageKeys() {
    if (typeof localStorage === 'undefined') return [];
    return Object.keys(localStorage).filter((key) => key.startsWith(DICTIONARY_STORAGE_PREFIX));
}

function clampVariantIndex(value, length) {
    if (length <= 0) return 0;
    const parsed = Number.isInteger(value) ? value : Number.parseInt(value ?? '0', 10);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(Math.max(parsed, 0), length - 1);
}

function uniqueStrings(values = []) {
    return [...new Set(values.filter(Boolean))];
}

function normalizeVariant(variant, fallbackText = '') {
    const text = typeof variant?.text === 'string'
        ? variant.text.trim()
        : String(fallbackText || '').trim();
    if (!text) return null;

    const now = new Date().toISOString();
    return {
        id: variant?.id || crypto.randomUUID(),
        text,
        createdAt: variant?.createdAt || now,
        updatedAt: variant?.updatedAt || variant?.createdAt || now,
    };
}

function normalizeVariants(entry) {
    const fallbackExplanation = typeof entry?.explanation === 'string' ? entry.explanation.trim() : '';
    const rawVariants = Array.isArray(entry?.variants) ? entry.variants : [];
    const variants = rawVariants
        .map((variant) => normalizeVariant(variant))
        .filter(Boolean);

    if (variants.length > 0) return variants;
    if (!fallbackExplanation) return [];
    return [normalizeVariant({ text: fallbackExplanation })];
}

function normalizeSourceKinds(entry) {
    const rawKinds = Array.isArray(entry?.sourceKinds)
        ? entry.sourceKinds
        : (typeof entry?.sourceKind === 'string' ? [entry.sourceKind] : []);

    return uniqueStrings(
        rawKinds
            .map((value) => String(value || '').trim().toLowerCase())
            .filter((value) => DICTIONARY_SOURCE_KINDS.has(value)),
    );
}

function normalizeSourceRef(sourceRef, fallbackSpaceId = null) {
    if (!sourceRef || typeof sourceRef !== 'object') return null;

    const normalized = {
        spaceId: typeof sourceRef.spaceId === 'string' && sourceRef.spaceId.trim()
            ? sourceRef.spaceId.trim()
            : (fallbackSpaceId || null),
        chatNodeId: typeof sourceRef.chatNodeId === 'string' && sourceRef.chatNodeId.trim()
            ? sourceRef.chatNodeId.trim()
            : null,
        messageIndex: Number.isInteger(sourceRef.messageIndex) ? sourceRef.messageIndex : null,
        start: Number.isInteger(sourceRef.start) ? sourceRef.start : null,
        end: Number.isInteger(sourceRef.end) ? sourceRef.end : null,
        term: typeof sourceRef.term === 'string' ? sourceRef.term.trim() : '',
        explanationId: typeof sourceRef.explanationId === 'string' && sourceRef.explanationId.trim()
            ? sourceRef.explanationId.trim()
            : null,
    };

    const hasValue = normalized.spaceId
        || normalized.chatNodeId
        || normalized.messageIndex !== null
        || normalized.start !== null
        || normalized.end !== null
        || normalized.term
        || normalized.explanationId;

    return hasValue ? normalized : null;
}

function mergeVariants(existingEntry, incomingEntry, rawNextEntry, now) {
    const existingVariants = normalizeVariants(existingEntry);
    const incomingVariants = normalizeVariants(incomingEntry);

    if (incomingVariants.length === 0) {
        return {
            variants: existingVariants,
            activeVariantIndex: clampVariantIndex(existingEntry?.activeVariantIndex, existingVariants.length),
        };
    }

    if (rawNextEntry?.replaceVariants) {
        const nextVariants = incomingVariants.map((variant) => ({
            ...variant,
            updatedAt: now,
        }));
        return {
            variants: nextVariants,
            activeVariantIndex: clampVariantIndex(rawNextEntry?.activeVariantIndex, nextVariants.length),
        };
    }

    if (rawNextEntry?.replaceActiveVariant && existingVariants.length > 0) {
        const targetIndex = clampVariantIndex(
            Number.isInteger(rawNextEntry?.activeVariantIndex)
                ? rawNextEntry.activeVariantIndex
                : existingEntry?.activeVariantIndex,
            existingVariants.length,
        );
        const replacement = incomingVariants[0];
        const current = existingVariants[targetIndex] || null;
        const nextVariants = existingVariants.map((variant, index) => (
            index === targetIndex
                ? {
                    ...replacement,
                    id: current?.id || replacement.id,
                    createdAt: current?.createdAt || replacement.createdAt || now,
                    updatedAt: now,
                }
                : variant
        ));
        return {
            variants: nextVariants,
            activeVariantIndex: targetIndex,
        };
    }

    const nextVariants = existingVariants.map((variant) => ({ ...variant }));
    let activeVariantIndex = clampVariantIndex(existingEntry?.activeVariantIndex, nextVariants.length);

    incomingVariants.forEach((variant) => {
        const duplicateIndex = nextVariants.findIndex((item) => item.text === variant.text);
        if (duplicateIndex >= 0 && !rawNextEntry?.forceAddVariant) {
            nextVariants[duplicateIndex] = {
                ...nextVariants[duplicateIndex],
                updatedAt: now,
            };
            activeVariantIndex = duplicateIndex;
            return;
        }

        nextVariants.push({
            ...variant,
            updatedAt: now,
        });
        activeVariantIndex = nextVariants.length - 1;
    });

    return {
        variants: nextVariants,
        activeVariantIndex,
    };
}

export function getDictionaryStorageKey(spaceId) {
    return `${DICTIONARY_STORAGE_PREFIX}${spaceId || 'default'}`;
}

export function getDictionaryEntryVariants(entry) {
    return normalizeVariants(entry);
}

export function getDictionaryEntryExplanation(entry) {
    const variants = normalizeVariants(entry);
    if (variants.length === 0) {
        return typeof entry?.explanation === 'string' ? entry.explanation.trim() : '';
    }

    const activeVariantIndex = clampVariantIndex(entry?.activeVariantIndex, variants.length);
    return variants[activeVariantIndex]?.text || '';
}

export function normalizeDictionaryEntry(entry, fallbackSpaceId = null) {
    const now = new Date().toISOString();
    const term = typeof entry?.term === 'string' ? entry.term.trim().replace(/\s+/g, ' ') : '';
    const rawSpaceId = typeof entry?.spaceId === 'string' && entry.spaceId.trim()
        ? entry.spaceId.trim()
        : (fallbackSpaceId || 'default');
    const variants = normalizeVariants(entry);
    const activeVariantIndex = clampVariantIndex(entry?.activeVariantIndex, variants.length);
    const explanation = variants[activeVariantIndex]?.text
        || (typeof entry?.explanation === 'string' ? entry.explanation.trim() : '');

    return {
        id: entry?.id || crypto.randomUUID(),
        spaceId: rawSpaceId,
        term,
        explanation,
        variants,
        activeVariantIndex,
        sourceKinds: normalizeSourceKinds(entry),
        sourceRef: normalizeSourceRef(entry?.sourceRef, rawSpaceId),
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
        const variantState = mergeVariants(existing, normalized, nextEntry, now);
        const merged = normalizeDictionaryEntry({
            ...existing,
            ...normalized,
            id: existing.id,
            spaceId: targetSpaceId,
            term: normalized.term || existing.term,
            variants: variantState.variants,
            activeVariantIndex: variantState.activeVariantIndex,
            explanation: variantState.variants[variantState.activeVariantIndex]?.text
                || normalized.explanation
                || existing.explanation,
            sourceKinds: uniqueStrings([
                ...(Array.isArray(existing.sourceKinds) ? existing.sourceKinds : []),
                ...(Array.isArray(normalized.sourceKinds) ? normalized.sourceKinds : []),
            ]),
            sourceRef: normalized.sourceRef || existing.sourceRef || null,
            createdAt: existing.createdAt || normalized.createdAt || now,
            updatedAt: now,
            collapsed: typeof nextEntry?.collapsed === 'boolean' ? nextEntry.collapsed : existing.collapsed,
        }, targetSpaceId);

        saveDictionaryEntries(targetSpaceId, [merged, ...entries.filter((_, index) => index !== existingIndex)]);
        return merged;
    }

    const incomingVariants = normalizeVariants(normalized);
    const next = normalizeDictionaryEntry({
        ...normalized,
        spaceId: targetSpaceId,
        variants: incomingVariants,
        activeVariantIndex: incomingVariants.length > 0
            ? clampVariantIndex(
                Number.isInteger(nextEntry?.activeVariantIndex)
                    ? nextEntry.activeVariantIndex
                    : incomingVariants.length - 1,
                incomingVariants.length,
            )
            : 0,
        createdAt: normalized.createdAt || now,
        updatedAt: now,
        collapsed: typeof nextEntry?.collapsed === 'boolean' ? nextEntry.collapsed : true,
    }, targetSpaceId);

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
            updatedAt: new Date().toISOString(),
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

    const allEntries = loadAllDictionaryEntries();
    const grouped = allEntries.reduce((accumulator, entry) => {
        const bucket = accumulator.get(entry.spaceId) || [];
        if (!ids.has(entry.id)) {
            bucket.push(entry);
        }
        accumulator.set(entry.spaceId, bucket);
        return accumulator;
    }, new Map());

    const seenSpaceIds = new Set(allEntries.map((entry) => entry.spaceId));
    seenSpaceIds.forEach((spaceId) => {
        saveDictionaryEntries(spaceId, grouped.get(spaceId) || []);
    });

    return loadAllDictionaryEntries();
}
