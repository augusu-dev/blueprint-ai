import React from 'react';
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Coins,
    Flag,
    GitFork,
    KeyRound,
    Map as MapIcon,
    MessageSquare,
    Sparkles,
    Target,
} from 'lucide-react';

const GRID_SIZE = 7;
const STEP_REWARD = { xp: 8, coins: 4, keys: 0 };
const QUEST_TILES = {
    '3,1': { questId: 'goal-quest', label: 'Goal Tower', accent: '#f59e0b' },
    '5,2': { questId: 'chat-quest', label: 'Echo Relay', accent: '#34d399' },
    '1,4': { questId: 'graph-quest', label: 'Branch Forge', accent: '#fb7185' },
    '5,5': { questId: 'explorer-quest', label: 'Scout Ruins', accent: '#a78bfa' },
};

function getTileId(x, y) {
    return `${x},${y}`;
}

function clamp(value) {
    return Math.max(0, Math.min(GRID_SIZE - 1, value));
}

function revealTileSet(player) {
    const tiles = new Set();

    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            tiles.add(getTileId(clamp(player.x + offsetX), clamp(player.y + offsetY)));
        }
    }

    return [...tiles];
}

function deriveQuests(spaceTitle, nodes, mapState) {
    const starterNode = nodes.find((node) => node.data?.isStarter);
    const sequenceNodes = nodes.filter((node) => node.type === 'sequenceNode');
    const hasGoal = Boolean(starterNode?.data?.systemPrompt?.trim());
    const hasChatLog = sequenceNodes.some((node) => (node.data?.chatHistory || []).some((message) => message.role === 'user'));
    const hasGraphBranch = sequenceNodes.length > 1;
    const hasExplored = (mapState?.revealedTileIds || []).length >= 18;

    return [
        {
            id: 'goal-quest',
            title: hasGoal ? 'Goal crystal stabilized' : 'Set your main learning goal',
            description: hasGoal
                ? `${spaceTitle || 'This session'} now has a concrete goal.`
                : 'Open chat and define one clear learning objective.',
            resolved: hasGoal,
            actionLabel: 'Open Chat',
            actionMode: 'chat',
            reward: { xp: 36, coins: 16, keys: 1 },
            badge: 'Main Quest',
        },
        {
            id: 'chat-quest',
            title: hasChatLog ? 'Conversation relay unlocked' : 'Send your first learning prompt',
            description: hasChatLog
                ? 'Your session has a live conversation history.'
                : 'Use chat to ask, refine, or clarify what you want to learn next.',
            resolved: hasChatLog,
            actionLabel: 'Open Chat',
            actionMode: 'chat',
            reward: { xp: 22, coins: 10, keys: 0 },
            badge: 'Momentum',
        },
        {
            id: 'graph-quest',
            title: hasGraphBranch ? 'Branch Forge activated' : 'Create your first branch in graph',
            description: hasGraphBranch
                ? 'You now have at least one alternate route to explore.'
                : 'Open graph view and add a new branch to your plan.',
            resolved: hasGraphBranch,
            actionLabel: 'Open Graph',
            actionMode: 'graph',
            reward: { xp: 28, coins: 14, keys: 1 },
            badge: 'Structure',
        },
        {
            id: 'explorer-quest',
            title: hasExplored ? 'Scout path secured' : 'Reveal more of the learning field',
            description: hasExplored
                ? 'You have uncovered enough terrain to unlock the next trail.'
                : 'Move around the map and uncover at least 18 tiles.',
            resolved: hasExplored,
            actionLabel: 'Keep Exploring',
            actionMode: 'map',
            reward: { xp: 18, coins: 12, keys: 0 },
            badge: 'Exploration',
        },
    ];
}

function getTileMeta(x, y) {
    const tileId = getTileId(x, y);
    if (tileId === '3,3') {
        return { label: 'Camp Core', accent: '#748ffc', variant: 'camp' };
    }

    if (QUEST_TILES[tileId]) {
        return { ...QUEST_TILES[tileId], variant: 'quest' };
    }

    if ((x + y) % 4 === 0) {
        return { label: 'Treasure Patch', accent: '#22d3ee', variant: 'reward' };
    }

    if ((x + y) % 3 === 0) {
        return { label: 'Tall Grass', accent: '#4ade80', variant: 'grass' };
    }

    return { label: 'Open Path', accent: '#94a3b8', variant: 'path' };
}

