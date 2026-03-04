import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
import { Settings, X, LogOut, Columns, Rows } from 'lucide-react';
import { supabase } from './lib/supabase';

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
    const [apiKeys, setApiKeys] = useState(() => {
        const saved = localStorage.getItem('blueprint_api_keys');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed.map(item => {
                        if (typeof item === 'string') {
                            let provider = 'openai';
                            if (item.startsWith('AIza')) provider = 'gemini';
                            else if (item.startsWith('sk-ant')) provider = 'anthropic';
                            return { key: item, provider, model: '' };
                        }
                        return { ...item, model: item.model || '' };
                    });
                }
            } catch (e) { }
        }
        return [{ key: '', provider: 'openai', model: '' }]; // Default to 1 empty key obj
    });

    useEffect(() => {
        localStorage.setItem('blueprint_api_keys', JSON.stringify(apiKeys));
    }, [apiKeys]);

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

    const runAIForNode = useCallback(async (id, promptText, selectedKeyIndex) => {
        const prompt = promptText || "No prompt provided.";
        const keyIndex = selectedKeyIndex || 0;
        const apiKeyObj = apiKeys[keyIndex];
        const keyToUse = apiKeyObj?.key?.trim();
        const provider = apiKeyObj?.provider || 'openai';

        if (!keyToUse) {
            setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, response: `Error: API Key ${keyIndex + 1} (${provider}) is not set in Settings.` } } : n));
            return;
        }

        // First set to loading...
        setNodes(nds => nds.map(node => {
            if (node.id === id) {
                return { ...node, data: { ...node.data, response: `Loading AI Response (${provider})...` } };
            }
            return node;
        }));

        try {
            let reply = "";

            if (provider === 'gemini') {
                const modelToUse = userModel || 'gemini-1.5-flash-latest';
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${keyToUse}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }]
                    })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || `Gemini API Error: ${response.status}`);
                reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response content received.";

            } else if (provider === 'anthropic') {
                const modelToUse = userModel || 'claude-3-haiku-20240307';
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': keyToUse,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerously-allow-browser': 'true'
                    },
                    body: JSON.stringify({
                        model: modelToUse,
                        max_tokens: 1024,
                        messages: [{ role: 'user', content: prompt }]
                    })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || `Anthropic API Error: ${response.status}`);
                reply = data.content?.[0]?.text || "No response content received.";

            } else if (provider === 'openrouter') {
                const modelToUse = userModel || 'google/gemini-flash-1.5';
                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${keyToUse}`
                    },
                    body: JSON.stringify({
                        model: modelToUse,
                        messages: [{ role: 'user', content: prompt }]
                    })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || `OpenRouter Error: ${response.status}`);
                reply = data.choices?.[0]?.message?.content || "No response content received.";

            } else if (provider === 'glm') {
                const modelToUse = userModel || 'glm-4';
                const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${keyToUse}`
                    },
                    body: JSON.stringify({
                        model: modelToUse,
                        messages: [{ role: 'user', content: prompt }]
                    })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || `GLM API Error: ${response.status}`);
                reply = data.choices?.[0]?.message?.content || "No response content received.";

            } else {
                // Default: OpenAI
                const modelToUse = userModel || 'gpt-4o-mini';
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${keyToUse}`
                    },
                    body: JSON.stringify({
                        model: modelToUse,
                        messages: [{ role: 'user', content: prompt }]
                    })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || `OpenAI API Error: ${response.status}`);
                reply = data.choices?.[0]?.message?.content || "No response content received.";
            }

            setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, response: reply } } : n));
        } catch (err) {
            setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, response: `Error: ${err.message}` } } : n));
        }
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
                onQuickAdd: onQuickAdd,
                apiKeys: apiKeys
            }
        }));
    }, [nodes, direction, updateNodeData, onAddBranch, runAIForNode, onQuickAdd, apiKeys]);

    const toggleDirection = () => setDirection(d => d === 'LR' ? 'TB' : 'LR');

    return (
        <div className="editor-layout">
            <div className="editor-header glass-panel">
                <div className="editor-header-left">
                    <h2>スペース</h2>
                </div>
                <div className="editor-controls">
                    <button className="btn btn-icon" onClick={toggleDirection} title="Toggle Layout Direction">
                        {direction === 'LR' ? <Columns size={20} /> : <Rows size={20} />}
                    </button>
                    <button className="btn btn-icon" onClick={() => setShowSettings(true)} title="Settings">
                        <Settings size={20} />
                    </button>
                    <button className="btn btn-icon" onClick={() => supabase.auth.signOut()} title="Log Out">
                        <LogOut size={20} />
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
                            <div className="glass-panel" style={{ padding: '0.75rem', marginBottom: '1.5rem', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                                <p style={{ fontSize: '0.85rem', margin: 0, fontWeight: 500, color: 'var(--text-color)' }}>
                                    🔒 <strong>Security Note:</strong> Your API keys are stored <em>only</em> locally in your browser to persist across reloads. <strong>Blueprint AI does not store, collect, or transmit your keys to any external servers</strong> other than the direct AI providers you choose.
                                </p>
                            </div>
                            <p className="help-text" style={{ marginBottom: '1rem' }}>Configure up to 5 API Keys from different providers. Leave "Model" blank to use the default.</p>
                            {apiKeys.map((item, index) => (
                                <div className="form-group glass-panel" key={index} style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <label style={{ marginBottom: 0, fontWeight: 600 }}>API Key {index + 1} {index === 0 && '(Default)'}</label>
                                        {apiKeys.length > 1 && (
                                            <button
                                                className="btn-text-danger"
                                                onClick={() => setApiKeys(apiKeys.filter((_, i) => i !== index))}
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Provider</label>
                                            <select
                                                className="node-input"
                                                style={{ padding: '0.4rem', height: '34px' }}
                                                value={item.provider}
                                                onChange={(e) => {
                                                    const newKeys = [...apiKeys];
                                                    newKeys[index] = { ...newKeys[index], provider: e.target.value };
                                                    setApiKeys(newKeys);
                                                }}
                                            >
                                                <option value="openai">OpenAI</option>
                                                <option value="gemini">Google Gemini</option>
                                                <option value="anthropic">Anthropic (Claude)</option>
                                                <option value="openrouter">OpenRouter</option>
                                                <option value="glm">GLM (ZhipuAI)</option>
                                            </select>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Model (Optional)</label>
                                            <input
                                                type="text"
                                                className="node-input"
                                                style={{ padding: '0.4rem', height: '34px' }}
                                                placeholder={
                                                    item.provider === 'gemini' ? "e.g., gemini-1.5-pro-latest" :
                                                        item.provider === 'anthropic' ? "e.g., claude-3-opus-20240229" :
                                                            item.provider === 'openrouter' ? "e.g., meta-llama/llama-3-8b-instruct" :
                                                                item.provider === 'glm' ? "e.g., glm-4" : "e.g., gpt-4o"
                                                }
                                                value={item.model || ''}
                                                onChange={(e) => {
                                                    const newKeys = [...apiKeys];
                                                    newKeys[index] = { ...newKeys[index], model: e.target.value };
                                                    setApiKeys(newKeys);
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Secret Key</label>
                                        <input
                                            type="password"
                                            placeholder={`Paste your ${item.provider} secret key here...`}
                                            value={item.key || ''}
                                            onChange={(e) => {
                                                const newKeys = [...apiKeys];
                                                newKeys[index] = { ...newKeys[index], key: e.target.value };
                                                setApiKeys(newKeys);
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                            {apiKeys.length < 5 && (
                                <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem', width: '100%' }} onClick={() => setApiKeys([...apiKeys, { key: '', provider: 'openai', model: '' }])}>
                                    + Add Another API Key
                                </button>
                            )}
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
