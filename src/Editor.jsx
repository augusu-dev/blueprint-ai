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
import { useLanguage } from './i18n';

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
    const { t, lang, setLang } = useLanguage();

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [spaceTitle, setSpaceTitle] = useState(t('editor.loading'));
    const [direction, setDirection] = useState('LR');
    const [showSettings, setShowSettings] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [tempTitle, setTempTitle] = useState('');
    const [isSaving, setIsSaving] = useState(false);

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
        return [{ key: '', provider: 'openai', model: '' }];
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
            let localData = null;
            try {
                const stored = localStorage.getItem(`blueprint_space_${spaceId}`);
                if (stored) localData = JSON.parse(stored);
            } catch (e) { }

            let remoteData = null;
            if (supabase) {
                try {
                    const { data, error } = await supabase
                        .from('spaces')
                        .select('*')
                        .eq('id', spaceId)
                        .single();

                    if (!error && data) remoteData = data;
                } catch (globalErr) {
                    console.warn("Global space fetch failed, checking local...");
                }
            }

            let bestData = null;
            if (remoteData && localData) {
                bestData = (new Date(remoteData.updated_at) > new Date(localData.updated_at)) ? remoteData : localData;
            } else {
                bestData = remoteData || localData;
            }

            if (bestData) {
                setSpaceTitle(bestData.title || t('editor.untitled'));
                if (Array.isArray(bestData.nodes) && bestData.nodes.length > 0) setNodes(bestData.nodes);
                else setNodes(initialNodes);

                if (Array.isArray(bestData.edges) && bestData.edges.length > 0) setEdges(bestData.edges);
                else setEdges(initialEdges);

                if (bestData.viewport && Object.keys(bestData.viewport).length > 0) {
                    setViewport({ x: bestData.viewport.x, y: bestData.viewport.y, zoom: bestData.viewport.zoom });
                }
            } else {
                setNodes(initialNodes);
                setEdges(initialEdges);
                setSpaceTitle(t('editor.untitled'));
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
                selectedApiKey: n.data.selectedApiKey,
                branchCount: n.data.branchCount
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
        if (!spaceId || nodes.length === 0) return;
        setIsSaving(true);
        try {
            const updates = {
                title: spaceTitle,
                nodes: cleanNodesForSave(nodes),
                edges: edges,
                updated_at: new Date().toISOString()
            };

            localStorage.setItem(`blueprint_space_${spaceId}`, JSON.stringify(updates));

            if (supabase) {
                const { error } = await supabase.from('spaces').update({
                    nodes: updates.nodes, edges: updates.edges, updated_at: updates.updated_at
                }).eq('id', spaceId);
                if (error) console.warn("Supabase skipped schema cache:", error.message);
            }

            console.log("=== Manual save done ===", spaceId);
            window.dispatchEvent(new CustomEvent('spaceTitleUpdated'));
        } catch (err) {
            console.error("Save error:", err);
            alert(t('editor.saveError'));
        } finally {
            setIsSaving(false);
        }
    };

    const saveTitle = async () => {
        const cleanedTitle = tempTitle.trim() || t('editor.untitled');
        setSpaceTitle(cleanedTitle);
        setIsEditingTitle(false);
        if (supabase && spaceId) {
            await supabase.from('spaces').update({ title: cleanedTitle }).eq('id', spaceId);
            window.dispatchEvent(new CustomEvent('spaceTitleUpdated'));
            handleManualSave();
        }
    };

    // Auto-save logic
    const saveTimerRef = useRef(null);
    useEffect(() => {
        if (!spaceId || nodes.length === 0) return;

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

        saveTimerRef.current = setTimeout(async () => {
            try {
                const updates = {
                    title: spaceTitle,
                    nodes: cleanNodesForSave(nodes),
                    edges: edges,
                    updated_at: new Date().toISOString()
                };

                localStorage.setItem(`blueprint_space_${spaceId}`, JSON.stringify(updates));

                if (supabase) {
                    const { error } = await supabase.from('spaces').update({
                        nodes: updates.nodes, edges: updates.edges, updated_at: updates.updated_at
                    }).eq('id', spaceId);
                    if (error) console.warn("Auto-save Supabase warning: schema cache sync failed");
                }

                console.log("Auto-save success", spaceId);
            } catch (err) {
                console.error("Auto-save failed", err);
            }
        }, 1500);

        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [nodes, edges, spaceId, spaceTitle]);

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

        setNodes(nds => nds.map(node => {
            if (node.id === id) {
                return { ...node, data: { ...node.data, response: `Loading AI Response (${provider})...` } };
            }
            return node;
        }));

        try {
            let reply = "";

            if (provider === 'gemini') {
                const modelToUse = userModel || 'gemini-2.5-flash';
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
                const modelToUse = userModel || 'claude-3-5-sonnet-20241022';
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
                const modelToUse = userModel || 'google/gemini-2.5-flash';
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
            alert(t('editor.maxNodes'));
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
    }, [direction, edges, setNodes, setEdges, t]);

    // Branch from chat: create a new node linked to the source chat node
    const onBranchFromChat = useCallback((sourceNodeId, chatHistory) => {
        const outgoingEdges = edges.filter(e => e.source === sourceNodeId);
        if (outgoingEdges.length >= 10) return false;

        setNodes((nds) => {
            const sourceNode = nds.find(n => n.id === sourceNodeId);
            if (!sourceNode) return nds;

            const newId = `node-${crypto.randomUUID()}`;
            const num = outgoingEdges.length;

            let px = direction === 'LR' ? 350 : (num * 240 - 120);
            let py = direction === 'TB' ? 350 : (num * 200 - 100);

            const newNode = {
                id: newId,
                type: 'sequenceNode',
                position: { x: sourceNode.position.x + px, y: sourceNode.position.y + py },
                data: {
                    dir: direction,
                    prompt: '',
                    chatHistory: chatHistory ? [...chatHistory] : [],
                    systemPrompt: sourceNode.data?.systemPrompt || '',
                    selectedApiKey: sourceNode.data?.selectedApiKey || 0
                }
            };

            setTimeout(() => {
                setEdges(eds => addEdge({ id: `e-${sourceNodeId}-${newId}`, source: sourceNodeId, sourceHandle: null, target: newId, targetHandle: null }, eds));
            }, 50);

            return [...nds, newNode];
        });

        return true;
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

    useEffect(() => {
        nodes.forEach(node => {
            updateNodeInternals(node.id);
        });
    }, [direction, updateNodeInternals]);

    return (
        <div className="editor-layout">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            {/* Header */}
            <div className="editor-header">
                <div className="editor-header-left" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <div
                        onClick={() => setIsSidebarOpen(true)}
                        style={{ background: 'var(--primary)', padding: '0.35rem', borderRadius: '8px', color: 'white', marginRight: '0.65rem', display: 'flex', cursor: 'pointer' }}
                    >
                        <Menu size={18} />
                    </div>
                    {isEditingTitle ? (
                        <input
                            autoFocus
                            className="node-input"
                            style={{ fontSize: '1.05rem', fontWeight: 500, padding: '0.2rem 0.5rem', width: '220px', background: 'transparent', border: '1px solid var(--panel-border)', borderRadius: '6px' }}
                            value={tempTitle}
                            onChange={(e) => setTempTitle(e.target.value)}
                            onBlur={saveTitle}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); }}
                        />
                    ) : (
                        <h2
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0, cursor: 'pointer' }}
                            onClick={() => { setTempTitle(spaceTitle); setIsEditingTitle(true); }}
                            title={t('editor.editTitle')}
                        >
                            {spaceTitle} <Edit3 size={13} color="var(--text-muted)" />
                        </h2>
                    )}
                </div>
                <div className="editor-controls" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <button
                        className="btn"
                        onClick={handleManualSave}
                        disabled={isSaving}
                        title={t('editor.save')}
                        style={{ background: isSaving ? 'rgba(108, 140, 255, 0.4)' : 'var(--primary)', color: 'white', fontSize: '0.78rem', padding: '0.35rem 0.9rem', border: 'none', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 500, boxShadow: '0 3px 10px rgba(108, 140, 255, 0.2)', cursor: isSaving ? 'wait' : 'pointer' }}
                    >
                        <Save size={14} />
                        {isSaving ? t('editor.saving') : t('editor.save')}
                    </button>
                    <button
                        className="btn"
                        onClick={toggleDirection}
                        title={direction === 'LR' ? t('editor.ltr') : t('editor.ttb')}
                        style={{ background: 'rgba(255,255,255,0.04)', fontSize: '0.78rem', padding: '0.35rem 0.9rem', border: '1px solid var(--panel-border)', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-main)' }}
                    >
                        {direction === 'LR' ? <Columns size={14} color="var(--primary)" /> : <Rows size={14} color="var(--primary)" />}
                        {direction === 'LR' ? t('editor.ltr') : t('editor.ttb')}
                    </button>
                    <button
                        className="btn"
                        onClick={() => setShowSettings(true)}
                        title={t('editor.settings')}
                        style={{ background: 'rgba(255,255,255,0.04)', fontSize: '0.78rem', padding: '0.3rem 0.75rem', border: '1px solid var(--panel-border)', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-main)' }}
                    >
                        <Settings size={14} color="var(--primary)" />
                        {t('editor.settings')}
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
                    onBranchFromChat={onBranchFromChat}
                />
            </div>

            {showSettings && (
                <div className="settings-modal-overlay">
                    <div className="settings-modal glass-panel">
                        <div className="settings-header">
                            <h3>{t('settings.title')}</h3>
                            <button className="btn-icon" onClick={() => setShowSettings(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="settings-body">
                            {/* Language Selector */}
                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.4rem' }}>{t('settings.langLabel')}</label>
                                <select
                                    className="node-input"
                                    style={{ padding: '0.5rem', height: '38px' }}
                                    value={lang}
                                    onChange={(e) => setLang(e.target.value)}
                                >
                                    <option value="ja">{t('settings.langJa')}</option>
                                    <option value="en">{t('settings.langEn')}</option>
                                    <option value="zh">{t('settings.langZh')}</option>
                                </select>
                            </div>

                            <div style={{ height: '1px', background: 'var(--panel-border)', marginBottom: '1.25rem' }} />

                            <div className="glass-panel" style={{ padding: '0.65rem', marginBottom: '1.25rem', borderRadius: '8px', background: 'rgba(108, 140, 255, 0.06)', border: '1px solid rgba(108, 140, 255, 0.15)' }}>
                                <p style={{ fontSize: '0.8rem', margin: 0, fontWeight: 400, color: 'var(--text-main)', lineHeight: 1.5 }}>
                                    🔒 <strong>{t('settings.securityLabel')}</strong> {t('settings.security')}
                                </p>
                            </div>
                            <p className="help-text" style={{ marginBottom: '1rem' }}>{t('settings.apiHelp')}</p>
                            {apiKeys.map((item, index) => (
                                <div className="form-group glass-panel" key={index} style={{ marginBottom: '0.75rem', padding: '0.65rem', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                        <label style={{ marginBottom: 0, fontWeight: 500, fontSize: '0.82rem' }}>{t('settings.apiKey')} {index + 1} {index === 0 && t('settings.default')}</label>
                                        {apiKeys.length > 1 && (
                                            <button
                                                className="btn-text-danger"
                                                onClick={() => setApiKeys(apiKeys.filter((_, i) => i !== index))}
                                            >
                                                {t('settings.delete')}
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('settings.provider')}</label>
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
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('settings.model')}</label>
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
                                                <option value="">{t('settings.modelDefault')}</option>
                                                {item.provider === 'openai' && (
                                                    <>
                                                        <option value="gpt-4o">gpt-4o</option>
                                                        <option value="gpt-4o-mini">gpt-4o-mini</option>
                                                        <option value="o3-mini">o3-mini</option>
                                                    </>
                                                )}
                                                {item.provider === 'gemini' && (
                                                    <>
                                                        <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                                                        <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                                                        <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                                                    </>
                                                )}
                                                {item.provider === 'anthropic' && (
                                                    <>
                                                        <option value="claude-3-5-sonnet-20241022">claude-3.5-sonnet</option>
                                                        <option value="claude-3-5-haiku-20241022">claude-3.5-haiku</option>
                                                    </>
                                                )}
                                                {item.provider === 'openrouter' && (
                                                    <>
                                                        <option value="google/gemini-2.5-flash">Google Gemini 2.5 Flash</option>
                                                        <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                                                        <option value="openai/gpt-4o">GPT-4o</option>
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
                                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('settings.secretKey')}</label>
                                        <input
                                            type="password"
                                            placeholder={`${item.provider}${t('settings.secretPlaceholder')}`}
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
                                <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.4rem', width: '100%' }} onClick={() => setApiKeys([...apiKeys, { key: '', provider: 'openai', model: '' }])}>
                                    {t('settings.addKey')}
                                </button>
                            )}
                        </div>
                        <div className="settings-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button className="btn-text-danger" style={{ fontSize: '0.82rem' }} onClick={() => { setShowSettings(false); supabase.auth.signOut(); }}>
                                <LogOut size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} /> {t('settings.logout')}
                            </button>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                <button className="btn btn-secondary" onClick={() => setShowSettings(false)}>{t('settings.cancel')}</button>
                                <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowSettings(false)}>{t('settings.save')}</button>
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
