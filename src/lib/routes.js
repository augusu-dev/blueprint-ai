export const SPACE_MODES = ['chat', 'graph', 'map'];
export const DEFAULT_SPACE_MODE = 'chat';
export const SPACE_ROUTE_PREFIX = 's';
const SPACE_MODE_SLUGS = {
    chat: 'c',
    graph: 'g',
    map: 'm',
};
const SPACE_MODE_ALIASES = Object.fromEntries(
    Object.entries(SPACE_MODE_SLUGS).map(([mode, slug]) => [slug, mode]),
);

export function normalizeSpaceMode(mode) {
    if (typeof mode !== 'string') return DEFAULT_SPACE_MODE;
    if (SPACE_MODES.includes(mode)) return mode;
    return SPACE_MODE_ALIASES[mode] || DEFAULT_SPACE_MODE;
}

export function isSpaceMode(mode) {
    return SPACE_MODES.includes(mode) || Boolean(SPACE_MODE_ALIASES[mode]);
}

export function getSpaceModeSlug(mode) {
    return SPACE_MODE_SLUGS[normalizeSpaceMode(mode)] || SPACE_MODE_SLUGS[DEFAULT_SPACE_MODE];
}

export function getSpacePath(spaceId, mode = DEFAULT_SPACE_MODE) {
    const safeMode = normalizeSpaceMode(mode);
    return `/${SPACE_ROUTE_PREFIX}/${getSpaceModeSlug(safeMode)}/${spaceId}`;
}

export function resolveSpaceRouteParams(params = {}) {
    const directMode = params.mode;
    const directId = params.id;
    if (directId && isSpaceMode(directMode)) {
        return {
            spaceId: directId,
            mode: normalizeSpaceMode(directMode),
            isCanonical: true,
        };
    }

    const first = params.first;
    const second = params.second;
    if (first && second) {
        if (isSpaceMode(first)) {
            return {
                spaceId: second,
                mode: normalizeSpaceMode(first),
                isCanonical: true,
            };
        }
        if (isSpaceMode(second)) {
            return {
                spaceId: first,
                mode: normalizeSpaceMode(second),
                isCanonical: false,
            };
        }
    }

    if (directId) {
        return {
            spaceId: directId,
            mode: DEFAULT_SPACE_MODE,
            isCanonical: true,
        };
    }

    return {
        spaceId: null,
        mode: DEFAULT_SPACE_MODE,
        isCanonical: false,
    };
}
