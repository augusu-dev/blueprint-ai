function createTileId(x, y) {
    return `${x},${y}`;
}

function createDefaultRevealedTiles() {
    return [
        createTileId(3, 3),
        createTileId(3, 2),
        createTileId(3, 4),
        createTileId(2, 3),
        createTileId(4, 3),
    ];
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
        player: { x: 3, y: 3 },
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
            x: Number.isInteger(mapState?.player?.x) ? mapState.player.x : defaults.player.x,
            y: Number.isInteger(mapState?.player?.y) ? mapState.player.y : defaults.player.y,
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
