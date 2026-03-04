import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Split, Plus, Play } from 'lucide-react';
import './nodes.css';

export default function BranchNode({ data, id }) {
    const isLR = data.dir === 'LR';
    const sourcePos = isLR ? Position.Right : Position.Bottom;
    const targetPos = isLR ? Position.Left : Position.Top;

    const numBranches = data.numBranches || 2;

    const handleAddBranch = () => {
        if (data.onAddBranch) data.onAddBranch(id);
    };

    return (
        <div className="custom-node node-branch selected:ring-2 selected:ring-node-branch">
            <Handle type="target" position={targetPos} className="custom-handle" />

            <div className="node-header">
                <Split size={16} />
                <span>Branch</span>
            </div>

            <div className="node-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
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

                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
                    <button className="node-btn-small" onClick={handleAddBranch} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                        <Plus size={12} /> Add Output Route
                    </button>
                </div>
            </div>

            <div className="node-quick-add branch-quick-add" style={{ padding: '0.5rem', display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                <button onClick={() => data.onQuickAdd(id, 'sequenceNode')} title="Sequence Node">+</button>
                <button onClick={() => data.onQuickAdd(id, 'loopNode')} title="Loop Node">↻</button>
                <button onClick={() => data.onQuickAdd(id, 'branchNode')} title="Branch Node">↗</button>
            </div>

            {Array.from({ length: numBranches }).map((_, i) => {
                const spacing = 100 / (numBranches + 1);
                const posStyle = isLR ? { top: `${spacing * (i + 1)}%` } : { left: `${spacing * (i + 1)}%` };
                return (
                    <Handle
                        key={i}
                        type="source"
                        id={`source-${i}`}
                        position={sourcePos}
                        className="custom-handle"
                        style={posStyle}
                    />
                );
            })}
        </div>
    );
}
