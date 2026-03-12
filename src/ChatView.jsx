import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Bot,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Copy,
    ExternalLink,
    GitBranch,
    Pin,
    RefreshCw,
    Send,
    Sparkles,
    Target,
    Trash2,
    User,
} from 'lucide-react';
import { useLanguage } from './i18n';
import GoalWizard from './GoalWizard';
import {
    createProjectImprovementVersion,
    getProjectPlanAccess,
    restoreProjectImprovementVersion,
    saveProjectImprovementVersion,
    saveProjectPlanSection,
} from './lib/workspace';

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
    return (history || []).map((message) => {
        const baseMessage = ensureMessageId(message);
        return baseMessage?.role === 'ai' ? normalizeAiMessage(baseMessage) : baseMessage;
    });
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
}) {
    const { t } = useLanguage();
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
    const messagesEndRef = useRef(null);
    const messageContentRefs = useRef({});

    useEffect(() => {
        if (!node) return;
        setChatHistory(normalizeHistory(node.data?.chatHistory || []));
        setGeneratingPromptIndex(null);
        setSelectionDraft(null);
        setActiveExplanation(null);
    }, [node]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory, isLoading]);

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
        const keyToUse = apiKeyObj?.key?.trim();
        const provider = apiKeyObj?.provider || 'openai';
        const userModel = apiKeyObj?.model;
        const fullSystemPrompt = [projectContextPrompt, systemPrompt].filter(Boolean).join('\n\n');

        if (!keyToUse) return `${t('chat.noApiKey')} (${provider})`;

        try {
            if (provider === 'gemini') {
                const modelToUse = userModel || 'gemini-3.1-pro-preview';
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${keyToUse}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        systemInstruction: fullSystemPrompt ? { parts: [{ text: fullSystemPrompt }] } : undefined,
                        contents: history.map((message) => ({
                            role: message.role === 'user' ? 'user' : 'model',
                            parts: [{ text: message.content }],
                        })),
                        tools: [{ googleSearch: {} }],
                    }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || 'Gemini Error');
                return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
            }

            if (provider === 'anthropic') {
                const modelToUse = userModel || 'claude-sonnet-4-6';
                const messages = history.map((message) => ({
                    role: message.role === 'ai' ? 'assistant' : 'user',
                    content: message.content,
                }));
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': keyToUse,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerously-allow-browser': 'true',
                    },
                    body: JSON.stringify({
                        model: modelToUse,
                        max_tokens: 2048,
                        system: fullSystemPrompt || undefined,
                        messages,
                    }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || 'Anthropic Error');
                return data.content?.[0]?.text || 'No response.';
            }

            const modelToUse = userModel || (
                provider === 'openai'
                    ? 'gpt-5.3-chat-latest'
                    : provider === 'openrouter'
                        ? 'google/gemini-3.1-pro-preview'
                        : 'glm-4-plus'
            );
            const endpoint = provider === 'openrouter'
                ? 'https://openrouter.ai/api/v1/chat/completions'
                : provider === 'glm'
                    ? 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
                    : 'https://api.openai.com/v1/chat/completions';
            const messages = [];
            if (fullSystemPrompt) messages.push({ role: 'system', content: fullSystemPrompt });
            history.forEach((message) => {
                messages.push({
                    role: message.role === 'ai' ? 'assistant' : 'user',
                    content: message.content,
                });
            });

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${keyToUse}`,
                },
                body: JSON.stringify({ model: modelToUse, messages }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || 'LLM Error');
            return data.choices?.[0]?.message?.content || 'No response.';
        } catch (error) {
            return `Error: ${error.message}`;
        }
    };

    const generateSpaceTitle = async (messageText) => {
        if (!spaceId) return;

        try {
            const apiKeyObj = apiKeys?.[node?.data?.selectedApiKey || 0];
            const keyToUse = apiKeyObj?.key?.trim();
            const provider = apiKeyObj?.provider || 'openai';
            const userModel = apiKeyObj?.model;
            if (!keyToUse) return;

            const titlePrompt = `次の最初のメッセージ「${messageText}」をもとに、このワークスペースのタイトルを10文字以内で1つだけ返してください。説明は不要です。`;
            let newTitle = '';

            if (provider === 'gemini') {
                const modelToUse = userModel || 'gemini-3.1-pro-preview';
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${keyToUse}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: titlePrompt }] }] }),
                });
                const data = await response.json();
                newTitle = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            } else if (provider === 'anthropic') {
                const modelToUse = userModel || 'claude-sonnet-4-6';
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': keyToUse,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerously-allow-browser': 'true',
                    },
                    body: JSON.stringify({
                        model: modelToUse,
                        max_tokens: 50,
                        messages: [{ role: 'user', content: titlePrompt }],
                    }),
                });
                const data = await response.json();
                newTitle = data.content?.[0]?.text?.trim() || '';
            } else {
                const modelToUse = userModel || (
                    provider === 'openai'
                        ? 'gpt-5.3-chat-latest'
                        : provider === 'openrouter'
                            ? 'google/gemini-3.1-pro-preview'
                            : 'glm-4-plus'
                );
                const endpoint = provider === 'openrouter'
                    ? 'https://openrouter.ai/api/v1/chat/completions'
                    : provider === 'glm'
                        ? 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
                        : 'https://api.openai.com/v1/chat/completions';
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${keyToUse}`,
                    },
                    body: JSON.stringify({
                        model: modelToUse,
                        messages: [{ role: 'user', content: titlePrompt }],
                    }),
                });
                const data = await response.json();
                newTitle = data.choices?.[0]?.message?.content?.trim() || '';
            }

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
        setSelectionDraft({ messageIndex, start, end, text: selectedText });
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
                '次の選択箇所を日本語でやさしく短く説明してください。',
                '条件:',
                '- 最大300文字',
                '- 難しい言い換えは避ける',
                '- その場で理解できる説明にする',
                '',
                `選択箇所: 「${selectionDraft.text}」`,
                '',
                `前後文脈: 「${before}<<${selectionDraft.text}>>${after}」`,
            ].join('\n');

            const explanationText = truncateInlineExplanation(await callAI(
                [{ role: 'user', content: prompt }],
                'あなたは学習支援の説明役です。最大300文字で、自然な日本語で簡潔に説明してください。',
            ));

            const explanation = {
                id: crypto.randomUUID(),
                start: selectionDraft.start,
                end: selectionDraft.end,
                text: selectionDraft.text,
                summary: explanationText,
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

    const handleQueuePrompt = () => {
        const messageText = input.trim();
        if (!messageText || !node) return;
        const nextHistory = normalizeHistory([...chatHistory, { role: 'user', content: messageText }]);

        setInput('');
        persistChatHistory(nextHistory);
    };

    const handleDeletePrompt = (messageIndex) => {
        const targetMessage = chatHistory[messageIndex];
        if (!targetMessage || targetMessage.role !== 'user') return;

        const nextMessage = chatHistory[messageIndex + 1];
        const removeCount = nextMessage?.role === 'ai' ? 2 : 1;
        const nextHistory = normalizeHistory(
            chatHistory.filter((_, index) => index < messageIndex || index >= messageIndex + removeCount),
        );

        if (generatingPromptIndex !== null) {
            if (generatingPromptIndex === messageIndex) {
                setGeneratingPromptIndex(null);
            } else if (generatingPromptIndex > messageIndex) {
                setGeneratingPromptIndex(Math.max(0, generatingPromptIndex - removeCount));
            }
        }

        setSelectionDraft(null);
        setActiveExplanation(null);
        persistChatHistory(nextHistory);
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

    const handleGeneratePrompt = async (userIndex, options = {}) => {
        if (!node || isLoading) return;

        const userMessage = chatHistory[userIndex];
        if (!userMessage || userMessage.role !== 'user') return;

        const existingReplyIndex = chatHistory[userIndex + 1]?.role === 'ai' ? userIndex + 1 : -1;
        const shouldAppendVariant = Boolean(options.appendVariant && existingReplyIndex >= 0);
        const wasFirstGeneratedReply = !chatHistory.some((message) => message.role === 'ai');
        const historyForReply = normalizeHistory(chatHistory.slice(0, userIndex + 1));

        setSelectionDraft(null);
        setActiveExplanation(null);
        setGeneratingPromptIndex(userIndex);
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
                    userIndex + 1,
                    0,
                    syncAiMessage(
                        { role: 'ai', collapsed: false },
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

        let userIndex = -1;
        for (let i = idx - 1; i >= 0; i -= 1) {
            if (chatHistory[i].role === 'user') {
                userIndex = i;
                break;
            }
        }
        if (userIndex < 0) return;

        await handleGeneratePrompt(userIndex, { appendVariant: true });
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

    const handleBranch = (idx) => {
        if (!node || !onBranchFromChat) return;
        const currentBranchCount = node.data?.branchCount || 0;
        if (currentBranchCount >= 10) return;

        const success = onBranchFromChat(node.id, chatHistory.slice(0, idx + 1));
        if (success) {
            onUpdateNodeData(node.id, 'branchCount', currentBranchCount + 1);
        }
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
            if (!node.data?.loopNodeId && node.data?.onToggleLoop) {
                node.data.onToggleLoop(node.id);
            }
        } else if (activeVariant.pendingAction === 'TOGGLE_LOOP_OFF') {
            if (node.data?.loopNodeId && node.data?.onToggleLoop) {
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
        ? 'このスペースでは目標のみ設定できます。'
        : activePlanSection !== 'goal' && !planAccess.isPlanSpace
            ? 'このセクションはプロジェクトの Plan Space でのみ編集できます。'
            : activePlanSection === 'improvement' && isViewingArchivedImprovement
                ? '過去バージョンは閲覧のみです。復元すると編集できます。'
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
    const pinnedMessages = [];
    const handleTogglePinnedMessage = () => {};
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
    const generatePromptButtonStyle = {
        ...iconActionStyle,
        width: '120px',
        padding: '0 0.9rem',
        gap: '0.35rem',
        fontSize: '0.78rem',
        lineHeight: 1,
        fontWeight: 600,
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
    const counterTextStyle = {
        fontSize: 0,
        color: '#8b91a1',
        minWidth: '8px',
        textAlign: 'center',
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
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    padding: '1.25rem 1.6rem 0.8rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.5rem',
                    maxWidth: '920px',
                    width: '100%',
                    margin: '0 auto',
                    minWidth: 0,
                }}
            >
                {false && (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.55rem',
                            marginBottom: '0.25rem',
                        }}
                    >
                        <div style={{ fontSize: '0.72rem', color: '#8b91a1', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                            ピン留め
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
                            {pinnedMessages.map((message) => (
                                <button
                                    key={message.id}
                                    type="button"
                                    onClick={() => handleTogglePinnedMessage(message.id)}
                                    style={{
                                        maxWidth: '260px',
                                        textAlign: 'left',
                                        padding: '0.72rem 0.9rem',
                                        borderRadius: '18px',
                                        border: '1px solid rgba(38, 43, 53, 0.08)',
                                        background: '#ffffff',
                                        color: '#3a4152',
                                        boxShadow: '0 12px 28px rgba(29, 33, 44, 0.08)',
                                        cursor: 'pointer',
                                    }}
                                    title="ピンを外す"
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.28rem', color: '#8b91a1', fontSize: '0.72rem' }}>
                                        <Pin size={12} />
                                        {message.role === 'user' ? 'プロンプト' : '回答'}
                                    </div>
                                    <div style={{ fontSize: '0.82rem', lineHeight: 1.55, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {message.content}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

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
                    chatHistory.map((rawMessage, idx) => {
                        const message = rawMessage.role === 'ai' ? normalizeAiMessage(rawMessage) : rawMessage;
                        const activeVariant = message.role === 'ai' ? getActiveResponseVariant(message) : null;
                        const displayedContent = activeVariant?.content || message.content || '';
                        const pendingAction = activeVariant?.pendingAction || null;
                        const actionStatus = activeVariant?.actionStatus || null;
                        const responseVariantCount = message.role === 'ai' ? message.responseVariants.length : 0;
                        const activeResponseVariantIndex = message.role === 'ai' ? message.activeVariantIndex : 0;
                        const linkedReplyIndex = message.role === 'user' && chatHistory[idx + 1]?.role === 'ai' ? idx + 1 : null;
                        const linkedReplyCollapsed = linkedReplyIndex !== null ? isReplyCollapsed(chatHistory[linkedReplyIndex]) : false;
                        const canGeneratePrompt = message.role === 'user' && linkedReplyIndex === null;
                        const isGeneratingPrompt = generatingPromptIndex === idx;
                        const explanations = getInlineExplanations(message);
                        const activeExplanationIndex = explanations.findIndex((item) => item.id === activeExplanation?.explanationId);
                        const currentExplanation = activeExplanation?.messageIndex === idx && activeExplanationIndex >= 0
                            ? explanations[activeExplanationIndex]
                            : null;

                        if (message.role === 'ai' && isReplyCollapsed(message)) {
                            return null;
                        }

                        return (
                            <div
                                key={idx}
                                className="chat-msg-wrapper"
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
                                    animation: 'fadeIn 0.2s ease',
                                    width: '100%',
                                    minWidth: 0,
                                }}
                            >
                                <div
                                        style={{
                                            display: 'flex',
                                            gap: '0.65rem',
                                            flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
                                            maxWidth: message.role === 'user' ? '78%' : '72%',
                                            minWidth: 0,
                                        }}
                                    >
                                        <div style={avatarColumnStyle}>
                                            <div
                                                style={{
                                                    width: '34px',
                                                    height: '34px',
                                                    borderRadius: '50%',
                                                    background: message.role === 'user' ? '#eadff8' : '#ffffff',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    boxShadow: message.role === 'user' ? '0 8px 20px rgba(174, 150, 223, 0.2)' : '0 10px 20px rgba(29, 33, 44, 0.08)',
                                                }}
                                            >
                                                {message.role === 'user' ? <User size={14} color="#664b8d" /> : <Bot size={14} color="#6f7688" />}
                                            </div>
                                            {message.role === 'user' && (
                                                <button
                                                    onClick={() => handleDeletePrompt(idx)}
                                                    style={userDeleteButtonStyle}
                                                    title="このプロンプトを削除"
                                                    aria-label="このプロンプトを削除"
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            )}
                                        </div>
                                    <div
                                        ref={(element) => {
                                            if (element) messageContentRefs.current[idx] = element;
                                            else delete messageContentRefs.current[idx];
                                        }}
                                        onMouseUp={() => {
                                            if (message.role === 'ai') {
                                                setTimeout(() => handleTextSelection(idx), 0);
                                            }
                                        }}
                                        onTouchEnd={() => {
                                            if (message.role === 'ai') {
                                                setTimeout(() => handleTextSelection(idx), 0);
                                            }
                                        }}
                                        style={{
                                            ...(message.role === 'user' ? userBubbleStyle : assistantBubbleStyle),
                                            minWidth: 0,
                                        }}
                                    >
                                        {renderMessageContent(message, idx)}
                                    </div>
                                </div>

                                {message.role === 'user' && (
                                    <div
                                        style={{
                                            marginTop: '0.35rem',
                                            marginRight: '2.55rem',
                                            alignSelf: 'flex-end',
                                            ...actionStripStyle,
                                            justifyContent: 'flex-end',
                                        }}
                                    >
                                        {linkedReplyIndex !== null && (
                                            <button
                                                onClick={() => handleToggleReplyCollapse(linkedReplyIndex)}
                                                style={iconActionStyle}
                                                title={linkedReplyCollapsed ? '回答を表示' : '回答を折り畳む'}
                                            >
                                                {linkedReplyCollapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
                                                {linkedReplyCollapsed ? '回答を表示' : '回答を折り畳む'}
                                            </button>
                                        )}

                                        {canGeneratePrompt && (
                                            <button
                                                onClick={() => handleGeneratePrompt(idx)}
                                                disabled={isLoading}
                                                style={generatePromptButtonStyle}
                                                title="このプロンプトで回答を生成"
                                            >
                                                <Sparkles size={11} />
                                                {isGeneratingPrompt ? '生成中...' : '回答を生成'}
                                            </button>
                                        )}
                                    </div>
                                )}

                                {selectionDraft?.messageIndex === idx && (
                                    <div
                                        style={{
                                            marginLeft: '2.5rem',
                                            marginTop: '0.5rem',
                                            padding: '0.95rem 1.05rem',
                                            borderRadius: '18px',
                                            background: 'linear-gradient(180deg, rgba(235,242,255,0.96) 0%, rgba(219,231,255,0.93) 100%)',
                                            border: '1px solid rgba(125,161,255,0.35)',
                                            boxShadow: '0 16px 34px rgba(17,31,66,0.18)',
                                            width: 'min(560px, calc(100% - 2.5rem))',
                                            maxWidth: '560px',
                                            minWidth: 0,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.75rem',
                                        }}
                                    >
                                        <div style={{ fontSize: '0.88rem', color: '#22314d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                            <Sparkles size={14} color="#63a9ff" />
                                            この部分を説明します
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: '#63a9ff', lineHeight: 1.7 }}>
                                            「{selectionDraft.text}」
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                                            <button style={cardActionStyle} onClick={handleCreateExplanation} disabled={isExplaining}>
                                                <Sparkles size={12} /> {isExplaining ? '説明中...' : '説明する'}
                                            </button>
                                            <button style={cardActionStyle} onClick={() => setSelectionDraft(null)}>
                                                閉じる
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {currentExplanation && (
                                    <div
                                        style={{
                                            marginLeft: '2.5rem',
                                            marginTop: '0.5rem',
                                            padding: '1rem 1.1rem',
                                            background: 'linear-gradient(180deg, rgba(235,242,255,0.96) 0%, rgba(219,231,255,0.93) 100%)',
                                            border: '1px solid rgba(125,161,255,0.35)',
                                            borderRadius: '18px',
                                            boxShadow: '0 18px 36px rgba(17,31,66,0.18)',
                                            display: 'inline-flex',
                                            flexDirection: 'column',
                                            gap: '0.8rem',
                                            width: 'min(560px, calc(100% - 2.5rem))',
                                            maxWidth: '560px',
                                            minWidth: 0,
                                            animation: 'fadeIn 0.2s ease',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.7rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <div style={{ fontSize: '0.88rem', color: '#22314d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                <Sparkles size={14} color="#63a9ff" />
                                                この部分の説明
                                            </div>
                                            {explanations.length > 1 && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <button style={iconActionStyle} disabled={activeExplanationIndex <= 0} onClick={() => shiftExplanation(idx, -1)} aria-label="Previous explanation">
                                                        <ChevronLeft size={12} />
                                                    </button>
                                                    <span style={{ fontSize: '0.72rem', color: '#63779a', minWidth: '36px', textAlign: 'center' }}>
                                                        {activeExplanationIndex + 1}/{explanations.length}
                                                    </span>
                                                    <button style={iconActionStyle} disabled={activeExplanationIndex >= explanations.length - 1} onClick={() => shiftExplanation(idx, 1)} aria-label="Next explanation">
                                                        <ChevronRight size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: '#63a9ff', lineHeight: 1.7 }}>
                                            「{currentExplanation.text}」
                                        </div>
                                        <div style={{ fontSize: '0.86rem', color: '#22314d', lineHeight: 1.9 }}>
                                            {currentExplanation.summary}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                                            <button style={cardActionStyle} onClick={() => openExplanation(idx, currentExplanation.id)}>
                                                もう一度
                                            </button>
                                            <button style={cardActionStyle} onClick={() => setActiveExplanation(null)}>
                                                閉じる
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {message.role === 'ai' && pendingAction && (
                                    <div
                                        style={{
                                            marginLeft: '2.5rem',
                                            marginTop: '0.5rem',
                                            padding: '0.85rem 1rem',
                                            background: 'rgba(92, 124, 250, 0.08)',
                                            border: '1px solid rgba(92, 124, 250, 0.25)',
                                            borderRadius: '12px',
                                            display: 'inline-flex',
                                            flexDirection: 'column',
                                            gap: '0.6rem',
                                            width: 'min(400px, calc(100% - 2.5rem))',
                                            maxWidth: '400px',
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
                                                    onClick={() => handleActionApprove(idx)}
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
                                                    onClick={() => handleActionReject(idx)}
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

                                {message.role === 'ai' && (
                                    <div className="chat-actions" style={{ marginLeft: '2.6rem', marginTop: '0.4rem', ...actionStripStyle }}>
                                        <button style={iconActionStyle} onClick={() => handleCopy(displayedContent, idx)} title={copiedIdx === idx ? t('chat.copied') : t('chat.copy')} aria-label={copiedIdx === idx ? t('chat.copied') : t('chat.copy')}>
                                            {copiedIdx === idx ? <Check size={14} /> : <Copy size={14} />}
                                        </button>
                                        <button style={iconActionStyle} onClick={() => handleRetry(idx)} disabled={isLoading} title={t('chat.retry')} aria-label={t('chat.retry')}>
                                            <RefreshCw size={14} />
                                        </button>

                                        {responseVariantCount > 1 && (
                                            <div style={{ ...actionStripStyle, paddingLeft: '0.28rem', marginLeft: '0.08rem', borderLeft: '1px solid rgba(68, 76, 95, 0.12)' }}>
                                                <button
                                                    style={iconActionStyle}
                                                    disabled={activeResponseVariantIndex <= 0}
                                                    onClick={() => handleSwitchResponseVariant(idx, -1)}
                                                    aria-label="Previous reply"
                                                >
                                                    <ChevronLeft size={14} />
                                                </button>
                                                <span style={{ ...counterTextStyle, minWidth: '44px' }}>
                                                    回答 {activeResponseVariantIndex + 1}/{responseVariantCount}
                                                </span>
                                                <span style={{ fontSize: '0.7rem', color: '#8b91a1', minWidth: '44px', textAlign: 'center' }}>
                                                    {activeResponseVariantIndex + 1}/{responseVariantCount}
                                                </span>
                                                <button
                                                    style={iconActionStyle}
                                                    disabled={activeResponseVariantIndex >= responseVariantCount - 1}
                                                    onClick={() => handleSwitchResponseVariant(idx, 1)}
                                                    aria-label="Next reply"
                                                >
                                                    <ChevronRight size={14} />
                                                </button>
                                            </div>
                                        )}

                                        <button style={iconActionStyle} onClick={() => handleBranch(idx)} disabled={branchCount >= 10} title={branchCount >= 10 ? t('chat.branchMax') : t('chat.branch')} aria-label={branchCount >= 10 ? t('chat.branchMax') : t('chat.branch')}>
                                            <GitBranch size={14} />
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
                                )}
                            </div>
                        );
                    })
                )}

                {isLoading && (
                    <div style={{ display: 'flex', gap: '0.65rem', animation: 'pulse 1.5s infinite', marginLeft: '0.2rem' }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 10px 20px rgba(29, 33, 44, 0.08)' }}>
                            <Bot size={14} color="#6f7688" />
                        </div>
                        <div style={{ padding: '0.78rem 1.08rem', color: '#6f7688', fontSize: '0.88rem', background: '#ffffff', borderRadius: '18px', boxShadow: '0 14px 28px rgba(29, 33, 44, 0.08)' }}>
                            {t('chat.generating')}
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
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
                    <textarea
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                handleQueuePrompt();
                            }
                        }}
                        placeholder={t('chat.placeholder')}
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
                    Enterでプロンプト追加 / 生成は各メッセージから
                </div>
            </div>
        </div>
    );
}
