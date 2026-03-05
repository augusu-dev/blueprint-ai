import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Split, Plus, Settings } from 'lucide-react';
import './nodes.css';

export default function BranchNode({ data, id }) {
    const [showConfig, setShowConfig] = useState(false);
    const isLR = data.dir === 'LR';
    const sourcePos = isLR ? Position.Right : Position.Bottom;
    const targetPos = isLR ? Position.Left : Position.Top;

    return (
        <div className="custom-node node-branch selected:ring-2 selected:ring-node-branch">
            <Handle type="target" position={targetPos} className="custom-handle" />

            <div className="node-header" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Split size={16} />
                    <span>Branch</span>
                </div>
                <button
                    onClick={() => data.onQuickAdd && data.onQuickAdd(id, 'sequenceNode')}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center' }}
                    title="Add Next Node"
                >
                    <Plus size={16} />
                </button>
            </div>

            <div className="node-body" style={{ paddingBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                        onClick={() => data.onOpenChat && data.onOpenChat(id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            background: 'var(--primary)', color: 'white', border: 'none',
                            padding: '0.5rem 1rem', borderRadius: '20px', cursor: 'pointer',
                            fontSize: '0.9rem', fontWeight: 600,
                            boxShadow: '0 4px 10px rgba(59, 130, 246, 0.3)'
                        }}
                    >
                        💬 Chat
                    </button>

                    <button
                        onClick={() => setShowConfig(!showConfig)}
                        style={{ background: showConfig ? 'var(--text-main)' : 'var(--panel-bg)', color: showConfig ? 'var(--bg-dark)' : 'var(--text-main)', border: '1px solid var(--panel-border)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                        title="設定 / Settings"
                    >
                        <Settings size={16} />
                    </button>
                </div>

                {showConfig && (
                    <div style={{ marginTop: '1rem', background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>カスタマイズ指示 (System Prompt)</label>
                        <textarea
                            className="node-input"
                            style={{ minHeight: '60px', width: '100%' }}
                            placeholder="AIに対する事前指示..."
                            value={data.systemPrompt || ''}
                            onChange={(e) => data.onChange && data.onChange(id, 'systemPrompt', e.target.value)}
                        />

                        <div style={{ marginTop: '0.75rem' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>使用モデル / APIキー</label>
                            <select
                                className="node-select-sm"
                                style={{ width: '100%', padding: '0.4rem' }}
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

            <Handle type="source" position={sourcePos} className="custom-handle" />
        </div>
    );
}
