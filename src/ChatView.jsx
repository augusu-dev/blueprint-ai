import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Bot,
    BookOpen,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Copy,
    ExternalLink,
    GitBranch,
    RefreshCw,
    Send,
    Sparkles,
    Target,
    Trash2,
    X,
    User,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from './i18n';
import GoalWizard from './GoalWizard';
import { getDictionaryPath } from './lib/routes';
import {
    createProjectImprovementVersion,
    getProjectPlanAccess,
    restoreProjectImprovementVersion,
    saveProjectImprovementVersion,
    saveProjectPlanSection,
} from './lib/workspace';
import { upsertDictionaryEntry } from './lib/dictionary';
import { createSingleTurnHistory, requestChatText, resolveModelSelection } from './lib/llmClient';

const { useCallback } = React;

const PLAN_SECTION_PROMPTS = {
    plan: `あなたはプロジェクトの計画設計アシスタントです。ここでは目標ではなく、具体的な進め方だけを整理してください。

- いま進める段階
- 直近でやること
- 分岐の考え方
- ノードや流れの調整方針

を、短く具体的にまとめてください。必要ならチェックリストを使ってください。返答は日本語です。`,
    reward: `あなたはプロジェクトの報酬設計アシスタントです。ここでは報酬設計だけを整理してください。

- 小さな達成報酬
- 節目のごほうび
- Map や Achievement に接続しやすい報酬の形
- 労力に見合う見せ方

を具体化してください。必要なら選択肢やチェックリストを使ってください。返答は日本語です。`,
    improvement: `あなたはプロジェクト改善アシスタントです。ここでは改善案だけを整理してください。

- 何を改善するか
- その理由
- どう変えるか
- 元に戻したい時の判断基準

を簡潔にまとめてください。改善はバージョン管理される前提で、日本語で返答してください。`,
};

function createResponseVariant({
    id,
    content = '',
    pendingAction = null,
    actionStatus = null,
    inlineExplanations = [],
}) {
    return {
        id: id || crypto.randomUUID(),
        content,
        pendingAction,
        actionStatus,
        inlineExplanations: Array.isArray(inlineExplanations) ? inlineExplanations : [],
    };
}

function ensureMessageId(message) {
    if (!message) return message;
    return {
        ...message,
        id: message.id || crypto.randomUUID(),
    };
}

function syncAiMessage(message, responseVariants, requestedActiveIndex = 0) {
    const safeVariants = responseVariants.length > 0
        ? responseVariants
        : [createResponseVariant({ content: message?.content || '' })];
    const activeVariantIndex = Math.max(0, Math.min(safeVariants.length - 1, requestedActiveIndex));
    const activeVariant = safeVariants[activeVariantIndex];

    return {
        ...message,
        role: 'ai',
        responseVariants: safeVariants,
        activeVariantIndex,
        content: activeVariant.content,
        pendingAction: activeVariant.pendingAction,
        actionStatus: activeVariant.actionStatus,
        inlineExplanations: activeVariant.inlineExplanations,
    };
}

function normalizeAiMessage(message) {
    if (!message || message.role !== 'ai') return message;

    const baseMessage = ensureMessageId(message);

    const responseVariants = Array.isArray(baseMessage.responseVariants) && baseMessage.responseVariants.length > 0
        ? baseMessage.responseVariants.map((variant) => createResponseVariant(variant))
        : [createResponseVariant({
            content: baseMessage.content ?? '',
            pendingAction: baseMessage.pendingAction ?? null,
            actionStatus: baseMessage.actionStatus ?? null,
            inlineExplanations: baseMessage.inlineExplanations,
        })];

    return syncAiMessage(
        baseMessage,
        responseVariants,
        Number.isInteger(baseMessage.activeVariantIndex) ? baseMessage.activeVariantIndex : 0,
    );
}

function normalizeHistory(history) {
    let previousUserNodeId = null;

    return (history || []).map((message) => {
        const baseMessage = ensureMessageId(message);
        if (baseMessage?.role === 'user') {
            const normalizedUser = {
                ...baseMessage,
                chatNodeId: typeof baseMessage.chatNodeId === 'string' && baseMessage.chatNodeId
                    ? baseMessage.chatNodeId
                    : baseMessage.id,
                chatParentId: typeof baseMessage.chatParentId === 'string' ? baseMessage.chatParentId : previousUserNodeId,
                chatBranchKind: baseMessage.chatBranchKind === 'branch' ? 'branch' : 'send',
            };
            previousUserNodeId = normalizedUser.chatNodeId;
            return normalizedUser;
        }

        if (baseMessage?.role === 'ai') {
            return {
                ...normalizeAiMessage(baseMessage),
                chatNodeId: typeof baseMessage.chatNodeId === 'string' && baseMessage.chatNodeId
                    ? baseMessage.chatNodeId
                    : previousUserNodeId || baseMessage.id,
            };
        }

        return baseMessage;
    });
}

function indexToBranchLetter(index) {
    let value = index;
    let label = '';
    do {
        label = String.fromCharCode(97 + (value % 26)) + label;
        value = Math.floor(value / 26) - 1;
    } while (value >= 0);
    return label;
}

function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function buildInlineOverlayPlacement(container, range, estimatedHeight) {
    const root = container?.closest?.('[data-chat-column-shell="true"]');
    if (!root || typeof range?.getBoundingClientRect !== 'function') return null;

    const rootRect = root.getBoundingClientRect();
    const selectionRect = range.getBoundingClientRect();
    const availableWidth = Math.max(120, rootRect.width - 16);
    const desiredWidth = Math.max(260, selectionRect.width + 92);
    const width = Math.min(Math.max(180, Math.min(360, desiredWidth)), availableWidth);
    const gap = 10;
    const belowSpace = window.innerHeight - selectionRect.bottom - 16;
    const aboveSpace = selectionRect.top - 16;
    const placement = belowSpace >= estimatedHeight || belowSpace >= aboveSpace ? 'bottom' : 'top';
    const top = placement === 'bottom'
        ? selectionRect.bottom - rootRect.top + gap
        : selectionRect.top - rootRect.top - estimatedHeight - gap;
    const left = clampNumber(selectionRect.left - rootRect.left, 8, Math.max(8, rootRect.width - width - 8));
    const maxTop = Math.max(8, rootRect.height - estimatedHeight - 8);

    return { top: clampNumber(top, 8, maxTop), left, width, placement };
}

function getBranchFamilyNodes(node) {
    if (!node) return [];
    const family = [node];
    let current = node;

    while (true) {
        const nextBranchChild = current.children.find((child) => child.branchKind === 'branch') || null;
        if (!nextBranchChild) break;
        family.push(nextBranchChild);
        current = nextBranchChild;
    }

    return family;
}

function getSendChildren(node) {
    return node?.children?.filter((child) => child.branchKind !== 'branch') || [];
}

function analyzeChatHistory(history) {
    const normalizedHistory = normalizeHistory(history);
    const nodeById = new Map();
    const orderedNodes = [];
    let lastUserNode = null;

    normalizedHistory.forEach((message, index) => {
        if (message.role === 'user') {
            const nodeId = message.chatNodeId || message.id;
            const parentId = typeof message.chatParentId === 'string' ? message.chatParentId : lastUserNode?.id || null;
            const branchKind = message.chatBranchKind === 'branch' ? 'branch' : 'send';
            const node = {
                id: nodeId,
                parentId,
                branchKind,
                order: orderedNodes.length,
                userIndex: index,
                replyIndex: null,
                userMessage: message,
                replyMessage: null,
                children: [],
                numericStep: 0,
                displayLabel: '',
                branchLetter: '',
            };

            nodeById.set(nodeId, node);
            orderedNodes.push(node);
            lastUserNode = node;
            return;
        }

        if (message.role === 'ai') {
            const attachId = message.chatNodeId || lastUserNode?.id || null;
            const targetNode = attachId ? nodeById.get(attachId) : null;
            if (targetNode && !targetNode.replyMessage) {
                targetNode.replyIndex = index;
                targetNode.replyMessage = message;
            }
        }
    });

    orderedNodes.forEach((node) => {
        const parent = node.parentId ? nodeById.get(node.parentId) : null;
        if (parent) {
            parent.children.push(node);
        }
    });

    orderedNodes.forEach((node) => {
        node.children.sort((left, right) => left.order - right.order);
    });

    const assignLabels = (node, numericStep) => {
        const branchFamily = getBranchFamilyNodes(node);
        const hasVariants = branchFamily.length > 1;

        branchFamily.forEach((familyNode, index) => {
            familyNode.numericStep = numericStep;
            familyNode.branchLetter = hasVariants ? indexToBranchLetter(index) : '';
            familyNode.displayLabel = hasVariants
                ? `${numericStep}${familyNode.branchLetter}`
                : String(numericStep);
            familyNode.branchFamilyIndex = index;
            familyNode.branchFamilySize = branchFamily.length;
            familyNode.isRightmostBranchVariant = index === branchFamily.length - 1;
        });

        branchFamily.forEach((familyNode) => {
            const sendChildren = getSendChildren(familyNode);
            sendChildren.forEach((child) => assignLabels(child, numericStep + 1));
        });
    };

    const rootNodes = orderedNodes.filter((node) => !node.parentId || !nodeById.has(node.parentId));
    rootNodes.forEach((node, index) => {
        node.branchKind = node.branchKind || 'send';
        assignLabels(node, index + 1);
    });

    return {
        nodeById,
        orderedNodes,
        rootNodes,
    };
}

function buildHistoryPath(history, targetNodeId) {
    const tree = analyzeChatHistory(history);
    const targetNode = tree.nodeById.get(targetNodeId);
    if (!targetNode) return [];

    const chain = [];
    let current = targetNode;
    while (current) {
        chain.unshift(current);
        current = current.parentId ? tree.nodeById.get(current.parentId) : null;
    }

    const pathHistory = [];
    chain.forEach((node) => {
        pathHistory.push(node.userMessage);
        if (node.replyMessage) {
            pathHistory.push(node.replyMessage);
        }
    });

    return pathHistory;
}

