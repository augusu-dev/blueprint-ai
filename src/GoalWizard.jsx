import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckSquare, ListTodo, Send, Square } from 'lucide-react';
import { useLanguage } from './i18n';
import {
    buildInteractiveResponseText,
    collectInteractiveProgress,
    hasInteractiveSelection,
    parseInteractiveContent,
} from './lib/interactiveContent';

const DEFAULT_GOAL_SYSTEM_PROMPT = `あなたは Plan 設計アシスタントです。この Plan Space では、ユーザーの目標、計画、報酬設計、改善ポイントを対話形式で整理してください。

重要なルール:
1. まず目標と期限・タイムラインを確認してください。期限があるなら日付、なければ期間の目安を聞いてください。
2. 次に計画を、段階・今週やること・次に着手することに分けて具体化してください。
3. 必要なら報酬設計として、小さな達成報酬や節目のごほうびを提案してください。
4. 必要なら改善として、詰まりそうな点、やり方の改善、継続のコツを聞いて整理してください。
5. 一度に確認するテーマは1つにしてください。ただし必要なら1メッセージ内に質問ブロックを2つまで出して構いません。
6. 質問形式は次のどれかを使ってください。
   - 複数選択: 案内文のあとに \`- [ ] 選択肢\` を各行に並べる
   - 単一選択: 案内文のあとに \`1. 選択肢\` \`2. 選択肢\` の形式で並べる
   - 自由入力: 質問文だけを書く
7. 必要に応じて、使える時間帯、作業ペース、苦手分野、作業環境も聞いてください。
8. 標準運用として、週2回の軽い進捗確認で計画を微調整する前提にしてください。
9. 4〜8往復くらいで十分に整理できたら、先頭に [GOAL_COMPLETE] を付けて次の5行で簡潔にまとめてください。
   この Plan の目標: ...
   タイムライン: ...
   計画メモ: ...
   報酬設計: ...
   改善メモ: ...
10. 返答は日本語で、自然で押しつけがましくないトーンにしてください。`;

