import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Split, Plus } from 'lucide-react';
import './nodes.css';

export default function BranchNode({ data, id }) {
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
            </div>

            <Handle type="source" position={sourcePos} className="custom-handle" />
        </div>
    );
}
