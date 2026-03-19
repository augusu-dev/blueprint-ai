export const SPACE_MODES = ['chat', 'graph', 'map'];
export const DEFAULT_SPACE_MODE = 'chat';
export const SPACE_ROUTE_PREFIX = 'S';

export function isSpaceMode(mode) {
    return SPACE_MODES.includes(mode);
}

export function getSpacePath(spaceId, mode = DEFAULT_SPACE_MODE) {
    const safeMode = isSpaceMode(mode) ? mode : DEFAULT_SPACE_MODE;
    return `/${SPACE_ROUTE_PREFIX}/${safeMode}/${spaceId}`;
}

export function resolveSpaceRouteParams(params = {}) {
    const directMode = params.mode;
    const directId = params.id;
    if (directId && isSpaceMode(directMode)) {
        return {
            spaceId: directId,
            mode: directMode,
            isCanonical: true,
        };
    }

    const first = params.first;
    const second = params.second;
    if (first && second) {
        if (isSpaceMode(first)) {
            return {
                spaceId: second,
                mode: first,
                isCanonical: true,
            };
        }
        if (isSpaceMode(second)) {
            return {
                spaceId: first,
                mode: second,
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
