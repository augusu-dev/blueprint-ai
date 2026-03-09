import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { HutSprite, LandmarkSprite, LionScoutSprite } from './MapSprites';
import {
    CAMERA_FOLLOW,
    CLICK_SPEED,
    HOME_APPROACH,
    HUT_CENTER,
    KEYBOARD_SPEED,
    LANDMARKS,
    TILE_DEPTH,
    TILE_HEIGHT_BASE,
    TILE_WIDTH_BASE,
    TREE_CLUSTERS,
    VIEW_RADIUS,
    clampTileIndex,
    collectRevealedTiles,
    deriveQuests,
    distanceBetween,
    findLandmarkByQuestId,
    getTileCenter,
    getTileKind,
    getTileLabel,
    getTilePalette,
    isBlockedTile,
    moveWithCollision,
    worldToScreen,
} from './lib/mapWorld';
import { MAP_WORLD_SIZE, clampWorldCoordinate, createTileId, normalizeMapState } from './lib/space';

const LANDMARK_DISPLAY = {
    'goal-quest': { label: 'Goal Tower', icon: Flag },
    'chat-quest': { label: 'Dialogue Plaza', icon: MessageSquare },
    'graph-quest': { label: 'Graph Studio', icon: GitFork },
    'explorer-quest': { label: 'Scout Spring', icon: Compass },
};

const dockButtonStyle = {
    width: '42px',
    height: '42px',
    borderRadius: '14px',
    border: '1px solid rgba(17, 52, 30, 0.14)',
    background: 'rgba(23, 37, 28, 0.84)',
    color: '#f9fff6',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(10, 18, 14, 0.18)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
};

const dpadButtonStyle = {
    width: '40px',
    height: '40px',
    borderRadius: '12px',
    border: '1px solid rgba(17, 52, 30, 0.14)',
    background: 'rgba(23, 37, 28, 0.84)',
    color: '#f9fff6',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(10, 18, 14, 0.18)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
};

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

