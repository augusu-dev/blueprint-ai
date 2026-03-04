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
                <div className="input-group">
                    <label>Routing Prompt / Condition</label>
                    <textarea
                        placeholder="Condition to evaluate..."
                        className="node-input"
                        defaultValue={data.prompt || ''}
                        onChange={(e) => data.onChange && data.onChange(id, 'prompt', e.target.value)}
                    />
                </div>

                <div className="ai-response">
                    <label>AI Response</label>
                    <div className="response-box">
                        {data.response || "Waiting for prompt..."}
                    </div>
                    <button className="btn-run-ai" onClick={() => data.onRunAI && data.onRunAI(id)}>
                        <Play size={12} /> Run
                    </button>
                </div>

                <button className="node-btn-small mt-2" onClick={handleAddBranch}>
                    <Plus size={12} /> Add Output Route
                </button>
            </div>

            <div className="node-quick-add branch-quick-add">
                <span>+ Add Next (to all):</span>
                <button onClick={() => data.onQuickAdd(id, 'sequenceNode')}>Seq</button>
                <button onClick={() => data.onQuickAdd(id, 'loopNode')}>Loop</button>
                <button onClick={() => data.onQuickAdd(id, 'branchNode')}>Branch</button>
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
