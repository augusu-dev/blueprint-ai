import { MAP_CENTER_INDEX, MAP_HUT_TILES, MAP_WORLD_SIZE, createTileId } from './space';

export const TILE_WIDTH_BASE = 88;
export const TILE_HEIGHT_BASE = 44;
export const TILE_DEPTH = 18;
export const VIEW_RADIUS = 13;
export const PLAYER_RADIUS = 0.22;
export const KEYBOARD_SPEED = 4.15;
export const CLICK_SPEED = 4.8;
export const CAMERA_FOLLOW = 9;
export const REVEAL_RADIUS = 4;
export const START_POINT = { x: MAP_CENTER_INDEX + 0.5, y: MAP_CENTER_INDEX + 2.65 };
export const HUT_CENTER = { x: MAP_CENTER_INDEX, y: MAP_CENTER_INDEX };
export const HOME_APPROACH = { x: MAP_CENTER_INDEX + 0.5, y: MAP_CENTER_INDEX + 2.5 };

export const LANDMARKS = [
    {
        id: 'goal-quest',
        label: 'ゴール塔',
        subtitle: '目標の核を固める',
        badge: 'Main',
        questTitle: '学習の主目標を固める',
        x: MAP_CENTER_INDEX + 1,
        y: MAP_CENTER_INDEX - 8,
        approach: { x: MAP_CENTER_INDEX + 1.5, y: MAP_CENTER_INDEX - 6.5 },
        type: 'tower',
        accent: '#ffd166',
        actionMode: 'chat',
        actionLabel: 'Chat を開く',
    },
    {
        id: 'chat-quest',
        label: 'ダイアログ屋台',
        subtitle: '最初の問いを投げる',
        badge: 'Talk',
        questTitle: '最初の学習プロンプトを送る',
        x: MAP_CENTER_INDEX - 7,
        y: MAP_CENTER_INDEX + 4,
        approach: { x: MAP_CENTER_INDEX - 5.5, y: MAP_CENTER_INDEX + 4.5 },
        type: 'market',
        accent: '#ff8a65',
        actionMode: 'chat',
        actionLabel: 'Chat を開く',
    },
    {
        id: 'graph-quest',
        label: 'ブランチ工房',
        subtitle: '分岐設計を進める',
        badge: 'Graph',
        questTitle: 'graph で最初の分岐を作る',
        x: MAP_CENTER_INDEX + 8,
        y: MAP_CENTER_INDEX + 3,
        approach: { x: MAP_CENTER_INDEX + 6.5, y: MAP_CENTER_INDEX + 3.5 },
        type: 'forge',
        accent: '#b388ff',
        actionMode: 'graph',
        actionLabel: 'Graph を開く',
    },
    {
        id: 'explorer-quest',
        label: '探索の泉',
        subtitle: '周辺を開拓する',
        badge: 'Scout',
        questTitle: 'ワールドをさらに探索する',
        x: MAP_CENTER_INDEX - 10,
        y: MAP_CENTER_INDEX - 5,
        approach: { x: MAP_CENTER_INDEX - 8.5, y: MAP_CENTER_INDEX - 4.5 },
        type: 'fountain',
        accent: '#62d2ff',
        actionMode: 'map',
        actionLabel: '探索を続ける',
    },
];

const WATER_PATCHES = [
    { x: MAP_CENTER_INDEX - 15, y: MAP_CENTER_INDEX - 3, width: 3, height: 2 },
    { x: MAP_CENTER_INDEX + 12, y: MAP_CENTER_INDEX + 10, width: 5, height: 3 },
    { x: MAP_CENTER_INDEX + 14, y: MAP_CENTER_INDEX - 11, width: 4, height: 2 },
];

export const TREE_CLUSTERS = [
    { x: MAP_CENTER_INDEX + 5, y: MAP_CENTER_INDEX - 4, radius: 1.35 },
    { x: MAP_CENTER_INDEX - 4, y: MAP_CENTER_INDEX - 10, radius: 1.1 },
    { x: MAP_CENTER_INDEX + 12, y: MAP_CENTER_INDEX - 4, radius: 1.2 },
    { x: MAP_CENTER_INDEX - 13, y: MAP_CENTER_INDEX + 8, radius: 1.5 },
];

function noise2d(x, y) {
    const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return value - Math.floor(value);
}