export default function MapView({ spaceTitle, nodes, mapState, onMapStateChange, onOpenMode }) {
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
    const tileWidth = TILE_WIDTH_BASE * zoom;
    const tileHeight = TILE_HEIGHT_BASE * zoom;
    const tileDepth = Math.max(9, Math.round(TILE_DEPTH * 0.68));

    const visibleTiles = useMemo(() => {
        const tiles = [];
        const centerTileX = Math.floor(camera.x);
        const centerTileY = Math.floor(camera.y);

        for (let y = centerTileY - VIEW_RADIUS; y <= centerTileY + VIEW_RADIUS; y += 1) {
            for (let x = centerTileX - VIEW_RADIUS; x <= centerTileX + VIEW_RADIUS; x += 1) {
                if (x < 0 || y < 0 || x >= MAP_WORLD_SIZE || y >= MAP_WORLD_SIZE) continue;
                const screen = worldToScreen(
                    x + 0.5,
                    y + 0.5,
                    camera,
                    fieldSize.width,
                    fieldSize.height,
                    tileWidth,
                    tileHeight,
                );
                if (
                    screen.left < -tileWidth
                    || screen.left > fieldSize.width + tileWidth
                    || screen.top < -tileHeight * 2
                    || screen.top > fieldSize.height + tileHeight * 2
                ) {
                    continue;
                }
                tiles.push({ x, y, id: createTileId(x, y), kind: getTileKind(x, y), screen });
            }
        }

        tiles.sort((a, b) => (a.x + a.y) - (b.x + b.y) || a.y - b.y);
        return tiles;
    }, [camera, fieldSize.height, fieldSize.width, tileHeight, tileWidth]);

    const landmarkScreens = useMemo(() => (
        LANDMARKS.map((landmark) => ({
            ...landmark,
            quest: quests.find((quest) => quest.id === landmark.id),
            display: LANDMARK_DISPLAY[landmark.id] || { label: landmark.badge, icon: Flag },
            screen: worldToScreen(
                landmark.x + 0.5,
                landmark.y + 0.5,
                camera,
                fieldSize.width,
                fieldSize.height,
                tileWidth,
                tileHeight,
            ),
        })).filter((landmark) => (
            landmark.screen.left > -120
            && landmark.screen.left < fieldSize.width + 120
            && landmark.screen.top > -180
            && landmark.screen.top < fieldSize.height + 180
        ))
    ), [camera, fieldSize.height, fieldSize.width, quests, tileHeight, tileWidth]);

    const treeScreens = useMemo(() => (
        TREE_CLUSTERS.map((tree, index) => ({
            ...tree,
            key: `tree-${index}`,
            screen: worldToScreen(
                tree.x + 0.5,
                tree.y + 0.5,
                camera,
                fieldSize.width,
                fieldSize.height,
                tileWidth,
                tileHeight,
            ),
        })).filter((tree) => (
            tree.screen.left > -100
            && tree.screen.left < fieldSize.width + 100
            && tree.screen.top > -140
            && tree.screen.top < fieldSize.height + 140
        ))
    ), [camera, fieldSize.height, fieldSize.width, tileHeight, tileWidth]);

    const hutScreen = useMemo(
        () => worldToScreen(HUT_CENTER.x, HUT_CENTER.y, camera, fieldSize.width, fieldSize.height, tileWidth, tileHeight),
        [camera, fieldSize.height, fieldSize.width, tileHeight, tileWidth],
    );
    const playerScreen = useMemo(
        () => worldToScreen(player.x, player.y, camera, fieldSize.width, fieldSize.height, tileWidth, tileHeight),
        [camera, fieldSize.height, fieldSize.width, player.x, player.y, tileHeight, tileWidth],
    );
    const destinationScreen = useMemo(() => {
        if (!destinationMarker) return null;
        return worldToScreen(
            destinationMarker.x,
            destinationMarker.y,
            camera,
            fieldSize.width,
            fieldSize.height,
            tileWidth,
            tileHeight,
        );
    }, [camera, destinationMarker, fieldSize.height, fieldSize.width, tileHeight, tileWidth]);

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
        setZoom((currentZoom) => Math.max(0.88, Math.min(1.14, currentZoom + direction)));
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
                    borderRadius: '30px',
                    overflow: 'hidden',
                    border: '1px solid rgba(47, 117, 55, 0.28)',
                    background: 'linear-gradient(180deg, #69c85e 0%, #59b952 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16), 0 24px 48px rgba(12, 23, 14, 0.18)',
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'radial-gradient(circle at top left, rgba(255,255,255,0.18), transparent 30%), linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.04))',
                        pointerEvents: 'none',
                    }}
                />
                <div
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        left: '1rem',
                        zIndex: 20,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.8rem',
                        padding: '0.58rem 0.9rem',
                        borderRadius: '14px',
                        background: 'rgba(36, 40, 44, 0.78)',
                        color: '#f5faf5',
                        boxShadow: '0 10px 24px rgba(10, 18, 14, 0.16)',
                        fontSize: '0.8rem',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                    }}
                >
                    <span style={{ fontWeight: 600 }}>Tool: Move</span>
                    <span style={{ opacity: 0.8 }}>World: 100 x 100</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Sparkles size={13} color="#70d7ff" />
                        {rewards.xp}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Coins size={13} color="#ffd469" />
                        {rewards.coins}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <KeyRound size={13} color="#bcff97" />
                        {rewards.keys}
                    </span>
                    <span style={{ opacity: 0.8 }}>Quests: {completedQuestIds.length}</span>
                </div>
                <div style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 20, display: 'flex', gap: '0.55rem' }}>
                    <IconDockButton icon={MessageSquare} title="Open chat" onClick={() => onOpenMode('chat')} />
                    <IconDockButton icon={GitFork} title="Open graph" onClick={() => onOpenMode('graph')} />
                    <IconDockButton icon={Compass} title="Return to base" onClick={moveToBase} />
                </div>

                <div style={{ position: 'absolute', inset: 0 }}>
                    {visibleTiles.map((tile) => {
                        const palette = getTilePalette(tile.kind, true);
                        const landmark = LANDMARKS.find((item) => item.x === tile.x && item.y === tile.y);
                        const isStartTile = tile.x >= HUT_CENTER.x - 1 && tile.x <= HUT_CENTER.x && tile.y >= HUT_CENTER.y - 1 && tile.y <= HUT_CENTER.y;

                        return (
                            <button
                                type="button"
                                key={tile.id}
                                onClick={() => handleTileClick(tile.x, tile.y)}
                                aria-label={`${tile.x},${tile.y}`}
                                style={{
                                    position: 'absolute',
                                    left: tile.screen.left,
                                    top: tile.screen.top,
                                    width: `${tileWidth}px`,
                                    height: `${tileHeight + tileDepth}px`,
                                    transform: 'translate(-50%, -50%)',
                                    border: 'none',
                                    background: 'transparent',
                                    padding: 0,
                                    cursor: isBlockedTile(tile.x, tile.y) ? 'default' : 'pointer',
                                    zIndex: tile.x + tile.y,
                                }}
                            >
                                <div
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                                        background: palette.top,
                                        boxShadow: `0 ${tileDepth}px 0 ${palette.edge}, inset 0 1px 0 rgba(255,255,255,0.1), 0 0 0 1px rgba(43, 110, 47, 0.18)`,
                                    }}
                                />
                                {isStartTile && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            inset: '7px',
                                            clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                                            border: '2px solid rgba(98, 161, 255, 0.85)',
                                        }}
                                    />
                                )}
                                {(tile.kind === 'path' || landmark) && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            left: '50%',
                                            top: '50%',
                                            transform: 'translate(-50%, -54%) rotate(45deg)',
                                            width: landmark ? '13px' : '11px',
                                            height: landmark ? '13px' : '11px',
                                            borderRadius: '3px',
                                            background: tile.kind === 'path' ? '#f5ebc9' : palette.chip,
                                            boxShadow: landmark ? `0 0 0 5px ${landmark.accent}18` : 'none',
                                        }}
                                    />
                                )}
                            </button>
                        );
                    })}

                    {treeScreens.map((tree) => (
                        <div
                            key={tree.key}
                            style={{
                                position: 'absolute',
                                left: tree.screen.left,
                                top: tree.screen.top - tileHeight * 0.82,
                                transform: 'translate(-50%, -50%)',
                                zIndex: tree.x + tree.y + 20,
                                pointerEvents: 'none',
                            }}
                        >
                            <LandmarkSprite type="tree" size={80 + tree.radius * 10} />
                        </div>
                    ))}

                    <div style={{ position: 'absolute', left: hutScreen.left, top: hutScreen.top - tileHeight * 1.35, transform: 'translate(-50%, -50%)', zIndex: 980, pointerEvents: 'none' }}>
                        <HutSprite size={150 * zoom} />
                    </div>
                    <div
                        style={{
                            position: 'absolute',
                            left: hutScreen.left,
                            top: hutScreen.top - tileHeight * 1.95,
                            transform: 'translate(-50%, -50%)',
                            zIndex: 990,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.38rem 0.72rem',
                            borderRadius: '999px',
                            background: 'rgba(32, 36, 40, 0.86)',
                            color: '#ffffff',
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            boxShadow: '0 10px 20px rgba(8, 14, 11, 0.16)',
                        }}
                    >
                        <Sparkles size={12} color="#63d7ff" />
                        START
                    </div>

                    {landmarkScreens.map((landmark) => {
                        const Icon = landmark.display.icon;
                        const isCompleted = completedQuestIds.includes(landmark.id);
                        const isClaimable = landmark.quest?.resolved && !isCompleted;

                        return (
                            <div
                                key={landmark.id}
                                style={{
                                    position: 'absolute',
                                    left: landmark.screen.left,
                                    top: landmark.screen.top - tileHeight * 0.98,
                                    transform: 'translate(-50%, -50%)',
                                    zIndex: landmark.x + landmark.y + 34,
                                    textAlign: 'center',
                                }}
                            >
                                <div style={{ pointerEvents: 'none' }}>
                                    <LandmarkSprite type={landmark.type} size={72 * zoom} />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleLandmarkAction(landmark)}
                                    title={isCompleted ? `${landmark.display.label} done` : landmark.display.label}
                                    style={{
                                        marginTop: '-0.35rem',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.32rem',
                                        padding: '0.34rem 0.68rem',
                                        borderRadius: '999px',
                                        border: 'none',
                                        background: 'rgba(30, 34, 38, 0.82)',
                                        color: isCompleted ? '#bdf6c1' : '#ffffff',
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        boxShadow: '0 8px 18px rgba(10, 18, 14, 0.16)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <Icon size={12} color={isClaimable ? '#ffd469' : landmark.accent} />
                                    {landmark.display.label}
                                </button>
                            </div>
                        );
                    })}

                    {destinationScreen && (
                        <div
                            style={{
                                position: 'absolute',
                                left: destinationScreen.left,
                                top: destinationScreen.top - tileHeight * 0.08,
                                transform: 'translate(-50%, -50%)',
                                width: `${tileWidth * 0.22}px`,
                                height: `${tileWidth * 0.22}px`,
                                borderRadius: '999px',
                                border: '2px solid rgba(255,255,255,0.92)',
                                boxShadow: '0 0 0 8px rgba(255,255,255,0.16)',
                                zIndex: 1000,
                            }}
                        />
                    )}

                    <div
                        style={{
                            position: 'absolute',
                            left: playerScreen.left,
                            top: playerScreen.top - tileHeight * 1.1,
                            transform: 'translate(-50%, -50%)',
                            zIndex: 1001,
                            pointerEvents: 'none',
                        }}
                    >
                        <LionScoutSprite size={74 * zoom} />
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
                        background: 'rgba(36, 40, 44, 0.78)',
                        color: '#f5faf5',
                        fontSize: '0.78rem',
                        boxShadow: '0 10px 24px rgba(10, 18, 14, 0.16)',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                    }}
                >
                    <span>{spaceTitle || 'Untitled Space'}</span>
                    <span style={{ opacity: 0.76 }}>{currentTileLabel}</span>
                    <span style={{ opacity: 0.76 }}>{currentTileX + 1}, {currentTileY + 1}</span>
                    {currentLandmark && <span style={{ opacity: 0.92 }}>{(LANDMARK_DISPLAY[currentLandmark.id] || {}).label}</span>}
                </div>

                <div style={{ position: 'absolute', right: '1rem', bottom: '1rem', zIndex: 20, display: 'grid', gap: '0.38rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <DPadButton
                            label="Move up"
                            icon={<ChevronUp size={16} />}
                            onMouseDown={() => holdDirection('ArrowUp', true)}
                            onMouseUp={() => holdDirection('ArrowUp', false)}
                            onMouseLeave={() => holdDirection('ArrowUp', false)}
                            onTouchStart={() => holdDirection('ArrowUp', true)}
                            onTouchEnd={() => holdDirection('ArrowUp', false)}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.38rem' }}>
                        <DPadButton
                            label="Move left"
                            icon={<ChevronLeft size={16} />}
                            onMouseDown={() => holdDirection('ArrowLeft', true)}
                            onMouseUp={() => holdDirection('ArrowLeft', false)}
                            onMouseLeave={() => holdDirection('ArrowLeft', false)}
                            onTouchStart={() => holdDirection('ArrowLeft', true)}
                            onTouchEnd={() => holdDirection('ArrowLeft', false)}
                        />
                        <DPadButton label="Return to base" icon={<Compass size={16} />} onClick={moveToBase} />
                        <DPadButton
                            label="Move right"
                            icon={<ChevronRight size={16} />}
                            onMouseDown={() => holdDirection('ArrowRight', true)}
                            onMouseUp={() => holdDirection('ArrowRight', false)}
                            onMouseLeave={() => holdDirection('ArrowRight', false)}
                            onTouchStart={() => holdDirection('ArrowRight', true)}
                            onTouchEnd={() => holdDirection('ArrowRight', false)}
                        />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <DPadButton
                            label="Move down"
                            icon={<ChevronDown size={16} />}
                            onMouseDown={() => holdDirection('ArrowDown', true)}
                            onMouseUp={() => holdDirection('ArrowDown', false)}
                            onMouseLeave={() => holdDirection('ArrowDown', false)}
                            onTouchStart={() => holdDirection('ArrowDown', true)}
                            onTouchEnd={() => holdDirection('ArrowDown', false)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
