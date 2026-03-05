import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
    ReactFlow,
    ReactFlowProvider,
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Settings, X, LogOut, Columns, Rows, Menu, Save, Edit3 } from 'lucide-react';
import { supabase } from './lib/supabase';
import { useParams, useNavigate } from 'react-router-dom';

import Sidebar from './Sidebar';
import LinearChat from './LinearChat';
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

function EditorContent() {
    const { id: spaceId } = useParams();
    const navigate = useNavigate();
    const { setViewport, updateNodeInternals } = useReactFlow();

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [spaceTitle, setSpaceTitle] = useState('Loading Space...');
    const [direction, setDirection] = useState('LR'); // LR = Left-to-Right, TB = Top-to-Bottom
    const [showSettings, setShowSettings] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Manual Title / Saving state
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [tempTitle, setTempTitle] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Linear Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [activeChatNodeId, setActiveChatNodeId] = useState(null);

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

    // Fetch initial space data
    useEffect(() => {
        if (!spaceId) {
            navigate('/');
            return;
        }

        const fetchSpace = async () => {
            if (!supabase) {
                console.warn("No Supabase instance found. Falling back to default canvas.");
                setNodes(initialNodes);
                setEdges(initialEdges);
                setSpaceTitle('無題のスペース（ローカル）');
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('spaces')
                    .select('*')
                    .eq('id', spaceId)
                    .single();

                if (error) {
                    console.error("Error fetching space:", error);
                    setNodes(initialNodes);
                    setEdges(initialEdges);
                    setSpaceTitle('無題のスペース');
                    return;
                }

                if (data) {
                    setSpaceTitle(data.title || '無題のスペース');

                    // Only set nodes/edges on initial load to avoid over-writing unsaved local state
                    if (Array.isArray(data.nodes) && data.nodes.length > 0) setNodes(data.nodes);
                    else setNodes(initialNodes);

                    if (Array.isArray(data.edges) && data.edges.length > 0) setEdges(data.edges);
                    else setEdges(initialEdges);

                    if (data.viewport && Object.keys(data.viewport).length > 0) {
                        setViewport({ x: data.viewport.x, y: data.viewport.y, zoom: data.viewport.zoom });
                    }
                }
            } catch (globalErr) {
                console.error("Global space fetch failed:", globalErr);
                setNodes(initialNodes);
                setEdges(initialEdges);
                setSpaceTitle('無題のスペース（エラー）');
            }
        };

        const fetchTitleOnly = async () => {
            try {
                const { data, error } = await supabase.from('spaces').select('title').eq('id', spaceId).single();
                if (data && data.title) setSpaceTitle(data.title);
            } catch (e) { }
        };

        fetchSpace();

        const handleTitleUpdate = () => fetchTitleOnly();
        window.addEventListener('spaceTitleUpdated', handleTitleUpdate);
        return () => window.removeEventListener('spaceTitleUpdated', handleTitleUpdate);
    }, [spaceId, navigate, setNodes, setEdges, setViewport]);

    const cleanNodesForSave = (rawNodes) => {
        return rawNodes.map(n => {
            const dataToSave = n.data ? {
                dir: n.data.dir,
                prompt: n.data.prompt,
                systemPrompt: n.data.systemPrompt,
                chatHistory: n.data.chatHistory,
                response: n.data.response,
                isStarter: n.data.isStarter,
                numBranches: n.data.numBranches,
                loopMode: n.data.loopMode,
                selectedApiKey: n.data.selectedApiKey
            } : {};

            return {
                id: n.id,
                type: n.type,
                position: n.position,
                data: dataToSave
            };
        });
    };

    const handleManualSave = async () => {
        if (!spaceId || nodes.length === 0 || !supabase) return;
        setIsSaving(true);
        try {
            const updates = {
                nodes: cleanNodesForSave(nodes),
                edges: edges,
                updated_at: new Date().toISOString()
            };

            const { error } = await supabase.from('spaces').update(updates).eq('id', spaceId);
            if (error) throw error;
            console.log("=== 手動保存完了 ===", spaceId);
            window.dispatchEvent(new CustomEvent('spaceTitleUpdated')); // Refreshes sidebar history sorting
        } catch (err) {
            console.error("手動保存エラー:", err);
            alert("保存に失敗しました。詳細: " + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const saveTitle = async () => {
        const cleanedTitle = tempTitle.trim() || '無題のスペース';
        setSpaceTitle(cleanedTitle);
        setIsEditingTitle(false);
        if (supabase && spaceId) {
            await supabase.from('spaces').update({ title: cleanedTitle }).eq('id', spaceId);
            window.dispatchEvent(new CustomEvent('spaceTitleUpdated'));
            handleManualSave(); // Auto-save everything once manual title set
        }
    };

    // Auto-save logic
    const saveTimerRef = useRef(null);
    useEffect(() => {
        if (!spaceId || nodes.length === 0 || !supabase) return;

        // Clear existing timer
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

        // Set a new debounce timer for 1.5 seconds
        saveTimerRef.current = setTimeout(async () => {
            try {
                const updates = {
                    nodes: cleanNodesForSave(nodes),
                    edges: edges,
                    updated_at: new Date().toISOString()
                };

                const { error } = await supabase
                    .from('spaces')
                    .update(updates)
                    .eq('id', spaceId);

                if (error) {
                    console.error("Auto-save Supabase error:", error);
                } else {
                    console.log("Auto-save success", spaceId);
                }
            } catch (err) {
                console.error("Auto-save failed", err);
            }
        }, 1500);

        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [nodes, edges, spaceId]);

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
        const userModel = apiKeyObj?.model;

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
                const modelToUse = userModel || 'gemini-3.1-pro-preview';
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${keyToUse}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        tools: [{ googleSearch: {} }]
                    })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || `Gemini API Error: ${response.status}`);
                reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response content received.";

            } else if (provider === 'anthropic') {
                const modelToUse = userModel || 'claude-4.6-sonnet';
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
                const modelToUse = userModel || 'google/gemini-3.1-pro-preview';
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
                const modelToUse = userModel || 'glm-4-plus';
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
                const modelToUse = userModel || 'gpt-4o';
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
        const outgoingEdges = edges.filter(e => e.source === sourceId);
        if (outgoingEdges.length >= 10) {
            alert("ノードの追加は1つのノードにつき最大10個までです。");
            return;
        }

        setNodes((nds) => {
            const sourceNode = nds.find(n => n.id === sourceId);
            if (!sourceNode) return nds;

            const newId = `node-${crypto.randomUUID()}`;
            const num = outgoingEdges.length;

            let px = direction === 'LR' ? 350 : (num * 240 - 120);
            let py = direction === 'TB' ? 350 : (num * 200 - 100);

            const posX = sourceNode.position.x + px;
            const posY = sourceNode.position.y + py;

            const newNode = {
                id: newId,
                type,
                position: { x: posX, y: posY },
                data: { dir: direction, prompt: '' }
            };

            setTimeout(() => {
                setEdges(eds => addEdge({ id: `e-${sourceId}-${newId}`, source: sourceId, sourceHandle: null, target: newId, targetHandle: null }, eds));
            }, 50);

            return [...nds, newNode];
        });
    }, [direction, edges, setNodes, setEdges]);

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
                onOpenChat: (nodeId) => {
                    setActiveChatNodeId(nodeId);
                    setIsChatOpen(true);
                },
                apiKeys: apiKeys
            }
        }));
    }, [nodes, direction, updateNodeData, onAddBranch, runAIForNode, onQuickAdd, apiKeys, setActiveChatNodeId, setIsChatOpen]);

    const toggleDirection = () => setDirection(d => d === 'LR' ? 'TB' : 'LR');

    // React Flow requires explicit notification when handle positions change dynamically
    useEffect(() => {
        nodes.forEach(node => {
            updateNodeInternals(node.id);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [direction, updateNodeInternals]);

    return (
        <div className="editor-layout">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            {/* Header */}
            <div className="editor-header">
                <div className="editor-header-left" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <div
                        onClick={() => setIsSidebarOpen(true)}
                        style={{ background: 'var(--primary)', padding: '0.4rem', borderRadius: '10px', color: 'white', marginRight: '0.75rem', display: 'flex' }}
                    >
                        <Menu size={20} />
                    </div>
                    {isEditingTitle ? (
                        <input
                            autoFocus
                            className="node-input"
                            style={{ fontSize: '1.25rem', fontWeight: 600, padding: '0.2rem 0.5rem', width: '250px' }}
                            value={tempTitle}
                            onChange={(e) => setTempTitle(e.target.value)}
                            onBlur={saveTitle}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); }}
                        />
                    ) : (
                        <h2
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}
                            onClick={() => { setTempTitle(spaceTitle); setIsEditingTitle(true); }}
                            title="タイトルを手動で変更する"
                        >
                            {spaceTitle} <Edit3 size={14} color="var(--text-muted)" />
                        </h2>
                    )}
                </div>
                <div className="editor-controls" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        className="btn"
                        onClick={handleManualSave}
                        disabled={isSaving}
                        title="現在の状態を手動で保存する"
                        style={{ background: isSaving ? 'rgba(59, 130, 246, 0.5)' : 'var(--primary)', color: 'white', fontSize: '0.8rem', padding: '0.4rem 1rem', border: 'none', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, boxShadow: '0 4px 10px rgba(59, 130, 246, 0.3)', cursor: isSaving ? 'wait' : 'pointer' }}
                    >
                        <Save size={16} />
                        {isSaving ? '保存中...' : '保存 (Save)'}
                    </button>
                    <button
                        className="btn"
                        onClick={toggleDirection}
                        title="レイアウトの方向を切り替える"
                        style={{ background: 'rgba(255,255,255,0.05)', fontSize: '0.8rem', padding: '0.4rem 1rem', border: '1px solid var(--panel-border)', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        {direction === 'LR' ? <Columns size={16} color="var(--primary)" /> : <Rows size={16} color="var(--primary)" />}
                        {direction === 'LR' ? '左から右へ' : '上から下へ'}
                    </button>
                    <button
                        className="btn"
                        onClick={() => setShowSettings(true)}
                        title="全体設定"
                        style={{ background: 'rgba(255,255,255,0.05)', fontSize: '0.8rem', padding: '0.3rem 0.8rem', border: '1px solid var(--panel-border)', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <Settings size={16} color="var(--primary)" />
                        全体設定
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

                <LinearChat
                    isOpen={isChatOpen}
                    onClose={() => setIsChatOpen(false)}
                    node={nodesWithData.find(n => n.id === activeChatNodeId)}
                    onUpdateNodeData={updateNodeData}
                />
            </div>

            {showSettings && (
                <div className="settings-modal-overlay">
                    <div className="settings-modal glass-panel">
                        <div className="settings-header">
                            <h3>全体設定</h3>
                            <button className="btn-icon" onClick={() => setShowSettings(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="settings-body">
                            <div className="glass-panel" style={{ padding: '0.75rem', marginBottom: '1.5rem', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                                <p style={{ fontSize: '0.85rem', margin: 0, fontWeight: 500, color: 'var(--text-color)' }}>
                                    🔒 <strong>セキュリティ設定:</strong> APIキーはブラウザのローカル環境にのみ安全に保存されます。Blueprint AIのサーバー等へ送信されることは一切ありません。
                                </p>
                            </div>
                            <p className="help-text" style={{ marginBottom: '1rem' }}>複数のプロバイダーのAPIキーを最大5つまで登録できます。「モデル」を空欄にするとデフォルトモデルが使用されます。</p>
                            {apiKeys.map((item, index) => (
                                <div className="form-group glass-panel" key={index} style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <label style={{ marginBottom: 0, fontWeight: 600 }}>APIキー {index + 1} {index === 0 && '(デフォルト)'}</label>
                                        {apiKeys.length > 1 && (
                                            <button
                                                className="btn-text-danger"
                                                onClick={() => setApiKeys(apiKeys.filter((_, i) => i !== index))}
                                            >
                                                削除
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>プロバイダー</label>
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
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>モデル名</label>
                                            <select
                                                className="node-input"
                                                style={{ padding: '0.4rem', height: '34px' }}
                                                value={item.model || ''}
                                                onChange={(e) => {
                                                    const newKeys = [...apiKeys];
                                                    newKeys[index] = { ...newKeys[index], model: e.target.value };
                                                    setApiKeys(newKeys);
                                                }}
                                            >
                                                <option value="">デフォルト (自動選択)</option>
                                                {item.provider === 'openai' && (
                                                    <>
                                                        <option value="gpt-5.3-chat-latest">gpt-5.3-chat-latest</option>
                                                        <option value="gpt-4o">gpt-4o</option>
                                                        <option value="gpt-4o-mini">gpt-4o-mini</option>
                                                        <option value="o4-mini">o4-mini</option>
                                                        <option value="o3-mini">o3-mini</option>
                                                    </>
                                                )}
                                                {item.provider === 'gemini' && (
                                                    <>
                                                        <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview</option>
                                                        <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
                                                        <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                                                        <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                                                        <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</option>
                                                    </>
                                                )}
                                                {item.provider === 'anthropic' && (
                                                    <>
                                                        <option value="claude-4.6-opus">claude-4.6-opus</option>
                                                        <option value="claude-4.6-sonnet">claude-4.6-sonnet</option>
                                                        <option value="claude-4.5-haiku">claude-4.5-haiku</option>
                                                        <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet</option>
                                                    </>
                                                )}
                                                {item.provider === 'openrouter' && (
                                                    <>
                                                        <option value="google/gemini-3.1-pro-preview">Google Gemini 3.1 Pro</option>
                                                        <option value="anthropic/claude-4.6-sonnet">Claude 4.6 Sonnet</option>
                                                        <option value="openai/gpt-5.3-chat-latest">GPT-5.3 Chat Latest</option>
                                                        <option value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B</option>
                                                    </>
                                                )}
                                                {item.provider === 'glm' && (
                                                    <>
                                                        <option value="glm-4-plus">glm-4-plus</option>
                                                        <option value="glm-4v-plus">glm-4v-plus</option>
                                                    </>
                                                )}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>シークレットキー (API Key)</label>
                                        <input
                                            type="password"
                                            placeholder={`${item.provider} のキーを貼り付けてください...`}
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
                                    + 別のAPIキーを追加
                                </button>
                            )}
                        </div>
                        <div className="settings-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button className="btn-text-danger" style={{ fontSize: '0.85rem' }} onClick={() => { setShowSettings(false); supabase.auth.signOut(); }}>
                                <LogOut size={16} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} /> ログアウト
                            </button>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button className="btn btn-secondary" onClick={() => setShowSettings(false)}>キャンセル</button>
                                <button className="btn btn-primary" onClick={() => setShowSettings(false)}>保存</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function Editor() {
    return (
        <ReactFlowProvider>
            <EditorContent />
        </ReactFlowProvider>
    );
}
