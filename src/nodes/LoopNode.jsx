import React, { useState, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
import { Repeat, Plus, Settings, Trash2 } from 'lucide-react';
import { useLanguage } from '../i18n';
import './nodes.css';

export default function LoopNode({ data, id }) {
    const { t } = useLanguage();
    const [showConfig, setShowConfig] = useState(false);
    const updateNodeInternals = useUpdateNodeInternals();
    const isLR = data.dir === 'LR';
    const sourcePos = isLR ? Position.Right : Position.Bottom;
    const targetPos = isLR ? Position.Left : Position.Top;
    const showLoopHandles = Boolean(data.isLooping || data.loopNodeId || data.loopOriginId);

    useEffect(() => {
        try { updateNodeInternals(id); } catch (e) { }
    }, [id, isLR, showLoopHandles, updateNodeInternals]);

    return (
        <div className="custom-node node-loop">
            <Handle type="target" position={targetPos} className="custom-handle" />
            {showLoopHandles && (
                <>
                    <Handle
                        type="target"
                        id="loop-return-target"
                        position={isLR ? Position.Left : Position.Top}
                        className="custom-handle"
                        style={isLR ? { top: '50%' } : { left: '24%' }}
                    />
                    <Handle
                        type="target"
                        id="loop-forward-target"
                        position={isLR ? Position.Right : Position.Bottom}
                        className="custom-handle"
                        style={isLR ? { top: '24%' } : { left: '76%' }}
                    />
                    <Handle
                        type="source"
                        id="loop-forward-source"
                        position={isLR ? Position.Right : Position.Bottom}
                        className="custom-handle"
                        style={isLR ? { top: '24%' } : { left: '76%' }}
                    />
                    <Handle
                        type="source"
                        id="loop-return-source"
                        position={isLR ? Position.Left : Position.Top}
                        className="custom-handle"
                        style={isLR ? { top: '50%' } : { left: '24%' }}
                    />
                </>
            )}

            <div className="node-header" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Repeat size={14} />
                    <button
                        onClick={() => data.onToggleLoop ? data.onToggleLoop(id) : (data.onChange && data.onChange(id, 'isLooping', !data.isLooping))}
                        style={{
                            background: data.isLooping ? 'rgba(251, 191, 36, 0.15)' : 'transparent',
                            border: data.isLooping ? '1px solid rgba(251, 191, 36, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '12px', padding: '0.15rem 0.4rem', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.2rem', color: data.isLooping ? '#fbbf24' : 'var(--text-muted)',
                            fontSize: '0.65rem', fontWeight: 500, transition: 'all 0.2s', fontFamily: 'inherit'
                        }}
                        title={data.isLooping ? "Loop On" : "Loop Off"}
                    >
                        <Repeat size={10} />
                    </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <button onClick={() => data.onDeleteNode && data.onDeleteNode(id)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.15rem', display: 'flex', alignItems: 'center', opacity: 0.5, transition: 'opacity 0.2s' }}
                        title={t('node.delete')}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#f87171'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
                        <Trash2 size={12} />
                    </button>
                    <button
                        onClick={() => data.onQuickAdd && data.onQuickAdd(id, 'sequenceNode')}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', padding: '0.15rem', display: 'flex', alignItems: 'center', opacity: 0.7, transition: 'opacity 0.2s' }}
                        title={t('node.addNode')}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                    >
                        <Plus size={14} />
                    </button>
                </div>
            </div>

            <div className="node-body" style={{ paddingBottom: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                        onClick={() => data.onOpenChat && data.onOpenChat(id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            background: 'var(--primary)', color: 'white', border: 'none',
                            padding: '0.4rem 0.9rem', borderRadius: '18px', cursor: 'pointer',
                            fontSize: '0.82rem', fontWeight: 500,
                            boxShadow: '0 3px 10px rgba(108, 140, 255, 0.25)',
                            transition: 'all 0.2s'
                        }}
                    >
                        💬 Chat
                    </button>

                    <button
                        onClick={() => setShowConfig(!showConfig)}
                        style={{ background: showConfig ? 'var(--text-main)' : 'rgba(255,255,255,0.04)', color: showConfig ? 'var(--bg-dark)' : 'var(--text-main)', border: '1px solid var(--panel-border)', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                        title={t('node.settings')}
                    >
                        <Settings size={13} />
                    </button>
                </div>

                {showConfig && (
                    <div style={{ marginTop: '0.75rem', background: 'rgba(255,255,255,0.02)', padding: '0.65rem', borderRadius: '8px', border: '1px solid var(--panel-border)', animation: 'fadeIn 0.2s ease' }}>
                        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem', display: 'block' }}>{t('node.loopStrategy')}</label>
                        <select
                            className="node-select-sm"
                            style={{ width: '100%', marginBottom: '0.6rem', padding: '0.35rem' }}
                            value={data.loopMode || 'perspective'}
                            onChange={(e) => data.onChange && data.onChange(id, 'loopMode', e.target.value)}
                        >
                            <option value="perspective">{t('node.loopPerspective')}</option>
                            <option value="quiz">{t('node.loopQuiz')}</option>
                            <option value="summary">{t('node.loopSummary')}</option>
                        </select>

                        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem', display: 'block' }}>{t('node.systemPrompt')}</label>
                        <textarea
                            className="node-input"
                            style={{ minHeight: '50px', width: '100%' }}
                            placeholder={t('node.systemPlaceholder')}
                            value={data.systemPrompt || ''}
                            onChange={(e) => data.onChange && data.onChange(id, 'systemPrompt', e.target.value)}
                        />

                        <div style={{ marginTop: '0.6rem' }}>
                            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem', display: 'block' }}>{t('node.apiKeyLabel')}</label>
                            <select
                                className="node-select-sm"
                                style={{ width: '100%', padding: '0.35rem' }}
                                value={data.selectedApiKey || 0}
                                onChange={(e) => data.onChange && data.onChange(id, 'selectedApiKey', parseInt(e.target.value))}
                            >
                                {data.apiKeys && data.apiKeys.map((item, i) => (
                                    <option key={i} value={i}>Key {i + 1} ({item?.provider || 'openai'})</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* Loop self-connection indicator */}
            <div style={{
                position: 'absolute', top: '-6px', right: '-6px',
                width: '22px', height: '22px', borderRadius: '50%',
                background: 'var(--bg-dark)', border: '2px solid var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.6rem'
            }}>
                <Repeat size={10} color="var(--primary)" />
            </div>

            <Handle type="source" position={sourcePos} className="custom-handle" />
        </div>
    );
}
