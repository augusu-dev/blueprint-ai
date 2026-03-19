import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlarmClock,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Coins,
    Compass,
    Flag,
    GitFork,
    KeyRound,
    MessageSquare,
    Sparkles,
} from 'lucide-react';
import { LionScoutSprite } from './MapSprites';
import { deriveStudySettings } from './lib/studySettings';
import {
    CAMERA_FOLLOW,
    CLICK_SPEED,
    HOME_APPROACH,
    HUT_CENTER,
    KEYBOARD_SPEED,
    LANDMARKS,
    clampTileIndex,
    collectRevealedTiles,
    deriveQuests,
    distanceBetween,
    findLandmarkByQuestId,
    getTileCenter,
    getTileKind,
    isBlockedTile,
    moveWithCollision,
} from './lib/mapWorld';
import { MAP_WORLD_SIZE, clampWorldCoordinate, createTileId, normalizeMapState } from './lib/space';

const LANDMARK_DISPLAY = {
    'goal-quest': { label: 'ゴール塔', icon: Flag },
    'chat-quest': { label: 'ダイアログ広場', icon: MessageSquare },
    'graph-quest': { label: 'グラフ工房', icon: GitFork },
    'explorer-quest': { label: '探索の泉', icon: Compass },
};

const TILE_LABELS = {
    courtyard: '中庭',
    path: '道',
    water: '水辺',
    tower: 'ゴール塔',
    market: 'ダイアログ広場',
    forge: 'グラフ工房',
    fountain: '探索の泉',
    'grass-light': '明るい草地',
    'grass-dark': '濃い草地',
    meadow: '草原',
    grass: '草地',
};

const TOP_DOWN_PALETTES = {
    courtyard: { top: 'linear-gradient(180deg, #91a28d 0%, #869983 100%)', edge: '#6f8170', chip: '#c9d6c2' },
    path: { top: 'linear-gradient(180deg, #9eaf98 0%, #92a48d 100%)', edge: '#7b8d79', chip: '#d7e4cf' },
    water: { top: 'linear-gradient(180deg, #8db0ad 0%, #7ea29e 100%)', edge: '#678885', chip: '#d2ebe7' },
    tower: { top: 'linear-gradient(180deg, #98a88e 0%, #8d9f85 100%)', edge: '#73836d', chip: '#dce7d4' },
    market: { top: 'linear-gradient(180deg, #93a489 0%, #87977d 100%)', edge: '#6d7d69', chip: '#d4dfcb' },
    forge: { top: 'linear-gradient(180deg, #8d9d85 0%, #819178 100%)', edge: '#687764', chip: '#ccd8c3' },
    fountain: { top: 'linear-gradient(180deg, #8fa8a0 0%, #81978f 100%)', edge: '#6b8079', chip: '#d6e6df' },
    meadow: { top: 'linear-gradient(180deg, #98aa90 0%, #8d9e85 100%)', edge: '#71836f', chip: '#dce7d5' },
    'grass-light': { top: 'linear-gradient(180deg, #96a88f 0%, #8a9b84 100%)', edge: '#70816e', chip: '#d8e4d2' },
    'grass-dark': { top: 'linear-gradient(180deg, #889881 0%, #7c8c75 100%)', edge: '#62705e', chip: '#c5d1bf' },
    grass: { top: 'linear-gradient(180deg, #93a58b 0%, #889981 100%)', edge: '#6d7e6b', chip: '#d5e0ce' },
};

const dockButtonStyle = {
    width: '42px',
    height: '42px',
    borderRadius: '14px',
    border: '1px solid rgba(91, 51, 28, 0.16)',
    background: 'rgba(44, 28, 18, 0.82)',
    color: '#fff8ef',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(59, 28, 10, 0.16)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
};

const dpadButtonStyle = {
    width: '40px',
    height: '40px',
    borderRadius: '12px',
    border: '1px solid rgba(91, 51, 28, 0.16)',
    background: 'rgba(44, 28, 18, 0.82)',
    color: '#fff8ef',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(59, 28, 10, 0.16)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
};

const CELL_BASE_SIZE = 28;
const CELL_MIN_SIZE = 20;
const CELL_MAX_SIZE = 34;

function IconDockButton({ icon, title, onClick }) {
    const IconComponent = icon;
    return (
        <button type="button" onClick={onClick} title={title} aria-label={title} style={dockButtonStyle}>
            <IconComponent size={18} />
        </button>
    );
}

