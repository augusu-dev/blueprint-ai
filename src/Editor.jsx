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
import { Settings, X, LogOut, Columns, Rows, Menu, Save, Edit3, MessageSquare, GitFork, Check } from 'lucide-react';
import { supabase } from './lib/supabase';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from './i18n';

import Sidebar from './Sidebar';
import ChatView from './ChatView';
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
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Chat-first: viewMode = 'chat' | 'nodes'
    const [viewMode, setViewMode] = useState('chat');
    const [activeChatNodeId, setActiveChatNodeId] = useState('1');

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

    useEffect(() => {
        if (!spaceId) { navigate('/'); return; }

        const fetchSpace = async () => {
            let localData = null;
            try {
                const stored = localStorage.getItem(`blueprint_space_${spaceId}`);
                if (stored) localData = JSON.parse(stored);
            } catch (e) { }

            let remoteData = null;
            if (supabase) {
                try {
                    const { data, error } = await supabase.from('spaces').select('*').eq('id', spaceId).single();
                    if (!error && data) remoteData = data;
                } catch (globalErr) { console.warn("Fetch failed"); }
            }

            let bestData = null;
            if (remoteData && localData) {
                bestData = (new Date(remoteData.updated_at) > new Date(localData.updated_at)) ? remoteData : localData;
            } else { bestData = remoteData || localData; }

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

        fetchSpace();

        const handleTitleUpdate = async () => {
            try {
                const { data } = await supabase.from('spaces').select('title').eq('id', spaceId).single();
                if (data?.title) setSpaceTitle(data.title);
            } catch (e) { }
        };
        window.addEventListener('spaceTitleUpdated', handleTitleUpdate);
        return () => window.removeEventListener('spaceTitleUpdated', handleTitleUpdate);
    }, [spaceId, navigate, setNodes, setEdges, setViewport]);

    const cleanNodesForSave = (rawNodes) => {
        return rawNodes.map(n => ({
            id: n.id, type: n.type, position: n.position,
            data: n.data ? {
                dir: n.data.dir, prompt: n.data.prompt, systemPrompt: n.data.systemPrompt,
                chatHistory: n.data.chatHistory, response: n.data.response, isStarter: n.data.isStarter,
                numBranches: n.data.numBranches, loopMode: n.data.loopMode,
                selectedApiKey: n.data.selectedApiKey, branchCount: n.data.branchCount,
                goalHistory: n.data.goalHistory
            } : {}
        }));
    };

    const handleManualSave = async () => {
        if (!spaceId || nodes.length === 0) return;
        setIsSaving(true);
        setSaveSuccess(false);
        try {
            const updates = { title: spaceTitle, nodes: cleanNodesForSave(nodes), edges, updated_at: new Date().toISOString() };
            localStorage.setItem(`blueprint_space_${spaceId}`, JSON.stringify(updates));
            if (supabase) {
                await supabase.from('spaces').update({ title: spaceTitle, nodes: updates.nodes, edges: updates.edges, updated_at: updates.updated_at }).eq('id', spaceId);
            }
            window.dispatchEvent(new CustomEvent('spaceTitleUpdated'));
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2500);
        } catch (err) {
            console.error("Save error:", err);
            alert(t('editor.saveError'));
        } finally { setIsSaving(false); }
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

    // Auto-save
    const saveTimerRef = useRef(null);
    useEffect(() => {
        if (!spaceId || nodes.length === 0) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            try {
                const updates = { title: spaceTitle, nodes: cleanNodesForSave(nodes), edges, updated_at: new Date().toISOString() };
                localStorage.setItem(`blueprint_space_${spaceId}`, JSON.stringify(updates));
                if (supabase) {
                    await supabase.from('spaces').update({ nodes: updates.nodes, edges: updates.edges, updated_at: updates.updated_at }).eq('id', spaceId);
                }
            } catch (err) { console.error("Auto-save failed", err); }
        }, 1500);
        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    }, [nodes, edges, spaceId, spaceTitle]);

    const updateNodeData = useCallback((id, key, val) => {
        setNodes((nds) => nds.map((node) => node.id === id ? { ...node, data: { ...node.data, [key]: val } } : node));
    }, [setNodes]);

    const onAddBranch = useCallback((id) => {
        setNodes((nds) => nds.map((node) => node.id === id ? { ...node, data: { ...node.data, numBranches: (node.data.numBranches || 2) + 1 } } : node));
    }, [setNodes]);

    const onQuickAdd = useCallback((sourceId, type) => {
        const outgoingEdges = edges.filter(e => e.source === sourceId);
        if (outgoingEdges.length >= 10) { alert(t('editor.maxNodes')); return; }
        setNodes((nds) => {
            const sourceNode = nds.find(n => n.id === sourceId);
            if (!sourceNode) return nds;
            const newId = `node-${crypto.randomUUID()}`;
            const num = outgoingEdges.length;
            let px = direction === 'LR' ? 350 : (num * 240 - 120);
            let py = direction === 'TB' ? 350 : (num * 200 - 100);
            const newNode = { id: newId, type, position: { x: sourceNode.position.x + px, y: sourceNode.position.y + py }, data: { dir: direction, prompt: '' } };
            setTimeout(() => { setEdges(eds => addEdge({ id: `e-${sourceId}-${newId}`, source: sourceId, target: newId }, eds)); }, 50);
            return [...nds, newNode];
        });
    }, [direction, edges, setNodes, setEdges, t]);

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
                id: newId, type: 'sequenceNode',
                position: { x: sourceNode.position.x + px, y: sourceNode.position.y + py },
                data: {
                    dir: direction, prompt: '',
                    chatHistory: chatHistory ? [...chatHistory] : [],
                    systemPrompt: sourceNode.data?.systemPrompt || '',
                    selectedApiKey: sourceNode.data?.selectedApiKey || 0
                }
            };
            setTimeout(() => { setEdges(eds => addEdge({ id: `e-${sourceNodeId}-${newId}`, source: sourceNodeId, target: newId }, eds)); }, 50);
            return [...nds, newNode];
        });
        return true;
    }, [direction, edges, setNodes, setEdges]);

    const onNavigateToBranch = useCallback((sourceNodeId, branchIndex) => {
        // Find the nth outgoing edge from this node
        const outgoing = edges.filter(e => e.source === sourceNodeId);
        if (branchIndex > 0 && branchIndex <= outgoing.length) {
            const targetNodeId = outgoing[branchIndex - 1].target;
            setActiveChatNodeId(targetNodeId);
        }
    }, [edges]);

    const onDeleteNode = useCallback((nodeId) => {
        setNodes(nds => nds.filter(n => n.id !== nodeId));
        setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
        if (activeChatNodeId === nodeId) setActiveChatNodeId('1');
    }, [setNodes, setEdges, activeChatNodeId]);

    const onConnect = useCallback((params) => {
        // Prevent self-loops
        if (params.source === params.target) return;
        setEdges((eds) => addEdge(params, eds));
    }, [setEdges]);

    const onEdgeClick = useCallback((event, edge) => {
        event.stopPropagation();
        setEdges(eds => eds.filter(e => e.id !== edge.id));
    }, [setEdges]);

    const nodesWithData = useMemo(() => {
        // Get goal/systemPrompt from starter node
        const starterNode = nodes.find(n => n.data?.isStarter);
        const sharedGoal = starterNode?.data?.systemPrompt || '';
        return nodes.map(n => ({
            ...n,
            data: {
                ...n.data, dir: direction,
                systemPrompt: n.data?.isStarter ? n.data.systemPrompt : (n.data?.systemPrompt || sharedGoal),
                onChange: updateNodeData, onAddBranch, onQuickAdd, onDeleteNode,
                onOpenChat: (nodeId) => { setActiveChatNodeId(nodeId); setViewMode('chat'); },
                apiKeys
            }
        }));
    }, [nodes, direction, updateNodeData, onAddBranch, onQuickAdd, onDeleteNode, apiKeys]);

    const toggleDirection = () => setDirection(d => d === 'LR' ? 'TB' : 'LR');

    useEffect(() => {
        const timer = setTimeout(() => {
            nodes.forEach(node => {
                try { updateNodeInternals(node.id); } catch (e) { }
            });
        }, 50);
        return () => clearTimeout(timer);
    }, [direction, nodes.length, updateNodeInternals]);

    const activeNode = nodesWithData.find(n => n.id === activeChatNodeId);

    return (
        <div className="editor-layout" style={{ display: 'flex', flexDirection: 'row' }}>
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            {/* Left icon bar (always visible) */}
            <div style={{
                width: '52px', background: 'var(--bg-dark)', borderRight: '1px solid var(--panel-border)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '0.75rem', gap: '0.5rem', zIndex: 50
            }}>
                <button onClick={() => setIsSidebarOpen(true)} className="btn-icon" style={{ width: '36px', height: '36px' }} title={t('sidebar.title')}>
                    <Menu size={18} />
                </button>
            </div>

            {/* Main area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {/* Top Header (always) */}
                <div style={{
                    padding: '0.45rem 1rem', borderBottom: '1px solid var(--panel-border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'var(--bg-dark)', zIndex: 50
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {isEditingTitle ? (
                            <input autoFocus className="node-input" style={{ fontSize: '1rem', fontWeight: 500, padding: '0.2rem 0.5rem', width: '220px', background: 'transparent', border: '1px solid var(--panel-border)', borderRadius: '6px' }}
                                value={tempTitle} onChange={(e) => setTempTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); }} />
                        ) : (
                            <h2 style={{
                                margin: 0, fontSize: '1.05rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem',
                                background: 'linear-gradient(90deg, var(--text-main), var(--text-muted))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                            }}
                                onClick={() => { setTempTitle(spaceTitle); setIsEditingTitle(true); }} title={t('editor.editTitle')}>
                                {spaceTitle} <Edit3 size={12} color="var(--text-muted)" />
                            </h2>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {/* View toggle */}
                        <button onClick={() => setViewMode(viewMode === 'chat' ? 'nodes' : 'chat')}
                            style={{
                                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--panel-border)',
                                borderRadius: '20px', padding: '0.3rem 0.8rem', fontSize: '0.78rem', fontWeight: 500,
                                color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem',
                                transition: 'all 0.2s', fontFamily: 'inherit'
                            }}>
                            {viewMode === 'chat' ? <><GitFork size={13} color="var(--primary)" /> {t('chat.switchToNodes')}</> : <><MessageSquare size={13} color="var(--primary)" /> {t('chat.switchToChat')}</>}
                        </button>

                        <button onClick={handleManualSave} disabled={isSaving}
                            style={{
                                background: saveSuccess ? 'var(--action)' : isSaving ? 'rgba(108, 140, 255, 0.4)' : 'var(--primary)',
                                color: 'white', fontSize: '0.78rem', padding: '0.3rem 0.8rem', border: 'none',
                                borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '0.3rem',
                                fontWeight: 500, cursor: isSaving ? 'wait' : 'pointer', fontFamily: 'inherit',
                                transition: 'all 0.3s'
                            }}>
                            {saveSuccess ? <><Check size={13} /> {t('editor.saved')}</> : <><Save size={13} /> {isSaving ? t('editor.saving') : t('editor.save')}</>}
                        </button>

                        {viewMode === 'nodes' && (
                            <button onClick={toggleDirection}
                                style={{
                                    background: 'rgba(255,255,255,0.04)', fontSize: '0.78rem', padding: '0.3rem 0.8rem',
                                    border: '1px solid var(--panel-border)', borderRadius: '20px',
                                    display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-main)',
                                    cursor: 'pointer', fontFamily: 'inherit'
                                }}>
                                {direction === 'LR' ? <Columns size={13} color="var(--primary)" /> : <Rows size={13} color="var(--primary)" />}
                                {direction === 'LR' ? t('editor.ltr') : t('editor.ttb')}
                            </button>
                        )}

                        <button onClick={() => setShowSettings(true)}
                            style={{
                                background: 'rgba(255,255,255,0.04)', fontSize: '0.78rem', padding: '0.3rem 0.7rem',
                                border: '1px solid var(--panel-border)', borderRadius: '20px',
                                display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-main)',
                                cursor: 'pointer', fontFamily: 'inherit'
                            }}>
                            <Settings size={13} color="var(--primary)" /> {t('editor.settings')}
                        </button>
                    </div>
                </div>

                {/* Content area */}
                {viewMode === 'chat' ? (
                    <ChatView
                        node={activeNode}
                        nodes={nodesWithData}
                        apiKeys={apiKeys}
                        onUpdateNodeData={updateNodeData}
                        onBranchFromChat={onBranchFromChat}
                        onNavigateToBranch={onNavigateToBranch}
                        spaceId={spaceId}
                    />
                ) : (
                    <div style={{ flex: 1, position: 'relative' }}>
                        <ReactFlow
                            nodes={nodesWithData}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onEdgeClick={onEdgeClick}
                            nodeTypes={nodeTypes}
                            fitView
                            colorMode="system"
                            defaultEdgeOptions={{ style: { stroke: 'var(--primary)', strokeWidth: 2 }, type: 'smoothstep' }}
                        >
                            <Controls />
                            <MiniMap nodeStrokeWidth={3} zoomable pannable />
                            <Background variant="dots" gap={20} size={1} />
                        </ReactFlow>
                    </div>
                )}
            </div>

            {/* Settings Modal */}
            {showSettings && (
                <div className="settings-modal-overlay">
                    <div className="settings-modal glass-panel">
                        <div className="settings-header">
                            <h3>{t('settings.title')}</h3>
                            <button className="btn-icon" onClick={() => setShowSettings(false)}><X size={18} /></button>
                        </div>
                        <div className="settings-body">
                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.4rem' }}>{t('settings.langLabel')}</label>
                                <select className="node-input" style={{ padding: '0.5rem', height: '38px' }} value={lang} onChange={(e) => setLang(e.target.value)}>
                                    <option value="ja">{t('settings.langJa')}</option>
                                    <option value="en">{t('settings.langEn')}</option>
                                    <option value="zh">{t('settings.langZh')}</option>
                                </select>
                            </div>
                            <div style={{ height: '1px', background: 'var(--panel-border)', marginBottom: '1.25rem' }} />
                            <div className="glass-panel" style={{ padding: '0.65rem', marginBottom: '1.25rem', borderRadius: '8px', background: 'rgba(108, 140, 255, 0.06)', border: '1px solid rgba(108, 140, 255, 0.15)' }}>
                                <p style={{ fontSize: '0.8rem', margin: 0, fontWeight: 400, lineHeight: 1.5 }}>🔒 <strong>{t('settings.securityLabel')}</strong> {t('settings.security')}</p>
                            </div>
                            <p className="help-text" style={{ marginBottom: '1rem' }}>{t('settings.apiHelp')}</p>
                            {apiKeys.map((item, index) => (
                                <div className="form-group glass-panel" key={index} style={{ marginBottom: '0.75rem', padding: '0.65rem', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                        <label style={{ marginBottom: 0, fontWeight: 500, fontSize: '0.82rem' }}>{t('settings.apiKey')} {index + 1} {index === 0 && t('settings.default')}</label>
                                        {apiKeys.length > 1 && <button className="btn-text-danger" onClick={() => setApiKeys(apiKeys.filter((_, i) => i !== index))}>{t('settings.delete')}</button>}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('settings.provider')}</label>
                                            <select className="node-input" style={{ padding: '0.4rem', height: '34px' }} value={item.provider} onChange={(e) => { const nk = [...apiKeys]; nk[index] = { ...nk[index], provider: e.target.value }; setApiKeys(nk); }}>
                                                <option value="openai">OpenAI</option>
                                                <option value="gemini">Google Gemini</option>
                                                <option value="anthropic">Anthropic (Claude)</option>
                                                <option value="openrouter">OpenRouter</option>
                                                <option value="glm">GLM (ZhipuAI)</option>
                                            </select>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('settings.model')}</label>
                                            <select className="node-input" style={{ padding: '0.4rem', height: '34px' }} value={item.model || ''} onChange={(e) => { const nk = [...apiKeys]; nk[index] = { ...nk[index], model: e.target.value }; setApiKeys(nk); }}>
                                                <option value="">{t('settings.modelDefault')}</option>
                                                {item.provider === 'openai' && <><option value="gpt-5.3-chat-latest">gpt-5.3-chat-latest</option><option value="gpt-5">gpt-5</option><option value="gpt-4o">gpt-4o</option><option value="o4-mini">o4-mini</option><option value="o3-mini">o3-mini</option></>}
                                                {item.provider === 'gemini' && <><option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview</option><option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option><option value="gemini-3-flash-preview">gemini-3-flash-preview</option><option value="gemini-3-pro-preview">gemini-3-pro-preview</option><option value="gemini-2.5-pro">gemini-2.5-pro</option><option value="gemini-2.5-flash">gemini-2.5-flash</option></>}
                                                {item.provider === 'anthropic' && <><option value="claude-opus-4-6">Claude Opus 4.6</option><option value="claude-sonnet-4-6">Claude Sonnet 4.6</option><option value="claude-sonnet-4-5">Claude Sonnet 4.5</option><option value="claude-haiku-4-5-20251015">Claude Haiku 4.5</option></>}
                                                {item.provider === 'openrouter' && <><option value="google/gemini-3.1-pro-preview">Gemini 3.1 Pro</option><option value="google/gemini-3-flash-preview">Gemini 3 Flash</option><option value="anthropic/claude-sonnet-4.6">Claude Sonnet 4.6</option><option value="openai/gpt-5.3-chat-latest">GPT-5.3 Chat</option><option value="openai/o4-mini">o4-mini</option></>}
                                                {item.provider === 'glm' && <><option value="glm-4-plus">glm-4-plus</option><option value="glm-4v-plus">glm-4v-plus</option></>}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('settings.secretKey')}</label>
                                        <input type="password" placeholder={`${item.provider}${t('settings.secretPlaceholder')}`} value={item.key || ''} onChange={(e) => { const nk = [...apiKeys]; nk[index] = { ...nk[index], key: e.target.value }; setApiKeys(nk); }} />
                                    </div>
                                </div>
                            ))}
                            {apiKeys.length < 5 && <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.4rem', width: '100%' }} onClick={() => setApiKeys([...apiKeys, { key: '', provider: 'openai', model: '' }])}>{t('settings.addKey')}</button>}
                        </div>
                        <div className="settings-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button className="btn-text-danger" style={{ fontSize: '0.82rem' }} onClick={() => { setShowSettings(false); supabase.auth.signOut(); }}><LogOut size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} /> {t('settings.logout')}</button>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
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
