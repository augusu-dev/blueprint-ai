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
    createEmptyApiKeyEntry,
    getDefaultModel,
    getModelOptions,
    getProviderOptions,
    normalizeApiKeyEntry,
} from './lib/aiCatalog';
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
const LOOP_MAX_NODES = 5;
const LOOP_EDGE_PREFIX = 'e-loop-';
const LOOP_COLUMN_OFFSET = 320;
const LOOP_ROW_OFFSET = 250;
const LOOP_STACK_SPACING = 190;

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

function stripLoopState(data = {}) {
    if (!data) return {};

    const nextData = { ...data };
    delete nextData.isLooping;
    delete nextData.loopNodeId;
    delete nextData.loopOriginId;
    delete nextData.loopRootId;
    delete nextData.loopPrevId;
    delete nextData.loopNextId;
    delete nextData.loopGenerated;
    return nextData;
}

function isLoopEdge(edge) {
    return edge?.data?.edgeKind === 'loop'
        || edge?.id?.startsWith(LOOP_EDGE_PREFIX)
        || Boolean(edge?.data?.loopArc);
}

function getLoopChainFromNext(nodesById, rootId) {
    const chain = [rootId];
    const visited = new Set(chain);
    let currentId = rootId;
    let safety = nodesById.size + 1;

    while (safety > 0) {
        safety -= 1;
        const nextId = nodesById.get(currentId)?.data?.loopNextId;
        if (!nextId || nextId === rootId) break;
        if (visited.has(nextId) || !nodesById.has(nextId)) break;

        chain.push(nextId);
        visited.add(nextId);
        currentId = nextId;
    }

    return chain;
}

function getLegacyLoopChain(nodesById, rootId) {
    const chain = [rootId];
    const visited = new Set(chain);
    let currentId = rootId;
    let safety = nodesById.size + 1;

    while (safety > 0) {
        safety -= 1;
        const nextId = nodesById.get(currentId)?.data?.loopNodeId;
        if (!nextId || visited.has(nextId) || !nodesById.has(nextId)) break;

        chain.push(nextId);
        visited.add(nextId);
        currentId = nextId;
    }

    return chain;
}

function extractLoopGroups(rawNodes) {
    const nodesById = new Map(rawNodes.map((node) => [node.id, node]));
    const rootIds = [];

    rawNodes.forEach((node) => {
        const data = node?.data || {};
        if (data.loopRootId && data.loopRootId === node.id) {
            rootIds.push(node.id);
            return;
        }

        if (data.loopNextId && (!data.loopRootId || data.loopRootId === node.id)) {
            rootIds.push(data.loopRootId || node.id);
            return;
        }

        if (data.loopNodeId && !data.loopOriginId) {
            rootIds.push(node.id);
        }
    });

    const groups = [];
    const assignedIds = new Set();

    [...new Set(rootIds)].forEach((rootId) => {
        if (!nodesById.has(rootId) || assignedIds.has(rootId)) return;

        const rootNode = nodesById.get(rootId);
        const chain = rootNode?.data?.loopNextId
            ? getLoopChainFromNext(nodesById, rootId)
            : getLegacyLoopChain(nodesById, rootId);

        if (chain.length < 2) return;

        chain.forEach((id) => assignedIds.add(id));
        groups.push(chain);
    });

    return groups;
}

function getLoopLayoutPositions(nodesById, chainIds, direction) {
    const positions = new Map();
    const rootNode = nodesById.get(chainIds[0]);
    if (!rootNode) return positions;

    const generatedIds = chainIds.slice(1);
    if (generatedIds.length === 0) return positions;

    if (direction === 'TB') {
        const totalWidth = (generatedIds.length - 1) * LOOP_STACK_SPACING;
        const startX = rootNode.position.x - (totalWidth / 2);
        const y = rootNode.position.y + LOOP_ROW_OFFSET;

        generatedIds.forEach((nodeId, index) => {
            positions.set(nodeId, {
                x: Math.round(startX + (index * LOOP_STACK_SPACING)),
                y: Math.round(y),
            });
        });

        return positions;
    }

    const totalHeight = (generatedIds.length - 1) * LOOP_STACK_SPACING;
    const startY = rootNode.position.y - (totalHeight / 2);
    const x = rootNode.position.x + LOOP_COLUMN_OFFSET;

    generatedIds.forEach((nodeId, index) => {
        positions.set(nodeId, {
            x: Math.round(x),
            y: Math.round(startY + (index * LOOP_STACK_SPACING)),
        });
    });

    return positions;
}