function DPadButton({ label, icon, ...events }) {
    return (
        <button type="button" aria-label={label} title={label} style={dpadButtonStyle} {...events}>
            {icon}
        </button>
    );
}

function getTilePalette(kind) {
    return TOP_DOWN_PALETTES[kind] || TOP_DOWN_PALETTES.grass;
}

function getTileLabel(kind) {
    return TILE_LABELS[kind] || TILE_LABELS.grass;
}

export default function MapView({ spaceTitle, nodes, mapState, onMapStateChange, onOpenMode, currentProject }) {
    const normalizedMapState = useMemo(() => normalizeMapState(mapState), [mapState]);
    const pressedKeysRef = useRef(new Set());
    const destinationRef = useRef(null);
    const fieldRef = useRef(null);
    const [fieldSize, setFieldSize] = useState({ width: 1100, height: 700 });
    const [zoom, setZoom] = useState(1);
    const [destinationMarker, setDestinationMarker] = useState(null);

    useEffect(() => {
        if (!fieldRef.current || typeof ResizeObserver === 'undefined') return undefined;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry?.contentRect) return;
            setFieldSize({
                width: Math.max(420, entry.contentRect.width),
                height: Math.max(520, entry.contentRect.height),
            });
        });

        observer.observe(fieldRef.current);
        return () => observer.disconnect();
    }, []);

    const updateMapRuntime = useCallback((updater) => {
        onMapStateChange((current) => normalizeMapState(updater(normalizeMapState(current))));
    }, [onMapStateChange]);

    useEffect(() => {
        const isEditableTarget = (target) => {
            const tagName = target?.tagName?.toLowerCase();
            return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable;
        };

        const keyMap = {
            ArrowUp: 'ArrowUp',
            ArrowDown: 'ArrowDown',
            ArrowLeft: 'ArrowLeft',
            ArrowRight: 'ArrowRight',
            w: 'ArrowUp',
            a: 'ArrowLeft',
            s: 'ArrowDown',
            d: 'ArrowRight',
        };

        const handleKeyDown = (event) => {
            if (isEditableTarget(event.target)) return;
            const normalizedKey = keyMap[event.key] || keyMap[event.key?.toLowerCase?.()];
            if (!normalizedKey) return;
            event.preventDefault();
            destinationRef.current = null;
            setDestinationMarker(null);
            pressedKeysRef.current.add(normalizedKey);
        };

        const handleKeyUp = (event) => {
            const normalizedKey = keyMap[event.key] || keyMap[event.key?.toLowerCase?.()];
            if (normalizedKey) pressedKeysRef.current.delete(normalizedKey);
        };

        const clearKeys = () => {
            pressedKeysRef.current.clear();
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', clearKeys);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', clearKeys);
        };
    }, []);

    useEffect(() => {
        let frameId = 0;
        let lastTime = 0;

        const step = (time) => {
            if (!lastTime) lastTime = time;
            const delta = Math.min((time - lastTime) / 1000, 0.05);
            lastTime = time;

            updateMapRuntime((current) => {
                const nextState = { ...current, rewards: { ...current.rewards } };
                const pressedKeys = pressedKeysRef.current;
                const destination = destinationRef.current;
                let player = current.player;
                let camera = current.camera;
                let changed = false;
                let vectorX = 0;
                let vectorY = 0;

                if (pressedKeys.has('ArrowUp')) vectorY -= 1;
                if (pressedKeys.has('ArrowDown')) vectorY += 1;
                if (pressedKeys.has('ArrowLeft')) vectorX -= 1;
                if (pressedKeys.has('ArrowRight')) vectorX += 1;

                if (vectorX !== 0 || vectorY !== 0) {
                    destinationRef.current = null;
                    setDestinationMarker(null);
                    const length = Math.hypot(vectorX, vectorY);
                    const movedPlayer = moveWithCollision(
                        player,
                        (vectorX / length) * KEYBOARD_SPEED * delta,
                        (vectorY / length) * KEYBOARD_SPEED * delta,
                        clampWorldCoordinate,
                    );
                    if (movedPlayer.x !== player.x || movedPlayer.y !== player.y) {
                        player = movedPlayer;
                        changed = true;
                    }
                } else if (destination) {
                    const deltaX = destination.x - player.x;
                    const deltaY = destination.y - player.y;
                    const distance = Math.hypot(deltaX, deltaY);
                    if (distance < 0.07) {
                        destinationRef.current = null;
                        setDestinationMarker(null);
                    } else {
                        const moveDistance = Math.min(CLICK_SPEED * delta, distance);
                        const movedPlayer = moveWithCollision(
                            player,
                            (deltaX / distance) * moveDistance,
                            (deltaY / distance) * moveDistance,
                            clampWorldCoordinate,
                        );
                        if (movedPlayer.x !== player.x || movedPlayer.y !== player.y) {
                            player = movedPlayer;
                            changed = true;
                        } else {
                            destinationRef.current = null;
                            setDestinationMarker(null);
                        }
                    }
                }

                if (changed) {
                    const discovered = collectRevealedTiles(current.revealedTileIds, player);
                    if (discovered.newlyRevealedCount > 0) {
                        nextState.revealedTileIds = discovered.tileIds;
                        nextState.rewards.xp += discovered.newlyRevealedCount * 2;
                        nextState.rewards.coins += Math.floor(discovered.newlyRevealedCount / 4);
                    }
                }

                const focusPoint = destinationRef.current
                    ? { x: (player.x + destinationRef.current.x) / 2, y: (player.y + destinationRef.current.y) / 2 }
                    : { x: player.x, y: player.y };
                const strength = Math.min(1, delta * CAMERA_FOLLOW);
                const nextCamera = {
                    x: current.camera.x + (focusPoint.x - current.camera.x) * strength,
                    y: current.camera.y + (focusPoint.y - current.camera.y) * strength,
                };

                if (
                    Math.abs(nextCamera.x - current.camera.x) > 0.001
                    || Math.abs(nextCamera.y - current.camera.y) > 0.001
                ) {
                    camera = nextCamera;
                    changed = true;
                }

                if (!changed) return current;

                nextState.player = player;
                nextState.camera = camera;
                return nextState;
            });

            frameId = window.requestAnimationFrame(step);
        };

        frameId = window.requestAnimationFrame(step);
        return () => window.cancelAnimationFrame(frameId);
    }, [updateMapRuntime]);

    const quests = useMemo(
        () => deriveQuests(spaceTitle, nodes, normalizedMapState),
        [spaceTitle, nodes, normalizedMapState],
    );
    const starterNode = useMemo(
        () => nodes.find((node) => node.data?.isStarter) || null,
        [nodes],
    );
    const studySettings = useMemo(
        () => deriveStudySettings(currentProject?.sharedGoal || starterNode?.data?.systemPrompt || ''),
        [currentProject?.sharedGoal, starterNode?.data?.systemPrompt],
    );
    const player = normalizedMapState.player;
    const camera = normalizedMapState.camera;
    const rewards = normalizedMapState.rewards || { xp: 0, coins: 0, keys: 0 };
    const completedQuestIds = useMemo(
        () => normalizedMapState.completedQuestIds || [],
        [normalizedMapState.completedQuestIds],
    );
    const currentTileX = clampTileIndex(Math.floor(player.x));
    const currentTileY = clampTileIndex(Math.floor(player.y));
    const currentTileLabel = getTileLabel(getTileKind(currentTileX, currentTileY));
    const currentLandmark = useMemo(
        () => LANDMARKS.find((landmark) => distanceBetween(player, landmark.approach) < 1.25),
        [player],
    );
    const cellSize = useMemo(
        () => Math.max(CELL_MIN_SIZE, Math.min(CELL_MAX_SIZE, Math.round(CELL_BASE_SIZE * zoom))),
        [zoom],
    );
    const visibleRadiusX = useMemo(
        () => Math.ceil(fieldSize.width / cellSize / 2) + 3,
        [cellSize, fieldSize.width],
    );
    const visibleRadiusY = useMemo(
        () => Math.ceil(fieldSize.height / cellSize / 2) + 3,
        [cellSize, fieldSize.height],
    );

    const worldToPlane = useCallback((worldX, worldY) => ({
        left: fieldSize.width / 2 + (worldX - camera.x) * cellSize,
        top: fieldSize.height / 2 + (worldY - camera.y) * cellSize,
    }), [camera.x, camera.y, cellSize, fieldSize.height, fieldSize.width]);

    const visibleTiles = useMemo(() => {
        const tiles = [];
        const centerTileX = Math.floor(camera.x);
        const centerTileY = Math.floor(camera.y);

        for (let y = centerTileY - visibleRadiusY; y <= centerTileY + visibleRadiusY; y += 1) {
            for (let x = centerTileX - visibleRadiusX; x <= centerTileX + visibleRadiusX; x += 1) {
                if (x < 0 || y < 0 || x >= MAP_WORLD_SIZE || y >= MAP_WORLD_SIZE) continue;
                const screen = worldToPlane(x + 0.5, y + 0.5);
                if (
                    screen.left < -cellSize
                    || screen.left > fieldSize.width + cellSize
                    || screen.top < -cellSize
                    || screen.top > fieldSize.height + cellSize
                ) {
                    continue;
                }
                tiles.push({ x, y, id: createTileId(x, y), kind: getTileKind(x, y), screen });
            }
        }

        tiles.sort((a, b) => a.y - b.y || a.x - b.x);
        return tiles;
    }, [camera.x, camera.y, cellSize, fieldSize.height, fieldSize.width, visibleRadiusX, visibleRadiusY, worldToPlane]);

    const playerScreen = useMemo(
        () => worldToPlane(player.x, player.y),
        [player.x, player.y, worldToPlane],
    );
    const destinationScreen = useMemo(() => {
        if (!destinationMarker) return null;
        return worldToPlane(destinationMarker.x, destinationMarker.y);
    }, [destinationMarker, worldToPlane]);

    const setDestination = useCallback((point) => {
        destinationRef.current = point;
        setDestinationMarker(point);
    }, []);

    const holdDirection = useCallback((directionKey, isActive) => {
        if (isActive) {
            destinationRef.current = null;
            setDestinationMarker(null);
            pressedKeysRef.current.add(directionKey);
            return;
        }
        pressedKeysRef.current.delete(directionKey);
    }, []);

    const handleTileClick = useCallback((tileX, tileY) => {
        if (isBlockedTile(tileX, tileY)) return;
        setDestination(getTileCenter(tileX, tileY));
    }, [setDestination]);

    const handleZoom = useCallback((event) => {
        event.preventDefault();
        const direction = event.deltaY > 0 ? -0.05 : 0.05;
        setZoom((currentZoom) => Math.max(0.85, Math.min(1.2, currentZoom + direction)));
    }, []);

    const moveToBase = useCallback(() => {
        setDestination(HOME_APPROACH);
    }, [setDestination]);

    const moveToQuest = useCallback((questId) => {
        const landmark = findLandmarkByQuestId(questId);
        if (landmark) setDestination(landmark.approach);
    }, [setDestination]);

    const claimQuest = useCallback((quest) => {
        if (!quest?.resolved || completedQuestIds.includes(quest.id)) return;
        onMapStateChange((current) => {
            const normalizedCurrent = normalizeMapState(current);
            return {
                ...normalizedCurrent,
                activeQuestIds: (normalizedCurrent.activeQuestIds || []).filter((questId) => questId !== quest.id),
                completedQuestIds: [...(normalizedCurrent.completedQuestIds || []), quest.id],
                rewards: {
                    xp: (normalizedCurrent.rewards?.xp || 0) + quest.reward.xp,
                    coins: (normalizedCurrent.rewards?.coins || 0) + quest.reward.coins,
                    keys: (normalizedCurrent.rewards?.keys || 0) + quest.reward.keys,
                },
            };
        });
    }, [completedQuestIds, onMapStateChange]);

    const handleLandmarkAction = useCallback((landmark) => {
        if (!landmark) return;
        const quest = landmark.quest;
        if (quest?.resolved && !completedQuestIds.includes(quest.id)) {
            claimQuest(quest);
            return;
        }
        if (quest?.actionMode && quest.actionMode !== 'map') {
            onOpenMode(quest.actionMode);
            return;
        }
        moveToQuest(landmark.id);
    }, [claimQuest, completedQuestIds, moveToQuest, onOpenMode]);

    return (
        <div style={{ flex: 1, minHeight: 0, padding: '1rem', background: 'transparent' }}>
            <div
                ref={fieldRef}
                onWheel={handleZoom}
                style={{
                    position: 'relative',
                    height: '100%',
                    minHeight: '680px',
                    borderRadius: '24px',
                    overflow: 'hidden',
                    border: '1px solid rgba(95, 112, 92, 0.24)',
                    background: 'linear-gradient(180deg, #82957f 0%, #7a8e77 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 24px 48px rgba(44, 58, 41, 0.16)',
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'radial-gradient(circle at top left, rgba(255,255,255,0.12), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.03))',
                        pointerEvents: 'none',
                    }}
                />
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
                        backgroundSize: `${cellSize}px ${cellSize}px`,
                        pointerEvents: 'none',
                    }}
                />
                <div style={{ position: 'absolute', inset: 0 }}>
                    {visibleTiles.map((tile) => {
                        const palette = getTilePalette(tile.kind);
                        const landmark = LANDMARKS.find((item) => item.x === tile.x && item.y === tile.y);
                        const isStartTile = tile.x >= HUT_CENTER.x - 1 && tile.x <= HUT_CENTER.x && tile.y >= HUT_CENTER.y - 1 && tile.y <= HUT_CENTER.y;

                        return (
                            <button
                                type="button"
                                key={tile.id}
                                onClick={() => (landmark ? handleLandmarkAction({
                                    ...landmark,
                                    quest: quests.find((quest) => quest.id === landmark.id),
                                    display: LANDMARK_DISPLAY[landmark.id] || { label: landmark.badge, icon: Flag },
                                }) : handleTileClick(tile.x, tile.y))}
                                aria-label={`${tile.x},${tile.y}`}
                                style={{
                                    position: 'absolute',
                                    left: tile.screen.left - (cellSize / 2),
                                    top: tile.screen.top - (cellSize / 2),
                                    width: `${cellSize}px`,
                                    height: `${cellSize}px`,
                                    border: 'none',
                                    borderRadius: '2px',
                                    background: palette.top,
                                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 1px ${palette.edge}`,
                                    padding: 0,
                                    cursor: isBlockedTile(tile.x, tile.y) ? 'default' : 'pointer',
                                    zIndex: 1,
                                }}
                            >
                                {isStartTile && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            inset: '2px',
                                            borderRadius: '2px',
                                            border: '2px solid rgba(217, 237, 209, 0.92)',
                                        }}
                                    />
                                )}
                                {(tile.kind === 'path' || landmark) && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            left: '50%',
                                            top: '50%',
                                            transform: 'translate(-50%, -50%)',
                                            width: landmark ? '12px' : '6px',
                                            height: landmark ? '12px' : '6px',
                                            borderRadius: '999px',
                                            background: tile.kind === 'path' ? '#dce7d6' : palette.chip,
                                            boxShadow: landmark ? `0 0 0 4px ${landmark.accent}33` : 'none',
                                        }}
                                    />
                                )}
                            </button>
                        );
                    })}


                    {destinationScreen && (
                        <div
                            style={{
                                position: 'absolute',
                                left: destinationScreen.left,
                                top: destinationScreen.top,
                                transform: 'translate(-50%, -50%)',
                                width: `${Math.max(14, cellSize * 0.56)}px`,
                                height: `${Math.max(14, cellSize * 0.56)}px`,
                                borderRadius: '999px',
                                border: '2px solid rgba(255,255,255,0.92)',
                                boxShadow: '0 0 0 8px rgba(255,255,255,0.16)',
                                zIndex: 14,
                            }}
                        />
                    )}

                    <div
                        style={{
                            position: 'absolute',
                            left: playerScreen.left,
                            top: playerScreen.top - cellSize * 1.1,
                            transform: 'translate(-50%, -50%)',
                            zIndex: 15,
                            pointerEvents: 'none',
                        }}
                    >
                        <LionScoutSprite size={62 * zoom} />
                    </div>
                </div>

                <div
                    style={{
                        position: 'absolute',
                        left: '1rem',
                        bottom: '1rem',
                        zIndex: 20,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        padding: '0.55rem 0.8rem',
                        borderRadius: '14px',
                        background: 'rgba(44, 28, 18, 0.78)',
                        color: '#fff8ef',
                        fontSize: '0.78rem',
                        boxShadow: '0 10px 24px rgba(59, 28, 10, 0.16)',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                    }}
                >
                    <span>{spaceTitle || 'スペース'}</span>
                    <span style={{ opacity: 0.8 }}>{currentTileLabel}</span>
                    <span style={{ opacity: 0.8 }}>{currentTileX + 1}, {currentTileY + 1}</span>
                    {currentLandmark && <span style={{ opacity: 0.92 }}>{(LANDMARK_DISPLAY[currentLandmark.id] || {}).label}</span>}
                </div>

            </div>
        </div>
    );
}
