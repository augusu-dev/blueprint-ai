import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Settings, X } from 'lucide-react';

import SequenceNode from './nodes/SequenceNode';
import LoopNode from './nodes/LoopNode';
import BranchNode from './nodes/BranchNode';

const initialNodes = [
    {
        id: '1',
        type: 'sequenceNode',
        position: { x: 100, y: 100 },
        data: { isStarter: true, dir: 'LR', prompt: '' },
    },
];

const initialEdges = [];

const nodeTypes = {
    sequenceNode: SequenceNode,
    loopNode: LoopNode,
    branchNode: BranchNode,
};

export default function Editor() {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [direction, setDirection] = useState('LR'); // LR = Left-to-Right, TB = Top-to-Bottom
    const [showSettings, setShowSettings] = useState(false);
    const [apiKeys, setApiKeys] = useState(['', '', '', '', '']);

    const idRef = useRef(2);

    const updateNodeData = useCallback((id, key, val) => {
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === id) {
                    return { ...node, data: { ...node.data, [key]: val } };
                }
                return node;
            })
        );
    }, [setNodes]);

    const onAddBranch = useCallback((id) => {
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === id) {
                    return {
                        ...node,
                        data: { ...node.data, numBranches: (node.data.numBranches || 2) + 1 }
                    };
                }
                return node;
            })
        );
    }, [setNodes]);

    const runAIForNode = useCallback(async (id) => {
        // First set to loading...
        setNodes(nds => nds.map(node => {
            if (node.id === id) {
                return { ...node, data: { ...node.data, response: "Loading AI Response..." } };
            }
            return node;
        }));

        setNodes((nds) => {
            const tempNodes = [...nds];
            const targetNode = tempNodes.find(n => n.id === id);
            if (!targetNode) return tempNodes;

            const prompt = targetNode.data.prompt || "No prompt provided.";
            const selectedKeyIndex = targetNode.data.selectedApiKey || 0;
            const keyToUse = apiKeys[selectedKeyIndex];

            if (!keyToUse) {
                return nds.map(n => n.id === id ? { ...n, data: { ...n.data, response: `Error: API Key ${selectedKeyIndex + 1} is not set in Settings.` } } : n);
            }

            // Async call out
            fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${keyToUse}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: prompt }]
                })
            })
                .then(res => res.json())
                .then(data => {
                    if (data.error) throw new Error(data.error.message);
                    const reply = data.choices && data.choices[0] && data.choices[0].message.content;
                    setNodes(current => current.map(n => n.id === id ? { ...n, data: { ...n.data, response: reply } } : n));
                })
                .catch(err => {
                    setNodes(current => current.map(n => n.id === id ? { ...n, data: { ...n.data, response: `Error: ${err.message}` } } : n));
                });

            return nds;
        });
    }, [apiKeys, setNodes]);

    const onQuickAdd = useCallback((sourceId, type) => {
        setNodes((nds) => {
            const sourceNode = nds.find(n => n.id === sourceId);
            if (!sourceNode) return nds;

            const newId = `${idRef.current++}`;
            // Calculate a rough position offset
            const posX = sourceNode.position.x + (direction === 'LR' ? 350 : 0);
            const posY = sourceNode.position.y + (direction === 'TB' ? 350 : 0);

            const newNode = {
                id: newId,
                type,
                position: { x: posX, y: posY },
                data: { dir: direction, prompt: '' }
            };

            setTimeout(() => {
                setEdges(eds => addEdge({ source: sourceId, sourceHandle: null, target: newId, targetHandle: null }, eds));
            }, 50);

            return [...nds, newNode];
        });
    }, [direction, setNodes, setEdges]);

    const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

    const nodesWithData = useMemo(() => {
        return nodes.map(n => ({
            ...n,
            data: {
                ...n.data,
                dir: direction,
                onChange: updateNodeData,
                onAddBranch: onAddBranch,
                onRunAI: runAIForNode,
                onQuickAdd: onQuickAdd
            }
        }));
    }, [nodes, direction, updateNodeData, onAddBranch, runAIForNode, onQuickAdd]);

    const toggleDirection = () => setDirection(d => d === 'LR' ? 'TB' : 'LR');

    return (
        <div className="editor-layout">
            <div className="editor-header glass-panel">
                <div className="editor-header-left">
                    <h2>Blueprint Space</h2>
                    <button className="btn btn-secondary btn-sm ml-4" onClick={toggleDirection}>
                        Layout: {direction === 'LR' ? 'Left to Right →' : 'Top to Bottom ↓'}
                    </button>
                </div>
                <div className="editor-controls">
                    <button className="btn btn-icon" onClick={() => setShowSettings(true)}>
                        <Settings size={20} />
                    </button>
                </div>
            </div>

            <div className="editor-canvas">
                <ReactFlow
                    nodes={nodesWithData}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
                    fitView
                    colorMode="system"
                >
                    <Controls />
                    <MiniMap nodeStrokeWidth={3} zoomable pannable />
                    <Background variant="dots" gap={20} size={1} />
                </ReactFlow>
            </div>

            {showSettings && (
                <div className="settings-modal-overlay">
                    <div className="settings-modal glass-panel">
                        <div className="settings-header">
                            <h3>Global Settings</h3>
                            <button className="btn-icon" onClick={() => setShowSettings(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="settings-body">
                            <p className="help-text" style={{ marginBottom: '1rem' }}>You can configure up to 5 OpenAI API Keys. They are stored locally.</p>
                            {apiKeys.map((key, index) => (
                                <div className="form-group" key={index} style={{ marginBottom: '0.75rem' }}>
                                    <label>API Key {index + 1} {index === 0 && '(Default)'}</label>
                                    <input
                                        type="password"
                                        placeholder={`sk-... (Key ${index + 1})`}
                                        value={key}
                                        onChange={(e) => {
                                            const newKeys = [...apiKeys];
                                            newKeys[index] = e.target.value;
                                            setApiKeys(newKeys);
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="settings-footer">
                            <button className="btn btn-primary" onClick={() => setShowSettings(false)}>Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