function collectSubtreeNodeIds(history, targetNodeId) {
    const tree = analyzeChatHistory(history);
    const targetNode = tree.nodeById.get(targetNodeId);
    if (!targetNode) return new Set();

    const collected = new Set();
    const queue = [targetNode];
    while (queue.length > 0) {
        const current = queue.shift();
        if (!current || collected.has(current.id)) continue;
        collected.add(current.id);
        current.children.forEach((child) => queue.push(child));
    }

    return collected;
}

function getActiveResponseVariant(message) {
    if (message?.role !== 'ai') return null;
    const normalizedMessage = normalizeAiMessage(message);
    return normalizedMessage.responseVariants[normalizedMessage.activeVariantIndex] || null;
}

function replaceActiveResponseVariant(message, updater) {
    const normalizedMessage = normalizeAiMessage(message);
    const responseVariants = normalizedMessage.responseVariants.map((variant, index) => (
        index === normalizedMessage.activeVariantIndex ? updater(variant) : variant
    ));
    return syncAiMessage(normalizedMessage, responseVariants, normalizedMessage.activeVariantIndex);
}

function appendResponseVariant(message, variant) {
    const normalizedMessage = normalizeAiMessage(message);
    const responseVariants = [...normalizedMessage.responseVariants, variant];
    return syncAiMessage(normalizedMessage, responseVariants, responseVariants.length - 1);
}

function setResponseVariantIndex(message, nextIndex) {
    const normalizedMessage = normalizeAiMessage(message);
    return syncAiMessage(normalizedMessage, normalizedMessage.responseVariants, nextIndex);
}

function parseAiReply(reply, fallbackText) {
    let content = reply || '';
    let pendingAction = null;

    if (content.includes('[ACTION: CREATE_NODE]')) {
        pendingAction = 'CREATE_NODE';
        content = content.replace(/\[ACTION: CREATE_NODE\]/g, '').trim();
    } else if (content.includes('[ACTION: TOGGLE_LOOP_ON]')) {
        pendingAction = 'TOGGLE_LOOP_ON';
        content = content.replace(/\[ACTION: TOGGLE_LOOP_ON\]/g, '').trim();
    } else if (content.includes('[ACTION: TOGGLE_LOOP_OFF]')) {
        pendingAction = 'TOGGLE_LOOP_OFF';
        content = content.replace(/\[ACTION: TOGGLE_LOOP_OFF\]/g, '').trim();
    }

    if (!content && pendingAction) {
        content = fallbackText || 'Action completed.';
    }

    return {
        content,
        pendingAction,
        actionStatus: pendingAction ? 'pending' : null,
    };
}