export default function GoalWizard({
    onClose,
    apiKeys,
    selectedApiKey,
    onSetGoal,
    onComplete,
    initialHistory,
    onSaveHistory,
    initialInteractiveStates,
    initialSelectedOptions,
    onSaveInteractiveStates,
    onSaveSelectedOptions,
    systemPrompt = DEFAULT_GOAL_SYSTEM_PROMPT,
    title,
    placeholder,
    completionTag = '[GOAL_COMPLETE]',
    sectionTabs = [],
    activeSectionId = 'goal',
    onSelectSection,
    readOnly = false,
    readOnlyMessage = '',
    versionOptions = [],
    selectedVersionId = null,
    onSelectVersion,
    onCreateVersion,
    onRestoreVersion,
    canCreateVersion = false,
    canRestoreVersion = false,
}) {
    const { t } = useLanguage();
    const [messages, setMessages] = useState(initialHistory || []);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [interactiveStates, setInteractiveStates] = useState(initialInteractiveStates || {});
    const [selectedOptions, setSelectedOptions] = useState(initialSelectedOptions || {});
    const [showProgressPanel, setShowProgressPanel] = useState(false);
    const messagesEndRef = useRef(null);
    const savedInteractiveStatesRef = useRef(JSON.stringify(initialInteractiveStates || {}));
    const savedSelectedOptionsRef = useRef(JSON.stringify(initialSelectedOptions || {}));
    const resolvedTitle = title || t('goal.title');
    const resolvedPlaceholder = placeholder || t('goal.placeholder');

    useEffect(() => {
        setMessages(initialHistory || []);
    }, [activeSectionId, initialHistory]);

    useEffect(() => {
        const nextState = initialInteractiveStates || {};
        savedInteractiveStatesRef.current = JSON.stringify(nextState);
        setInteractiveStates(nextState);
    }, [activeSectionId, initialInteractiveStates]);

    useEffect(() => {
        const nextState = initialSelectedOptions || {};
        savedSelectedOptionsRef.current = JSON.stringify(nextState);
        setSelectedOptions(nextState);
    }, [activeSectionId, initialSelectedOptions]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    useEffect(() => {
        if (onSaveHistory && messages.length > 0) {
            onSaveHistory(messages);
        }
    }, [messages, onSaveHistory]);

    useEffect(() => {
        const nextSerialized = JSON.stringify(interactiveStates);
        if (nextSerialized === savedInteractiveStatesRef.current) return;
        savedInteractiveStatesRef.current = nextSerialized;
        if (onSaveInteractiveStates) {
            onSaveInteractiveStates(interactiveStates);
        }
    }, [interactiveStates, onSaveInteractiveStates]);

    useEffect(() => {
        const nextSerialized = JSON.stringify(selectedOptions);
        if (nextSerialized === savedSelectedOptionsRef.current) return;
        savedSelectedOptionsRef.current = nextSerialized;
        if (onSaveSelectedOptions) {
            onSaveSelectedOptions(selectedOptions);
        }
    }, [onSaveSelectedOptions, selectedOptions]);

    const callAI = async (history) => {
        const apiKeyObj = apiKeys?.[selectedApiKey || 0];
        const keyToUse = apiKeyObj?.key?.trim();
        const provider = apiKeyObj?.provider || 'openai';
        const userModel = apiKeyObj?.model;

        if (!keyToUse) return t('chat.noApiKey');

        try {
            if (provider === 'gemini') {
                const modelToUse = userModel || 'gemini-3.1-pro-preview';
                const contents = [
                    { role: 'user', parts: [{ text: systemPrompt }] },
                    { role: 'model', parts: [{ text: 'はい、Plan を一緒に整理します。' }] },
                ];

                history.forEach((message) => {
                    contents.push({
                        role: message.role === 'user' ? 'user' : 'model',
                        parts: [{ text: message.content }],
                    });
                });

                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${keyToUse}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents }),
                    },
                );
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || 'Gemini Error');
                return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
            }

            if (provider === 'anthropic') {
                const modelToUse = userModel || 'claude-sonnet-4-6';
                const messagesForApi = history.map((message) => ({
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
                        system: systemPrompt,
                        messages: messagesForApi,
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
            const messagesForApi = [{ role: 'system', content: systemPrompt }];

            history.forEach((message) => {
                messagesForApi.push({
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
                body: JSON.stringify({ model: modelToUse, messages: messagesForApi }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || 'LLM Error');
            return data.choices?.[0]?.message?.content || 'No response.';
        } catch (error) {
            return `Error: ${error.message}`;
        }
    };

    const handleSend = async (overrideText = null) => {
        const text = overrideText || input.trim();
        if (!text || isLoading || readOnly) return;

        const userMessage = { role: 'user', content: text };
        const nextHistory = [...messages, userMessage];
        setMessages(nextHistory);

        if (!overrideText) {
            setInput('');
        }

        setIsLoading(true);
        const reply = await callAI(nextHistory);
        const aiMessage = { role: 'ai', content: reply };
        const finalHistory = [...nextHistory, aiMessage];
        setMessages(finalHistory);
        setIsLoading(false);

        if (completionTag && reply.includes(completionTag)) {
            const nextValue = reply.replace(completionTag, '').trim();
            if (onComplete) onComplete(nextValue);
            else if (onSetGoal) onSetGoal(nextValue);
        }
    };

    const progressItems = useMemo(
        () => collectInteractiveProgress(messages, interactiveStates),
        [interactiveStates, messages],
    );
    const completedProgressCount = progressItems.filter((item) => item.checked).length;

    const toggleCheckbox = (messageIndex, itemId) => {
        setInteractiveStates((previous) => ({
            ...previous,
            [`${messageIndex}-${itemId}`]: !previous[`${messageIndex}-${itemId}`],
        }));
    };

    const selectOption = (messageIndex, itemId) => {
        setSelectedOptions((previous) => ({
            ...previous,
            [messageIndex]: itemId,
        }));
    };

    const submitInteractive = (messageIndex, parsed) => {
        const responseText = buildInteractiveResponseText(parsed, messageIndex, interactiveStates, selectedOptions);
        if (responseText) {
            handleSend(responseText);
        }
    };

    const renderAIMessage = (content, messageIndex) => {
        const cleanContent = completionTag ? content.replace(completionTag, '').trim() : content;
        const parsed = parseInteractiveContent(cleanContent);
        const hasInteractive = parsed.some((part) => part.type === 'checkbox' || part.type === 'select');
        const canSubmit = hasInteractiveSelection(parsed, messageIndex, interactiveStates, selectedOptions);

        return (
            <div>
                {parsed.map((part, partIndex) => {
                    if (part.type === 'text') {
                        return (
                            <div key={partIndex} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                                {part.content}
                            </div>
                        );
                    }

                    if (part.type === 'checkbox') {
                        return (
                            <div key={partIndex} style={{ margin: '0.6rem 0' }}>
                                {part.title && (
                                    <div style={{ marginBottom: '0.45rem', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                                        {part.title}
                                    </div>
                                )}
                                {part.items.map((item) => {
                                    const checked = Boolean(interactiveStates[`${messageIndex}-${item.id}`]);
                                    return (
                                        <button
                                            type="button"
                                            key={item.id}
                                            onClick={() => !readOnly && toggleCheckbox(messageIndex, item.id)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                width: '100%',
                                                padding: '0.55rem 0.75rem',
                                                marginBottom: '0.35rem',
                                                background: checked ? 'rgba(92, 124, 250, 0.15)' : 'rgba(255,255,255,0.02)',
                                                border: checked ? '1px solid rgba(92, 124, 250, 0.4)' : '1px solid var(--panel-border)',
                                                boxShadow: checked ? '0 4px 12px rgba(92, 124, 250, 0.15)' : 'none',
                                                borderRadius: '12px',
                                                cursor: 'pointer',
                                                color: 'var(--text-main)',
                                                fontSize: '0.88rem',
                                                textAlign: 'left',
                                                transition: 'var(--transition-smooth)',
                                                fontFamily: 'inherit',
                                            }}
                                        >
                                            {checked ? <CheckSquare size={16} color="var(--primary)" /> : <Square size={16} color="var(--text-muted)" />}
                                            {item.label}
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    }

                    if (part.type === 'select') {
                        return (
                            <div key={partIndex} style={{ margin: '0.6rem 0' }}>
                                {part.title && (
                                    <div style={{ marginBottom: '0.45rem', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                                        {part.title}
                                    </div>
                                )}
                                <div style={{ display: 'grid', gridTemplateColumns: part.items.length <= 4 ? 'repeat(2, 1fr)' : '1fr', gap: '0.35rem' }}>
                                    {part.items.map((item) => {
                                        const isSelected = selectedOptions[messageIndex] === item.id;
                                        return (
                                            <button
                                                type="button"
                                                key={item.id}
                                                onClick={() => !readOnly && selectOption(messageIndex, item.id)}
                                                style={{
                                                    padding: '0.6rem 0.8rem',
                                                    background: isSelected ? 'rgba(92, 124, 250, 0.15)' : 'rgba(255,255,255,0.02)',
                                                    border: isSelected ? '2px solid var(--primary)' : '1px solid var(--panel-border)',
                                                    boxShadow: isSelected ? '0 4px 12px rgba(92, 124, 250, 0.2)' : 'none',
                                                    borderRadius: '14px',
                                                    cursor: 'pointer',
                                                    color: 'var(--text-main)',
                                                    fontSize: '0.85rem',
                                                    textAlign: 'left',
                                                    transition: 'var(--transition-smooth)',
                                                    fontFamily: 'inherit',
                                                    fontWeight: isSelected ? 500 : 400,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.4rem',
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        width: '22px',
                                                        height: '22px',
                                                        borderRadius: '50%',
                                                        flexShrink: 0,
                                                        background: isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                                                        color: isSelected ? 'white' : 'var(--text-muted)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    {item.value.replace(/[.)\]]/g, '')}
                                                </span>
                                                {item.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    }

                    return null;
                })}

                {hasInteractive && messageIndex === messages.length - 1 && (!completionTag || !content.includes(completionTag)) && (
                    <button
                        type="button"
                        onClick={() => submitInteractive(messageIndex, parsed)}
                        disabled={!canSubmit || readOnly}
                        style={{
                            marginTop: '0.6rem',
                            padding: '0.5rem 1.2rem',
                            background: 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '20px',
                            cursor: canSubmit ? 'pointer' : 'default',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                            transition: 'all 0.2s',
                            fontFamily: 'inherit',
                            opacity: canSubmit ? 1 : 0.55,
                        }}
                    >
                        回答を送信 →
                    </button>
                )}
            </div>
        );
    };

    const hasCompletedGoal = Boolean(completionTag) && messages.some((message) => message.content.includes(completionTag));

    return (
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-dark)', height: '100%' }}>
            <div
                style={{
                    padding: '0.9rem 1.5rem',
                    borderBottom: '1px solid var(--panel-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                    <button type="button" onClick={onClose} className="btn-icon" style={{ width: '32px', height: '32px' }}>
                        <ArrowLeft size={16} />
                    </button>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0, flexWrap: 'wrap' }}>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 500 }}>{resolvedTitle}</h3>
                            <button
                                type="button"
                                onClick={() => setShowProgressPanel((current) => !current)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    padding: '0.34rem 0.72rem',
                                    borderRadius: '999px',
                                    border: '1px solid var(--panel-border)',
                                    background: showProgressPanel ? 'rgba(92, 124, 250, 0.14)' : 'rgba(255,255,255,0.04)',
                                    color: 'var(--text-main)',
                                    cursor: 'pointer',
                                    fontSize: '0.76rem',
                                    fontFamily: 'inherit',
                                }}
                            >
                                <ListTodo size={13} color="var(--primary)" />
                                {progressItems.length > 0 ? `${t('goal.progress')} ${completedProgressCount}/${progressItems.length}` : t('goal.progress')}
                            </button>
                        </div>
                        {sectionTabs.length > 1 && (
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                {sectionTabs.map((tab) => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => onSelectSection && onSelectSection(tab.id)}
                                        disabled={tab.disabled}
                                        style={{
                                            padding: '0.34rem 0.72rem',
                                            borderRadius: '999px',
                                            border: tab.active ? '1px solid rgba(92, 124, 250, 0.42)' : '1px solid var(--panel-border)',
                                            background: tab.active ? 'rgba(92, 124, 250, 0.16)' : 'rgba(255,255,255,0.04)',
                                            color: tab.active ? '#dbe5ff' : 'var(--text-main)',
                                            cursor: tab.disabled ? 'default' : 'pointer',
                                            fontSize: '0.74rem',
                                            fontFamily: 'inherit',
                                            opacity: tab.disabled ? 0.45 : 1,
                                        }}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        )}
                        {(readOnlyMessage || versionOptions.length > 0) && (
                            <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                {versionOptions.length > 0 && (
                                    <>
                                        <select
                                            value={selectedVersionId || ''}
                                            onChange={(event) => onSelectVersion && onSelectVersion(event.target.value)}
                                            style={{
                                                background: 'rgba(255,255,255,0.04)',
                                                color: 'var(--text-main)',
                                                border: '1px solid var(--panel-border)',
                                                borderRadius: '999px',
                                                padding: '0.28rem 0.75rem',
                                                fontSize: '0.74rem',
                                            }}
                                        >
                                            {versionOptions.map((version) => (
                                                <option key={version.id} value={version.id}>
                                                    {version.label}
                                                </option>
                                            ))}
                                        </select>
                                        {canCreateVersion && (
                                            <button
                                                type="button"
                                                onClick={() => onCreateVersion && onCreateVersion()}
                                                style={{
                                                    padding: '0.3rem 0.72rem',
                                                    borderRadius: '999px',
                                                    border: '1px solid var(--panel-border)',
                                                    background: 'rgba(255,255,255,0.04)',
                                                    color: 'var(--text-main)',
                                                    cursor: 'pointer',
                                                    fontSize: '0.74rem',
                                                    fontFamily: 'inherit',
                                                }}
                                            >
                                                新しい版
                                            </button>
                                        )}
                                        {canRestoreVersion && (
                                            <button
                                                type="button"
                                                onClick={() => onRestoreVersion && onRestoreVersion()}
                                                style={{
                                                    padding: '0.3rem 0.72rem',
                                                    borderRadius: '999px',
                                                    border: '1px solid rgba(92, 124, 250, 0.28)',
                                                    background: 'rgba(92, 124, 250, 0.14)',
                                                    color: '#dbe5ff',
                                                    cursor: 'pointer',
                                                    fontSize: '0.74rem',
                                                    fontFamily: 'inherit',
                                                }}
                                            >
                                                この版を復元
                                            </button>
                                        )}
                                    </>
                                )}
                                {readOnlyMessage && (
                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                        {readOnlyMessage}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    maxWidth: '780px',
                    width: '100%',
                    margin: '0 auto',
                    minWidth: 0,
                }}
            >
                {readOnlyMessage && (
                    <div
                        style={{
                            padding: '0.85rem 1rem',
                            borderRadius: '14px',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid var(--panel-border)',
                            color: 'var(--text-muted)',
                            fontSize: '0.82rem',
                            lineHeight: 1.65,
                        }}
                    >
                        {readOnlyMessage}
                    </div>
                )}
                {showProgressPanel && (
                    <div
                        style={{
                            background: 'var(--panel-bg)',
                            border: '1px solid var(--panel-border)',
                            borderRadius: '18px',
                            padding: '1rem 1.1rem',
                            boxShadow: 'var(--shadow-sm)',
                            display: 'grid',
                            gap: '0.65rem',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.86rem', fontWeight: 600 }}>
                            <ListTodo size={15} color="var(--primary)" />
                            {t('goal.progress')}
                            {progressItems.length > 0 && (
                                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                    {completedProgressCount}/{progressItems.length}
                                </span>
                            )}
                        </div>
                        {progressItems.length === 0 ? (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                {t('goal.progressEmpty')}
                            </div>
                        ) : (
                            progressItems.map((item) => (
                                <div
                                    key={item.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '0.55rem',
                                        padding: '0.52rem 0.6rem',
                                        borderRadius: '12px',
                                        background: item.checked ? 'rgba(52, 211, 153, 0.08)' : 'rgba(255,255,255,0.03)',
                                        border: item.checked ? '1px solid rgba(52, 211, 153, 0.24)' : '1px solid rgba(255,255,255,0.05)',
                                    }}
                                >
                                    {item.checked ? <CheckSquare size={16} color="var(--action)" /> : <Square size={16} color="var(--text-muted)" />}
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>{item.label}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.18rem' }}>{item.groupTitle}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {messages.map((message, index) => (
                    <div
                        key={index}
                        style={{
                            display: 'flex',
                            gap: '0.75rem',
                            flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
                        }}
                    >
                        <div
                            style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: '50%',
                                flexShrink: 0,
                                background: message.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.8rem',
                            }}
                        >
                            {message.role === 'user' ? 'U' : 'AI'}
                        </div>
                        <div
                            style={{
                                background: message.role === 'user' ? 'linear-gradient(135deg, var(--primary) 0%, #748ffc 100%)' : 'var(--panel-bg)',
                                color: message.role === 'user' ? 'white' : 'var(--text-main)',
                                padding: '0.8rem 1.25rem',
                                borderRadius: message.role === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                                border: message.role === 'ai' ? '1px solid var(--panel-border)' : '1px solid rgba(255,255,255,0.1)',
                                boxShadow: message.role === 'user' ? '0 4px 15px rgba(92, 124, 250, 0.25)' : 'var(--shadow-sm)',
                                maxWidth: '85%',
                                fontSize: '0.92rem',
                                lineHeight: 1.75,
                                backdropFilter: message.role === 'ai' ? 'blur(20px)' : 'none',
                                WebkitBackdropFilter: message.role === 'ai' ? 'blur(20px)' : 'none',
                            }}
                        >
                            {message.role === 'ai' ? renderAIMessage(message.content, index) : message.content}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div style={{ display: 'flex', gap: '0.75rem', animation: 'pulse 1.5s infinite' }}>
                        <div
                            style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: '50%',
                                background: 'rgba(255,255,255,0.06)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            AI
                        </div>
                        <div style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            {t('goal.thinking')}
                        </div>
                    </div>
                )}

                {hasCompletedGoal && (
                    <div style={{ textAlign: 'center', color: 'var(--action)', fontSize: '0.88rem', padding: '1rem', animation: 'fadeIn 0.5s' }}>
                        ✓ {t('goal.complete')}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: '1.25rem 2rem', borderTop: '1px solid var(--panel-border)' }}>
                <div
                    style={{
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
                        maxWidth: '780px',
                        margin: '0 auto',
                        transition: 'var(--transition-smooth)',
                        minHeight: '56px',
                    }}
                >
                    <textarea
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder={resolvedPlaceholder}
                        disabled={readOnly}
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-main)',
                            resize: 'none',
                            outline: 'none',
                            padding: '0.4rem 0',
                            minHeight: '32px',
                            maxHeight: '120px',
                            fontSize: '0.9rem',
                            fontFamily: 'inherit',
                        }}
                        rows={1}
                    />
                    <button
                        type="button"
                        onClick={() => handleSend()}
                        disabled={readOnly || isLoading || !input.trim()}
                        style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            background: input.trim() ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                            color: input.trim() ? 'white' : 'var(--text-muted)',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: input.trim() ? 'pointer' : 'default',
                            transition: 'all 0.2s',
                        }}
                    >
                        <Send size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
}
