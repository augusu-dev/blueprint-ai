import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Repeat, Play } from 'lucide-react';
import './nodes.css';

export default function LoopNode({ data, id }) {
    const isLR = data.dir === 'LR';
    const sourcePos = isLR ? Position.Right : Position.Bottom;
    const targetPos = isLR ? Position.Left : Position.Top;

    return (
        <div className="custom-node node-loop selected:ring-2 selected:ring-node-loop">
            <Handle type="target" position={targetPos} className="custom-handle" />

            <div className="node-header">
                <Repeat size={16} />
                <span>Learning Loop</span>
            </div>

            <div className="node-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <select
                        className="node-select mb-2"
                        defaultValue={data.loopMode || 'perspective'}
                        onChange={(e) => data.onChange && data.onChange(id, 'loopMode', e.target.value)}
                    >
                        <option value="perspective">Alternative Perspective</option>
                        <option value="quiz">Interactive Quiz</option>
                        <option value="summary">Summarization</option>
                    </select>

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

                        <select
                            className="node-select-sm"
                            defaultValue={data.selectedApiKey || 0}
                            onChange={(e) => data.onChange && data.onChange(id, 'selectedApiKey', parseInt(e.target.value))}
                            title="API Key Select"
                            style={{ maxWidth: '100px' }}
                        >
                            {data.apiKeys && data.apiKeys.map((item, i) => (
                                <option key={i} value={i}>Key {i + 1} ({item?.provider || 'openai'})</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="node-quick-add" style={{ padding: '0.5rem', display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                <button onClick={() => data.onQuickAdd(id, 'sequenceNode')} title="Sequence Node">+</button>
                <button onClick={() => data.onQuickAdd(id, 'loopNode')} title="Loop Node">↻</button>
                <button onClick={() => data.onQuickAdd(id, 'branchNode')} title="Branch Node">↗</button>
            </div>

            <Handle type="source" position={sourcePos} className="custom-handle" />
        </div>
    );
}
