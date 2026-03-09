export const SPACE_MODES = ['chat', 'graph', 'map'];
export const DEFAULT_SPACE_MODE = 'chat';

export function isSpaceMode(mode) {
    return SPACE_MODES.includes(mode);
}

export function getSpacePath(spaceId, mode = DEFAULT_SPACE_MODE) {
    const safeMode = isSpaceMode(mode) ? mode : DEFAULT_SPACE_MODE;
    return `/space/${spaceId}/${safeMode}`;
}
