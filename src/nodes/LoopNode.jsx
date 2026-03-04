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
                <div className="input-group">
                    <label>Loop Strategy</label>
                    <select
                        className="node-select mb-2"
                        defaultValue={data.loopMode || 'perspective'}
                        onChange={(e) => data.onChange && data.onChange(id, 'loopMode', e.target.value)}
                    >
                        <option value="perspective">Alternative Perspective</option>
                        <option value="quiz">Interactive Quiz</option>
                        <option value="summary">Summarization</option>
                    </select>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <label style={{ marginBottom: 0 }}>Context Prompt</label>
                        <select
                            className="node-select-sm"
                            defaultValue={data.selectedApiKey || 0}
                            onChange={(e) => data.onChange && data.onChange(id, 'selectedApiKey', parseInt(e.target.value))}
                            title="Select API Key"
                        >
                            {data.apiKeys && data.apiKeys.map((_, i) => (
                                <option key={i} value={i}>Key {i + 1}</option>
                            ))}
                        </select>
                    </div>
                    <textarea
                        placeholder="Focus of this loop..."
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