function applyLoopGroups(rawNodes, groups, direction) {
    const nodeMap = new Map(
        rawNodes.map((node) => [
            node.id,
            {
                ...node,
                data: stripLoopState(node.data),
            },
        ]),
    );

    groups.forEach((rawChain) => {
        const chain = rawChain.filter((nodeId) => nodeMap.has(nodeId));
        if (chain.length < 2) return;

        const positions = getLoopLayoutPositions(nodeMap, chain, direction);
        const rootId = chain[0];

        chain.forEach((nodeId, index) => {
            const node = nodeMap.get(nodeId);
            if (!node) return;

            const nextId = chain[(index + 1) % chain.length];
            const prevId = chain[(index - 1 + chain.length) % chain.length];
            const nextPosition = index === 0
                ? node.position
                : (positions.get(nodeId) || node.position);

            nodeMap.set(nodeId, {
                ...node,
                position: nextPosition,
                data: {
                    ...node.data,
                    loopRootId: rootId,
                    loopPrevId: prevId,
                    loopNextId: nextId,
                    loopGenerated: index > 0,
                    isLooping: index < chain.length - 1,
                },
            });
        });
    });

    return rawNodes
        .filter((node) => nodeMap.has(node.id))
        .map((node) => nodeMap.get(node.id));
}

function createLoopEdge(sourceId, targetId, rootId, direction, role, index, count) {
    return {
        id: `${LOOP_EDGE_PREFIX}${rootId}-${sourceId}-${targetId}`,
        source: sourceId,
        target: targetId,
        type: 'deleteEdge',
        style: {
            stroke: role === 'chain' ? 'rgba(245, 158, 11, 0.92)' : 'rgba(251, 191, 36, 0.94)',
            strokeWidth: role === 'chain' ? 2.8 : 3,
        },
        data: {
            edgeKind: 'loop',
            loopEdgeRole: role,
            loopEdgeIndex: index,
            loopNodeCount: count,
            loopDirection: direction,
            loopGroupId: rootId,
        },
    };
}

function rebuildLoopEdges(rawNodes, rawEdges, direction) {
    const baseEdges = rawEdges.filter((edge) => !isLoopEdge(edge));
    const groups = extractLoopGroups(rawNodes);
    const loopEdges = groups.flatMap((chain) => {
        if (chain.length < 2) return [];

        return chain.map((sourceId, index) => {
            const targetId = chain[(index + 1) % chain.length];
            const role = index === 0
                ? 'entry'
                : (index === chain.length - 1 ? 'close' : 'chain');

            return createLoopEdge(sourceId, targetId, chain[0], direction, role, index, chain.length);
        });
    });

    return [...baseEdges, ...loopEdges];
}

function prepareLoopGraph(rawNodes, rawEdges, direction) {
    const groups = extractLoopGroups(rawNodes);
    const nodes = applyLoopGroups(rawNodes, groups, direction);
    const edges = rebuildLoopEdges(nodes, rawEdges, direction);
    return { nodes, edges, groups };
}

