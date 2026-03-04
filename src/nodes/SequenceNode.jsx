import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Target, Play } from 'lucide-react';
import './nodes.css';

export default function SequenceNode({ data, id }) {
    const isLR = data.dir === 'LR';
    const sourcePos = isLR ? Position.Right : Position.Bottom;
    const targetPos = isLR ? Position.Left : Position.Top;

    return (
        <div className="custom-node node-sequence selected:ring-2 selected:ring-node-seq">
            {!data.isStarter && (
                <Handle type="target" position={targetPos} className="custom-handle" />
            )}

            <div className="node-header">
                <Target size={16} />
                <span>Sequence</span>
            </div>

            <div className="node-body">
                <div className="input-group">
                    <label>Prompt / Instruction</label>
                    <textarea
                        placeholder="Tell the AI what to do..."
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
            </div>

            <div className="node-quick-add">
                <span>+ Add Next:</span>
                <button onClick={() => data.onQuickAdd(id, 'sequenceNode')}>Seq</button>
                <button onClick={() => data.onQuickAdd(id, 'loopNode')}>Loop</button>
                <button onClick={() => data.onQuickAdd(id, 'branchNode')}>Branch</button>
            </div>

            <Handle type="source" position={sourcePos} className="custom-handle" />
        </div>
    );
}
