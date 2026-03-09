import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Coins,
    Compass,
    Flag,
    Gamepad2,
    GitFork,
    KeyRound,
    Map as MapIcon,
    MessageSquare,
    Sparkles,
    Target,
    Trophy,
} from 'lucide-react';
import { LionScoutSprite, HutSprite, LandmarkSprite } from './MapSprites';
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
import { MAP_CENTER_INDEX, MAP_WORLD_SIZE, clampWorldCoordinate, createTileId, normalizeMapState } from './lib/space';

function DPadButton({ label, icon, onMouseDown, onMouseUp, onMouseLeave, onTouchStart, onTouchEnd }) {
    return (
        <button
            type="button"
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            style={{
                width: '46px',
                height: '46px',
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.16)',
                background: 'linear-gradient(180deg, rgba(20,34,59,0.96) 0%, rgba(9,17,30,0.96) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 22px rgba(0,0,0,0.26)',
                color: '#f7fbff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'inherit',
            }}
            aria-label={label}
        >
            {icon}
        </button>
    );
}

function WorldOverviewCard({ player, currentLandmark, onMoveToBase }) {
    const tilePercent = 100 / MAP_WORLD_SIZE;
    const startLeft = (MAP_CENTER_INDEX - 1) * tilePercent;
    const startTop = (MAP_CENTER_INDEX - 1) * tilePercent;

    return (
        <div style={{ borderRadius: '22px', padding: '0.95rem', background: 'linear-gradient(180deg, rgba(16,32,58,0.95) 0%, rgba(10,20,37,0.95) 100%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 22px 40px rgba(0,0,0,0.22)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.8rem' }}>
                <div>
                    <div style={{ fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9bb0c7' }}>World Overview</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fbff', marginTop: '0.18rem' }}>100 x 100 Map</div>
                </div>
                <button type="button" className="chat-action-btn" onClick={onMoveToBase}>
                    <Compass size={12} />
                    スタートへ
                </button>
            </div>

            <div style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: '22px', overflow: 'hidden', border: '1px solid rgba(111, 164, 255, 0.18)', background: 'linear-gradient(180deg, #1c7d3a 0%, #0f4f24 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 20px 36px rgba(0,0,0,0.24)' }}>
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage: `
                            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px),
                            linear-gradient(rgba(7,18,33,0.16) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(7,18,33,0.16) 1px, transparent 1px)
                        `,
                        backgroundSize: `${tilePercent}% ${tilePercent}%, ${tilePercent}% ${tilePercent}%, 10% 10%, 10% 10%`,
                        backgroundPosition: '0 0',
                    }}
                />
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 28%, rgba(255,255,255,0.16), transparent 34%), linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(2,8,14,0.16) 100%)' }} />

                <div
                    style={{
                        position: 'absolute',
                        left: `${startLeft}%`,
                        top: `${startTop}%`,
                        width: `${tilePercent * 2}%`,
                        height: `${tilePercent * 2}%`,
                        border: '2px solid rgba(99, 215, 255, 0.95)',
                        background: 'rgba(99, 215, 255, 0.16)',
                        boxShadow: '0 0 0 8px rgba(99, 215, 255, 0.12)',
                    }}
                />

                {LANDMARKS.map((landmark) => (
                    <div
                        key={landmark.id}
                        style={{
                            position: 'absolute',
                            left: `${((landmark.x + 0.5) / MAP_WORLD_SIZE) * 100}%`,
                            top: `${((landmark.y + 0.5) / MAP_WORLD_SIZE) * 100}%`,
                            transform: 'translate(-50%, -50%)',
                            width: '10px',
                            height: '10px',
                            borderRadius: '999px',
                            background: landmark.accent,
                            boxShadow: `0 0 0 4px ${landmark.accent}22, 0 0 18px ${landmark.accent}66`,
                        }}
                    />
                ))}

                <div style={{ position: 'absolute', left: `${(HUT_CENTER.x / MAP_WORLD_SIZE) * 100}%`, top: `${(HUT_CENTER.y / MAP_WORLD_SIZE) * 100}%`, transform: 'translate(-50%, -72%)', filter: 'drop-shadow(0 10px 14px rgba(0,0,0,0.22))' }}>
                    <HutSprite size={50} />
                </div>

                <div style={{ position: 'absolute', left: `${(player.x / MAP_WORLD_SIZE) * 100}%`, top: `${(player.y / MAP_WORLD_SIZE) * 100}%`, transform: 'translate(-50%, -74%)', filter: 'drop-shadow(0 12px 18px rgba(0,0,0,0.24))' }}>
                    <LionScoutSprite size={34} />
                </div>

                <div style={{ position: 'absolute', left: '0.85rem', top: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.55rem', borderRadius: '999px', background: 'rgba(7,18,33,0.78)', border: '1px solid rgba(255,255,255,0.08)', color: '#f7fbff', fontSize: '0.72rem', fontWeight: 700 }}>
                    <Sparkles size={12} color="#63d7ff" />
                    中央4マス開始
                </div>

                <div style={{ position: 'absolute', right: '0.85rem', bottom: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.55rem', borderRadius: '999px', background: 'rgba(7,18,33,0.8)', border: '1px solid rgba(255,255,255,0.08)', color: '#f7fbff', fontSize: '0.72rem', fontWeight: 700 }}>
                    <Flag size={12} color={currentLandmark?.accent || '#7ed8ff'} />
                    {currentLandmark ? currentLandmark.badge : 'Field'}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.45rem', marginTop: '0.75rem' }}>
                <div style={{ padding: '0.58rem 0.62rem', borderRadius: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.66rem', color: '#8ea7c2', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Player</div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#f5fbff', marginTop: '0.18rem' }}>{Math.floor(player.x) + 1}, {Math.floor(player.y) + 1}</div>
                </div>
                <div style={{ padding: '0.58rem 0.62rem', borderRadius: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.66rem', color: '#8ea7c2', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Start</div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#f5fbff', marginTop: '0.18rem' }}>50 / 50</div>
                </div>
                <div style={{ padding: '0.58rem 0.62rem', borderRadius: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.66rem', color: '#8ea7c2', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Quest</div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#f5fbff', marginTop: '0.18rem' }}>{currentLandmark ? currentLandmark.badge : '探索中'}</div>
                </div>
            </div>
        </div>
    );
}

export default function MapView({ spaceTitle, nodes, mapState, onMapStateChange, onOpenMode }) {
    const normalizedMapState = useMemo(() => normalizeMapState(mapState), [mapState]);
    const mapStateRef = useRef(normalizedMapState);
    const pressedKeysRef = useRef(new Set());
    const destinationRef = useRef(null);
    const fieldRef = useRef(null);
    const [fieldSize, setFieldSize] = useState({ width: 960, height: 620 });
    const [zoom, setZoom] = useState(1);
    const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
    const [destinationMarker, setDestinationMarker] = useState(null);

    useEffect(() => {
        mapStateRef.current = normalizedMapState;
    }, [normalizedMapState]);

    useEffect(() => {
        if (!fieldRef.current || typeof ResizeObserver === 'undefined') return undefined;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry?.contentRect) return;
            setFieldSize({
                width: Math.max(360, entry.contentRect.width),
                height: Math.max(320, entry.contentRect.height),
            });
        });

        observer.observe(fieldRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const handleResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const updateMapRuntime = useCallback((updater) => {
        onMapStateChange((current) => {
            const normalizedCurrent = normalizeMapState(current);
            const next = normalizeMapState(updater(normalizedCurrent));
            mapStateRef.current = next;
            return next;
        });
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
                const pressedKeys = pressedKeysRef.current;
                const destination = destinationRef.current;
                const nextState = { ...current, rewards: { ...current.rewards } };
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

                if (Math.abs(nextCamera.x - current.camera.x) > 0.001 || Math.abs(nextCamera.y - current.camera.y) > 0.001) {
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

    const quests = useMemo(() => deriveQuests(spaceTitle, nodes, normalizedMapState), [spaceTitle, nodes, normalizedMapState]);
    const player = normalizedMapState.player;
    const camera = normalizedMapState.camera;
    const rewards = normalizedMapState.rewards || { xp: 0, coins: 0, keys: 0 };
    const completedQuestIds = useMemo(() => normalizedMapState.completedQuestIds || [], [normalizedMapState.completedQuestIds]);
    const revealedTileIds = useMemo(() => new Set(normalizedMapState.revealedTileIds || []), [normalizedMapState.revealedTileIds]);
    const revealedCount = normalizedMapState.revealedTileIds?.length || 0;
    const currentTileX = clampTileIndex(Math.floor(player.x));
    const currentTileY = clampTileIndex(Math.floor(player.y));
    const currentLandmark = useMemo(() => LANDMARKS.find((landmark) => distanceBetween(player, landmark.approach) < 1.25), [player]);
    const tileWidth = TILE_WIDTH_BASE * zoom;
    const tileHeight = TILE_HEIGHT_BASE * zoom;

    const visibleTiles = useMemo(() => {
        const tiles = [];
        const centerTileX = Math.floor(camera.x);
        const centerTileY = Math.floor(camera.y);

        for (let y = centerTileY - VIEW_RADIUS; y <= centerTileY + VIEW_RADIUS; y += 1) {
            for (let x = centerTileX - VIEW_RADIUS; x <= centerTileX + VIEW_RADIUS; x += 1) {
                if (x < 0 || y < 0 || x >= MAP_WORLD_SIZE || y >= MAP_WORLD_SIZE) continue;
                const screen = worldToScreen(x + 0.5, y + 0.5, camera, fieldSize.width, fieldSize.height, tileWidth, tileHeight);
                if (screen.left < -tileWidth || screen.left > fieldSize.width + tileWidth || screen.top < -tileHeight * 2 || screen.top > fieldSize.height + tileHeight * 2) continue;
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
            screen: worldToScreen(landmark.x + 0.5, landmark.y + 0.5, camera, fieldSize.width, fieldSize.height, tileWidth, tileHeight),
        })).filter((landmark) => landmark.screen.left > -120 && landmark.screen.left < fieldSize.width + 120 && landmark.screen.top > -180 && landmark.screen.top < fieldSize.height + 160)
    ), [camera, fieldSize.height, fieldSize.width, quests, tileHeight, tileWidth]);

    const treeScreens = useMemo(() => (
        TREE_CLUSTERS.map((tree, index) => ({
            ...tree,
            key: `tree-${index}`,
            screen: worldToScreen(tree.x + 0.5, tree.y + 0.5, camera, fieldSize.width, fieldSize.height, tileWidth, tileHeight),
        })).filter((tree) => tree.screen.left > -100 && tree.screen.left < fieldSize.width + 100 && tree.screen.top > -150 && tree.screen.top < fieldSize.height + 140)
    ), [camera, fieldSize.height, fieldSize.width, tileHeight, tileWidth]);

    const hutScreen = useMemo(() => worldToScreen(HUT_CENTER.x, HUT_CENTER.y, camera, fieldSize.width, fieldSize.height, tileWidth, tileHeight), [camera, fieldSize.height, fieldSize.width, tileHeight, tileWidth]);
    const playerScreen = useMemo(() => worldToScreen(player.x, player.y, camera, fieldSize.width, fieldSize.height, tileWidth, tileHeight), [camera, fieldSize.height, fieldSize.width, player.x, player.y, tileHeight, tileWidth]);
    const destinationScreen = useMemo(() => {
        if (!destinationMarker) return null;
        return worldToScreen(destinationMarker.x, destinationMarker.y, camera, fieldSize.width, fieldSize.height, tileWidth, tileHeight);
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
        const direction = event.deltaY > 0 ? -0.06 : 0.06;
        setZoom((currentZoom) => Math.max(0.78, Math.min(1.28, currentZoom + direction)));
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
        updateMapRuntime((current) => ({
            ...current,
            activeQuestIds: (current.activeQuestIds || []).filter((questId) => questId !== quest.id),
            completedQuestIds: [...(current.completedQuestIds || []), quest.id],
            rewards: {
                xp: (current.rewards?.xp || 0) + quest.reward.xp,
                coins: (current.rewards?.coins || 0) + quest.reward.coins,
                keys: (current.rewards?.keys || 0) + quest.reward.keys,
            },
        }));
    }, [completedQuestIds, updateMapRuntime]);

    const currentTileLabel = getTileLabel(getTileKind(currentTileX, currentTileY));
    const isCompactLayout = viewportWidth < 1180;
    const showLegacyPilotCard = false;
    const leftPanel = (
        <div className="glass-panel" style={{ borderRadius: '28px', padding: '1rem', background: 'linear-gradient(180deg, rgba(7,18,36,0.96) 0%, rgba(5,13,24,0.96) 100%)', border: '1px solid rgba(111, 164, 255, 0.14)', display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'auto' }}>
            <WorldOverviewCard player={player} currentLandmark={currentLandmark} onMoveToBase={moveToBase} />
            {showLegacyPilotCard && (
            <div style={{ borderRadius: '22px', padding: '0.95rem', background: 'linear-gradient(180deg, rgba(16,32,58,0.95) 0%, rgba(10,20,37,0.95) 100%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 22px 40px rgba(0,0,0,0.22)' }}>
                <div style={{ fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9bb0c7', marginBottom: '0.7rem' }}>Session Pilot</div>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
                    <LionScoutSprite size={118} />
                </div>
                <div style={{ fontSize: '1.04rem', fontWeight: 700, color: '#f8fbff', textAlign: 'center' }}>レオ・ナビゲーター</div>
                <div style={{ fontSize: '0.8rem', color: '#95a9bf', textAlign: 'center', lineHeight: 1.65, marginTop: '0.45rem' }}>
                    このライオンが学習の進行役です。移動しながらクエストを開き、chat と graph に戻ります。
                </div>
            </div>
            )}

            <div style={{ borderRadius: '22px', padding: '0.95rem', background: 'linear-gradient(180deg, rgba(14,27,49,0.94) 0%, rgba(8,15,28,0.95) 100%)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <Gamepad2 size={16} color="#7ed8ff" />
                    <div style={{ fontSize: '0.92rem', fontWeight: 700 }}>Move</div>
                </div>
                <div style={{ display: 'grid', justifyContent: 'center', gap: '0.45rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <DPadButton label="上へ移動" icon={<ChevronUp size={18} />} onMouseDown={() => holdDirection('ArrowUp', true)} onMouseUp={() => holdDirection('ArrowUp', false)} onMouseLeave={() => holdDirection('ArrowUp', false)} onTouchStart={() => holdDirection('ArrowUp', true)} onTouchEnd={() => holdDirection('ArrowUp', false)} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
                        <DPadButton label="左へ移動" icon={<ChevronLeft size={18} />} onMouseDown={() => holdDirection('ArrowLeft', true)} onMouseUp={() => holdDirection('ArrowLeft', false)} onMouseLeave={() => holdDirection('ArrowLeft', false)} onTouchStart={() => holdDirection('ArrowLeft', true)} onTouchEnd={() => holdDirection('ArrowLeft', false)} />
                        <button type="button" onClick={moveToBase} style={{ width: '66px', height: '66px', borderRadius: '22px', border: '1px solid rgba(255,255,255,0.16)', background: 'linear-gradient(180deg, rgba(80,130,255,0.95) 0%, rgba(43,86,196,0.95) 100%)', color: 'white', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 700, boxShadow: '0 16px 28px rgba(25,65,170,0.34)', fontFamily: 'inherit' }}>帰還</button>
                        <DPadButton label="右へ移動" icon={<ChevronRight size={18} />} onMouseDown={() => holdDirection('ArrowRight', true)} onMouseUp={() => holdDirection('ArrowRight', false)} onMouseLeave={() => holdDirection('ArrowRight', false)} onTouchStart={() => holdDirection('ArrowRight', true)} onTouchEnd={() => holdDirection('ArrowRight', false)} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <DPadButton label="下へ移動" icon={<ChevronDown size={18} />} onMouseDown={() => holdDirection('ArrowDown', true)} onMouseUp={() => holdDirection('ArrowDown', false)} onMouseLeave={() => holdDirection('ArrowDown', false)} onTouchStart={() => holdDirection('ArrowDown', true)} onTouchEnd={() => holdDirection('ArrowDown', false)} />
                    </div>
                </div>
                <div style={{ fontSize: '0.76rem', color: '#8fa8c5', lineHeight: 1.6, marginTop: '0.85rem' }}>
                    `WASD` / 矢印キーでも連続移動できます。タイルをクリックすると、その地点までシームレスに歩きます。
                </div>
            </div>

            <div style={{ display: 'grid', gap: '0.55rem' }}>
                <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => onOpenMode('chat')}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}><MessageSquare size={15} />Chat</span>
                    <ChevronRight size={14} />
                </button>
                <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => onOpenMode('graph')}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}><GitFork size={15} />Graph</span>
                    <ChevronRight size={14} />
                </button>
            </div>
        </div>
    );

    const centerPanel = (
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', padding: '0.95rem 1rem', borderRadius: '24px', background: 'linear-gradient(180deg, rgba(7,18,36,0.98) 0%, rgba(4,13,24,0.98) 100%)', border: '1px solid rgba(111, 164, 255, 0.14)', boxShadow: '0 18px 40px rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '14px', background: 'linear-gradient(135deg, #63d7ff 0%, #4b7fff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#07111f', boxShadow: '0 12px 24px rgba(74,115,255,0.32)' }}>
                        <MapIcon size={18} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.74rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8ca7c4' }}>Map Session</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f5fbff' }}>{spaceTitle || 'Untitled Space'}</div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                    {[{ icon: Sparkles, label: `${rewards.xp} XP`, color: '#63d7ff' }, { icon: Coins, label: `${rewards.coins} Coins`, color: '#ffd166' }, { icon: KeyRound, label: `${rewards.keys} Keys`, color: '#8fff99' }, { icon: Compass, label: `${revealedCount} / ${MAP_WORLD_SIZE * MAP_WORLD_SIZE}`, color: '#ff98c5' }].map((chip) => {
                        const Icon = chip.icon;
                        return <div key={chip.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.48rem 0.8rem', borderRadius: '999px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.8rem', color: '#eaf5ff' }}><Icon size={14} color={chip.color} />{chip.label}</div>;
                    })}
                </div>
            </div>

            <div ref={fieldRef} onWheel={handleZoom} style={{ position: 'relative', flex: isCompactLayout ? '0 0 auto' : 1, minHeight: isCompactLayout ? '560px' : 0, height: isCompactLayout ? '68vh' : undefined, borderRadius: '34px', overflow: 'hidden', border: '1px solid rgba(111, 164, 255, 0.18)', background: 'linear-gradient(180deg, #134d28 0%, #1d8038 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 30px 60px rgba(0,0,0,0.24)' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top, rgba(255,255,255,0.12), transparent 45%), radial-gradient(circle at bottom, rgba(0,0,0,0.22), transparent 40%)' }} />
                <div style={{ position: 'absolute', top: '0.9rem', left: '1rem', zIndex: 10, display: 'inline-flex', alignItems: 'center', gap: '0.65rem', padding: '0.55rem 0.8rem', borderRadius: '16px', background: 'rgba(8,18,33,0.74)', border: '1px solid rgba(255,255,255,0.08)', color: '#f4fbff', fontSize: '0.8rem' }}>
                    <span>World 100 x 100</span>
                    <span style={{ color: '#7ed8ff' }}>Start 4 Tiles</span>
                    <span style={{ color: '#ffd166' }}>Zoom {Math.round(zoom * 100)}%</span>
                </div>

                <div style={{ position: 'absolute', inset: 0 }}>
                    {visibleTiles.map((tile) => {
                        const revealed = revealedTileIds.has(tile.id);
                        const palette = getTilePalette(tile.kind, revealed);
                        const landmark = LANDMARKS.find((item) => item.x === tile.x && item.y === tile.y);
                        const isPlayerTile = currentTileX === tile.x && currentTileY === tile.y;
                        const isStartTile = tile.x >= HUT_CENTER.x - 1 && tile.x <= HUT_CENTER.x && tile.y >= HUT_CENTER.y - 1 && tile.y <= HUT_CENTER.y;

                        return (
                            <button type="button" key={tile.id} onClick={() => handleTileClick(tile.x, tile.y)} style={{ position: 'absolute', left: tile.screen.left, top: tile.screen.top, width: `${tileWidth}px`, height: `${tileHeight + TILE_DEPTH}px`, transform: 'translate(-50%, -50%)', border: 'none', background: 'transparent', padding: 0, cursor: isBlockedTile(tile.x, tile.y) ? 'default' : 'pointer', zIndex: tile.x + tile.y }} aria-label={`${tile.x},${tile.y}`}>
                                <div style={{ position: 'absolute', left: 0, top: `${tileHeight / 2}px`, width: 0, height: 0, borderTop: `${TILE_DEPTH}px solid ${palette.edge}`, borderLeft: `${tileWidth / 2}px solid transparent`, borderRight: `${tileWidth / 2}px solid transparent`, filter: 'brightness(0.82)' }} />
                                <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', background: palette.top, boxShadow: revealed ? `0 6px 0 ${palette.edge}, inset 0 1px 0 rgba(255,255,255,0.18), 0 0 0 1px ${palette.outline}` : `0 6px 0 ${palette.edge}, inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px ${palette.outline}`, opacity: revealed ? 1 : 0.9 }} />
                                {isStartTile && <div style={{ position: 'absolute', inset: '6px', clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', border: '2px solid rgba(99, 215, 255, 0.92)', boxShadow: '0 0 0 6px rgba(99, 215, 255, 0.12)' }} />}
                                {(tile.kind === 'path' || landmark) && <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -55%)', width: landmark ? '18px' : '14px', height: landmark ? '18px' : '14px', borderRadius: '6px', background: palette.chip, boxShadow: landmark ? `0 0 20px ${landmark.accent}55` : 'none' }} />}
                                {isPlayerTile && <div style={{ position: 'absolute', inset: '10px', clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', border: '2px solid rgba(255,255,255,0.75)', background: 'rgba(255,255,255,0.08)' }} />}
                            </button>
                        );
                    })}

                    {treeScreens.map((tree) => (
                        <div key={tree.key} style={{ position: 'absolute', left: tree.screen.left, top: tree.screen.top - tileHeight * 0.9, transform: 'translate(-50%, -50%)', zIndex: tree.x + tree.y + 20 }}>
                            <LandmarkSprite type="tree" size={84 + tree.radius * 14} />
                        </div>
                    ))}

                    <div style={{ position: 'absolute', left: hutScreen.left, top: hutScreen.top - tileHeight * 1.55, transform: 'translate(-50%, -50%)', zIndex: 999 }}>
                        <HutSprite size={190 * zoom} />
                    </div>
                    <div style={{ position: 'absolute', left: hutScreen.left, top: hutScreen.top - tileHeight * 2.25, transform: 'translate(-50%, -50%)', zIndex: 1000, display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.32rem 0.65rem', borderRadius: '999px', background: 'rgba(7, 18, 33, 0.86)', border: '1px solid rgba(99, 215, 255, 0.45)', color: '#f7fbff', fontSize: '0.74rem', fontWeight: 700, boxShadow: '0 12px 24px rgba(99, 215, 255, 0.22)' }}>
                        <Sparkles size={12} color="#63d7ff" />
                        START
                    </div>

                    {landmarkScreens.map((landmark) => (
                        <div key={landmark.id} style={{ position: 'absolute', left: landmark.screen.left, top: landmark.screen.top - tileHeight * 1.05, transform: 'translate(-50%, -50%)', zIndex: landmark.x + landmark.y + 36, textAlign: 'center', pointerEvents: 'none' }}>
                            <LandmarkSprite type={landmark.type} size={90 * zoom} />
                            <div style={{ marginTop: '-0.45rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.28rem 0.55rem', borderRadius: '999px', background: 'rgba(7, 18, 33, 0.78)', border: `1px solid ${landmark.accent}55`, color: '#f7fbff', fontSize: '0.72rem', fontWeight: 700, boxShadow: `0 12px 18px ${landmark.accent}22` }}>
                                <Flag size={12} color={landmark.accent} />
                                {landmark.label}
                            </div>
                        </div>
                    ))}

                    {destinationScreen && <div style={{ position: 'absolute', left: destinationScreen.left, top: destinationScreen.top - tileHeight * 0.1, transform: 'translate(-50%, -50%)', width: `${tileWidth * 0.4}px`, height: `${tileHeight * 0.4}px`, borderRadius: '999px', border: '2px solid rgba(255,255,255,0.92)', boxShadow: '0 0 0 8px rgba(255,255,255,0.18)', zIndex: 1000 }} />}
                    <div style={{ position: 'absolute', left: playerScreen.left, top: playerScreen.top - tileHeight * 1.2, transform: 'translate(-50%, -50%)', zIndex: 1001, pointerEvents: 'none' }}>
                        <LionScoutSprite size={98 * zoom} />
                    </div>
                </div>

                <div style={{ position: 'absolute', left: '1rem', bottom: '1rem', zIndex: 10, padding: '0.8rem 0.9rem', borderRadius: '20px', background: 'rgba(8,18,33,0.78)', border: '1px solid rgba(255,255,255,0.08)', color: '#f0f8ff', maxWidth: '320px' }}>
                    <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8ca7c4' }}>Current Tile</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: '0.25rem' }}>{currentTileLabel}</div>
                    <div style={{ fontSize: '0.8rem', color: '#a8bdd2', lineHeight: 1.6, marginTop: '0.35rem' }}>
                        座標 {currentTileX + 1}:{currentTileY + 1}。{currentLandmark ? `${currentLandmark.label} に接近中です。` : '拠点から外へ歩き、気になる施設へ向かってください。'}
                    </div>
                </div>
            </div>
        </div>
    );
    const rightPanel = (
        <div className="glass-panel" style={{ borderRadius: '28px', padding: '1rem', background: 'linear-gradient(180deg, rgba(7,18,36,0.96) 0%, rgba(5,13,24,0.96) 100%)', border: '1px solid rgba(111, 164, 255, 0.14)', display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'auto' }}>
            <div style={{ borderRadius: '22px', padding: '0.95rem', background: 'linear-gradient(180deg, rgba(15,29,52,0.94) 0%, rgba(7,15,28,0.95) 100%)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.7rem' }}>
                    <Compass size={16} color="#7ed8ff" />
                    <div style={{ fontSize: '0.94rem', fontWeight: 700 }}>Park Control</div>
                </div>
                <div style={{ display: 'grid', gap: '0.55rem' }}>
                    {[['現在地', currentTileLabel], ['ワールド', '100 x 100'], ['スタート', '中央 4 マス + 小屋'], ['近接施設', currentLandmark ? currentLandmark.label : 'なし']].map(([label, value]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.7rem', fontSize: '0.8rem', color: '#deebf8', padding: '0.58rem 0.7rem', borderRadius: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <span style={{ color: '#8ea7c2' }}>{label}</span>
                            <span>{value}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ borderRadius: '22px', padding: '0.95rem', background: 'linear-gradient(180deg, rgba(15,29,52,0.94) 0%, rgba(7,15,28,0.95) 100%)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <Target size={16} color="#ffd166" />
                    <div style={{ fontSize: '0.94rem', fontWeight: 700 }}>Quest Board</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                    {quests.map((quest) => {
                        const completed = completedQuestIds.includes(quest.id);
                        const claimable = quest.resolved && !completed;

                        return (
                            <div key={quest.id} style={{ borderRadius: '18px', padding: '0.85rem', background: completed ? 'rgba(94, 216, 164, 0.1)' : 'rgba(255,255,255,0.03)', border: completed ? '1px solid rgba(94,216,164,0.2)' : '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontSize: '0.72rem', color: completed ? '#7dffc2' : '#8ea7c2', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{quest.badge}</div>
                                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#f7fbff', marginTop: '0.22rem' }}>{quest.questTitle}</div>
                                    </div>
                                    <div style={{ padding: '0.2rem 0.5rem', borderRadius: '999px', fontSize: '0.72rem', background: completed ? 'rgba(94,216,164,0.14)' : claimable ? 'rgba(99,215,255,0.12)' : 'rgba(255,255,255,0.05)', color: completed ? '#8dffcb' : claimable ? '#88e3ff' : '#96abc0' }}>
                                        {completed ? 'Completed' : claimable ? 'Ready' : 'Open'}
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#a3b7cc', lineHeight: 1.6, marginTop: '0.5rem' }}>{quest.description}</div>
                                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                                    <button className="chat-action-btn" onClick={() => moveToQuest(quest.id)}><Compass size={12} />向かう</button>
                                    <button className="chat-action-btn" onClick={() => onOpenMode(quest.actionMode)}>{quest.actionMode === 'graph' ? <GitFork size={12} /> : <MessageSquare size={12} />}{quest.actionLabel}</button>
                                    <button className="chat-action-btn" onClick={() => claimQuest(quest)} disabled={!claimable}><Trophy size={12} />受け取る</button>
                                </div>
                                <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginTop: '0.65rem', fontSize: '0.76rem', color: '#b7cadc' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Sparkles size={12} color="#63d7ff" />{quest.reward.xp}</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Coins size={12} color="#ffd166" />{quest.reward.coins}</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><KeyRound size={12} color="#9dff99" />{quest.reward.keys}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div style={{ borderRadius: '22px', padding: '0.95rem', background: 'linear-gradient(180deg, rgba(15,29,52,0.94) 0%, rgba(7,15,28,0.95) 100%)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, marginBottom: '0.7rem' }}>プレイループ</div>
                <div style={{ display: 'grid', gap: '0.55rem' }}>
                    {['1. Chat で次の目標や疑問を作る。', '2. Map でその目標をクエストとして追う。', '3. Graph で分岐を増やし、理解の道筋を整理する。'].map((line) => (
                        <div key={line} style={{ padding: '0.75rem 0.8rem', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#a8bdd2', fontSize: '0.8rem', lineHeight: 1.55 }}>
                            {line}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <div style={{ flex: 1, minHeight: 0, background: 'linear-gradient(180deg, #071327 0%, #04101d 100%)', display: 'grid', gridTemplateColumns: isCompactLayout ? '1fr' : '260px minmax(0, 1fr) 290px', gap: '1rem', padding: '1rem', overflow: isCompactLayout ? 'auto' : 'hidden' }}>
            {isCompactLayout ? centerPanel : leftPanel}
            {isCompactLayout ? leftPanel : centerPanel}
            {rightPanel}
        </div>
    );
}