function prepareLoopGraphFromGroups(rawNodes, rawEdges, groups, direction) {
    const nodes = applyLoopGroups(rawNodes, groups, direction);
    const edges = rebuildLoopEdges(nodes, rawEdges, direction);
    return { nodes, edges };
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
                    return parsed.map((item) => normalizeApiKeyEntry(item));
                }
            } catch {
                // Ignore invalid locally stored API keys.
            }
        }
        return [createEmptyApiKeyEntry('openai')];
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
        const preparedDraftGraph = prepareLoopGraph(
            applyProjectGoalToNodes(draftNodes, draftProject),
            draftEdges,
            direction,
        );

        setIsHydrated(false);
        setSpaceTitle(t('editor.untitled'));
        setNodes(alignGoalNode(preparedDraftGraph.nodes, direction));
        setEdges(preparedDraftGraph.edges);
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
            const preparedGraph = prepareLoopGraph(
                applyProjectGoalToNodes(
                    resolvedNodes,
                    projectForSpace,
                ),
                resolvedEdges,
                direction,
            );

            setSpaceTitle(data.title || t('editor.untitled'));
            setMapState(normalizeMapState(data.map_state));
            setNodes(alignGoalNode(preparedGraph.nodes, direction));
            setEdges(preparedGraph.edges);
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
                loopRootId: n.data.loopRootId, loopPrevId: n.data.loopPrevId,
                loopNextId: n.data.loopNextId, loopGenerated: n.data.loopGenerated,
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
        const snapshotGraph = Array.isArray(snapshot.nodes) && snapshot.nodes.length > 0
            ? prepareLoopGraph(snapshot.nodes, Array.isArray(snapshot.edges) ? snapshot.edges : [], direction)
            : null;
        const sharedGraph = sharedNodes
            ? prepareLoopGraph(sharedNodes, sharedEdges || [], direction)
            : null;
        const snapshotNodes = snapshotGraph ? cleanNodesForSave(snapshotGraph.nodes) : null;
        const snapshotEdges = snapshotGraph?.edges || null;
        const updates = {
            title: snapshot.title || t('editor.untitled'),
            nodes: snapshotNodes || (sharedGraph ? cleanNodesForSave(sharedGraph.nodes) : null) || cleanNodesForSave(createInitialNodes()),
            edges: snapshotEdges || sharedGraph?.edges || createInitialEdges(),
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
    }, [direction, supabase, t]);

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
        const preparedGraph = prepareLoopGraph(nodes, edges, direction);

        const updates = {
            title: titleOverride,
            nodes: cleanNodesForSave(preparedGraph.nodes),
            edges: preparedGraph.edges,
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
    }, [currentProjectId, direction, edges, isHydrated, mapState, nodes, spaceId, spaceTitle, updateRemoteSpace]);

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
        if (changes.some((change) => change.type === 'position')) {
            setNodes((currentNodes) => {
                const preparedGraph = prepareLoopGraph(currentNodes, edges, direction);
                setEdges(preparedGraph.edges);
                return alignGoalNode(preparedGraph.nodes, direction);
            });
        }
        if (changes.some((change) => change.type !== 'select')) {
            markDraftDirty();
        }
    }, [baseOnNodesChange, direction, edges, markDraftDirty, setEdges, setNodes]);

    const onEdgesChange = useCallback((changes) => {
        baseOnEdgesChange(changes);
        if (changes.some((change) => change.type !== 'select')) {
            markDraftDirty();
        }
    }, [baseOnEdgesChange, markDraftDirty]);

    useEffect(() => {
        setNodes((currentNodes) => alignGoalNode(currentNodes, direction));
    }, [direction, nodes, setNodes]);

    useEffect(() => {
        setNodes((currentNodes) => {
            const preparedGraph = prepareLoopGraph(currentNodes, edges, direction);
            setEdges(preparedGraph.edges);
            return alignGoalNode(preparedGraph.nodes, direction);
        });
    }, [direction, setEdges, setNodes]);

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

            const groups = extractLoopGroups(nds).map((group) => [...group]);
            const groupIndex = groups.findIndex((group) => group.includes(sourceId));
            let nextNodes = nds;
            let removedNodeId = null;

            if (groupIndex === -1) {
                const newLoopNodeId = `loop-${crypto.randomUUID()}`;
                const loopNode = {
                    id: newLoopNodeId,
                    type: 'loopNode',
                    position: { ...sourceNode.position },
                    data: {
                        dir: direction,
                        prompt: '',
                        loopMode: sourceNode.data?.loopMode || 'perspective',
                        systemPrompt: sourceNode.data?.systemPrompt || '',
                        selectedApiKey: sourceNode.data?.selectedApiKey || 0,
                    },
                };

                nextNodes = [...nds, loopNode];
                groups.push([sourceId, newLoopNodeId]);
            } else {
                const chain = groups[groupIndex];
                const sourceIndex = chain.indexOf(sourceId);
                const isLastNodeInRing = sourceIndex === chain.length - 1;

                if (isLastNodeInRing) {
                    if (chain.length >= LOOP_MAX_NODES) {
                        return nds;
                    }

                    const newLoopNodeId = `loop-${crypto.randomUUID()}`;
                    const loopNode = {
                        id: newLoopNodeId,
                        type: 'loopNode',
                        position: { ...sourceNode.position },
                        data: {
                            dir: direction,
                            prompt: '',
                            loopMode: sourceNode.data?.loopMode || 'perspective',
                            systemPrompt: sourceNode.data?.systemPrompt || '',
                            selectedApiKey: sourceNode.data?.selectedApiKey || 0,
                        },
                    };

                    nextNodes = [...nds, loopNode];
                    chain.splice(sourceIndex + 1, 0, newLoopNodeId);
                } else {
                    removedNodeId = chain[sourceIndex + 1];
                    chain.splice(sourceIndex + 1, 1);
                    nextNodes = nds.filter((node) => node.id !== removedNodeId);

                    if (chain.length < 2) {
                        groups.splice(groupIndex, 1);
                    }
                }
            }

            const preparedGraph = prepareLoopGraphFromGroups(nextNodes, edges, groups, direction);
            setEdges((eds) => {
                const filteredEdges = removedNodeId
                    ? eds.filter((edge) => edge.source !== removedNodeId && edge.target !== removedNodeId)
                    : eds;
                return rebuildLoopEdges(preparedGraph.nodes, filteredEdges, direction);
            });

            if (removedNodeId && activeChatNodeId === removedNodeId) {
                setActiveChatNodeId(sourceId);
            }

            return preparedGraph.nodes;
        });
        markDraftDirty();
    }, [activeChatNodeId, direction, edges, markDraftDirty, setEdges, setNodes]);

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
            const groups = extractLoopGroups(nds).map((group) => [...group]);
            const groupIndex = groups.findIndex((group) => group.includes(nodeId));
            const removedNodeIds = new Set([nodeId]);
            let nextNodes = nds;

            if (groupIndex !== -1) {
                const chain = groups[groupIndex];
                const nodeIndex = chain.indexOf(nodeId);

                if (nodeIndex === 0) {
                    chain.forEach((id) => removedNodeIds.add(id));
                    nextNodes = nds.filter((node) => !removedNodeIds.has(node.id));
                    groups.splice(groupIndex, 1);
                } else {
                    chain.splice(nodeIndex, 1);
                    nextNodes = nds.filter((node) => node.id !== nodeId);

                    if (chain.length < 2) {
                        groups.splice(groupIndex, 1);
                    }
                }
            } else {
                nextNodes = nds.filter((node) => node.id !== nodeId);
            }

            const preparedGraph = prepareLoopGraphFromGroups(nextNodes, edges, groups, direction);
            setEdges((eds) => rebuildLoopEdges(
                preparedGraph.nodes,
                eds.filter((edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)),
                direction,
            ));

            if (removedNodeIds.has(activeChatNodeId)) {
                setActiveChatNodeId('1');
            }

            return preparedGraph.nodes;
        });
        markDraftDirty();
    }, [activeChatNodeId, direction, edges, markDraftDirty, setEdges, setNodes]);

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
        if (edgeToDelete?.data?.edgeKind === 'loop') return;
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
                            {apiKeys.map((item, index) => {
                                const modelOptions = getModelOptions(item.provider);
                                const selectedPresetModel = modelOptions.some((modelOption) => modelOption.value === item.model)
                                    ? item.model
                                    : '';

                                return (
                                <div className="form-group glass-panel" key={index} style={{ marginBottom: '0.75rem', padding: '0.65rem', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                        <label style={{ marginBottom: 0, fontWeight: 500, fontSize: '0.82rem' }}>{t('settings.apiKey')} {index + 1} {index === 0 && t('settings.default')}</label>
                                        {apiKeys.length > 1 && <button className="btn-text-danger" onClick={() => setApiKeys(apiKeys.filter((_, i) => i !== index))}>{t('settings.delete')}</button>}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('settings.provider')}</label>
                                            <select
                                                className="node-input"
                                                style={{ padding: '0.4rem', height: '34px' }}
                                                value={item.provider}
                                                onChange={(e) => {
                                                    const nk = [...apiKeys];
                                                    nk[index] = { ...nk[index], provider: e.target.value, model: getDefaultModel(e.target.value) };
                                                    setApiKeys(nk);
                                                }}
                                            >
                                                {getProviderOptions().map((providerOption) => (
                                                    <option key={providerOption.id} value={providerOption.id}>
                                                        {providerOption.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('settings.model')}</label>
                                            <select className="node-input" style={{ padding: '0.4rem', height: '34px' }} value={selectedPresetModel} onChange={(e) => { const nk = [...apiKeys]; nk[index] = { ...nk[index], model: e.target.value }; setApiKeys(nk); }}>
                                                <option value="">{t('settings.modelDefault')}</option>
                                                {modelOptions.map((modelOption) => (
                                                    <option key={modelOption.value} value={modelOption.value}>
                                                        {modelOption.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('settings.secretKey')}</label>
                                        <input type="password" placeholder={`${item.provider}${t('settings.secretPlaceholder')}`} value={item.key || ''} onChange={(e) => { const nk = [...apiKeys]; nk[index] = { ...nk[index], key: e.target.value }; setApiKeys(nk); }} />
                                    </div>
                                </div>
                                );
                            })}
                            <p className="help-text" style={{ marginTop: '-0.25rem', marginBottom: '0.9rem' }}>
                                同じ OpenAI アカウントで ChatGPT と API を併用することはできますが、このアプリのプロバイダー接続は API 側を使います。モデルは選択式です。
                            </p>
                            {apiKeys.length < 5 && <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.4rem', width: '100%' }} onClick={() => setApiKeys([...apiKeys, createEmptyApiKeyEntry('openai')])}>{t('settings.addKey')}</button>}
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
