import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Copy, Check, RefreshCw, GitBranch, ExternalLink, ChevronLeft, ChevronRight, Target, Sparkles } from 'lucide-react';
import { useLanguage } from './i18n';
import GoalWizard from './GoalWizard';

export default function ChatView({
    node,
    apiKeys,
    onUpdateNodeData,
    onBranchFromChat,
    onNavigateToBranch,
    spaceId
}) {
    const { t } = useLanguage();
    const [input, setInput] = useState('');
    const [chatHistory, setChatHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [copiedIdx, setCopiedIdx] = useState(null);
    const [activeBranchView, setActiveBranchView] = useState(0);
    const [showGoalWizard, setShowGoalWizard] = useState(false);
    const [selectionDraft, setSelectionDraft] = useState(null);
    const [activeExplanation, setActiveExplanation] = useState(null);
    const [isExplaining, setIsExplaining] = useState(false);
    const messagesEndRef = useRef(null);
    const messageContentRefs = useRef({});

    useEffect(() => {
        if (node) {
            setChatHistory(node.data?.chatHistory || []);
            setSelectionDraft(null);
            setActiveExplanation(null);
        }
    }, [node]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory, isLoading]);

    const callAI = async (history, systemPrompt) => {
        const apiKeyObj = apiKeys?.[node?.data?.selectedApiKey || 0];
        const keyToUse = apiKeyObj?.key?.trim();
        const provider = apiKeyObj?.provider || 'openai';
        const userModel = apiKeyObj?.model;

        if (!keyToUse) return `${t('chat.noApiKey')} (${provider})`;

        try {
            if (provider === 'gemini') {
                const modelToUse = userModel || 'gemini-3.1-pro-preview';
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${keyToUse}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
                        contents: history.map(msg => ({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.content }] })),
                        tools: [{ googleSearch: {} }]
                    })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || 'Gemini Error');
                return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';

            } else if (provider === 'anthropic') {
                const modelToUse = userModel || 'claude-sonnet-4-6';
                const msgs = history.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': keyToUse, 'anthropic-version': '2023-06-01', 'anthropic-dangerously-allow-browser': 'true' },
                    body: JSON.stringify({ model: modelToUse, max_tokens: 2048, system: systemPrompt || undefined, messages: msgs })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || 'Anthropic Error');
                return data.content?.[0]?.text || 'No response.';

            } else {
                const modelToUse = userModel || (provider === 'openai' ? 'gpt-5.3-chat-latest' : provider === 'openrouter' ? 'google/gemini-3.1-pro-preview' : 'glm-4-plus');
                const endpoint = provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' :
                    provider === 'glm' ? 'https://open.bigmodel.cn/api/paas/v4/chat/completions' :
                        'https://api.openai.com/v1/chat/completions';
                const msgs = [];
                if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
                history.forEach(m => msgs.push({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keyToUse}` },
                    body: JSON.stringify({ model: modelToUse, messages: msgs })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || 'LLM Error');
                return data.choices?.[0]?.message?.content || 'No response.';
            }
        } catch (err) {
            return `Error: ${err.message}`;
        }
    };

    const getInlineExplanations = (message) => {
        if (!Array.isArray(message?.inlineExplanations)) return [];
        return [...message.inlineExplanations].sort((a, b) => a.start - b.start);
    };

    const persistChatHistory = (nextHistory) => {
        setChatHistory(nextHistory);
        if (node) {
            onUpdateNodeData(node.id, 'chatHistory', nextHistory);
        }
    };

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

        const existing = getInlineExplanations(chatHistory[messageIndex]).find((item) => item.start === start && item.end === end);

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
        if (!sourceMessage) return;

        setIsExplaining(true);
        try {
            const before = sourceMessage.content.slice(Math.max(0, selectionDraft.start - 120), selectionDraft.start);
            const after = sourceMessage.content.slice(selectionDraft.end, Math.min(sourceMessage.content.length, selectionDraft.end + 120));
            const prompt = [
                '次の文章の選択箇所について、日本語でやさしく説明してください。',
                '条件:',
                '- 300字以内',
                '- 箇条書きにしない',
                '- その場ですぐ理解できる短さにする',
                '',
                `選択箇所:「${selectionDraft.text}」`,
                '',
                `前後文:「${before}<<${selectionDraft.text}>>${after}」`,
            ].join('\n');

            const explanationText = truncateInlineExplanation(await callAI(
                [{ role: 'user', content: prompt }],
                'あなたは学習の補助役です。選択された一部分だけを、必ず300字以内の日本語で短く説明してください。余計な前置きは不要です。'
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
            nextHistory[selectionDraft.messageIndex] = {
                ...targetMessage,
                inlineExplanations: [...currentExplanations, explanation],
            };

            persistChatHistory(nextHistory);
            setActiveExplanation({ messageIndex: selectionDraft.messageIndex, explanationId: explanation.id });
            setSelectionDraft(null);
        } finally {
            setIsExplaining(false);
        }
    };

    const handleSend = async (retryContent = null) => {
        const messageText = retryContent || input.trim();
        if (!messageText || !node) return;

        const newUserMsg = { role: 'user', content: messageText };
        let updatedHistory;

        if (retryContent) {
            const lastUserIdx = chatHistory.map(m => m.role).lastIndexOf('user');
            updatedHistory = [...chatHistory.slice(0, lastUserIdx), newUserMsg];
        } else {
            updatedHistory = [...chatHistory, newUserMsg];
        }

        setChatHistory(updatedHistory);
        if (!retryContent) setInput('');
        setIsLoading(true);

        // Inject node control abilities into system prompt
        const controlInstructions = `
\n\n---
[システム指示]
あなたはチャットを通じてノードシステムを構築・制御することができます。ユーザーから指示があった場合や、状況に応じてあなたが必要だと判断した場合は、以下のタグを含めて返信することで、ユーザーにアクションの実行を提案できます。
1. 新たにノードを派生・分岐させるべき話題になった場合: [ACTION: CREATE_NODE] と返信のどこかに含める。
2. このノード自身にループ機能(自動的反復処理)を行わせるべき話題になった場合: [ACTION: TOGGLE_LOOP_ON] と含める。
3. ループ機能を停止させるべき場合: [ACTION: TOGGLE_LOOP_OFF] と含める。
※ アクションタグを含めるだけで、システムが自動的に抽出してユーザーへ提案UIを表示します。
---
        `;
        const activeSystemPrompt = (node.data?.systemPrompt || '') + controlInstructions;
        const reply = await callAI(updatedHistory, activeSystemPrompt);

        let displayReply = reply || '';
        let pendingAction = null;

        if (displayReply.includes('[ACTION: CREATE_NODE]')) {
            pendingAction = 'CREATE_NODE';
            displayReply = displayReply.replace(/\[ACTION: CREATE_NODE\]/g, '').trim();
        } else if (displayReply.includes('[ACTION: TOGGLE_LOOP_ON]')) {
            pendingAction = 'TOGGLE_LOOP_ON';
            displayReply = displayReply.replace(/\[ACTION: TOGGLE_LOOP_ON\]/g, '').trim();
        } else if (displayReply.includes('[ACTION: TOGGLE_LOOP_OFF]')) {
            pendingAction = 'TOGGLE_LOOP_OFF';
            displayReply = displayReply.replace(/\[ACTION: TOGGLE_LOOP_OFF\]/g, '').trim();
        }

        if (!displayReply && pendingAction) {
            displayReply = t('chat.actionCompleted') || 'Action completed.';
        }

        const aiMsgObj = {
            role: 'ai',
            content: displayReply,
            pendingAction: pendingAction,
            actionStatus: pendingAction ? 'pending' : null
        };

        const finalHistory = [...updatedHistory, aiMsgObj];
        setChatHistory(finalHistory);
        onUpdateNodeData(node.id, 'chatHistory', finalHistory);

        // Auto title on first message
        if (chatHistory.length === 0 && spaceId && !retryContent) {
            try {
                const apiKeyObj = apiKeys?.[node?.data?.selectedApiKey || 0];
                const keyToUse = apiKeyObj?.key?.trim();
                const provider = apiKeyObj?.provider || 'openai';
                const userModel = apiKeyObj?.model;
                if (keyToUse) {
                    const titlePrompt = `ユーザーの最初のメッセージ「${messageText}」に基づき、このワークスペースのタイトルを10文字以内で作成してください。余計な記号や説明は一切含めず、タイトルテキストのみを出力してください。`;
                    let newTitle = '';

                    if (provider === 'gemini') {
                        const modelToUse = userModel || 'gemini-3.1-pro-preview';
                        const tRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${keyToUse}`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: titlePrompt }] }] })
                        });
                        const tData = await tRes.json();
                        newTitle = tData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                    } else if (provider === 'anthropic') {
                        const modelToUse = userModel || 'claude-sonnet-4-6';
                        const tRes = await fetch('https://api.anthropic.com/v1/messages', {
                            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': keyToUse, 'anthropic-version': '2023-06-01', 'anthropic-dangerously-allow-browser': 'true' },
                            body: JSON.stringify({ model: modelToUse, max_tokens: 50, messages: [{ role: 'user', content: titlePrompt }] })
                        });
                        const tData = await tRes.json();
                        newTitle = tData.content?.[0]?.text?.trim() || '';
                    } else {
                        const modelToUse = userModel || (provider === 'openai' ? 'gpt-5.3-chat-latest' : provider === 'openrouter' ? 'google/gemini-3.1-pro-preview' : 'glm-4-plus');
                        const endpoint = provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' :
                            provider === 'glm' ? 'https://open.bigmodel.cn/api/paas/v4/chat/completions' : 'https://api.openai.com/v1/chat/completions';
                        const tRes = await fetch(endpoint, {
                            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keyToUse}` },
                            body: JSON.stringify({ model: modelToUse, messages: [{ role: 'user', content: titlePrompt }] })
                        });
                        const tData = await tRes.json();
                        newTitle = tData.choices?.[0]?.message?.content?.trim() || '';
                    }

                    newTitle = newTitle.replace(/^["']|["']$/g, '');
                    if (newTitle && !newTitle.includes('Untitled')) {
                        const { supabase } = await import('./lib/supabase');
                        if (supabase) {
                            await supabase.from('spaces').update({ title: newTitle }).eq('id', spaceId);
                            window.dispatchEvent(new CustomEvent('spaceTitleUpdated'));
                        }
                    }
                }
            } catch (tErr) {
                console.error("Title Generation Failed:", tErr);
            }
        }

        setIsLoading(false);
    };

    const handleCopy = async (content, idx) => {
        try {
            await navigator.clipboard.writeText(content);
            setCopiedIdx(idx);
            setTimeout(() => setCopiedIdx(null), 2000);
        } catch (err) { console.error('Copy failed:', err); }
    };

    const handleRetry = (idx) => {
        for (let i = idx - 1; i >= 0; i--) {
            if (chatHistory[i].role === 'user') {
                handleSend(chatHistory[i].content);
                return;
            }
        }
    };

    const handleBranch = (idx) => {
        if (!node || !onBranchFromChat) return;
        const branchHistory = chatHistory.slice(0, idx + 1);
        const currentBranchCount = node.data.branchCount || 0;
        if (currentBranchCount >= 10) return;
        const success = onBranchFromChat(node.id, branchHistory);
        if (success) {
            onUpdateNodeData(node.id, 'branchCount', currentBranchCount + 1);
        }
    };

    const handleActionApprove = (idx) => {
        const msg = chatHistory[idx];
        if (!msg || !msg.pendingAction || msg.actionStatus !== 'pending') return;

        // Execute action
        if (msg.pendingAction === 'CREATE_NODE' && onBranchFromChat) {
            onBranchFromChat(node.id, chatHistory.slice(0, idx + 1));
            const currentBranchCount = node.data?.branchCount || 0;
            onUpdateNodeData(node.id, 'branchCount', currentBranchCount + 1);
        } else if (msg.pendingAction === 'TOGGLE_LOOP_ON') {
            onUpdateNodeData(node.id, 'isLooping', true);
        } else if (msg.pendingAction === 'TOGGLE_LOOP_OFF') {
            onUpdateNodeData(node.id, 'isLooping', false);
        }

        // Update status
        const newHistory = [...chatHistory];
        newHistory[idx] = { ...msg, actionStatus: 'approved' };
        setChatHistory(newHistory);
        onUpdateNodeData(node.id, 'chatHistory', newHistory);
    };

    const handleActionReject = (idx) => {
        const msg = chatHistory[idx];
        if (!msg || !msg.pendingAction || msg.actionStatus !== 'pending') return;

        const newHistory = [...chatHistory];
        newHistory[idx] = { ...msg, actionStatus: 'rejected' };
        setChatHistory(newHistory);
        onUpdateNodeData(node.id, 'chatHistory', newHistory);
    };

    const renderMessageContent = (message, messageIndex) => {
        if (message.role !== 'ai') return message.content;

        const explanations = getInlineExplanations(message);
        if (explanations.length === 0) return message.content;

        const segments = [];
        let cursor = 0;

        explanations.forEach((item) => {
            if (item.start > cursor) {
                segments.push(
                    <span key={`${item.id}-text`}>
                        {message.content.slice(cursor, item.start)}
                    </span>
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
                    {message.content.slice(item.start, item.end)}
                </span>
            );

            cursor = item.end;
        });

        if (cursor < message.content.length) {
            segments.push(
                <span key={`${messageIndex}-tail`}>
                    {message.content.slice(cursor)}
                </span>
            );
        }

        return segments;
    };

    if (!node) {
        return (
            <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-dark)',
                color: 'var(--text-muted)',
                padding: '2rem',
                textAlign: 'center',
            }}>
                <div>
                    <div style={{ fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                        Session Loading
                    </div>
                    <div style={{ fontSize: '0.96rem', color: 'var(--text-main)' }}>
                        Preparing your chat workspace...
                    </div>
                </div>
            </div>
        );
    }

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
                initialHistory={node.data?.goalHistory || []}
                onSaveHistory={(history) => onUpdateNodeData(node.id, 'goalHistory', history)}
            />
        );
    }

    const branchCount = node.data?.branchCount || 0;

    return (
        <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-dark)',
            height: '100%',
            position: 'relative'
        }}>
            {/* Top Bar */}
            <div style={{
                padding: '0.5rem 1.5rem',
                borderBottom: '1px solid var(--panel-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {/* Goal Button */}
                    {node.data?.isStarter && (
                        <button
                            onClick={() => setShowGoalWizard(true)}
                            style={{
                                background: node.data?.systemPrompt ? 'rgba(52, 211, 153, 0.08)' : 'rgba(108, 140, 255, 0.08)',
                                color: node.data?.systemPrompt ? 'var(--action)' : 'var(--primary)',
                                border: `1px solid ${node.data?.systemPrompt ? 'rgba(52, 211, 153, 0.2)' : 'rgba(108, 140, 255, 0.2)'}`,
                                borderRadius: '18px',
                                padding: '0.35rem 0.85rem',
                                fontSize: '0.8rem',
                                fontWeight: 500,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                transition: 'all 0.2s',
                                fontFamily: 'inherit'
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
                    onChange={(e) => onUpdateNodeData(node.id, 'selectedApiKey', parseInt(e.target.value))}
                    style={{ maxWidth: '130px' }}
                    title={t('chat.modelSelect')}
                >
                    {apiKeys?.map((item, i) => (
                        <option key={i} value={i}>Key {i + 1} ({item?.provider || 'openai'})</option>
                    ))}
                </select>
            </div>

            {/* Messages */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                maxWidth: '820px',
                width: '100%',
                margin: '0 auto'
            }}>
                {chatHistory.length === 0 ? (
                    <div style={{
                        margin: 'auto',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        animation: 'fadeSlideUp 0.5s ease'
                    }}>
                        <Bot size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                        <p style={{ fontSize: '1rem', fontWeight: 400 }}>{t('chat.empty')}</p>
                    </div>
                ) : (
                    chatHistory.map((msg, idx) => {
                        const explanations = getInlineExplanations(msg);
                        const activeExplanationIndex = explanations.findIndex((item) => item.id === activeExplanation?.explanationId);
                        const currentExplanation = activeExplanation?.messageIndex === idx && activeExplanationIndex >= 0
                            ? explanations[activeExplanationIndex]
                            : null;

                        return (
                            <div key={idx} className="chat-msg-wrapper" style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                animation: 'fadeIn 0.2s ease'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    gap: '0.65rem',
                                    flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                                    maxWidth: '85%'
                                }}>
                                    <div style={{
                                        width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                                        background: msg.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        {msg.role === 'user' ? <User size={14} color="white" /> : <Bot size={14} />}
                                    </div>
                                    <div
                                        ref={(element) => {
                                            if (element) messageContentRefs.current[idx] = element;
                                            else delete messageContentRefs.current[idx];
                                        }}
                                        onMouseUp={() => {
                                            if (msg.role === 'ai') {
                                                setTimeout(() => handleTextSelection(idx), 0);
                                            }
                                        }}
                                        onTouchEnd={() => {
                                            if (msg.role === 'ai') {
                                                setTimeout(() => handleTextSelection(idx), 0);
                                            }
                                        }}
                                        style={{
                                            background: msg.role === 'user' ? 'linear-gradient(135deg, var(--primary) 0%, #748ffc 100%)' : 'var(--panel-bg)',
                                            color: msg.role === 'user' ? 'white' : 'var(--text-main)',
                                            padding: '0.8rem 1.25rem',
                                            borderRadius: msg.role === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                                            border: msg.role === 'ai' ? '1px solid var(--panel-border)' : '1px solid rgba(255,255,255,0.1)',
                                            boxShadow: msg.role === 'user' ? '0 4px 15px rgba(92, 124, 250, 0.25)' : 'var(--shadow-sm)',
                                            wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                                            fontSize: '0.92rem', lineHeight: 1.75,
                                            backdropFilter: msg.role === 'ai' ? 'blur(20px)' : 'none',
                                            WebkitBackdropFilter: msg.role === 'ai' ? 'blur(20px)' : 'none'
                                        }}
                                    >
                                        {renderMessageContent(msg, idx)}
                                    </div>
                                </div>

                                {selectionDraft?.messageIndex === idx && (
                                    <div style={{
                                        marginLeft: '2.5rem',
                                        marginTop: '0.5rem',
                                        padding: '0.75rem 0.9rem',
                                        borderRadius: '14px',
                                        background: 'rgba(126, 216, 255, 0.08)',
                                        border: '1px solid rgba(126, 216, 255, 0.2)',
                                        maxWidth: '440px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.65rem'
                                    }}>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-main)', lineHeight: 1.6 }}>
                                            <span style={{ color: '#7ed8ff', fontWeight: 600 }}>選択中:</span> 「{selectionDraft.text}」
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                                            <button className="chat-action-btn" onClick={handleCreateExplanation} disabled={isExplaining}>
                                                <Sparkles size={12} /> {isExplaining ? '説明中...' : '説明する'}
                                            </button>
                                            <button className="chat-action-btn" onClick={() => setSelectionDraft(null)}>
                                                閉じる
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {currentExplanation && (
                                    <div style={{
                                        marginLeft: '2.5rem',
                                        marginTop: '0.5rem',
                                        padding: '0.85rem 1rem',
                                        background: 'rgba(92, 124, 250, 0.08)',
                                        border: '1px solid rgba(92, 124, 250, 0.25)',
                                        borderRadius: '12px',
                                        display: 'inline-flex',
                                        flexDirection: 'column',
                                        gap: '0.65rem',
                                        maxWidth: '460px',
                                        animation: 'fadeIn 0.2s ease'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.7rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <div style={{ fontSize: '0.84rem', color: 'var(--text-main)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                <Sparkles size={13} color="#7ed8ff" />
                                                この部分の説明
                                            </div>
                                            {explanations.length > 1 && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <button className="chat-action-btn" disabled={activeExplanationIndex <= 0} onClick={() => shiftExplanation(idx, -1)} style={{ padding: '0.2rem' }}>
                                                        <ChevronLeft size={12} />
                                                    </button>
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', minWidth: '28px', textAlign: 'center' }}>
                                                        {activeExplanationIndex + 1}/{explanations.length}
                                                    </span>
                                                    <button className="chat-action-btn" disabled={activeExplanationIndex >= explanations.length - 1} onClick={() => shiftExplanation(idx, 1)} style={{ padding: '0.2rem' }}>
                                                        <ChevronRight size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: '#8fdfff', lineHeight: 1.6 }}>
                                            「{currentExplanation.text}」
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', lineHeight: 1.7 }}>
                                            {currentExplanation.summary}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                                            <button className="chat-action-btn" onClick={() => openExplanation(idx, currentExplanation.id)}>
                                                もう一度
                                            </button>
                                            <button className="chat-action-btn" onClick={() => setActiveExplanation(null)}>
                                                閉じる
                                            </button>
                                        </div>
                                    </div>
                                )}

                            {/* Pending Action UI */}
                            {msg.role === 'ai' && msg.pendingAction && (
                                <div style={{
                                    marginLeft: '2.5rem',
                                    marginTop: '0.5rem',
                                    padding: '0.85rem 1rem',
                                    background: 'rgba(92, 124, 250, 0.08)',
                                    border: '1px solid rgba(92, 124, 250, 0.25)',
                                    borderRadius: '12px',
                                    display: 'inline-flex',
                                    flexDirection: 'column',
                                    gap: '0.6rem',
                                    maxWidth: '400px',
                                    animation: 'fadeIn 0.3s ease'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: 500 }}>
                                        <Bot size={14} color="var(--primary)" />
                                        {msg.pendingAction === 'CREATE_NODE' ? t('chat.aiSuggestsBranch') :
                                            msg.pendingAction === 'TOGGLE_LOOP_ON' ? t('chat.aiSuggestsLoopOn') :
                                                'AI Suggests Action'}
                                    </div>

                                    {msg.actionStatus === 'pending' ? (
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                onClick={() => handleActionApprove(idx)}
                                                style={{
                                                    padding: '0.4rem 0.8rem', background: 'var(--primary)', color: 'white',
                                                    border: 'none', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer',
                                                    transition: 'var(--transition-smooth)', fontWeight: 500
                                                }}>
                                                <Check size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-2px' }} />
                                                {t('chat.approve')}
                                            </button>
                                            <button
                                                onClick={() => handleActionReject(idx)}
                                                style={{
                                                    padding: '0.4rem 0.8rem', background: 'rgba(255,100,100,0.15)', color: '#ff6b6b',
                                                    border: '1px solid rgba(255,100,100,0.3)', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer',
                                                    transition: 'var(--transition-smooth)'
                                                }}>
                                                {t('chat.reject')}
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ color: msg.actionStatus === 'approved' ? 'var(--action)' : 'var(--text-muted)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            {msg.actionStatus === 'approved' ? <Check size={12} /> : null}
                                            {msg.actionStatus === 'approved' ? t('chat.actionExecuted') : t('chat.actionRejected')}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Action buttons for AI messages */}
                            {msg.role === 'ai' && (
                                <div className="chat-actions" style={{ marginLeft: '2.6rem', marginTop: '0.4rem' }}>
                                    <button className="chat-action-btn" onClick={() => handleCopy(msg.content, idx)} title={copiedIdx === idx ? t('chat.copied') : t('chat.copy')}>
                                        {copiedIdx === idx ? <Check size={12} /> : <Copy size={12} />}
                                        {copiedIdx === idx ? t('chat.copied') : t('chat.copy')}
                                    </button>
                                    <button className="chat-action-btn" onClick={() => handleRetry(idx)} disabled={isLoading} title={t('chat.retry')}>
                                        <RefreshCw size={12} /> {t('chat.retry')}
                                    </button>
                                    <button className="chat-action-btn" onClick={() => handleBranch(idx)} disabled={branchCount >= 10} title={branchCount >= 10 ? t('chat.branchMax') : t('chat.branch')}>
                                        <GitBranch size={12} /> {t('chat.branch')} {branchCount > 0 && `(${branchCount}/10)`}
                                    </button>

                                    {/* Branch navigation */}
                                    {branchCount > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', marginLeft: '0.3rem', borderLeft: '1px solid var(--panel-border)', paddingLeft: '0.5rem' }}>
                                            <button
                                                className="chat-action-btn"
                                                disabled={activeBranchView <= 0}
                                                onClick={() => setActiveBranchView(v => Math.max(0, v - 1))}
                                                style={{ padding: '0.2rem' }}
                                            >
                                                <ChevronLeft size={12} />
                                            </button>
                                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', minWidth: '20px', textAlign: 'center' }}>
                                                {activeBranchView + 1}
                                            </span>
                                            <button
                                                className="chat-action-btn"
                                                disabled={activeBranchView >= branchCount}
                                                onClick={() => setActiveBranchView(v => Math.min(branchCount, v + 1))}
                                                style={{ padding: '0.2rem' }}
                                            >
                                                <ChevronRight size={12} />
                                            </button>

                                            {/* Move to branch button (not for branch 1 = index 0) */}
                                            {activeBranchView > 0 && onNavigateToBranch && (
                                                <button
                                                    className="chat-action-btn"
                                                    onClick={() => onNavigateToBranch(node.id, activeBranchView)}
                                                    style={{ marginLeft: '0.2rem' }}
                                                    title={t('chat.moveTo')}
                                                >
                                                    <ExternalLink size={12} /> {t('chat.moveTo')}
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
                    <div style={{ display: 'flex', gap: '0.65rem', animation: 'pulse 1.5s infinite' }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Bot size={14} />
                        </div>
                        <div style={{ padding: '0.7rem 1.1rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                            {t('chat.generating')}
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div style={{ padding: '1.25rem 2rem', borderTop: '1px solid var(--panel-border)' }}>
                <div style={{
                    display: 'flex',
                    background: 'var(--panel-bg)',
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    border: '1px solid var(--panel-border)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                    borderRadius: '28px',
                    overflow: 'hidden',
                    padding: '0.35rem 0.35rem 0.35rem 1.25rem',
                    alignItems: 'flex-end',
                    maxWidth: '820px',
                    margin: '0 auto',
                    transition: 'var(--transition-smooth)',
                    minHeight: '56px'
                }}>
                    <textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                        }}
                        placeholder={t('chat.placeholder')}
                        style={{
                            flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)',
                            resize: 'none', outline: 'none', padding: '0.5rem 0', minHeight: '32px',
                            maxHeight: '150px', fontSize: '0.95rem', fontFamily: 'inherit', lineHeight: 1.5
                        }}
                        rows={1}
                    />
                    <button
                        onClick={() => handleSend()}
                        disabled={isLoading || !input.trim()}
                        style={{
                            width: '38px', height: '38px', borderRadius: '50%',
                            background: input.trim() ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                            color: input.trim() ? 'white' : 'var(--text-muted)',
                            border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: input.trim() ? 'pointer' : 'default', transition: 'all 0.2s',
                            marginBottom: '4px'
                        }}
                    >
                        <Send size={16} />
                    </button>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.4rem' }}>
                    {t('chat.shiftEnter')}
                </div>
            </div>
        </div>
    );
}
