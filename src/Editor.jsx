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
import { Settings, X, LogOut, ArrowDown, ArrowRight, Menu, Edit3, MessageSquare, GitFork, Map as MapIcon } from 'lucide-react';
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
import { DEFAULT_SPACE_MODE, getSpacePath, isSpaceMode, resolveSpaceRouteParams } from './lib/routes';
import { createDefaultMapState, createInitialEdges, createInitialNodes, normalizeMapState } from './lib/space';
import {
    getProjectContextPrompt,
    loadWorkspaceMeta,
    syncWorkspaceProjectFromSpace,
} from './lib/workspace';

const nodeTypes = {
    sequenceNode: SequenceNode,
    loopNode: LoopNode,
    branchNode: BranchNode,
    goalNode: GoalNode,
};

const edgeTypes = {
    deleteEdge: DeleteEdge,
};

const DEFAULT_NODE_WIDTH = 280;
const DEFAULT_NODE_HEIGHT = 150;
const DEFAULT_GOAL_NODE_WIDTH = 380;
const DEFAULT_GOAL_NODE_HEIGHT = 460;
const GOAL_NODE_MARGIN = 72;

function getNodeMeasure(node, key, fallback) {
    return Number(node?.measured?.[key] || node?.[key] || fallback);
}

function getGoalAnchorPosition(rawNodes, direction) {
    const goalNode = rawNodes.find((node) => node.type === 'goalNode');
    if (!goalNode) return null;

    const contentNodes = rawNodes.filter((node) => node.id !== goalNode.id);
    if (contentNodes.length === 0) {
        return direction === 'TB'
            ? { x: 50, y: -432 }
            : { x: -352, y: -55 };
    }

    const bounds = contentNodes.reduce((accumulator, node) => {
        const x = Number(node?.position?.x || 0);
        const y = Number(node?.position?.y || 0);
        const width = getNodeMeasure(node, 'width', DEFAULT_NODE_WIDTH);
        const height = getNodeMeasure(node, 'height', DEFAULT_NODE_HEIGHT);
        return {
            minX: Math.min(accumulator.minX, x),
            minY: Math.min(accumulator.minY, y),
            maxX: Math.max(accumulator.maxX, x + width),
            maxY: Math.max(accumulator.maxY, y + height),
        };
    }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

    const goalWidth = getNodeMeasure(goalNode, 'width', DEFAULT_GOAL_NODE_WIDTH);
    const goalHeight = getNodeMeasure(goalNode, 'height', DEFAULT_GOAL_NODE_HEIGHT);

    if (direction === 'TB') {
        return {
            x: Math.round(bounds.minX + ((bounds.maxX - bounds.minX - goalWidth) / 2)),
            y: Math.round(bounds.minY - GOAL_NODE_MARGIN - goalHeight),
        };
    }

    return {
        x: Math.round(bounds.minX - GOAL_NODE_MARGIN - goalWidth),
        y: Math.round(bounds.minY + ((bounds.maxY - bounds.minY - goalHeight) / 2)),
    };
}

function alignGoalNode(rawNodes, direction) {
    const goalNode = rawNodes.find((node) => node.type === 'goalNode');
    const nextPosition = getGoalAnchorPosition(rawNodes, direction);

    if (!goalNode || !nextPosition) return rawNodes;

    const currentX = Number(goalNode?.position?.x || 0);
    const currentY = Number(goalNode?.position?.y || 0);
    if (currentX === nextPosition.x && currentY === nextPosition.y) {
        return rawNodes;
    }

    return rawNodes.map((node) => (
        node.id === goalNode.id
            ? { ...node, position: nextPosition }
            : node
    ));
}

function EditorContent() {
    const routeParams = useParams();
    const { spaceId, mode } = resolveSpaceRouteParams(routeParams);
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
    const [activeChatNodeId, setActiveChatNodeId] = useState('1');
    const [draftMode, setDraftMode] = useState(DEFAULT_SPACE_MODE);
    const [draftDirty, setDraftDirty] = useState(false);
    const currentMode = isDraft ? draftMode : (isSpaceMode(mode) ? mode : DEFAULT_SPACE_MODE);
    const draftSnapshotRef = useRef(null);
    const promoteDraftPromiseRef = useRef(null);
    const [workspaceMetaVersion, setWorkspaceMetaVersion] = useState(0);

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
        const handleWorkspaceMetaUpdate = () => setWorkspaceMetaVersion((current) => current + 1);
        window.addEventListener('workspaceMetaUpdated', handleWorkspaceMetaUpdate);
        return () => window.removeEventListener('workspaceMetaUpdated', handleWorkspaceMetaUpdate);
    }, []);

    const workspaceMeta = useMemo(() => {
        void workspaceMetaVersion;
        return loadWorkspaceMeta();
    }, [workspaceMetaVersion]);
    const currentProjectId = isDraft
        ? (workspaceMeta.draftProjectId || null)
        : (workspaceMeta.spaces[spaceId]?.projectId || null);
    const currentProject = useMemo(
        () => workspaceMeta.projects.find((project) => project.id === currentProjectId) || null,
        [currentProjectId, workspaceMeta.projects],
    );
    const projectContextPrompt = useMemo(
        () => getProjectContextPrompt(currentProject),
        [currentProject],
    );

    const applyProjectGoalToNodes = useCallback((rawNodes, project) => {
        if (!project?.sharedGoal) return rawNodes;

        return rawNodes.map((node) => (
            node?.data?.isStarter && !node?.data?.systemPrompt
                ? { ...node, data: { ...node.data, systemPrompt: project.sharedGoal } }
                : node
        ));
    }, []);

    const resetDraftState = useCallback(() => {
        const latestWorkspaceMeta = loadWorkspaceMeta();
        const draftProjectId = latestWorkspaceMeta.draftProjectId || null;
        const draftProject = latestWorkspaceMeta.projects.find((project) => project.id === draftProjectId) || null;
        const draftNodes = Array.isArray(draftProject?.sharedSnapshot?.nodes) && draftProject.sharedSnapshot.nodes.length > 0
            ? draftProject.sharedSnapshot.nodes
            : createInitialNodes();
        const draftEdges = Array.isArray(draftProject?.sharedSnapshot?.edges) && draftProject.sharedSnapshot.edges.length > 0
            ? draftProject.sharedSnapshot.edges
            : createInitialEdges();

        setIsHydrated(false);
        setSpaceTitle(t('editor.untitled'));
        setNodes(alignGoalNode(applyProjectGoalToNodes(draftNodes, draftProject), direction));
        setEdges(draftEdges);
        setMapState(createDefaultMapState());
        setActiveChatNodeId('1');
        setDraftMode(DEFAULT_SPACE_MODE);
        setDraftDirty(false);
        promoteDraftPromiseRef.current = null;
        setIsHydrated(true);
    }, [applyProjectGoalToNodes, direction, setEdges, setNodes, t]);

    useEffect(() => {
        if (isDraft) return;
        if (!isSpaceMode(mode)) {
            navigate(getSpacePath(spaceId), { replace: true });
        }
    }, [isDraft, spaceId, mode, navigate]);

    useEffect(() => {
        const handleWorkspaceStartNewSpace = () => {
            if (isDraft) {
                resetDraftState();
                return;
            }
            navigate('/');
        };

        window.addEventListener('workspaceStartNewSpace', handleWorkspaceStartNewSpace);
        return () => window.removeEventListener('workspaceStartNewSpace', handleWorkspaceStartNewSpace);
    }, [isDraft, navigate, resetDraftState]);

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
            resetDraftState();
            return undefined;
        }

        if (!spaceId || !isSpaceMode(mode)) return undefined;
        let isCancelled = false;
        setIsHydrated(false);

        const applySpaceData = (data) => {
            if (isCancelled || !data) return;
            const latestWorkspaceMeta = loadWorkspaceMeta();
            const projectForSpace = latestWorkspaceMeta.projects.find(
                (project) => project.id === latestWorkspaceMeta.spaces[spaceId]?.projectId,
            ) || null;
            const projectNodes = Array.isArray(projectForSpace?.sharedSnapshot?.nodes) && projectForSpace.sharedSnapshot.nodes.length > 0
                ? projectForSpace.sharedSnapshot.nodes
                : null;
            const projectEdges = Array.isArray(projectForSpace?.sharedSnapshot?.edges) && projectForSpace.sharedSnapshot.edges.length > 0
                ? projectForSpace.sharedSnapshot.edges
                : null;
            const localNodes = Array.isArray(data.nodes) && data.nodes.length > 0 ? data.nodes : null;
            const localEdges = Array.isArray(data.edges) && data.edges.length > 0 ? data.edges : null;
            const resolvedNodes = localNodes || projectNodes || createInitialNodes();
            const resolvedEdges = localEdges || projectEdges || createInitialEdges();

            setSpaceTitle(data.title || t('editor.untitled'));
            setMapState(normalizeMapState(data.map_state));
            setNodes(
                alignGoalNode(
                    applyProjectGoalToNodes(
                        resolvedNodes,
                        projectForSpace,
                    ),
                    direction,
                ),
            );
            setEdges(resolvedEdges);
            if (data.viewport && Object.keys(data.viewport).length > 0) {
                setViewport({ x: data.viewport.x, y: data.viewport.y, zoom: data.viewport.zoom });
            }
            setIsHydrated(true);
        };

        const fetchSpace = async () => {
            let localData = null;
            try {
                const stored = localStorage.getItem(`blueprint_space_${spaceId}`);
                if (stored) {
                    localData = JSON.parse(stored);
                    if (localData?.project_id) {
                        syncWorkspaceProjectFromSpace(spaceId, localData, localData.project_id);
                    }
                }
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
    }, [applyProjectGoalToNodes, direction, isDraft, mode, resetDraftState, setEdges, setNodes, setViewport, spaceId, t]);

    const cleanNodesForSave = (rawNodes) => {
        return rawNodes.map(n => ({
            id: n.id, type: n.type, position: n.position,
            data: n.data ? {
                dir: n.data.dir, prompt: n.data.prompt, systemPrompt: n.data.systemPrompt,
                chatHistory: n.data.chatHistory, response: n.data.response, isStarter: n.data.isStarter,
                numBranches: n.data.numBranches, loopMode: n.data.loopMode,
                selectedApiKey: n.data.selectedApiKey, branchCount: n.data.branchCount,
                goalHistory: n.data.goalHistory, isLooping: n.data.isLooping,
                loopNodeId: n.data.loopNodeId, loopOriginId: n.data.loopOriginId,
                goalInteractiveStates: n.data.goalInteractiveStates,
                goalSelectedOptions: n.data.goalSelectedOptions,
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
            projectId: currentProjectId,
        };
    }, [spaceTitle, nodes, edges, mapState, currentMode, currentProjectId]);

    const createSpaceFromSnapshot = useCallback(async (snapshot) => {
        const latestWorkspaceMeta = loadWorkspaceMeta();
        const project = latestWorkspaceMeta.projects.find((item) => item.id === snapshot.projectId) || null;
        const sharedNodes = Array.isArray(project?.sharedSnapshot?.nodes) && project.sharedSnapshot.nodes.length > 0
            ? project.sharedSnapshot.nodes
            : null;
        const sharedEdges = Array.isArray(project?.sharedSnapshot?.edges) && project.sharedSnapshot.edges.length > 0
            ? project.sharedSnapshot.edges
            : null;
        const snapshotNodes = Array.isArray(snapshot.nodes) && snapshot.nodes.length > 0
            ? cleanNodesForSave(snapshot.nodes)
            : null;
        const snapshotEdges = Array.isArray(snapshot.edges) && snapshot.edges.length > 0
            ? snapshot.edges
            : null;
        const updates = {
            title: snapshot.title || t('editor.untitled'),
            nodes: snapshotNodes || sharedNodes || cleanNodesForSave(createInitialNodes()),
            edges: snapshotEdges || sharedEdges || createInitialEdges(),
            map_state: snapshot.mapState,
            project_id: snapshot.projectId || null,
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
                        syncWorkspaceProjectFromSpace(data.id, persistedUpdates, snapshot.projectId || null);
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
        syncWorkspaceProjectFromSpace(newId, updates, snapshot.projectId || null);
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

    const persistCurrentSpace = useCallback(async (titleOverride = spaceTitle) => {
        if (!spaceId || nodes.length === 0 || !isHydrated) return;

        const updates = {
            title: titleOverride,
            nodes: cleanNodesForSave(nodes),
            edges,
            map_state: mapState,
            project_id: currentProjectId,
            updated_at: new Date().toISOString(),
        };

        localStorage.setItem(`blueprint_space_${spaceId}`, JSON.stringify(updates));
        await updateRemoteSpace({
            title: updates.title,
            nodes: updates.nodes,
            edges: updates.edges,
            map_state: updates.map_state,
            updated_at: updates.updated_at,
        });
        syncWorkspaceProjectFromSpace(spaceId, updates, currentProjectId);
    }, [currentProjectId, edges, isHydrated, mapState, nodes, spaceId, spaceTitle, updateRemoteSpace]);

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
            try {
                await persistCurrentSpace(cleanedTitle);
            } catch (err) {
                console.error('Save error:', err);
                alert(t('editor.saveError'));
            }
        }
    };

    // Auto-save
    const saveTimerRef = useRef(null);
    useEffect(() => {
        if (!spaceId || nodes.length === 0 || !isHydrated) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            try {
                await persistCurrentSpace();
            } catch (err) {
                console.error('Auto-save failed', err);
            }
        }, 1500);
        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    }, [currentProjectId, edges, isHydrated, mapState, nodes, persistCurrentSpace, spaceId, spaceTitle]);

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

    useEffect(() => {
        setNodes((currentNodes) => alignGoalNode(currentNodes, direction));
    }, [direction, nodes, setNodes]);

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

    const toggleLoopForNode = useCallback((sourceId) => {
        setNodes((nds) => {
            const sourceNode = nds.find((node) => node.id === sourceId);
            if (!sourceNode) return nds;

            const existingLoopNodeId = sourceNode.data?.loopNodeId || null;
            if (existingLoopNodeId) {
                setEdges((eds) => eds.filter((edge) => (
                    edge.source !== existingLoopNodeId
                    && edge.target !== existingLoopNodeId
                    && edge.id !== `e-loop-forward-${sourceId}-${existingLoopNodeId}`
                    && edge.id !== `e-loop-return-${existingLoopNodeId}-${sourceId}`
                )));

                return nds
                    .filter((node) => node.id !== existingLoopNodeId)
                    .map((node) => (
                        node.id === sourceId
                            ? { ...node, data: { ...node.data, isLooping: false, loopNodeId: null } }
                            : node
                    ));
            }

            const newLoopNodeId = `loop-${crypto.randomUUID()}`;
            const offset = direction === 'LR'
                ? { x: 260, y: -220 }
                : { x: 260, y: 220 };
            const loopNode = {
                id: newLoopNodeId,
                type: 'loopNode',
                position: {
                    x: sourceNode.position.x + offset.x,
                    y: sourceNode.position.y + offset.y,
                },
                data: {
                    dir: direction,
                    prompt: '',
                    systemPrompt: sourceNode.data?.systemPrompt || '',
                    selectedApiKey: sourceNode.data?.selectedApiKey || 0,
                    loopOriginId: sourceId,
                },
            };

            setEdges((eds) => ([
                ...eds,
                {
                    id: `e-loop-forward-${sourceId}-${newLoopNodeId}`,
                    source: sourceId,
                    target: newLoopNodeId,
                    sourceHandle: 'loop-forward-source',
                    targetHandle: 'loop-forward-target',
                    type: 'deleteEdge',
                    style: {
                        stroke: 'rgba(251, 191, 36, 0.92)',
                        strokeWidth: 2.4,
                    },
                    data: { loopArc: 'forward', loopDirection: direction },
                },
                {
                    id: `e-loop-return-${newLoopNodeId}-${sourceId}`,
                    source: newLoopNodeId,
                    target: sourceId,
                    sourceHandle: 'loop-return-source',
                    targetHandle: 'loop-return-target',
                    type: 'deleteEdge',
                    style: {
                        stroke: 'rgba(251, 191, 36, 0.82)',
                        strokeWidth: 2.2,
                    },
                    data: { loopArc: 'return', loopDirection: direction },
                },
            ]));

            return [
                ...nds.map((node) => (
                    node.id === sourceId
                        ? { ...node, data: { ...node.data, isLooping: true, loopNodeId: newLoopNodeId } }
                        : node
                )),
                loopNode,
            ];
        });
        markDraftDirty();
    }, [direction, markDraftDirty, setEdges, setNodes]);

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
        setNodes((nds) => {
            const autoLoopChildren = nds
                .filter((node) => node.data?.loopOriginId === nodeId)
                .map((node) => node.id);
            const sourceNode = nds.find((node) => node.id === nodeId) || null;
            const loopNodeId = sourceNode?.data?.loopNodeId || null;
            const removedNodeIds = new Set([nodeId, ...autoLoopChildren, ...(loopNodeId ? [loopNodeId] : [])]);

            setEdges((eds) => eds.filter((edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)));

            if (activeChatNodeId === nodeId || (loopNodeId && activeChatNodeId === loopNodeId)) {
                setActiveChatNodeId('1');
            }

            return nds
                .filter((node) => !removedNodeIds.has(node.id))
                .map((node) => (
                    node.data?.loopNodeId === nodeId
                        ? { ...node, data: { ...node.data, isLooping: false, loopNodeId: null } }
                        : node
                ));
        });
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
        const sharedGoal = starterNode?.data?.systemPrompt || currentProject?.sharedGoal || '';
        return nodes.map(n => ({
            ...n,
            draggable: n.type === 'goalNode' ? false : n.draggable,
            data: {
                ...n.data, dir: direction,
                systemPrompt: n.data?.isStarter ? (n.data?.systemPrompt || currentProject?.sharedGoal || '') : (n.data?.systemPrompt || sharedGoal),
                projectContextPrompt,
                onChange: updateNodeData,
                onUpdateNodeData: updateNodeData,
                onToggleLoop: toggleLoopForNode,
                onAddBranch,
                onQuickAdd,
                onDeleteNode,
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
    }, [nodes, edges, direction, currentProject, projectContextPrompt, updateNodeData, toggleLoopForNode, onAddBranch, onQuickAdd, onDeleteNode, apiKeys, navigate, spaceId, isDraft]);

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
        <div className="editor-layout" style={{ display: 'flex', flexDirection: 'row', height: '100dvh', width: '100vw', overflow: 'hidden' }}>
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} onOpenSettings={() => setShowSettings(true)} />

            {/* Left icon bar (always visible) */}
            <div style={{
                width: '52px', background: 'var(--bg-dark)', borderRight: '1px solid var(--panel-border)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
                paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
                gap: '0.5rem', zIndex: 200, flexShrink: 0, position: 'relative'
            }}>
                <button onClick={() => setIsSidebarOpen(true)} className="btn-icon" style={{ width: '36px', height: '36px' }} title={t('sidebar.title')}>
                    <Menu size={18} />
                </button>
                <button onClick={() => setShowSettings(true)} className="btn-icon" style={{ width: '36px', height: '36px', marginTop: 'auto' }} title={t('settings.title')} aria-label={t('settings.title')}>
                    <Settings size={17} />
                </button>
            </div>

            {/* Main area */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                {/* Top Header (always) */}
                <div style={{
                    padding: 'calc(env(safe-area-inset-top, 0px) + 0.45rem) 1rem 0.45rem', borderBottom: '1px solid var(--panel-border)',
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
                        {currentProject && (
                            <span style={{
                                padding: '0.22rem 0.6rem',
                                borderRadius: '999px',
                                fontSize: '0.72rem',
                                color: '#c6d4ff',
                                background: 'rgba(108, 140, 255, 0.12)',
                                border: '1px solid rgba(108, 140, 255, 0.18)',
                                whiteSpace: 'nowrap',
                            }}>
                                {currentProject.name}
                            </span>
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

                        {currentMode === 'graph' && (
                        <button onClick={toggleDirection}
                            aria-label={direction === 'LR' ? t('editor.ltr') : t('editor.ttb')}
                            title={direction === 'LR' ? t('editor.ltr') : t('editor.ttb')}
                            style={{
                                    width: '36px', height: '36px', padding: 0,
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid var(--panel-border)', borderRadius: '20px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)',
                                    cursor: 'pointer', fontFamily: 'inherit'
                                }}>
                                {direction === 'LR' ? <ArrowRight size={15} color="var(--primary)" /> : <ArrowDown size={15} color="var(--primary)" />}
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
                        projectContextPrompt={projectContextPrompt}
                        spaceId={spaceId}
                    />
                ) : currentMode === 'map' ? (
                    <MapView
                        spaceTitle={spaceTitle}
                        nodes={nodesWithData}
                        mapState={mapState}
                        currentProject={currentProject}
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
                            <button className="btn btn-secondary" onClick={() => setShowSettings(false)}>{t('settings.cancel')}</button>
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
