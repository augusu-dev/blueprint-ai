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
import { Settings, X, LogOut, Columns, Rows, Menu, Save, Edit3, MessageSquare, GitFork, Check, Map as MapIcon } from 'lucide-react';
import { supabase } from './lib/supabase';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from './i18n';

import Sidebar from './Sidebar';
import ChatView from './ChatView';
import MapView from './MapView';
import SequenceNode from './nodes/SequenceNode';
import LoopNode from './nodes/LoopNode';
import BranchNode from './nodes/BranchNode';
import GoalNode from './nodes/GoalNode';
import DeleteEdge from './nodes/DeleteEdge';
import { DEFAULT_SPACE_MODE, getSpacePath, isSpaceMode } from './lib/routes';
import { createDefaultMapState, createInitialEdges, createInitialNodes, normalizeMapState } from './lib/space';

const nodeTypes = {
    sequenceNode: SequenceNode,
    loopNode: LoopNode,
    branchNode: BranchNode,
    goalNode: GoalNode,
};

const edgeTypes = {
    deleteEdge: DeleteEdge,
};

function EditorContent() {
    const { id: spaceId, mode } = useParams();
    const navigate = useNavigate();
    const { setViewport, updateNodeInternals } = useReactFlow();
    const { t, lang, setLang } = useLanguage();
    const isDraft = !spaceId;

    const [nodes, setNodes, baseOnNodesChange] = useNodesState([]);
    const [edges, setEdges, baseOnEdgesChange] = useEdgesState([]);
    const [mapState, setMapState] = useState(createDefaultMapState);
    const [spaceTitle, setSpaceTitle] = useState(t('editor.loading'));
    const [isHydrated, setIsHydrated] = useState(false);
    const [direction, setDirection] = useState('LR');
    const [showSettings, setShowSettings] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [tempTitle, setTempTitle] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [activeChatNodeId, setActiveChatNodeId] = useState('1');
    const [draftMode, setDraftMode] = useState(DEFAULT_SPACE_MODE);
    const [draftDirty, setDraftDirty] = useState(false);
    const currentMode = isDraft ? draftMode : (isSpaceMode(mode) ? mode : DEFAULT_SPACE_MODE);
    const draftSnapshotRef = useRef(null);
    const promoteDraftPromiseRef = useRef(null);

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
            } catch {
                // Ignore invalid locally stored API keys.
            }
        }
        return [{ key: '', provider: 'openai', model: '' }];
    });

    useEffect(() => {
        localStorage.setItem('blueprint_api_keys', JSON.stringify(apiKeys));
    }, [apiKeys]);

    useEffect(() => {
        if (isDraft) return;
        if (!isSpaceMode(mode)) {
            navigate(getSpacePath(spaceId), { replace: true });
        }
    }, [isDraft, spaceId, mode, navigate]);

    const updateRemoteSpace = useCallback(async (payload) => {
        if (!supabase || !spaceId) return;

        const legacyPayload = { ...payload };
        delete legacyPayload.map_state;
        const { error } = await supabase.from('spaces').update(payload).eq('id', spaceId);

        if (!error) return;
        if (!Object.prototype.hasOwnProperty.call(payload, 'map_state')) throw error;

        const { error: legacyError } = await supabase.from('spaces').update(legacyPayload).eq('id', spaceId);
        if (legacyError) throw legacyError;
    }, [spaceId]);

    useEffect(() => {
        if (isDraft) {
            setIsHydrated(false);
            setSpaceTitle(t('editor.untitled'));
            setNodes(createInitialNodes());
            setEdges(createInitialEdges());
            setMapState(createDefaultMapState());
            setActiveChatNodeId('1');
            setDraftMode(DEFAULT_SPACE_MODE);
            setDraftDirty(false);
            setIsHydrated(true);
            return undefined;
        }

        if (!spaceId || !isSpaceMode(mode)) return undefined;
        let isCancelled = false;
        setIsHydrated(false);

        const applySpaceData = (data) => {
            if (isCancelled || !data) return;

            setSpaceTitle(data.title || t('editor.untitled'));
            setMapState(normalizeMapState(data.map_state));
            setNodes(Array.isArray(data.nodes) && data.nodes.length > 0 ? data.nodes : createInitialNodes());
            setEdges(Array.isArray(data.edges) && data.edges.length > 0 ? data.edges : createInitialEdges());
            if (data.viewport && Object.keys(data.viewport).length > 0) {
                setViewport({ x: data.viewport.x, y: data.viewport.y, zoom: data.viewport.zoom });
            }
            setIsHydrated(true);
        };

        const fetchSpace = async () => {
            let localData = null;
            try {
                const stored = localStorage.getItem(`blueprint_space_${spaceId}`);
                if (stored) localData = JSON.parse(stored);
            } catch {
                // Ignore invalid locally stored API keys.
            }

            const fallbackData = localData || {
                title: t('editor.untitled'),
                nodes: createInitialNodes(),
                edges: createInitialEdges(),
                map_state: createDefaultMapState(),
            };

            applySpaceData(fallbackData);

            let remoteData = null;
            if (supabase) {
                try {
                    const { data, error } = await supabase.from('spaces').select('*').eq('id', spaceId).single();
                    if (!error && data) remoteData = data;
                } catch {
                    console.warn('Fetch failed');
                }
            }

            if (isCancelled) return;

            let bestData = null;
            if (remoteData && localData) {
                bestData = (new Date(remoteData.updated_at) > new Date(localData.updated_at)) ? remoteData : localData;
            } else {
                bestData = remoteData || fallbackData;
            }

            if (bestData) {
                applySpaceData({
                    ...bestData,
                    map_state: bestData.map_state ?? localData?.map_state ?? fallbackData.map_state,
                });
            }
        };

        fetchSpace();

        const handleTitleUpdate = async () => {
            try {
                const { data } = await supabase.from('spaces').select('title').eq('id', spaceId).single();
                if (!isCancelled && data?.title) setSpaceTitle(data.title);
            } catch {
                // Ignore title refresh failures.
            }
        };
        window.addEventListener('spaceTitleUpdated', handleTitleUpdate);
        return () => {
            isCancelled = true;
            window.removeEventListener('spaceTitleUpdated', handleTitleUpdate);
        };
    }, [isDraft, spaceId, mode, setNodes, setEdges, setViewport, t]);

    const cleanNodesForSave = (rawNodes) => {
        return rawNodes.map(n => ({
            id: n.id, type: n.type, position: n.position,
            data: n.data ? {
                dir: n.data.dir, prompt: n.data.prompt, systemPrompt: n.data.systemPrompt,
                chatHistory: n.data.chatHistory, response: n.data.response, isStarter: n.data.isStarter,
                numBranches: n.data.numBranches, loopMode: n.data.loopMode,
                selectedApiKey: n.data.selectedApiKey, branchCount: n.data.branchCount,
                goalHistory: n.data.goalHistory, isLooping: n.data.isLooping
            } : {}
        }));
    };

    useEffect(() => {
        draftSnapshotRef.current = {
            title: spaceTitle,
            nodes,
            edges,
            mapState,
            mode: currentMode,
        };
    }, [spaceTitle, nodes, edges, mapState, currentMode]);

    const createSpaceFromSnapshot = useCallback(async (snapshot) => {
        const updates = {
            title: snapshot.title || t('editor.untitled'),
            nodes: cleanNodesForSave(snapshot.nodes),
            edges: snapshot.edges,
            map_state: snapshot.mapState,
            updated_at: new Date().toISOString(),
        };

        if (supabase) {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const basePayload = {
                        user_id: user.id,
                        title: updates.title,
                        nodes: updates.nodes,
                        edges: updates.edges,
                        map_state: updates.map_state,
                        updated_at: updates.updated_at,
                    };

                    let insertResult = await supabase.from('spaces').insert(basePayload).select().single();
                    if (insertResult.error) {
                        const legacyPayload = { ...basePayload };
                        delete legacyPayload.map_state;
                        insertResult = await supabase.from('spaces').insert(legacyPayload).select().single();
                    }

                    const { data, error } = insertResult;
                    if (!error && data?.id) {
                        const persistedUpdates = {
                            ...updates,
                            title: data.title || updates.title,
                            updated_at: data.updated_at || updates.updated_at,
                        };
                        localStorage.setItem(`blueprint_space_${data.id}`, JSON.stringify(persistedUpdates));
                        window.dispatchEvent(new CustomEvent('spaceTitleUpdated'));
                        return data.id;
                    }
                }
            } catch (err) {
                console.error('Draft promotion failed remotely:', err);
            }
        }

        const newId = crypto.randomUUID();
        localStorage.setItem(`blueprint_space_${newId}`, JSON.stringify(updates));
        window.dispatchEvent(new CustomEvent('spaceTitleUpdated'));
        return newId;
    }, [t]);

    const markDraftDirty = useCallback(() => {
        if (isDraft) {
            setDraftDirty(true);
        }
    }, [isDraft]);

    useEffect(() => {
        if (!isDraft || !draftDirty || promoteDraftPromiseRef.current) return;

        const promoteDraft = async () => {
            const snapshot = draftSnapshotRef.current;
            if (!snapshot) return;

            const newId = await createSpaceFromSnapshot(snapshot);
            navigate(getSpacePath(newId, snapshot.mode), { replace: true });
        };

        promoteDraftPromiseRef.current = promoteDraft();
    }, [createSpaceFromSnapshot, draftDirty, isDraft, navigate]);

    const handleManualSave = async () => {
        if (!spaceId || nodes.length === 0) return;
        setIsSaving(true);
        setSaveSuccess(false);
        try {
            const updates = { title: spaceTitle, nodes: cleanNodesForSave(nodes), edges, map_state: mapState, updated_at: new Date().toISOString() };
            localStorage.setItem(`blueprint_space_${spaceId}`, JSON.stringify(updates));
            await updateRemoteSpace({ title: spaceTitle, nodes: updates.nodes, edges: updates.edges, map_state: updates.map_state, updated_at: updates.updated_at });
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
        if (isDraft) {
            if (cleanedTitle !== spaceTitle) {
                markDraftDirty();
            }
            return;
        }
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
                const updates = { title: spaceTitle, nodes: cleanNodesForSave(nodes), edges, map_state: mapState, updated_at: new Date().toISOString() };
                localStorage.setItem(`blueprint_space_${spaceId}`, JSON.stringify(updates));
                await updateRemoteSpace({ nodes: updates.nodes, edges: updates.edges, map_state: updates.map_state, updated_at: updates.updated_at });
            } catch (err) {
                console.error('Auto-save failed', err);
            }
        }, 1500);
        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    }, [nodes, edges, mapState, spaceId, spaceTitle, updateRemoteSpace]);

    const onNodesChange = useCallback((changes) => {
        baseOnNodesChange(changes);
        if (changes.some((change) => change.type !== 'select')) {
            markDraftDirty();
        }
    }, [baseOnNodesChange, markDraftDirty]);

    const onEdgesChange = useCallback((changes) => {
        baseOnEdgesChange(changes);
        if (changes.some((change) => change.type !== 'select')) {
            markDraftDirty();
        }
    }, [baseOnEdgesChange, markDraftDirty]);

    const updateMapState = useCallback((nextMapState) => {
        setMapState((current) => normalizeMapState(typeof nextMapState === 'function' ? nextMapState(current) : nextMapState));
        markDraftDirty();
    }, [markDraftDirty]);

    const updateNodeData = useCallback((id, key, val) => {
        setNodes((nds) => nds.map((node) => node.id === id ? { ...node, data: { ...node.data, [key]: val } } : node));
        markDraftDirty();
    }, [markDraftDirty, setNodes]);

    const onAddBranch = useCallback((id) => {
        setNodes((nds) => nds.map((node) => node.id === id ? { ...node, data: { ...node.data, numBranches: (node.data.numBranches || 2) + 1 } } : node));
        markDraftDirty();
    }, [markDraftDirty, setNodes]);

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
            setTimeout(() => { setEdges(eds => addEdge({ id: `e-${sourceId}-${newId}`, source: sourceId, target: newId, type: 'deleteEdge' }, eds)); }, 50);
            return [...nds, newNode];
        });
        markDraftDirty();
    }, [direction, edges, markDraftDirty, setNodes, setEdges, t]);

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
            setTimeout(() => { setEdges(eds => addEdge({ id: `e-${sourceNodeId}-${newId}`, source: sourceNodeId, target: newId, type: 'deleteEdge' }, eds)); }, 50);
            return [...nds, newNode];
        });
        markDraftDirty();
        return true;
    }, [direction, edges, markDraftDirty, setNodes, setEdges]);

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
        markDraftDirty();
    }, [setNodes, setEdges, activeChatNodeId, markDraftDirty]);

    const onConnect = useCallback((params) => {
        // Prevent self-loops
        if (params.source === params.target) return;
        const sourceNode = nodes.find((node) => node.id === params.source);
        setEdges((eds) => {
            const baseEdges = sourceNode?.type === 'goalNode'
                ? eds.filter((edge) => edge.source !== params.source)
                : eds;
            return addEdge({
                ...params,
                sourceHandle: params.sourceHandle || (sourceNode?.type === 'goalNode' ? 'goal' : params.sourceHandle),
                type: 'deleteEdge',
            }, baseEdges);
        });
        window.requestAnimationFrame(() => {
            if (params.source) updateNodeInternals(params.source);
            if (params.target) updateNodeInternals(params.target);
        });
        markDraftDirty();
    }, [markDraftDirty, nodes, setEdges, updateNodeInternals]);

    const onDeleteEdge = useCallback((edgeId) => {
        const edgeToDelete = edges.find((edge) => edge.id === edgeId);
        setEdges(eds => eds.filter(e => e.id !== edgeId));
        window.requestAnimationFrame(() => {
            if (edgeToDelete?.source) updateNodeInternals(edgeToDelete.source);
            if (edgeToDelete?.target) updateNodeInternals(edgeToDelete.target);
        });
        markDraftDirty();
    }, [edges, markDraftDirty, setEdges, updateNodeInternals]);

    const onEdgeClick = useCallback((event, edge) => {
        event.stopPropagation();
        onDeleteEdge(edge.id);
    }, [onDeleteEdge]);

    const edgesWithData = useMemo(() => {
        return edges.map(e => ({
            ...e,
            data: { ...e.data, onDelete: onDeleteEdge }
        }));
    }, [edges, onDeleteEdge]);

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
                onOpenChat: (nodeId) => {
                    setActiveChatNodeId(nodeId);
                    if (isDraft) {
                        setDraftMode('chat');
                    } else if (spaceId) {
                        navigate(getSpacePath(spaceId, 'chat'));
                    }
                },
                onSetGoalFromNode: (goalNodeId, goalText) => {
                    const outgoingEdge = edges.find(e => e.source === goalNodeId);
                    if (outgoingEdge) {
                        updateNodeData(outgoingEdge.target, 'systemPrompt', goalText);
                    } else if (starterNode) {
                        updateNodeData(starterNode.id, 'systemPrompt', goalText);
                    }
                },
                apiKeys
            }
        }));
    }, [nodes, edges, direction, updateNodeData, onAddBranch, onQuickAdd, onDeleteNode, apiKeys, navigate, spaceId, isDraft]);

    const toggleDirection = () => setDirection(d => d === 'LR' ? 'TB' : 'LR');

    useEffect(() => {
        const timer = setTimeout(() => {
            nodes.forEach(node => {
                try {
                    updateNodeInternals(node.id);
                } catch {
                    // Ignore transient node internals failures.
                }
            });
        }, 50);
        return () => clearTimeout(timer);
    }, [direction, nodes, updateNodeInternals]);

    useEffect(() => {
        if (nodes.length === 0) return;

        const hasActiveNode = nodes.some((node) => node.id === activeChatNodeId);
        if (hasActiveNode) return;

        const fallbackNode = nodes.find((node) => node.data?.isStarter) || nodes[0];
        if (fallbackNode) {
            setActiveChatNodeId(fallbackNode.id);
        }
    }, [nodes, activeChatNodeId]);

    const activeNode = nodesWithData.find(n => n.id === activeChatNodeId);
    const modeTabs = [
        { id: 'chat', label: 'Chat', icon: MessageSquare },
        { id: 'graph', label: 'Graph', icon: GitFork },
        { id: 'map', label: 'Map', icon: MapIcon },
    ];

    return (
        <div className="editor-layout" style={{ display: 'flex', flexDirection: 'row', height: '100vh', width: '100vw', overflow: 'hidden' }}>
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} onOpenSettings={() => setShowSettings(true)} />

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
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.18rem',
                            borderRadius: '999px',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid var(--panel-border)'
                        }}>
                            {modeTabs.map((tab) => {
                                const Icon = tab.icon;
                                const isActive = currentMode === tab.id;

                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => {
                                            if (isDraft) {
                                                setDraftMode(tab.id);
                                                return;
                                            }
                                            navigate(getSpacePath(spaceId, tab.id));
                                        }}
                                        style={{
                                            border: 'none',
                                            borderRadius: '999px',
                                            padding: '0.38rem 0.78rem',
                                            background: isActive ? 'linear-gradient(135deg, rgba(108,140,255,0.92), rgba(96,165,250,0.92))' : 'transparent',
                                            color: isActive ? 'white' : 'var(--text-muted)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.35rem',
                                            fontSize: '0.78rem',
                                            fontWeight: 500,
                                            fontFamily: 'inherit',
                                            boxShadow: isActive ? '0 8px 24px rgba(108, 140, 255, 0.25)' : 'none',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        <Icon size={13} />
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>

                        <button onClick={handleManualSave} disabled={isSaving || !isHydrated || isDraft}
                            style={{
                                background: saveSuccess ? 'var(--action)' : (isSaving || !isHydrated || isDraft) ? 'rgba(108, 140, 255, 0.4)' : 'var(--primary)',
                                color: 'white', fontSize: '0.78rem', padding: '0.3rem 0.8rem', border: 'none',
                                borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '0.3rem',
                                fontWeight: 500, cursor: (isSaving || !isHydrated || isDraft) ? 'wait' : 'pointer', fontFamily: 'inherit',
                                transition: 'all 0.3s'
                            }}>
                            {saveSuccess ? <><Check size={13} /> {t('editor.saved')}</> : <><Save size={13} /> {isDraft ? 'Draft' : (isSaving || !isHydrated) ? t('editor.saving') : t('editor.save')}</>}
                        </button>

                        {currentMode === 'graph' && (
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
                    </div>
                </div>

                {/* Content area */}
                {currentMode === 'chat' ? (
                    <ChatView
                        node={activeNode}
                        nodes={nodesWithData}
                        apiKeys={apiKeys}
                        onUpdateNodeData={updateNodeData}
                        onBranchFromChat={onBranchFromChat}
                        onNavigateToBranch={onNavigateToBranch}
                        spaceId={spaceId}
                    />
                ) : currentMode === 'map' ? (
                    <MapView
                        spaceTitle={spaceTitle}
                        nodes={nodesWithData}
                        mapState={mapState}
                        onMapStateChange={updateMapState}
                        onOpenMode={(nextMode) => {
                            if (isDraft) {
                                setDraftMode(nextMode);
                                return;
                            }
                            navigate(getSpacePath(spaceId, nextMode));
                        }}
                    />
                ) : (
                    <div style={{ flex: 1, position: 'relative' }}>
                        <ReactFlow
                            nodes={nodesWithData}
                            edges={edgesWithData}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onEdgeClick={onEdgeClick}
                            nodeTypes={nodeTypes}
                            edgeTypes={edgeTypes}
                            fitView
                            colorMode="system"
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