function createPathTileIds() {
    const tiles = new Set();
    const start = { x: MAP_CENTER_INDEX, y: MAP_CENTER_INDEX + 2 };

    const addPath = (from, to) => {
        let currentX = from.x;
        let currentY = from.y;

        tiles.add(createTileId(currentX, currentY));
        while (currentX !== to.x) {
            currentX += currentX < to.x ? 1 : -1;
            tiles.add(createTileId(currentX, currentY));
        }
        while (currentY !== to.y) {
            currentY += currentY < to.y ? 1 : -1;
            tiles.add(createTileId(currentX, currentY));
        }
    };

    [
        { x: MAP_CENTER_INDEX + 1, y: MAP_CENTER_INDEX - 6 },
        { x: MAP_CENTER_INDEX - 5, y: MAP_CENTER_INDEX + 4 },
        { x: MAP_CENTER_INDEX + 6, y: MAP_CENTER_INDEX + 3 },
        { x: MAP_CENTER_INDEX - 8, y: MAP_CENTER_INDEX - 4 },
    ].forEach((point) => addPath(start, point));

    for (let y = MAP_CENTER_INDEX - 1; y <= MAP_CENTER_INDEX + 2; y += 1) {
        for (let x = MAP_CENTER_INDEX - 1; x <= MAP_CENTER_INDEX + 1; x += 1) {
            tiles.add(createTileId(x, y));
        }
    }

    return tiles;
}

const PATH_TILE_IDS = createPathTileIds();

export function clampTileIndex(value) {
    return Math.max(0, Math.min(MAP_WORLD_SIZE - 1, value));
}

export function getTileCenter(x, y) {
    return { x: x + 0.5, y: y + 0.5 };
}

export function isHutTile(x, y) {
    return MAP_HUT_TILES.some((tile) => tile.x === x && tile.y === y);
}

export function isWaterTile(x, y) {
    if (isHutTile(x, y)) return false;
    return WATER_PATCHES.some((patch) => (
        x >= patch.x
        && x < patch.x + patch.width
        && y >= patch.y
        && y < patch.y + patch.height
    ));
}

export function isPathTile(x, y) {
    return PATH_TILE_IDS.has(createTileId(x, y));
}

export function findLandmarkByQuestId(questId) {
    return LANDMARKS.find((landmark) => landmark.id === questId);
}

export function getTileKind(x, y) {
    if (isHutTile(x, y)) return 'courtyard';
    if (isWaterTile(x, y)) return 'water';
    if (isPathTile(x, y)) return 'path';

    const landmark = LANDMARKS.find((item) => item.x === x && item.y === y);
    if (landmark) return landmark.type;

    const random = noise2d(x, y);
    if (random > 0.82) return 'grass-light';
    if (random < 0.12) return 'grass-dark';
    if ((x + y) % 7 === 0) return 'meadow';
    return 'grass';
}

export function getTilePalette(kind, isRevealed) {
    const palettes = {
        courtyard: { top: 'linear-gradient(180deg, #9be26f 0%, #6ad14b 100%)', edge: '#4aa63b', outline: 'rgba(40,70,32,0.45)', chip: '#d9ffbe' },
        path: { top: 'linear-gradient(180deg, #fff4d0 0%, #e9d59d 100%)', edge: '#b89d5f', outline: 'rgba(97,76,32,0.24)', chip: '#fffbe9' },
        water: { top: 'linear-gradient(180deg, #55b3ff 0%, #2e7ce6 100%)', edge: '#1c58b4', outline: 'rgba(16,54,128,0.3)', chip: '#a5ebff' },
        tower: { top: 'linear-gradient(180deg, #8fdc76 0%, #52c25e 100%)', edge: '#32994b', outline: 'rgba(20,74,36,0.25)', chip: '#f6e9a8' },
        market: { top: 'linear-gradient(180deg, #90db7f 0%, #53c05b 100%)', edge: '#349c48', outline: 'rgba(22,72,38,0.25)', chip: '#ffd2c2' },
        forge: { top: 'linear-gradient(180deg, #90db7f 0%, #54c161 100%)', edge: '#339b52', outline: 'rgba(22,72,38,0.25)', chip: '#e4d2ff' },
        fountain: { top: 'linear-gradient(180deg, #96df84 0%, #5ac566 100%)', edge: '#389f4f', outline: 'rgba(22,72,38,0.25)', chip: '#cdefff' },
        meadow: { top: 'linear-gradient(180deg, #a2ec7f 0%, #64d65e 100%)', edge: '#3dab4e', outline: 'rgba(24,82,36,0.22)', chip: '#fffce0' },
        'grass-light': { top: 'linear-gradient(180deg, #a4f484 0%, #71de69 100%)', edge: '#43ae54', outline: 'rgba(24,82,36,0.2)', chip: '#d9ffd9' },
        'grass-dark': { top: 'linear-gradient(180deg, #85d864 0%, #4bb44d 100%)', edge: '#2d8541', outline: 'rgba(19,62,28,0.26)', chip: '#ceffd5' },
        grass: { top: 'linear-gradient(180deg, #93e76e 0%, #5ccc57 100%)', edge: '#38a14b', outline: 'rgba(24,82,36,0.2)', chip: '#d6ffd0' },
    };
    const palette = palettes[kind] || palettes.grass;

    if (isRevealed) return palette;

    return {
        top: 'linear-gradient(180deg, rgba(82,118,78,0.82) 0%, rgba(44,72,45,0.92) 100%)',
        edge: '#27492e',
        outline: 'rgba(0,0,0,0.22)',
        chip: 'rgba(255,255,255,0.08)',
    };
}