export default function MapView({ spaceTitle, nodes, mapState, onMapStateChange, onOpenMode }) {
    const quests = deriveQuests(spaceTitle, nodes, mapState);
    const completedQuestIds = mapState?.completedQuestIds || [];
    const activeQuestIds = mapState?.activeQuestIds?.length ? mapState.activeQuestIds : quests.map((quest) => quest.id);
    const rewards = mapState?.rewards || { xp: 0, coins: 0, keys: 0 };
    const player = mapState?.player || { x: 3, y: 3 };
    const revealedTileIds = new Set(mapState?.revealedTileIds || []);
    const currentTile = getTileMeta(player.x, player.y);

    const movePlayer = (dx, dy) => {
        onMapStateChange((current) => {
            const nextPlayer = {
                x: clamp(current.player.x + dx),
                y: clamp(current.player.y + dy),
            };
            const nextRevealed = new Set(current.revealedTileIds || []);
            revealTileSet(nextPlayer).forEach((tileId) => nextRevealed.add(tileId));

            return {
                ...current,
                player: nextPlayer,
                revealedTileIds: [...nextRevealed],
                rewards: {
                    xp: (current.rewards?.xp || 0) + STEP_REWARD.xp,
                    coins: (current.rewards?.coins || 0) + STEP_REWARD.coins,
                    keys: current.rewards?.keys || 0,
                },
            };
        });
    };

    const claimQuest = (quest) => {
        if (!quest.resolved || completedQuestIds.includes(quest.id)) return;

        onMapStateChange((current) => ({
            ...current,
            completedQuestIds: [...(current.completedQuestIds || []), quest.id],
            activeQuestIds: (current.activeQuestIds || []).filter((questId) => questId !== quest.id),
            rewards: {
                xp: (current.rewards?.xp || 0) + quest.reward.xp,
                coins: (current.rewards?.coins || 0) + quest.reward.coins,
                keys: (current.rewards?.keys || 0) + quest.reward.keys,
            },
        }));
    };

    return (
        <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: 'radial-gradient(circle at top left, rgba(96, 165, 250, 0.12), transparent 35%), radial-gradient(circle at bottom right, rgba(236, 72, 153, 0.10), transparent 32%), var(--bg-dark)',
            overflow: 'auto',
        }}>
            <div style={{
                padding: '1rem 1.2rem',
                borderBottom: '1px solid var(--panel-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap',
                background: 'rgba(11, 15, 25, 0.68)',
                backdropFilter: 'blur(18px)',
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'linear-gradient(135deg, #60a5fa, #34d399)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#07111f' }}>
                            <MapIcon size={17} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.76rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Adventure Map</div>
                            <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)' }}>{spaceTitle || 'Untitled Space'}</div>
                        </div>
                    </div>
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', maxWidth: '540px', lineHeight: 1.6 }}>
                        Chat drives the mission, graph organizes branches, and map turns progress into a playable field.
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <div style={{ padding: '0.45rem 0.75rem', borderRadius: '999px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--panel-border)', color: 'var(--text-main)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Sparkles size={14} color="#60a5fa" /> {rewards.xp} XP
                    </div>
                    <div style={{ padding: '0.45rem 0.75rem', borderRadius: '999px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--panel-border)', color: 'var(--text-main)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Coins size={14} color="#f59e0b" /> {rewards.coins} Coins
                    </div>
                    <div style={{ padding: '0.45rem 0.75rem', borderRadius: '999px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--panel-border)', color: 'var(--text-main)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <KeyRound size={14} color="#34d399" /> {rewards.keys} Keys
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem' }}>
                <div style={{ flex: '1 1 480px', minWidth: '320px' }}>
                    <div className="glass-panel" style={{ padding: '1rem', borderRadius: '22px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                            <div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>Field Grid</div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Move tile by tile to reveal learning objectives and reward points.</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                <button className="btn-icon" onClick={() => movePlayer(0, -1)} style={{ width: '34px', height: '34px' }} title="Move up"><ChevronUp size={16} /></button>
                                <button className="btn-icon" onClick={() => movePlayer(-1, 0)} style={{ width: '34px', height: '34px' }} title="Move left"><ChevronLeft size={16} /></button>
                                <button className="btn-icon" onClick={() => movePlayer(1, 0)} style={{ width: '34px', height: '34px' }} title="Move right"><ChevronRight size={16} /></button>
                                <button className="btn-icon" onClick={() => movePlayer(0, 1)} style={{ width: '34px', height: '34px' }} title="Move down"><ChevronDown size={16} /></button>
                            </div>
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                            gap: '0.55rem',
                            width: '100%',
                            maxWidth: '560px',
                            margin: '0 auto',
                        }}>
                            {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
                                const x = index % GRID_SIZE;
                                const y = Math.floor(index / GRID_SIZE);
                                const tileId = getTileId(x, y);
                                const tile = getTileMeta(x, y);
                                const isPlayer = player.x === x && player.y === y;
                                const isRevealed = revealedTileIds.has(tileId);
                                const canStep = Math.abs(player.x - x) + Math.abs(player.y - y) === 1;

                                return (
                                    <button
                                        key={tileId}
                                        onClick={() => {
                                            if (!canStep) return;
                                            movePlayer(x - player.x, y - player.y);
                                        }}
                                        style={{
                                            aspectRatio: '1 / 1',
                                            borderRadius: '18px',
                                            border: isPlayer ? `2px solid ${tile.accent}` : '1px solid rgba(255,255,255,0.08)',
                                            background: isRevealed
                                                ? `linear-gradient(180deg, ${tile.accent}22, rgba(11, 18, 32, 0.92))`
                                                : 'linear-gradient(180deg, rgba(20, 29, 46, 0.9), rgba(8, 12, 20, 0.95))',
                                            boxShadow: isRevealed
                                                ? `0 14px 0 rgba(8,12,20,0.6), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px ${tile.accent}22`
                                                : '0 12px 0 rgba(5,8,15,0.8)',
                                            color: isRevealed ? 'var(--text-main)' : 'rgba(255,255,255,0.22)',
                                            cursor: canStep ? 'pointer' : 'default',
                                            transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                                            transform: isPlayer ? 'translateY(-3px)' : 'none',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.28rem',
                                            padding: '0.45rem',
                                            fontFamily: 'inherit',
                                            position: 'relative',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        {isPlayer && (
                                            <div style={{
                                                position: 'absolute',
                                                inset: '8px',
                                                borderRadius: '12px',
                                                border: `1px solid ${tile.accent}`,
                                                boxShadow: `0 0 24px ${tile.accent}66`,
                                            }} />
                                        )}
                                        <div style={{ fontSize: '0.7rem', fontWeight: 600, opacity: isRevealed ? 1 : 0.3 }}>
                                            {tile.variant === 'quest' ? <Flag size={15} color={tile.accent} /> : <Sparkles size={14} color={tile.accent} />}
                                        </div>
                                        <div style={{ fontSize: '0.68rem', fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>
                                            {isRevealed ? tile.label : 'Fog'}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        <div style={{ marginTop: '1rem', padding: '0.9rem 1rem', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Current Tile</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '0.2rem' }}>{currentTile.label}</div>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.35rem', lineHeight: 1.5 }}>
                                        Position {player.x + 1}:{player.y + 1}. Reveal the field, trigger quests, and route back to chat or graph when needed.
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                                    <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => onOpenMode('chat')}>
                                        <MessageSquare size={14} /> Chat
                                    </button>
                                    <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => onOpenMode('graph')}>
                                        <GitFork size={14} /> Graph
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ flex: '1 1 320px', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="glass-panel" style={{ padding: '1rem', borderRadius: '22px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
                            <div style={{ width: '30px', height: '30px', borderRadius: '10px', background: 'rgba(96,165,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Target size={15} color="#60a5fa" />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-main)' }}>Quest Board</div>
                                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Progress unlocks the next layer of the map.</div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {quests.filter((quest) => activeQuestIds.includes(quest.id) || completedQuestIds.includes(quest.id)).map((quest) => {
                                const completed = completedQuestIds.includes(quest.id);
                                const claimable = quest.resolved && !completed;

                                return (
                                    <div key={quest.id} style={{
                                        padding: '0.9rem',
                                        borderRadius: '18px',
                                        background: completed ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.03)',
                                        border: completed ? '1px solid rgba(52,211,153,0.2)' : '1px solid var(--panel-border)',
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                                            <div>
                                                <div style={{ fontSize: '0.72rem', color: completed ? '#34d399' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{quest.badge}</div>
                                                <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '0.2rem' }}>{quest.title}</div>
                                            </div>
                                            <div style={{ padding: '0.22rem 0.55rem', borderRadius: '999px', background: claimable ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)', fontSize: '0.72rem', color: claimable ? '#93c5fd' : 'var(--text-muted)' }}>
                                                {completed ? 'Completed' : claimable ? 'Ready' : 'Open'}
                                            </div>
                                        </div>

                                        <div style={{ fontSize: '0.81rem', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: '0.55rem' }}>
                                            {quest.description}
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}><Sparkles size={13} color="#60a5fa" /> {quest.reward.xp}</span>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}><Coins size={13} color="#f59e0b" /> {quest.reward.coins}</span>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}><KeyRound size={13} color="#34d399" /> {quest.reward.keys}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                                                <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => onOpenMode(quest.actionMode)}>
                                                    {quest.actionLabel}
                                                </button>
                                                <button
                                                    className="btn btn-primary"
                                                    style={{ width: 'auto', opacity: claimable ? 1 : 0.55, cursor: claimable ? 'pointer' : 'not-allowed' }}
                                                    onClick={() => claimQuest(quest)}
                                                    disabled={!claimable}
                                                >
                                                    {completed ? 'Claimed' : 'Claim Reward'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="glass-panel" style={{ padding: '1rem', borderRadius: '22px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem' }}>
                            <div style={{ width: '30px', height: '30px', borderRadius: '10px', background: 'rgba(251,191,36,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Flag size={15} color="#fbbf24" />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-main)' }}>Recommended Loop</div>
                                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Keep the product loop small and satisfying.</div>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gap: '0.55rem' }}>
                            {[
                                '1. Clarify the next learning objective in chat.',
                                '2. Shape alternate approaches in graph.',
                                '3. Return to map to move, claim, and unlock.',
                            ].map((line) => (
                                <div key={line} style={{ padding: '0.75rem 0.85rem', borderRadius: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                    {line}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
