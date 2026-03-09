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

    return {
        player: {
            x: isFiniteCoordinate(mapState?.player?.x) ? clampWorldCoordinate(mapState.player.x) : defaults.player.x,
            y: isFiniteCoordinate(mapState?.player?.y) ? clampWorldCoordinate(mapState.player.y) : defaults.player.y,
        },
        camera: {
            x: isFiniteCoordinate(mapState?.camera?.x) ? clampWorldCoordinate(mapState.camera.x) : defaults.camera.x,
            y: isFiniteCoordinate(mapState?.camera?.y) ? clampWorldCoordinate(mapState.camera.y) : defaults.camera.y,
        },
        revealedTileIds: Array.isArray(mapState?.revealedTileIds) && mapState.revealedTileIds.length > 0
            ? mapState.revealedTileIds
            : defaults.revealedTileIds,
        activeQuestIds: Array.isArray(mapState?.activeQuestIds)
            ? mapState.activeQuestIds
            : defaults.activeQuestIds,
        completedQuestIds: Array.isArray(mapState?.completedQuestIds)
            ? mapState.completedQuestIds
            : defaults.completedQuestIds,
        rewards: {
            xp: typeof mapState?.rewards?.xp === 'number' ? mapState.rewards.xp : defaults.rewards.xp,
            coins: typeof mapState?.rewards?.coins === 'number' ? mapState.rewards.coins : defaults.rewards.coins,
            keys: typeof mapState?.rewards?.keys === 'number' ? mapState.rewards.keys : defaults.rewards.keys,
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