export function getTileLabel(kind) {
    const labels = {
        courtyard: '拠点まわり',
        path: 'ガイド路',
        water: '水辺',
        tower: 'ゴール塔',
        market: '対話屋台',
        forge: '分岐工房',
        fountain: '探索の泉',
        'grass-light': '明るい草地',
        'grass-dark': '濃い草地',
        meadow: '花の広場',
        grass: '草地',
    };
    return labels[kind] || labels.grass;
}

export function isBlockedTile(x, y) {
    if (isWaterTile(x, y) || isHutTile(x, y)) return true;
    return LANDMARKS.some((landmark) => landmark.x === x && landmark.y === y);
}

export function isPointWalkable(x, y) {
    if (x < PLAYER_RADIUS || y < PLAYER_RADIUS || x > MAP_WORLD_SIZE - PLAYER_RADIUS || y > MAP_WORLD_SIZE - PLAYER_RADIUS) {
        return false;
    }

    const samplePoints = [
        [x, y],
        [x + PLAYER_RADIUS, y],
        [x - PLAYER_RADIUS, y],
        [x, y + PLAYER_RADIUS],
        [x, y - PLAYER_RADIUS],
    ];

    return samplePoints.every(([sampleX, sampleY]) => {
        const tileX = clampTileIndex(Math.floor(sampleX));
        const tileY = clampTileIndex(Math.floor(sampleY));
        return !isBlockedTile(tileX, tileY);
    });
}

export function moveWithCollision(player, deltaX, deltaY, clampWorldCoordinate) {
    const nextPlayer = { ...player };
    const nextX = clampWorldCoordinate(nextPlayer.x + deltaX);
    const nextY = clampWorldCoordinate(nextPlayer.y + deltaY);

    if (isPointWalkable(nextX, nextPlayer.y)) nextPlayer.x = nextX;
    if (isPointWalkable(nextPlayer.x, nextY)) nextPlayer.y = nextY;

    return nextPlayer;
}

export function collectRevealedTiles(currentTileIds, player) {
    const next = new Set(currentTileIds || []);
    let revealedCount = 0;
    const playerTileX = clampTileIndex(Math.floor(player.x));
    const playerTileY = clampTileIndex(Math.floor(player.y));

    for (let y = playerTileY - REVEAL_RADIUS; y <= playerTileY + REVEAL_RADIUS; y += 1) {
        for (let x = playerTileX - REVEAL_RADIUS; x <= playerTileX + REVEAL_RADIUS; x += 1) {
            if (x < 0 || y < 0 || x >= MAP_WORLD_SIZE || y >= MAP_WORLD_SIZE) continue;
            const tileId = createTileId(x, y);
            if (!next.has(tileId)) {
                next.add(tileId);
                revealedCount += 1;
            }
        }
    }

    return { tileIds: [...next], newlyRevealedCount: revealedCount };
}

export function worldToScreen(worldX, worldY, camera, width, height, tileWidth, tileHeight) {
    const relativeX = worldX - camera.x;
    const relativeY = worldY - camera.y;
    return {
        left: width / 2 + (relativeX - relativeY) * (tileWidth / 2),
        top: height / 2 + (relativeX + relativeY) * (tileHeight / 2),
    };
}

export function distanceBetween(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

export function deriveQuests(spaceTitle, nodes, mapState) {
    const starterNode = nodes.find((node) => node.data?.isStarter);
    const sequenceNodes = nodes.filter((node) => node.type === 'sequenceNode');
    const hasGoal = Boolean(starterNode?.data?.systemPrompt?.trim());
    const hasChatLog = sequenceNodes.some((node) => (node.data?.chatHistory || []).some((message) => message.role === 'user'));
    const hasGraphBranch = sequenceNodes.length > 1;
    const hasExplored = (mapState?.revealedTileIds || []).length >= 240;

    return LANDMARKS.map((landmark) => {
        if (landmark.id === 'goal-quest') {
            return { ...landmark, description: hasGoal ? `${spaceTitle || 'このセッション'} の主目標が決まりました。` : 'chat で今回の学習ゴールを一つ定めてください。', resolved: hasGoal, reward: { xp: 48, coins: 18, keys: 1 } };
        }
        if (landmark.id === 'chat-quest') {
            return { ...landmark, description: hasChatLog ? '最初の問いが記録され、会話が動き始めました。' : 'chat で最初の質問か相談を送ってください。', resolved: hasChatLog, reward: { xp: 26, coins: 12, keys: 0 } };
        }
        if (landmark.id === 'graph-quest') {
            return { ...landmark, description: hasGraphBranch ? '分岐が一つ以上でき、学習ルートを比較できます。' : 'graph で新しい分岐を一つ追加してください。', resolved: hasGraphBranch, reward: { xp: 32, coins: 14, keys: 1 } };
        }
        return { ...landmark, description: hasExplored ? '周辺が十分に開拓され、次の探索フェーズに進めます。' : 'map を歩いて 240 タイル以上を開放してください。', resolved: hasExplored, reward: { xp: 24, coins: 15, keys: 0 } };
    });
}
