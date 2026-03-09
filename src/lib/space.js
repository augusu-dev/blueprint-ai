export const MAP_WORLD_SIZE = 100;
export const MAP_CENTER_INDEX = MAP_WORLD_SIZE / 2;
export const MAP_HUT_TILES = [
    { x: MAP_CENTER_INDEX - 1, y: MAP_CENTER_INDEX - 1 },
    { x: MAP_CENTER_INDEX, y: MAP_CENTER_INDEX - 1 },
    { x: MAP_CENTER_INDEX - 1, y: MAP_CENTER_INDEX },
    { x: MAP_CENTER_INDEX, y: MAP_CENTER_INDEX },
];

export function createTileId(x, y) {
    return `${x},${y}`;
}

function createDefaultRevealedTiles() {
    const revealed = new Set();

    for (let y = MAP_CENTER_INDEX - 7; y <= MAP_CENTER_INDEX + 6; y += 1) {
        for (let x = MAP_CENTER_INDEX - 7; x <= MAP_CENTER_INDEX + 6; x += 1) {
            revealed.add(createTileId(x, y));
        }
    }

    return [...revealed];
}

function isFiniteCoordinate(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function parseTileId(tileId) {
    if (typeof tileId !== 'string') return null;
    const [x, y] = tileId.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
}

function isLegacyMapState(mapState) {
    if (!mapState) return false;

    const playerX = mapState?.player?.x;
    const playerY = mapState?.player?.y;
    if (isFiniteCoordinate(playerX) && isFiniteCoordinate(playerY) && playerX <= 8 && playerY <= 8) {
        return true;
    }

    if (!Array.isArray(mapState?.revealedTileIds) || mapState.revealedTileIds.length === 0) {
        return false;
    }

    return mapState.revealedTileIds.every((tileId) => {
        const parsed = parseTileId(tileId);
        return parsed ? parsed.x <= 8 && parsed.y <= 8 : false;
    });
}

export function clampWorldCoordinate(value) {
    return Math.max(0, Math.min(MAP_WORLD_SIZE - 0.001, value));
}

export function createInitialNodes() {
    return [
        {
            id: 'goal-1',
            type: 'goalNode',
            position: { x: -320, y: 120 },
            data: {},
        },
        {
            id: '1',
            type: 'sequenceNode',
            position: { x: 100, y: 100 },
            data: { isStarter: true, dir: 'LR', prompt: '' },
        },
    ];
}

export function createInitialEdges() {
    return [
        { id: 'e-goal-1', source: 'goal-1', sourceHandle: 'goal', target: '1', animated: true, type: 'deleteEdge' },
    ];
}

export function createDefaultMapState() {
    return {
        player: { x: MAP_CENTER_INDEX + 0.48, y: MAP_CENTER_INDEX + 2.7 },
        camera: { x: MAP_CENTER_INDEX, y: MAP_CENTER_INDEX },
        revealedTileIds: createDefaultRevealedTiles(),
        activeQuestIds: ['goal-quest', 'chat-quest', 'graph-quest', 'explorer-quest'],
        completedQuestIds: [],
        rewards: {
            xp: 0,
            coins: 0,
            keys: 0,
        },
    };
}

export function normalizeMapState(mapState) {
    const defaults = createDefaultMapState();
    const source = isLegacyMapState(mapState)
        ? {
            ...defaults,
            activeQuestIds: Array.isArray(mapState?.activeQuestIds) ? mapState.activeQuestIds : defaults.activeQuestIds,
            completedQuestIds: Array.isArray(mapState?.completedQuestIds) ? mapState.completedQuestIds : defaults.completedQuestIds,
            rewards: {
                xp: typeof mapState?.rewards?.xp === 'number' ? mapState.rewards.xp : defaults.rewards.xp,
                coins: typeof mapState?.rewards?.coins === 'number' ? mapState.rewards.coins : defaults.rewards.coins,
                keys: typeof mapState?.rewards?.keys === 'number' ? mapState.rewards.keys : defaults.rewards.keys,
            },
        }
        : mapState;

    return {
        player: {
            x: isFiniteCoordinate(source?.player?.x) ? clampWorldCoordinate(source.player.x) : defaults.player.x,
            y: isFiniteCoordinate(source?.player?.y) ? clampWorldCoordinate(source.player.y) : defaults.player.y,
        },
        camera: {
            x: isFiniteCoordinate(source?.camera?.x) ? clampWorldCoordinate(source.camera.x) : defaults.camera.x,
            y: isFiniteCoordinate(source?.camera?.y) ? clampWorldCoordinate(source.camera.y) : defaults.camera.y,
        },
        revealedTileIds: Array.isArray(source?.revealedTileIds) && source.revealedTileIds.length > 0
            ? source.revealedTileIds
            : defaults.revealedTileIds,
        activeQuestIds: Array.isArray(source?.activeQuestIds)
            ? source.activeQuestIds
            : defaults.activeQuestIds,
        completedQuestIds: Array.isArray(source?.completedQuestIds)
            ? source.completedQuestIds
            : defaults.completedQuestIds,
        rewards: {
            xp: typeof source?.rewards?.xp === 'number' ? source.rewards.xp : defaults.rewards.xp,
            coins: typeof source?.rewards?.coins === 'number' ? source.rewards.coins : defaults.rewards.coins,
            keys: typeof source?.rewards?.keys === 'number' ? source.rewards.keys : defaults.rewards.keys,
        },
    };
}

export function createSpaceData(title) {
    return {
        title,
        nodes: createInitialNodes(),
        edges: createInitialEdges(),
        map_state: createDefaultMapState(),
        updated_at: new Date().toISOString(),
    };
}