export default function ChatView({
    node,
    apiKeys,
    onUpdateNodeData,
    onBranchFromChat,
    onNavigateToBranch,
    projectContextPrompt,
    spaceId,
    spaceTitle,
}) {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [input, setInput] = useState('');
    const [chatHistory, setChatHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [generatingPromptIndex, setGeneratingPromptIndex] = useState(null);
    const [copiedIdx, setCopiedIdx] = useState(null);
    const [activeBranchView, setActiveBranchView] = useState(0);
    const [showGoalWizard, setShowGoalWizard] = useState(false);
    const [selectionDraft, setSelectionDraft] = useState(null);
    const [activeExplanation, setActiveExplanation] = useState(null);
    const [isExplaining, setIsExplaining] = useState(false);
    const [workspaceMetaVersion, setWorkspaceMetaVersion] = useState(0);
    const [activePlanSection, setActivePlanSection] = useState('goal');
    const [selectedImprovementVersionId, setSelectedImprovementVersionId] = useState(null);
    const [branchTargetNodeId, setBranchTargetNodeId] = useState(null);
    const [focusedChatNodeId, setFocusedChatNodeId] = useState(null);
    const [chatZoom, setChatZoom] = useState(1);
    const inputRef = useRef(null);
    const messageContentRefs = useRef({});
    const workflowRailRef = useRef(null);
    const workflowSceneRef = useRef(null);
    const chatNodeRefs = useRef({});
    const workflowDragStateRef = useRef({
        active: false,
        pointerId: null,
        startX: 0,
        startY: 0,
        scrollLeft: 0,
        scrollTop: 0,
        moved: false,
    });
    const lastWorkflowDragAtRef = useRef(0);
    const inlineOverlayRef = useRef(null);
    const [isWorkflowDragging, setIsWorkflowDragging] = useState(false);
    const [workflowSceneSize, setWorkflowSceneSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        if (!node) return;
        setChatHistory(normalizeHistory(node.data?.chatHistory || []));
        setGeneratingPromptIndex(null);
        setSelectionDraft(null);
        setActiveExplanation(null);
        setFocusedChatNodeId(null);
    }, [node]);

    useEffect(() => {
        const handleWorkspaceMetaUpdate = () => setWorkspaceMetaVersion((current) => current + 1);
        window.addEventListener('workspaceMetaUpdated', handleWorkspaceMetaUpdate);
        return () => window.removeEventListener('workspaceMetaUpdated', handleWorkspaceMetaUpdate);
    }, []);

    const persistChatHistory = (nextHistory) => {
        const normalized = normalizeHistory(nextHistory);
        setChatHistory(normalized);
        if (node) {
            onUpdateNodeData(node.id, 'chatHistory', normalized);
        }
    };

    const chatTree = useMemo(() => analyzeChatHistory(chatHistory), [chatHistory]);
    const isWorkflowMode = chatTree.rootNodes.length > 0;
    const lastOrderedNode = chatTree.orderedNodes[chatTree.orderedNodes.length - 1] || null;
    const activePromptNodeId = branchTargetNodeId || focusedChatNodeId || lastOrderedNode?.id || null;
    const branchTargetLabel = branchTargetNodeId
        ? chatTree.nodeById.get(branchTargetNodeId)?.displayLabel || ''
        : '';
    const activePromptLabel = activePromptNodeId
        ? chatTree.nodeById.get(activePromptNodeId)?.displayLabel || ''
        : '';

    useEffect(() => {
        if (chatTree.orderedNodes.length === 0) {
            setFocusedChatNodeId(null);
            return;
        }
        setFocusedChatNodeId((current) => (
            current && chatTree.nodeById.has(current)
                ? current
                : lastOrderedNode?.id || null
        ));
    }, [chatTree.nodeById, chatTree.orderedNodes.length, lastOrderedNode?.id]);

    useEffect(() => {
        if (branchTargetNodeId && !chatTree.nodeById.has(branchTargetNodeId)) {
            setBranchTargetNodeId(null);
        }
    }, [branchTargetNodeId, chatTree]);

    useEffect(() => {
        const element = workflowSceneRef.current;
        if (!element) return undefined;

        const updateSize = () => {
            setWorkflowSceneSize({
                width: element.offsetWidth,
                height: element.offsetHeight,
            });
        };

        updateSize();

        const observer = new ResizeObserver(() => updateSize());
        observer.observe(element);
        return () => observer.disconnect();
    }, [chatHistory, chatZoom]);

    const centerChatNode = useCallback((nodeId, behavior = 'smooth') => {
        if (!nodeId) return;
        const viewport = workflowRailRef.current;
        const target = chatNodeRefs.current[nodeId];
        if (!viewport || !target) return;

        const viewportRect = viewport.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const deltaX = (targetRect.left + targetRect.width / 2) - (viewportRect.left + viewport.clientWidth / 2);
        const deltaY = (targetRect.top + targetRect.height / 2) - (viewportRect.top + viewport.clientHeight / 2);

        viewport.scrollTo({
            left: Math.max(0, viewport.scrollLeft + deltaX),
            top: Math.max(0, viewport.scrollTop + deltaY),
            behavior,
        });
    }, []);

    useEffect(() => {
        if (!isWorkflowMode || !activePromptNodeId) return undefined;
        const frame = window.requestAnimationFrame(() => {
            centerChatNode(activePromptNodeId, 'smooth');
        });
        return () => window.cancelAnimationFrame(frame);
    }, [activePromptNodeId, centerChatNode, isWorkflowMode]);

    const closeInlineOverlay = () => {
        setSelectionDraft(null);
        setActiveExplanation(null);
    };

    useEffect(() => {
        if (!selectionDraft && !activeExplanation) return undefined;

        const handlePointerDown = (event) => {
            if (inlineOverlayRef.current?.contains(event.target)) return;
            closeInlineOverlay();
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                closeInlineOverlay();
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [activeExplanation, selectionDraft]);

    const getControlInstructions = () => `

---
[システム指示]
必要だと判断した場合のみ、次のタグを返答に含めてください。
1. 新しいノードを作る提案をする時は [ACTION: CREATE_NODE]
2. ループを有効化する提案をする時は [ACTION: TOGGLE_LOOP_ON]
3. ループを無効化する提案をする時は [ACTION: TOGGLE_LOOP_OFF]
タグを含めると、アプリ側で確認 UI を表示します。
---
    `;

    const callAI = async (history, systemPrompt) => {
        const apiKeyObj = apiKeys?.[node?.data?.selectedApiKey || 0];
        const { key, provider } = resolveModelSelection(apiKeyObj);
        const fullSystemPrompt = [projectContextPrompt, systemPrompt].filter(Boolean).join('\n\n');

        if (!key) return `${t('chat.noApiKey')} (${provider})`;

        try {
            return await requestChatText({
                apiKeyEntry: apiKeyObj,
                history,
                systemPrompt: fullSystemPrompt,
                enableGeminiSearch: true,
            });
        } catch (error) {
            return `Error: ${error.message}`;
        }
    };

    const generateSpaceTitle = async (messageText) => {
        if (!spaceId) return;

        try {
            const apiKeyObj = apiKeys?.[node?.data?.selectedApiKey || 0];
            const { key } = resolveModelSelection(apiKeyObj);
            if (!key) return;
            const titlePrompt = `Create one short Japanese title for this space from the first message below. Return only the title with no quotes or extra punctuation.\n\n${messageText}`;
            let newTitle = (await requestChatText({
                apiKeyEntry: apiKeyObj,
                history: createSingleTurnHistory(titlePrompt),
                maxTokens: 50,
            })).trim();

            newTitle = newTitle.replace(/^["']|["']$/g, '');
            if (!newTitle || newTitle.includes('Untitled')) return;

            const { supabase } = await import('./lib/supabase');
            if (!supabase) return;
            await supabase.from('spaces').update({ title: newTitle }).eq('id', spaceId);
            window.dispatchEvent(new CustomEvent('spaceTitleUpdated'));
        } catch (error) {
            console.error('Title Generation Failed:', error);
        }
    };

    const getInlineExplanations = (message) => {
        const activeVariant = getActiveResponseVariant(message);
        if (!Array.isArray(activeVariant?.inlineExplanations)) return [];
        return [...activeVariant.inlineExplanations].sort((a, b) => a.start - b.start);
    };

    const isReplyCollapsed = (message) => Boolean(message?.collapsed);

    const truncateInlineExplanation = (text) => {
        const normalized = (text || '').replace(/\s+/g, ' ').trim();
        if (normalized.length <= 300) return normalized;
        return `${normalized.slice(0, 297)}...`;
    };

    const openExplanation = (messageIndex, explanationId) => {
        setSelectionDraft(null);
        setActiveExplanation({ messageIndex, explanationId });
    };

    const shiftExplanation = (messageIndex, direction) => {
        const explanations = getInlineExplanations(chatHistory[messageIndex]);
        if (explanations.length === 0) return;

        const activeIndex = explanations.findIndex((item) => item.id === activeExplanation?.explanationId);
        const fallbackIndex = activeIndex >= 0 ? activeIndex : 0;
        const nextIndex = Math.max(0, Math.min(explanations.length - 1, fallbackIndex + direction));
        setActiveExplanation({ messageIndex, explanationId: explanations[nextIndex].id });
    };

    const handleTextSelection = (messageIndex) => {
        const container = messageContentRefs.current[messageIndex];
        const selection = window.getSelection();

        if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
            setSelectionDraft(null);
            return;
        }

        const range = selection.getRangeAt(0);
        if (!container.contains(range.commonAncestorContainer)) {
            setSelectionDraft(null);
            return;
        }

        const rawText = range.toString();
        const selectedText = rawText.trim();
        if (!selectedText) {
            setSelectionDraft(null);
            return;
        }

        const prefixRange = range.cloneRange();
        prefixRange.selectNodeContents(container);
        prefixRange.setEnd(range.startContainer, range.startOffset);

        const leadingWhitespace = rawText.length - rawText.trimStart().length;
        const trailingWhitespace = rawText.length - rawText.trimEnd().length;
        const start = prefixRange.toString().length + leadingWhitespace;
        const end = start + rawText.length - leadingWhitespace - trailingWhitespace;

        const existing = getInlineExplanations(chatHistory[messageIndex]).find((item) => (
            item.start === start && item.end === end
        ));

        if (existing) {
            selection.removeAllRanges();
            openExplanation(messageIndex, existing.id);
            return;
        }

        setActiveExplanation(null);
        setSelectionDraft({
            messageIndex,
            start,
            end,
            text: selectedText,
            overlay: buildInlineOverlayPlacement(container, range, 132) || {
                top: 12,
                left: 12,
                width: 280,
                placement: 'bottom',
            },
        });
    };

    const handleCreateExplanation = async () => {
        if (!selectionDraft || isExplaining) return;

        const sourceMessage = chatHistory[selectionDraft.messageIndex];
        const activeVariant = getActiveResponseVariant(sourceMessage);
        if (!sourceMessage || !activeVariant) return;

        setIsExplaining(true);
        try {
            const sourceContent = activeVariant.content || '';
            const before = sourceContent.slice(Math.max(0, selectionDraft.start - 120), selectionDraft.start);
            const after = sourceContent.slice(selectionDraft.end, Math.min(sourceContent.length, selectionDraft.end + 120));
            const prompt = [
                'Explain the selected passage in concise Japanese.',
                'Rules:',
                '- Keep it within 300 Japanese characters.',
                '- Use plain, easy-to-read language.',
                '- Focus on what the passage means in this context.',
                '',
                `Selected text: "${selectionDraft.text}"`,
                '',
                `Context: ${before}<<${selectionDraft.text}>>${after}`,
            ].join('\n');

            const explanationText = truncateInlineExplanation(await callAI(
                [{ role: 'user', content: prompt }],
                'Return only a short Japanese explanation of the selected text.',
            ));

            const explanation = {
                id: crypto.randomUUID(),
                start: selectionDraft.start,
                end: selectionDraft.end,
                text: selectionDraft.text,
                summary: explanationText,
                overlay: selectionDraft.overlay || null,
            };

            const nextHistory = [...chatHistory];
            const targetMessage = nextHistory[selectionDraft.messageIndex];
            const currentExplanations = getInlineExplanations(targetMessage);
            nextHistory[selectionDraft.messageIndex] = replaceActiveResponseVariant(targetMessage, (variant) => ({
                ...variant,
                inlineExplanations: [...currentExplanations, explanation],
            }));

            persistChatHistory(nextHistory);
            setActiveExplanation({ messageIndex: selectionDraft.messageIndex, explanationId: explanation.id });
            setSelectionDraft(null);
        } finally {
            setIsExplaining(false);
        }
    };

    const handleCopySelection = async () => {
        if (!selectionDraft?.text) return;
        try {
            await navigator.clipboard.writeText(selectionDraft.text);
        } catch (error) {
            console.error('Copy failed:', error);
        }
    };

    const handleSaveSelectionToDictionary = () => {
        if (!selectionDraft?.text || !spaceId) return;

        upsertDictionaryEntry(spaceId, {
            term: selectionDraft.text,
            explanation: '',
            collapsed: true,
        });
        closeInlineOverlay();
        navigate(getDictionaryPath(spaceId));
    };

    const handleQueuePrompt = () => {
        const messageText = input.trim();
        if (!messageText || !node) return;
        const selectedBranchNode = branchTargetNodeId ? chatTree.nodeById.get(branchTargetNodeId) || null : null;
        const parentNodeId = selectedBranchNode?.id || focusedChatNodeId || lastOrderedNode?.id || null;
        const branchKind = selectedBranchNode ? 'branch' : 'send';
        const nextNodeId = crypto.randomUUID();
        const nextHistory = normalizeHistory([
            ...chatHistory,
            {
                role: 'user',
                content: messageText,
                chatNodeId: nextNodeId,
                chatParentId: parentNodeId,
                chatBranchKind: branchKind,
            },
        ]);

        setInput('');
        setBranchTargetNodeId(null);
        setFocusedChatNodeId(nextNodeId);
        persistChatHistory(nextHistory);
    };

    const handleDeletePrompt = (nodeId) => {
        if (!nodeId) return;

        const subtreeIds = collectSubtreeNodeIds(chatHistory, nodeId);
        if (subtreeIds.size === 0) return;

        const nextHistory = normalizeHistory(
            chatHistory.filter((message) => {
                if (!message || typeof message !== 'object') return true;
                const messageNodeId = message.chatNodeId || message.id || null;
                return !subtreeIds.has(messageNodeId);
            }),
        );

        setGeneratingPromptIndex(null);
        setSelectionDraft(null);
        setActiveExplanation(null);
        if (branchTargetNodeId && subtreeIds.has(branchTargetNodeId)) {
            setBranchTargetNodeId(null);
        }
        persistChatHistory(nextHistory);
    };

    const handleSelectBranchTarget = (nodeId) => {
        if (!nodeId) return;
        setFocusedChatNodeId(nodeId);
        setBranchTargetNodeId((current) => (current === nodeId ? null : nodeId));
        centerChatNode(nodeId, 'smooth');
        window.setTimeout(() => {
            inputRef.current?.focus?.();
        }, 0);
    };

    const handleFocusChatNode = (event, nodeId) => {
        if (!nodeId) return;
        if (Date.now() - lastWorkflowDragAtRef.current < 180) return;
        if (isInteractiveDragTarget(event.target)) return;
        if (window.getSelection && String(window.getSelection()).trim()) return;

        setFocusedChatNodeId(nodeId);
        setBranchTargetNodeId(null);
        centerChatNode(nodeId, 'smooth');
        window.setTimeout(() => {
            inputRef.current?.focus?.();
        }, 0);
    };

    const handleCopy = async (content, idx) => {
        try {
            await navigator.clipboard.writeText(content);
            setCopiedIdx(idx);
            window.setTimeout(() => setCopiedIdx(null), 2000);
        } catch (error) {
            console.error('Copy failed:', error);
        }
    };

    const handleToggleReplyCollapse = (replyIndex) => {
        const replyMessage = chatHistory[replyIndex];
        if (!replyMessage || replyMessage.role !== 'ai') return;

        const nextHistory = [...chatHistory];
        nextHistory[replyIndex] = {
            ...normalizeAiMessage(replyMessage),
            collapsed: !isReplyCollapsed(replyMessage),
        };
        persistChatHistory(nextHistory);

        if (!isReplyCollapsed(replyMessage)) {
            setSelectionDraft((current) => (current?.messageIndex === replyIndex ? null : current));
            setActiveExplanation((current) => (current?.messageIndex === replyIndex ? null : current));
        }
    };

    const handleGeneratePrompt = async (nodeId, options = {}) => {
        if (!node || isLoading) return;

        const treeNode = chatTree.nodeById.get(nodeId);
        if (!treeNode) return;

        const userMessage = treeNode.userMessage;
        const existingReplyIndex = chatHistory.findIndex((message) => message.role === 'ai' && (message.chatNodeId === nodeId));
        const shouldAppendVariant = Boolean(options.appendVariant && existingReplyIndex >= 0);
        const wasFirstGeneratedReply = !chatHistory.some((message) => message.role === 'ai');
        const historyForReply = buildHistoryPath(chatHistory, nodeId);

        setSelectionDraft(null);
        setActiveExplanation(null);
        setGeneratingPromptIndex(treeNode.userIndex);
        setIsLoading(true);

        try {
            const reply = await callAI(historyForReply, (node.data?.systemPrompt || '') + getControlInstructions());
            const parsedReply = parseAiReply(reply, t('chat.actionCompleted') || 'Action completed.');
            const nextHistory = [...chatHistory];

            if (existingReplyIndex >= 0) {
                nextHistory[existingReplyIndex] = shouldAppendVariant
                    ? appendResponseVariant(nextHistory[existingReplyIndex], createResponseVariant(parsedReply))
                    : syncAiMessage(
                        { ...normalizeAiMessage(nextHistory[existingReplyIndex]), collapsed: false },
                        [createResponseVariant(parsedReply)],
                        0,
                    );
            } else {
                nextHistory.splice(
                    treeNode.userIndex + 1,
                    0,
                    syncAiMessage(
                        { role: 'ai', collapsed: false, chatNodeId: nodeId, chatParentId: treeNode.parentId || null },
                        [createResponseVariant(parsedReply)],
                        0,
                    ),
                );
            }

            persistChatHistory(nextHistory);

            if (wasFirstGeneratedReply && spaceId) {
                await generateSpaceTitle(userMessage.content);
            }
        } finally {
            setGeneratingPromptIndex(null);
            setIsLoading(false);
        }
    };

    const handleRetry = async (idx) => {
        if (isLoading || !node) return;
        const targetMessage = chatHistory[idx];
        if (!targetMessage || targetMessage.role !== 'ai') return;

        const targetNodeId = targetMessage.chatNodeId || null;
        if (!targetNodeId) return;

        await handleGeneratePrompt(targetNodeId, { appendVariant: true });
    };

    const handleSwitchResponseVariant = (idx, direction) => {
        const targetMessage = chatHistory[idx];
        if (!targetMessage || targetMessage.role !== 'ai') return;

        const normalizedMessage = normalizeAiMessage(targetMessage);
        const nextIndex = Math.max(
            0,
            Math.min(normalizedMessage.responseVariants.length - 1, normalizedMessage.activeVariantIndex + direction),
        );
        if (nextIndex === normalizedMessage.activeVariantIndex) return;

        const nextHistory = [...chatHistory];
        nextHistory[idx] = setResponseVariantIndex(targetMessage, nextIndex);
        persistChatHistory(nextHistory);
        setSelectionDraft(null);
        setActiveExplanation(null);
    };

    const handleActionApprove = (idx) => {
        const message = normalizeAiMessage(chatHistory[idx]);
        const activeVariant = getActiveResponseVariant(message);
        if (!message || !activeVariant?.pendingAction || activeVariant.actionStatus !== 'pending') return;

        if (activeVariant.pendingAction === 'CREATE_NODE' && onBranchFromChat) {
            onBranchFromChat(node.id, chatHistory.slice(0, idx + 1));
            const currentBranchCount = node.data?.branchCount || 0;
            onUpdateNodeData(node.id, 'branchCount', currentBranchCount + 1);
        } else if (activeVariant.pendingAction === 'TOGGLE_LOOP_ON') {
            if (!node.data?.isLooping && node.data?.onToggleLoop) {
                node.data.onToggleLoop(node.id);
            }
        } else if (activeVariant.pendingAction === 'TOGGLE_LOOP_OFF') {
            if (node.data?.isLooping && node.data?.onToggleLoop) {
                node.data.onToggleLoop(node.id);
            }
        }

        const nextHistory = [...chatHistory];
        nextHistory[idx] = replaceActiveResponseVariant(message, (variant) => ({
            ...variant,
            actionStatus: 'approved',
        }));
        persistChatHistory(nextHistory);
    };

    const handleActionReject = (idx) => {
        const message = normalizeAiMessage(chatHistory[idx]);
        const activeVariant = getActiveResponseVariant(message);
        if (!message || !activeVariant?.pendingAction || activeVariant.actionStatus !== 'pending') return;

        const nextHistory = [...chatHistory];
        nextHistory[idx] = replaceActiveResponseVariant(message, (variant) => ({
            ...variant,
            actionStatus: 'rejected',
        }));
        persistChatHistory(nextHistory);
    };

    const renderMessageContent = (message, messageIndex) => {
        if (message.role !== 'ai') return message.content;

        const activeVariant = getActiveResponseVariant(message);
        const content = activeVariant?.content || '';
        const explanations = getInlineExplanations(message);

        if (explanations.length === 0) return content;

        const segments = [];
        let cursor = 0;

        explanations.forEach((item) => {
            if (item.start > cursor) {
                segments.push(
                    <span key={`${item.id}-text`}>
                        {content.slice(cursor, item.start)}
                    </span>,
                );
            }

            segments.push(
                <span
                    key={item.id}
                    onClick={() => openExplanation(messageIndex, item.id)}
                    style={{
                        textDecoration: 'underline dotted rgba(126, 216, 255, 0.92)',
                        textDecorationThickness: '2px',
                        textUnderlineOffset: '5px',
                        cursor: 'pointer',
                    }}
                >
                    {content.slice(item.start, item.end)}
                </span>,
            );

            cursor = item.end;
        });

        if (cursor < content.length) {
            segments.push(<span key={`${messageIndex}-tail`}>{content.slice(cursor)}</span>);
        }

        return segments;
    };

    const isInteractiveDragTarget = (target) => (
        target instanceof Element
        && Boolean(target.closest('button, input, textarea, select, a, [role="button"]'))
    );

    const stopWorkflowDrag = (pointerId = null) => {
        const rail = workflowRailRef.current;
        const currentPointerId = pointerId ?? workflowDragStateRef.current.pointerId;
        if (rail && currentPointerId !== null) {
            try {
                rail.releasePointerCapture?.(currentPointerId);
            } catch {
                // Ignore pointer capture cleanup failures.
            }
        }

        workflowDragStateRef.current = {
            active: false,
            pointerId: null,
            startX: 0,
            startY: 0,
            scrollLeft: 0,
            scrollTop: 0,
            moved: false,
        };
        setIsWorkflowDragging(false);
    };

    const handleWorkflowPointerDown = (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (isInteractiveDragTarget(event.target)) return;

        const rail = workflowRailRef.current;
        if (!rail || (rail.scrollWidth <= rail.clientWidth && rail.scrollHeight <= rail.clientHeight)) return;

        workflowDragStateRef.current = {
            active: true,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            scrollLeft: rail.scrollLeft,
            scrollTop: rail.scrollTop,
            moved: false,
        };
        rail.setPointerCapture?.(event.pointerId);
        setIsWorkflowDragging(true);
    };

    const handleWorkflowPointerMove = (event) => {
        const rail = workflowRailRef.current;
        const dragState = workflowDragStateRef.current;
        if (!rail || !dragState.active) return;

        const deltaX = event.clientX - dragState.startX;
        const deltaY = event.clientY - dragState.startY;
        if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
            dragState.moved = true;
        }
        rail.scrollLeft = dragState.scrollLeft - deltaX;
        rail.scrollTop = dragState.scrollTop - deltaY;
    };

    const handleWorkflowPointerUp = (event) => {
        if (workflowDragStateRef.current.moved) {
            lastWorkflowDragAtRef.current = Date.now();
        }
        stopWorkflowDrag(event.pointerId);
    };

    useEffect(() => () => stopWorkflowDrag(), []);

    const planAccess = useMemo(() => (
        spaceId
            ? getProjectPlanAccess(spaceId)
            : {
                projectId: null,
                project: null,
                isProjectSpace: false,
                isPlanSpace: false,
                planSpaceId: null,
                activeImprovementVersion: null,
            }
    ), [spaceId, workspaceMetaVersion]);
    const improvementVersions = planAccess.project?.improvementVersions || [];
    const activeImprovementVersion = planAccess.activeImprovementVersion || null;
    const selectedImprovementVersion = improvementVersions.find((version) => version.id === selectedImprovementVersionId)
        || activeImprovementVersion
        || null;
    const isViewingArchivedImprovement = Boolean(
        selectedImprovementVersion
        && activeImprovementVersion
        && selectedImprovementVersion.id !== activeImprovementVersion.id,
    );

    useEffect(() => {
        if (!planAccess.isProjectSpace) {
            if (activePlanSection !== 'goal') {
                setActivePlanSection('goal');
            }
            setSelectedImprovementVersionId(null);
            return;
        }

        setSelectedImprovementVersionId((current) => (
            current && improvementVersions.some((version) => version.id === current)
                ? current
                : activeImprovementVersion?.id || null
        ));
    }, [activeImprovementVersion?.id, activePlanSection, improvementVersions, planAccess.isProjectSpace]);

    if (!node) {
        return (
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(180deg, #f7f4f7 0%, #f1eff3 100%)',
                    color: '#7a8091',
                    padding: '2rem',
                    textAlign: 'center',
                }}
            >
                <div>
                    <div style={{ fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                        Session Loading
                    </div>
                    <div style={{ fontSize: '0.96rem', color: '#2d3342' }}>
                        Preparing your chat workspace...
                    </div>
                </div>
            </div>
        );
    }

    const projectPlanSection = planAccess.project?.planSections?.plan || { history: [], interactiveStates: {}, selectedOptions: {} };
    const projectRewardSection = planAccess.project?.planSections?.reward || { history: [], interactiveStates: {}, selectedOptions: {} };
    const selectedImprovementSection = selectedImprovementVersion || { history: [], interactiveStates: {}, selectedOptions: {} };
    const readOnlyMessage = !planAccess.isProjectSpace && activePlanSection !== 'goal'
        ? 'このスペースでは目標のみ編集できます。'
        : activePlanSection !== 'goal' && !planAccess.isPlanSpace
            ? 'このセクションはプロジェクトの Plan Space でのみ編集できます。'
            : activePlanSection === 'improvement' && isViewingArchivedImprovement
                ? '過去バージョンを表示中です。復元するまで編集できません。'
                : '';
    const isPlanSectionReadOnly = Boolean(readOnlyMessage);
    const sectionTabs = [
        { id: 'goal', label: '目標', active: activePlanSection === 'goal', disabled: false },
        ...(planAccess.isProjectSpace ? [
            { id: 'plan', label: '計画', active: activePlanSection === 'plan', disabled: false },
            { id: 'reward', label: '報酬設計', active: activePlanSection === 'reward', disabled: false },
            { id: 'improvement', label: '改善', active: activePlanSection === 'improvement', disabled: false },
        ] : []),
    ];
    const activeWizardConfig = activePlanSection === 'plan'
        ? {
            systemPrompt: PLAN_SECTION_PROMPTS.plan,
            placeholder: 'このプロジェクトで整理したい計画や分岐方針を書いてください...',
            initialHistory: projectPlanSection.history,
            onSaveHistory: (history) => planAccess.projectId && saveProjectPlanSection(planAccess.projectId, 'plan', { ...projectPlanSection, history }),
            initialInteractiveStates: projectPlanSection.interactiveStates,
            initialSelectedOptions: projectPlanSection.selectedOptions,
            onSaveInteractiveStates: (state) => planAccess.projectId && saveProjectPlanSection(planAccess.projectId, 'plan', { ...projectPlanSection, interactiveStates: state }),
            onSaveSelectedOptions: (state) => planAccess.projectId && saveProjectPlanSection(planAccess.projectId, 'plan', { ...projectPlanSection, selectedOptions: state }),
            completionTag: null,
        }
        : activePlanSection === 'reward'
            ? {
                systemPrompt: PLAN_SECTION_PROMPTS.reward,
                placeholder: '報酬設計や Achievement の案を書いてください...',
                initialHistory: projectRewardSection.history,
                onSaveHistory: (history) => planAccess.projectId && saveProjectPlanSection(planAccess.projectId, 'reward', { ...projectRewardSection, history }),
                initialInteractiveStates: projectRewardSection.interactiveStates,
                initialSelectedOptions: projectRewardSection.selectedOptions,
                onSaveInteractiveStates: (state) => planAccess.projectId && saveProjectPlanSection(planAccess.projectId, 'reward', { ...projectRewardSection, interactiveStates: state }),
                onSaveSelectedOptions: (state) => planAccess.projectId && saveProjectPlanSection(planAccess.projectId, 'reward', { ...projectRewardSection, selectedOptions: state }),
                completionTag: null,
            }
            : activePlanSection === 'improvement'
                ? {
                    systemPrompt: PLAN_SECTION_PROMPTS.improvement,
                    placeholder: '改善したい点や、戻したい版の考え方を書いてください...',
                    initialHistory: selectedImprovementSection.history,
                    onSaveHistory: (history) => (
                        planAccess.projectId
                        && selectedImprovementVersion
                        && !isViewingArchivedImprovement
                        && saveProjectImprovementVersion(planAccess.projectId, selectedImprovementVersion.id, { ...selectedImprovementSection, history })
                    ),
                    initialInteractiveStates: selectedImprovementSection.interactiveStates,
                    initialSelectedOptions: selectedImprovementSection.selectedOptions,
                    onSaveInteractiveStates: (state) => (
                        planAccess.projectId
                        && selectedImprovementVersion
                        && !isViewingArchivedImprovement
                        && saveProjectImprovementVersion(planAccess.projectId, selectedImprovementVersion.id, { ...selectedImprovementSection, interactiveStates: state })
                    ),
                    onSaveSelectedOptions: (state) => (
                        planAccess.projectId
                        && selectedImprovementVersion
                        && !isViewingArchivedImprovement
                        && saveProjectImprovementVersion(planAccess.projectId, selectedImprovementVersion.id, { ...selectedImprovementSection, selectedOptions: state })
                    ),
                    completionTag: null,
                }
                : {
                    initialHistory: node.data?.goalHistory || [],
                    onSaveHistory: (history) => onUpdateNodeData(node.id, 'goalHistory', history),
                    initialInteractiveStates: node.data?.goalInteractiveStates || {},
                    initialSelectedOptions: node.data?.goalSelectedOptions || {},
                    onSaveInteractiveStates: (state) => onUpdateNodeData(node.id, 'goalInteractiveStates', state),
                    onSaveSelectedOptions: (state) => onUpdateNodeData(node.id, 'goalSelectedOptions', state),
                    completionTag: '[GOAL_COMPLETE]',
                };

    if (showGoalWizard && node.data?.isStarter) {
        return (
            <GoalWizard
                onClose={() => setShowGoalWizard(false)}
                apiKeys={apiKeys}
                selectedApiKey={node.data?.selectedApiKey || 0}
                onSetGoal={(goalText) => {
                    onUpdateNodeData(node.id, 'systemPrompt', goalText);
                    setShowGoalWizard(false);
                }}
                title={t('goal.title')}
                sectionTabs={sectionTabs}
                activeSectionId={activePlanSection}
                onSelectSection={setActivePlanSection}
                readOnly={isPlanSectionReadOnly}
                readOnlyMessage={readOnlyMessage}
                versionOptions={activePlanSection === 'improvement'
                    ? improvementVersions.map((version) => ({ id: version.id, label: version.version }))
                    : []}
                selectedVersionId={activePlanSection === 'improvement' ? selectedImprovementVersion?.id || '' : ''}
                onSelectVersion={setSelectedImprovementVersionId}
                onCreateVersion={() => planAccess.projectId && createProjectImprovementVersion(planAccess.projectId)}
                onRestoreVersion={() => planAccess.projectId && selectedImprovementVersion && restoreProjectImprovementVersion(planAccess.projectId, selectedImprovementVersion.id)}
                canCreateVersion={activePlanSection === 'improvement' && planAccess.isPlanSpace}
                canRestoreVersion={activePlanSection === 'improvement' && planAccess.isPlanSpace && isViewingArchivedImprovement}
                {...activeWizardConfig}
            />
        );
    }

    const branchCount = node.data?.branchCount || 0;
    const iconActionStyle = {
        width: '30px',
        height: '30px',
        padding: 0,
        gap: 0,
        border: '1px solid rgba(68, 76, 95, 0.12)',
        borderRadius: '999px',
        background: 'rgba(255, 255, 255, 0.82)',
        color: '#707789',
        boxShadow: '0 6px 12px rgba(31, 35, 45, 0.08)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        fontSize: 0,
        lineHeight: 0,
    };
    const promptTriggerButtonStyle = {
        ...iconActionStyle,
        color: '#5e67a2',
        background: 'rgba(255,255,255,0.92)',
    };
    const branchTriggerButtonStyle = {
        ...iconActionStyle,
        color: '#5e67a2',
        background: 'rgba(255,255,255,0.92)',
    };
    const avatarColumnStyle = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.3rem',
        flexShrink: 0,
    };
    const userDeleteButtonStyle = {
        width: '22px',
        height: '22px',
        padding: 0,
        borderRadius: '999px',
        border: '1px solid rgba(122, 104, 159, 0.14)',
        background: 'rgba(255, 255, 255, 0.82)',
        color: '#8268a7',
        boxShadow: '0 5px 10px rgba(133, 110, 176, 0.12)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
    };
    const actionStripStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: '0.28rem',
        flexWrap: 'wrap',
    };
    const cardActionStyle = {
        padding: '0.42rem 0.82rem',
        borderRadius: '999px',
        border: '1px solid rgba(123, 145, 190, 0.22)',
        background: 'rgba(255,255,255,0.76)',
        color: '#53617c',
        fontSize: '0.76rem',
        cursor: 'pointer',
    };
    const userBubbleStyle = {
        background: 'linear-gradient(180deg, #ebe2f9 0%, #e3d7f5 100%)',
        color: '#4f396f',
        padding: '0.78rem 1.2rem',
        borderRadius: '22px',
        boxShadow: '0 10px 22px rgba(174, 150, 223, 0.22)',
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
        fontSize: '0.94rem',
        lineHeight: 1.72,
        border: '1px solid rgba(190, 174, 224, 0.5)',
    };
    const assistantBubbleStyle = {
        background: '#ffffff',
        color: '#22252f',
        padding: '0.9rem 1.15rem',
        borderRadius: '22px',
        boxShadow: '0 14px 30px rgba(30, 34, 44, 0.12)',
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
        fontSize: '0.94rem',
        lineHeight: 1.78,
        border: '1px solid rgba(34, 37, 47, 0.06)',
    };
    const renderConversationColumn = (treeNode) => {
        const userMessage = treeNode.userIndex !== null ? chatHistory[treeNode.userIndex] : null;
        const replyMessage = treeNode.replyIndex !== null ? normalizeAiMessage(chatHistory[treeNode.replyIndex]) : null;
        const replyCollapsed = replyMessage ? isReplyCollapsed(replyMessage) : false;
        const replyVariant = replyMessage ? getActiveResponseVariant(replyMessage) : null;
        const displayedReplyContent = replyVariant?.content || replyMessage?.content || '';
        const pendingAction = replyVariant?.pendingAction || null;
        const actionStatus = replyVariant?.actionStatus || null;
        const responseVariantCount = replyMessage?.responseVariants?.length || 0;
        const activeResponseVariantIndex = replyMessage?.activeVariantIndex || 0;
        const hasPreviousResponseVariant = responseVariantCount > 1 && activeResponseVariantIndex > 0;
        const hasNextResponseVariant = responseVariantCount > 1 && activeResponseVariantIndex < responseVariantCount - 1;
        const canGeneratePrompt = userMessage && treeNode.replyIndex === null;
        const isGeneratingPrompt = userMessage && generatingPromptIndex === treeNode.userIndex;
        const replyExplanations = replyMessage ? getInlineExplanations(replyMessage) : [];
        const activeExplanationIndex = replyExplanations.findIndex((item) => item.id === activeExplanation?.explanationId);
        const currentExplanation = activeExplanation?.messageIndex === treeNode.replyIndex && activeExplanationIndex >= 0
            ? replyExplanations[activeExplanationIndex]
            : null;
        const isSelectionOverlayVisible = selectionDraft?.messageIndex === treeNode.replyIndex;
        const isExplanationOverlayVisible = Boolean(currentExplanation);
        const isBranchTarget = branchTargetNodeId === treeNode.id;
        const isFocusedNode = focusedChatNodeId === treeNode.id;
        const columnWidth = 'clamp(280px, 44vw, 430px)';
        const columnShellStyle = {
            flex: `0 0 ${columnWidth}`,
            width: columnWidth,
            minWidth: columnWidth,
            padding: '1rem 0.95rem 1.05rem',
            borderRadius: '30px',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.86) 0%, rgba(247,243,250,0.96) 100%)',
            border: isBranchTarget
                ? '2px solid rgba(92, 124, 250, 0.58)'
                : isFocusedNode
                    ? '2px solid rgba(143, 127, 232, 0.52)'
                    : '1px solid rgba(126, 136, 166, 0.12)',
            boxShadow: isBranchTarget
                ? '0 20px 42px rgba(92, 124, 250, 0.16)'
                : isFocusedNode
                    ? '0 22px 42px rgba(143, 127, 232, 0.18)'
                    : '0 18px 38px rgba(24, 27, 35, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            position: 'relative',
            minHeight: '220px',
            cursor: 'pointer',
            transition: 'transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease',
            transform: isFocusedNode ? 'translateY(-2px)' : 'translateY(0)',
        };
        const bubbleWidthStyle = {
            maxWidth: '100%',
            width: '100%',
        };
        const actionCardWidth = 'min(400px, calc(100% - 2.5rem))';
        const selectionOverlayPlacement = selectionDraft?.overlay || {
            top: 12,
            left: 12,
            width: 280,
        };
        const explanationOverlayPlacement = currentExplanation?.overlay || {
            top: 12,
            left: 12,
            width: 320,
        };
        const selectionOverlayButtonStyle = {
            ...cardActionStyle,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.28rem',
            padding: '0.35rem 0.55rem',
            fontSize: '0.72rem',
        };

        return (
            <div
                key={treeNode.id}
                ref={(element) => {
                    if (element) chatNodeRefs.current[treeNode.id] = element;
                    else delete chatNodeRefs.current[treeNode.id];
                }}
                data-chat-column-shell="true"
                style={columnShellStyle}
                onClick={(event) => handleFocusChatNode(event, treeNode.id)}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.45rem', paddingLeft: '0.1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '999px', background: 'rgba(116, 129, 255, 0.82)' }} />
                        <span style={{ fontSize: '0.74rem', letterSpacing: '0.04em', color: '#7a8194', fontWeight: 700 }}>
                            {treeNode.displayLabel || treeNode.numericStep}
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.32rem' }}>
                        {isFocusedNode && !isBranchTarget && (
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#755fd6', background: 'rgba(143,127,232,0.12)', border: '1px solid rgba(143,127,232,0.18)', borderRadius: '999px', padding: '0.16rem 0.48rem' }}>
                                送信先
                            </span>
                        )}
                        {isBranchTarget && (
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#4f63d9', background: 'rgba(92,124,250,0.1)', border: '1px solid rgba(92,124,250,0.18)', borderRadius: '999px', padding: '0.16rem 0.48rem' }}>
                                分岐先
                            </span>
                        )}
                    </div>
                </div>

                {userMessage && (
                    <div
                        className="chat-msg-wrapper"
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            animation: 'fadeIn 0.2s ease',
                            width: '100%',
                            minWidth: 0,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                gap: '0.65rem',
                                flexDirection: 'row-reverse',
                                maxWidth: isWorkflowMode ? '100%' : '78%',
                                minWidth: 0,
                                width: isWorkflowMode ? '100%' : 'auto',
                            }}
                        >
                            <div style={avatarColumnStyle}>
                                <div
                                    style={{
                                        width: '34px',
                                        height: '34px',
                                        borderRadius: '50%',
                                        background: '#eadff8',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: '0 8px 20px rgba(174, 150, 223, 0.2)',
                                    }}
                                >
                                    <User size={14} color="#664b8d" />
                                </div>
                                <button
                                    onClick={() => handleDeletePrompt(treeNode.id)}
                                    style={userDeleteButtonStyle}
                                    title="この候補を削除"
                                    aria-label="この候補を削除"
                                >
                                    <Trash2 size={11} />
                                </button>
                            </div>
                            <div
                                style={{
                                    ...userBubbleStyle,
                                    ...bubbleWidthStyle,
                                    minWidth: 0,
                                    maxHeight: 'calc(1.72em * 30 + 2rem)',
                                    overflowY: 'auto',
                                }}
                            >
                                {userMessage.content}
                            </div>
                        </div>

                        <div
                            style={{
                                marginTop: '0.35rem',
                                marginRight: '2.55rem',
                                alignSelf: 'flex-end',
                                ...actionStripStyle,
                                justifyContent: 'flex-end',
                                maxWidth: isWorkflowMode ? 'calc(100% - 2.55rem)' : undefined,
                            }}
                        >
                            {treeNode.replyIndex !== null && (
                                <button
                                    onClick={() => handleToggleReplyCollapse(treeNode.replyIndex)}
                                    style={iconActionStyle}
                                    title={replyCollapsed ? '返信を展開' : '返信を折りたたむ'}
                                    aria-label={replyCollapsed ? '返信を展開' : '返信を折りたたむ'}
                                >
                                    {replyCollapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
                                    {replyCollapsed ? '返信を展開' : '返信を折りたたむ'}
                                </button>
                            )}

                            {canGeneratePrompt && (
                                <button
                                    onClick={() => handleGeneratePrompt(treeNode.id)}
                                    disabled={isLoading}
                                    style={promptTriggerButtonStyle}
                                    title="質問を送る"
                                    aria-label="質問を送る"
                                >
                                    {isGeneratingPrompt ? <RefreshCw size={11} /> : <Send size={11} />}
                                </button>
                            )}
                            {treeNode.isRightmostBranchVariant && (
                                <button
                                    type="button"
                                    onClick={() => handleSelectBranchTarget(treeNode.id)}
                                    style={{
                                        ...branchTriggerButtonStyle,
                                        border: branchTargetNodeId === treeNode.id
                                            ? '1px solid rgba(92, 124, 250, 0.36)'
                                            : branchTriggerButtonStyle.border,
                                        background: branchTargetNodeId === treeNode.id
                                            ? 'rgba(92, 124, 250, 0.14)'
                                            : branchTriggerButtonStyle.background,
                                        color: branchTargetNodeId === treeNode.id ? '#4f63d9' : branchTriggerButtonStyle.color,
                                    }}
                                    title="分岐を追加"
                                    aria-label="分岐を追加"
                                >
                                    <GitBranch size={11} />
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {replyMessage && !replyCollapsed && (
                    <div
                        className="chat-msg-wrapper"
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            animation: 'fadeIn 0.2s ease',
                            width: '100%',
                            minWidth: 0,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                gap: '0.65rem',
                                flexDirection: 'row',
                                maxWidth: isWorkflowMode ? '100%' : '72%',
                                minWidth: 0,
                                width: isWorkflowMode ? '100%' : 'auto',
                            }}
                        >
                            <div style={avatarColumnStyle}>
                                <div
                                    style={{
                                        width: '34px',
                                        height: '34px',
                                        borderRadius: '50%',
                                        background: '#ffffff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: '0 10px 20px rgba(29, 33, 44, 0.08)',
                                    }}
                                    >
                                    <Bot size={14} color="#6f7688" />
                                </div>
                            </div>
                            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                                {hasPreviousResponseVariant && (
                                    <button
                                        type="button"
                                        onClick={() => handleSwitchResponseVariant(treeNode.replyIndex, -1)}
                                        aria-label="Previous reply"
                                        style={{
                                            ...iconActionStyle,
                                            position: 'absolute',
                                            left: '-0.65rem',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            zIndex: 2,
                                            width: '30px',
                                            height: '30px',
                                            borderRadius: '50%',
                                            background: 'rgba(255,255,255,0.96)',
                                            boxShadow: '0 10px 24px rgba(17, 31, 66, 0.10)',
                                        }}
                                    >
                                        <ChevronLeft size={14} />
                                    </button>
                                )}
                                {hasNextResponseVariant && (
                                    <button
                                        type="button"
                                        onClick={() => handleSwitchResponseVariant(treeNode.replyIndex, 1)}
                                        aria-label="Next reply"
                                        style={{
                                            ...iconActionStyle,
                                            position: 'absolute',
                                            right: '-0.65rem',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            zIndex: 2,
                                            width: '30px',
                                            height: '30px',
                                            borderRadius: '50%',
                                            background: 'rgba(255,255,255,0.96)',
                                            boxShadow: '0 10px 24px rgba(17, 31, 66, 0.10)',
                                        }}
                                    >
                                        <ChevronRight size={14} />
                                    </button>
                                )}
                                <div
                                    ref={(element) => {
                                        if (element) messageContentRefs.current[treeNode.replyIndex] = element;
                                        else delete messageContentRefs.current[treeNode.replyIndex];
                                    }}
                                    onMouseUp={() => setTimeout(() => handleTextSelection(treeNode.replyIndex), 0)}
                                    onTouchEnd={() => setTimeout(() => handleTextSelection(treeNode.replyIndex), 0)}
                                    style={{
                                        ...assistantBubbleStyle,
                                        ...bubbleWidthStyle,
                                        minWidth: 0,
                                        maxHeight: 'calc(1.78em * 30 + 2rem)',
                                        overflowY: 'auto',
                                        opacity: isSelectionOverlayVisible || isExplanationOverlayVisible ? 0.68 : 1,
                                        filter: 'none',
                                        userSelect: isSelectionOverlayVisible || isExplanationOverlayVisible ? 'none' : 'text',
                                    }}
                                >
                                    {responseVariantCount > 1 && (
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                marginBottom: '0.55rem',
                                                fontSize: '0.7rem',
                                                color: '#8b91a1',
                                                fontWeight: 600,
                                            }}
                                        >
                                            {activeResponseVariantIndex + 1}/{responseVariantCount}
                                        </div>
                                    )}
                                    {renderMessageContent(replyMessage, treeNode.replyIndex)}
                                </div>
                            </div>
                        </div>

                        {(isSelectionOverlayVisible || isExplanationOverlayVisible) && (
                            <>
                                {isSelectionOverlayVisible && selectionDraft && (
                                    <div
                                        ref={inlineOverlayRef}
                                        style={{
                                            position: 'absolute',
                                            top: `${selectionOverlayPlacement.top}px`,
                                            left: `${selectionOverlayPlacement.left}px`,
                                            width: `${selectionOverlayPlacement.width}px`,
                                            maxWidth: 'calc(100% - 16px)',
                                            zIndex: 6,
                                            padding: '0.72rem 0.78rem',
                                            borderRadius: '16px',
                                            background: 'linear-gradient(180deg, rgba(235,242,255,0.98) 0%, rgba(222,233,255,0.95) 100%)',
                                            border: '1px solid rgba(125,161,255,0.48)',
                                            boxShadow: '0 16px 34px rgba(17,31,66,0.18)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.55rem',
                                            minWidth: 0,
                                            pointerEvents: 'auto',
                                        }}
                                    >
                                        <div style={{ fontSize: '0.84rem', color: '#22314d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <Sparkles size={14} color="#63a9ff" />
                                            選択範囲の説明を作成
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#5b79d9', lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: '4.6rem', overflow: 'auto' }}>
                                            {selectionDraft.text}
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.38rem' }}>
                                            <button style={selectionOverlayButtonStyle} onClick={handleCopySelection}>
                                                <Copy size={12} /> コピー
                                            </button>
                                            <button style={selectionOverlayButtonStyle} onClick={handleSaveSelectionToDictionary}>
                                                <BookOpen size={12} /> 辞書
                                            </button>
                                            <button style={selectionOverlayButtonStyle} onClick={handleCreateExplanation} disabled={isExplaining}>
                                                <Sparkles size={12} /> {isExplaining ? '生成中...' : '説明'}
                                            </button>
                                            <button style={selectionOverlayButtonStyle} onClick={closeInlineOverlay}>
                                                <X size={12} /> 閉じる
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {isExplanationOverlayVisible && currentExplanation && (
                                    <div
                                        ref={inlineOverlayRef}
                                        style={{
                                            position: 'absolute',
                                            top: `${explanationOverlayPlacement.top}px`,
                                            left: `${explanationOverlayPlacement.left}px`,
                                            width: `${explanationOverlayPlacement.width}px`,
                                            maxWidth: 'calc(100% - 16px)',
                                            zIndex: 6,
                                            padding: '0.88rem 0.95rem',
                                            borderRadius: '18px',
                                            background: 'linear-gradient(180deg, rgba(235,242,255,0.98) 0%, rgba(219,231,255,0.95) 100%)',
                                            border: '1px solid rgba(125,161,255,0.42)',
                                            boxShadow: '0 18px 36px rgba(17,31,66,0.18)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.62rem',
                                            minWidth: 0,
                                            pointerEvents: 'auto',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.7rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <div style={{ fontSize: '0.84rem', color: '#22314d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <Sparkles size={14} color="#63a9ff" />
                                                説明
                                            </div>
                                            {replyExplanations.length > 1 && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <button style={iconActionStyle} disabled={activeExplanationIndex <= 0} onClick={() => shiftExplanation(treeNode.replyIndex, -1)} aria-label="前の説明">
                                                        <ChevronLeft size={12} />
                                                    </button>
                                                    <span style={{ fontSize: '0.72rem', color: '#63779a', minWidth: '36px', textAlign: 'center' }}>
                                                        {activeExplanationIndex + 1}/{replyExplanations.length}
                                                    </span>
                                                    <button style={iconActionStyle} disabled={activeExplanationIndex >= replyExplanations.length - 1} onClick={() => shiftExplanation(treeNode.replyIndex, 1)} aria-label="次の説明">
                                                        <ChevronRight size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#5b79d9', lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: '4.8rem', overflow: 'auto' }}>
                                            {currentExplanation.text}
                                        </div>
                                        <div style={{ fontSize: '0.84rem', color: '#22314d', lineHeight: 1.85, whiteSpace: 'pre-wrap', maxHeight: '6rem', overflow: 'auto' }}>
                                            {currentExplanation.summary}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                                            <button style={cardActionStyle} onClick={() => openExplanation(treeNode.replyIndex, currentExplanation.id)}>
                                                もう一度見る
                                            </button>
                                            <button style={cardActionStyle} onClick={closeInlineOverlay}>
                                                <X size={12} /> 閉じる
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                        {pendingAction && (
                            <div
                                style={{
                                    marginLeft: '2.7rem',
                                    marginTop: '0.5rem',
                                    padding: '0.85rem 1rem',
                                    background: 'rgba(92, 124, 250, 0.08)',
                                    border: '1px solid rgba(92, 124, 250, 0.25)',
                                    borderRadius: '12px',
                                    display: 'inline-flex',
                                    flexDirection: 'column',
                                    gap: '0.6rem',
                                    width: actionCardWidth,
                                    maxWidth: isWorkflowMode ? 'none' : '400px',
                                    minWidth: 0,
                                    animation: 'fadeIn 0.3s ease',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: 500 }}>
                                    <Bot size={14} color="var(--primary)" />
                                    {pendingAction === 'CREATE_NODE'
                                        ? t('chat.aiSuggestsBranch')
                                        : pendingAction === 'TOGGLE_LOOP_ON'
                                            ? t('chat.aiSuggestsLoopOn')
                                            : 'AI Suggests Action'}
                                </div>

                                {actionStatus === 'pending' ? (
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => handleActionApprove(treeNode.replyIndex)}
                                            style={{
                                                padding: '0.4rem 0.8rem',
                                                background: 'var(--primary)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                fontSize: '0.8rem',
                                                cursor: 'pointer',
                                                transition: 'var(--transition-smooth)',
                                                fontWeight: 500,
                                            }}
                                        >
                                            <Check size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-2px' }} />
                                            {t('chat.approve')}
                                        </button>
                                        <button
                                            onClick={() => handleActionReject(treeNode.replyIndex)}
                                            style={{
                                                padding: '0.4rem 0.8rem',
                                                background: 'rgba(255,100,100,0.15)',
                                                color: '#ff6b6b',
                                                border: '1px solid rgba(255,100,100,0.3)',
                                                borderRadius: '6px',
                                                fontSize: '0.8rem',
                                                cursor: 'pointer',
                                                transition: 'var(--transition-smooth)',
                                            }}
                                        >
                                            {t('chat.reject')}
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ color: actionStatus === 'approved' ? 'var(--action)' : 'var(--text-muted)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        {actionStatus === 'approved' ? <Check size={12} /> : null}
                                        {actionStatus === 'approved' ? t('chat.actionExecuted') : t('chat.actionRejected')}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="chat-actions" style={{ marginLeft: '2.7rem', marginTop: '0.4rem', ...actionStripStyle }}>
                            <button style={iconActionStyle} onClick={() => handleCopy(displayedReplyContent, treeNode.replyIndex)} title={copiedIdx === treeNode.replyIndex ? t('chat.copied') : t('chat.copy')} aria-label={copiedIdx === treeNode.replyIndex ? t('chat.copied') : t('chat.copy')}>
                                {copiedIdx === treeNode.replyIndex ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                            <button style={iconActionStyle} onClick={() => handleRetry(treeNode.replyIndex)} disabled={isLoading} title={t('chat.retry')} aria-label={t('chat.retry')}>
                                <RefreshCw size={14} />
                            </button>

                            {branchCount > 0 && (
                                <div style={{ ...actionStripStyle, paddingLeft: '0.28rem', marginLeft: '0.08rem', borderLeft: '1px solid rgba(68, 76, 95, 0.12)' }}>
                                    <button
                                        style={iconActionStyle}
                                        disabled={activeBranchView <= 0}
                                        onClick={() => setActiveBranchView((value) => Math.max(0, value - 1))}
                                        aria-label="Previous branch"
                                    >
                                        <ChevronLeft size={14} />
                                    </button>
                                    <span style={{ fontSize: '0.7rem', color: '#8b91a1', minWidth: '20px', textAlign: 'center' }}>
                                        {activeBranchView + 1}
                                    </span>
                                    <button
                                        style={iconActionStyle}
                                        disabled={activeBranchView >= branchCount}
                                        onClick={() => setActiveBranchView((value) => Math.min(branchCount, value + 1))}
                                        aria-label="Next branch"
                                    >
                                        <ChevronRight size={14} />
                                    </button>

                                    {activeBranchView > 0 && onNavigateToBranch && (
                                        <button
                                            style={iconActionStyle}
                                            onClick={() => onNavigateToBranch(node.id, activeBranchView)}
                                            title={t('chat.moveTo')}
                                            aria-label={t('chat.moveTo')}
                                        >
                                            <ExternalLink size={14} />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderChatNodeTree = (treeNode) => {
        const branchFamily = getBranchFamilyNodes(treeNode);
        const connectorStroke = 'rgba(125,161,255,0.56)';

        return (
            <div key={treeNode.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.9rem', minWidth: 0, width: 'fit-content', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '2.25rem', minWidth: 0, width: 'fit-content', position: 'relative', paddingTop: branchFamily.length > 1 ? '1.2rem' : 0 }}>
                    {branchFamily.map((familyNode, index) => {
                        const sendChildren = getSendChildren(familyNode);

                        return (
                            <div key={familyNode.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.45rem', minWidth: 0, position: 'relative' }}>
                                {branchFamily.length > 1 && (
                                    <>
                                        <div style={{ position: 'absolute', top: '-1.2rem', left: '50%', width: '2px', height: '1.2rem', transform: 'translateX(-50%)', borderRadius: '999px', background: connectorStroke }} />
                                        {index < branchFamily.length - 1 && (
                                            <div style={{ position: 'absolute', top: '-1.2rem', left: '50%', width: 'calc(100% + 2.25rem)', height: '2px', borderRadius: '999px', background: connectorStroke }} />
                                        )}
                                    </>
                                )}
                                {renderConversationColumn(familyNode)}
                                {sendChildren.length > 0 && (
                                    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.9rem', paddingTop: '1.35rem', minWidth: 0 }}>
                                        <div style={{ position: 'absolute', top: 0, left: '50%', width: '2px', height: '1.35rem', transform: 'translateX(-50%)', borderRadius: '999px', background: connectorStroke }} />
                                        {sendChildren.map((child) => renderChatNodeTree(child))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const handleWorkflowWheel = useCallback((event) => {
        if (!isWorkflowMode) return;
        event.preventDefault();

        const viewport = workflowRailRef.current;
        if (!viewport) return;

        const nextZoom = Math.min(1.6, Math.max(0.72, Number((chatZoom + (event.deltaY < 0 ? 0.08 : -0.08)).toFixed(2))));
        if (nextZoom === chatZoom) return;

        const rect = viewport.getBoundingClientRect();
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;
        const contentX = viewport.scrollLeft + pointerX;
        const contentY = viewport.scrollTop + pointerY;
        const ratio = nextZoom / chatZoom;

        setChatZoom(nextZoom);
        window.requestAnimationFrame(() => {
            viewport.scrollLeft = Math.max(0, contentX * ratio - pointerX);
            viewport.scrollTop = Math.max(0, contentY * ratio - pointerY);
        });
    }, [chatZoom, isWorkflowMode]);

    return (
        <div
            style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                background: 'linear-gradient(180deg, #f7f4f7 0%, #f1eff3 100%)',
                height: '100%',
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    padding: '0.9rem 1.7rem 0.35rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    minWidth: 0,
                    gap: '0.75rem',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    {node.data?.isStarter && (
                        <button
                            onClick={() => setShowGoalWizard(true)}
                            style={{
                                background: '#ffffff',
                                color: node.data?.systemPrompt ? '#278f66' : '#5f58a8',
                                border: `1px solid ${node.data?.systemPrompt ? 'rgba(39,143,102,0.18)' : 'rgba(119,104,188,0.16)'}`,
                                borderRadius: '999px',
                                padding: '0.42rem 0.92rem',
                                fontSize: '0.8rem',
                                fontWeight: 500,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                transition: 'all 0.2s',
                                fontFamily: 'inherit',
                                boxShadow: '0 8px 20px rgba(28, 33, 45, 0.06)',
                            }}
                        >
                            <Target size={13} />
                            {t('goal.title')}
                        </button>
                    )}
                </div>
                <select
                    className="node-select-sm"
                    value={node.data?.selectedApiKey || 0}
                    onChange={(event) => onUpdateNodeData(node.id, 'selectedApiKey', parseInt(event.target.value, 10))}
                    style={{ maxWidth: '148px', flexShrink: 0, background: '#ffffff', color: '#4f5565', border: '1px solid rgba(31, 41, 55, 0.08)', boxShadow: '0 8px 20px rgba(28, 33, 45, 0.06)' }}
                    title={t('chat.modelSelect')}
                >
                    {apiKeys?.map((item, index) => (
                        <option key={index} value={index}>
                            Key {index + 1} ({item?.provider || 'openai'})
                        </option>
                    ))}
                </select>
            </div>

            <div
                style={{
                    flex: 1,
                    overflow: 'hidden',
                    padding: '1.25rem 1.6rem 0.8rem',
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0,
                    minHeight: 0,
                    position: 'relative',
                }}
            >
                {chatHistory.length === 0 ? (
                    <div
                        style={{
                            margin: 'auto',
                            textAlign: 'center',
                            color: '#7a8091',
                            animation: 'fadeSlideUp 0.5s ease',
                        }}
                    >
                        <Bot size={40} style={{ opacity: 0.22, marginBottom: '0.9rem' }} />
                        <p style={{ fontSize: '0.96rem', fontWeight: 400 }}>{t('chat.empty')}</p>
                    </div>
                ) : (
                    <>
                        <div
                            ref={workflowRailRef}
                            onPointerDown={isWorkflowMode ? handleWorkflowPointerDown : undefined}
                            onPointerMove={isWorkflowMode ? handleWorkflowPointerMove : undefined}
                            onPointerUp={isWorkflowMode ? handleWorkflowPointerUp : undefined}
                            onPointerCancel={isWorkflowMode ? handleWorkflowPointerUp : undefined}
                            onPointerLeave={isWorkflowMode ? handleWorkflowPointerUp : undefined}
                            onWheel={isWorkflowMode ? handleWorkflowWheel : undefined}
                            style={{
                                flex: 1,
                                minWidth: 0,
                                minHeight: 0,
                                width: '100%',
                                overflow: isWorkflowMode ? 'auto' : 'hidden',
                                paddingBottom: '1rem',
                                cursor: isWorkflowMode ? (isWorkflowDragging ? 'grabbing' : 'grab') : 'default',
                                userSelect: isWorkflowMode && isWorkflowDragging ? 'none' : 'auto',
                                touchAction: isWorkflowMode ? 'none' : 'auto',
                                scrollbarWidth: isWorkflowMode ? 'thin' : 'none',
                            }}
                        >
                            <div
                                style={{
                                    width: `${Math.max(workflowSceneSize.width * chatZoom + 96, 0)}px`,
                                    height: `${Math.max(workflowSceneSize.height * chatZoom + 72, 0)}px`,
                                    minWidth: '100%',
                                    minHeight: '100%',
                                    padding: '0.35rem 0.75rem 1rem',
                                    boxSizing: 'border-box',
                                }}
                            >
                                <div
                                    ref={workflowSceneRef}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '1.75rem',
                                        width: 'max-content',
                                        minWidth: 'max-content',
                                        transform: `scale(${chatZoom})`,
                                        transformOrigin: 'top left',
                                    }}
                                >
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.45rem', paddingTop: '0.1rem' }}>
                                        <div style={{ width: '2px', height: '18px', background: 'linear-gradient(180deg, rgba(125,161,255,0.62) 0%, rgba(125,161,255,0.08) 100%)' }} />
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.38rem',
                                                color: '#2a3242',
                                                fontSize: '1.05rem',
                                                fontWeight: 700,
                                                letterSpacing: '0.03em',
                                                textAlign: 'center',
                                                whiteSpace: 'nowrap',
                                                fontFamily: 'inherit',
                                            }}
                                        >
                                            {spaceTitle || t('editor.untitled')}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', width: '100%' }}>
                                        {chatTree.rootNodes.map((treeNode) => renderChatNodeTree(treeNode))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
                {isLoading && (
                    <div style={{ position: 'absolute', left: '1.85rem', bottom: '1rem', display: 'flex', gap: '0.65rem', animation: 'pulse 1.5s infinite', marginLeft: '0.2rem', zIndex: 3 }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 10px 20px rgba(29, 33, 44, 0.08)' }}>
                            <Bot size={14} color="#6f7688" />
                        </div>
                        <div style={{ padding: '0.78rem 1.08rem', color: '#6f7688', fontSize: '0.88rem', background: '#ffffff', borderRadius: '18px', boxShadow: '0 14px 28px rgba(29, 33, 44, 0.08)' }}>
                            {t('chat.generating')}
                        </div>
                    </div>
                )}
            </div>

            <div style={{ padding: '1rem 1.5rem 1.3rem' }}>
                <div
                    style={{
                        display: 'flex',
                        background: 'rgba(255,255,255,0.96)',
                        border: '1px solid rgba(38, 43, 53, 0.08)',
                        boxShadow: '0 16px 34px rgba(29, 33, 44, 0.08)',
                        borderRadius: '28px',
                        overflow: 'hidden',
                        padding: '0.45rem 0.45rem 0.45rem 1.15rem',
                        alignItems: 'flex-end',
                        maxWidth: '820px',
                        margin: '0 auto',
                        minHeight: '56px',
                        minWidth: 0,
                    }}
                >
                    {activePromptLabel && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                alignSelf: 'center',
                                marginRight: '0.75rem',
                                padding: '0.3rem 0.6rem',
                                borderRadius: '999px',
                                background: branchTargetLabel ? 'rgba(92,124,250,0.1)' : 'rgba(143,127,232,0.1)',
                                border: branchTargetLabel ? '1px solid rgba(92,124,250,0.18)' : '1px solid rgba(143,127,232,0.18)',
                                color: branchTargetLabel ? '#4f63d9' : '#755fd6',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {branchTargetLabel ? `分岐先 ${branchTargetLabel}` : `送信先 ${activePromptLabel}`}
                            {branchTargetLabel && (
                                <button
                                    type="button"
                                    onClick={() => setBranchTargetNodeId(null)}
                                    style={{ ...iconActionStyle, width: '20px', height: '20px', background: 'transparent', boxShadow: 'none', border: 'none', color: '#4f63d9' }}
                                    aria-label="分岐先を解除"
                                    title="分岐先を解除"
                                >
                                    <X size={11} />
                                </button>
                            )}
                        </div>
                    )}
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                handleQueuePrompt();
                            }
                        }}
                        placeholder={branchTargetLabel ? `分岐先 ${branchTargetLabel} への質問を入力` : activePromptLabel ? `送信先 ${activePromptLabel} への質問を入力` : t('chat.placeholder')}
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            color: '#232734',
                            resize: 'none',
                            outline: 'none',
                            padding: '0.5rem 0',
                            minHeight: '32px',
                            maxHeight: '150px',
                            fontSize: '0.95rem',
                            fontFamily: 'inherit',
                            lineHeight: 1.5,
                        }}
                        rows={1}
                    />
                    <button
                        onClick={handleQueuePrompt}
                        disabled={!input.trim()}
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            background: input.trim() ? '#8f7fe8' : '#ece7f6',
                            color: input.trim() ? 'white' : '#a09ab4',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: input.trim() ? 'pointer' : 'default',
                            transition: 'all 0.2s',
                        }}
                    >
                        <Send size={16} />
                    </button>
                </div>
                <div style={{ display: 'none' }}>
                    Enter縺ｧ繝励Ο繝ｳ繝励ヨ霑ｽ蜉 / 逕滓・縺ｯ蜷・Γ繝・そ繝ｼ繧ｸ縺九ｉ
                </div>
            </div>
        </div>
    );
}

