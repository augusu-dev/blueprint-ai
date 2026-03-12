import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
import { Bot, Check, CheckSquare, ListTodo, Send, Square, Target, User } from 'lucide-react';
import { useLanguage } from '../i18n';
import {
    buildInteractiveResponseText,
    collectInteractiveProgress,
    hasInteractiveSelection,
    parseInteractiveContent,
} from '../lib/interactiveContent';

const GOAL_SYSTEM_PROMPT = `あなたは Plan 設計アシスタントです。
このセッションでは、目標、計画、報酬設計、改善ポイントを短い対話で整理してください。

ルール:
1. まず目標と期限・タイムラインを確認してください。
2. 次に計画を、段階・今週やること・次にやることへ具体化してください。
3. 必要なら報酬設計として、小さなごほうびや節目を提案してください。
4. 必要なら改善として、詰まりそうな点や改善策を整理してください。
5. 一度に質問は1つだけにしてください。
6. 複数選択を出すときは \`- [ ] 選択肢\` の形式を使ってください。
7. 単一選択を出すときは \`1. 選択肢\` の形式を使ってください。
8. 標準運用として、週2回の軽い進捗確認で計画を微調整する前提にしてください。
9. まとまったら [GOAL_COMPLETE] を先頭につけて、次の5行で簡潔にまとめてください。
   この Plan の目標: ...
   タイムライン: ...
   計画メモ: ...
   報酬設計: ...
   改善メモ: ...
10. 日本語で自然に返答してください。`;

export default function GoalNode({ data, id }) {
    const { t } = useLanguage();
    const updateNodeInternals = useUpdateNodeInternals();
    const isLR = data.dir === 'LR';
    const sourcePos = isLR ? Position.Right : Position.Bottom;
    const {
        apiKeys = [],
        selectedApiKey = 0,
        goalHistory = [],
        goalInteractiveStates = {},
        goalSelectedOptions = {},
        onUpdateNodeData,
        onChange,
        onSetGoalFromNode,
    } = data;
    const persistNodeData = onUpdateNodeData || onChange;

    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [interactiveStates, setInteractiveStates] = useState(goalInteractiveStates);
    const [selectedOptions, setSelectedOptions] = useState(goalSelectedOptions);
    const [showProgressPanel, setShowProgressPanel] = useState(false);
    const messagesEndRef = useRef(null);
    const savedInteractiveStatesRef = useRef(JSON.stringify(goalInteractiveStates || {}));
    const savedSelectedOptionsRef = useRef(JSON.stringify(goalSelectedOptions || {}));

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [goalHistory, isLoading]);

    useEffect(() => {
        const frameId = window.requestAnimationFrame(() => {
            updateNodeInternals(id);
        });
        return () => window.cancelAnimationFrame(frameId);
    }, [goalHistory.length, id, isLoading, updateNodeInternals]);

    useEffect(() => {
        const nextSerialized = JSON.stringify(interactiveStates);
        if (nextSerialized === savedInteractiveStatesRef.current) return;
        savedInteractiveStatesRef.current = nextSerialized;
        if (!persistNodeData) return;
        persistNodeData(id, 'goalInteractiveStates', interactiveStates);
    }, [id, interactiveStates, persistNodeData]);

    useEffect(() => {
        const nextSerialized = JSON.stringify(selectedOptions);
        if (nextSerialized === savedSelectedOptionsRef.current) return;
        savedSelectedOptionsRef.current = nextSerialized;
        if (!persistNodeData) return;
        persistNodeData(id, 'goalSelectedOptions', selectedOptions);
    }, [id, persistNodeData, selectedOptions]);

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
                    { role: 'user', parts: [{ text: GOAL_SYSTEM_PROMPT }] },
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
                const resData = await response.json();
                if (!response.ok) throw new Error(resData.error?.message || 'Gemini Error');
                return resData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
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
                        system: GOAL_SYSTEM_PROMPT,
                        messages,
                    }),
                });
                const resData = await response.json();
                if (!response.ok) throw new Error(resData.error?.message || 'Anthropic Error');
                return resData.content?.[0]?.text || 'No response.';
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
            const messages = [{ role: 'system', content: GOAL_SYSTEM_PROMPT }];

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
            const resData = await response.json();
            if (!response.ok) throw new Error(resData.error?.message || 'LLM Error');
            return resData.choices?.[0]?.message?.content || 'No response.';
        } catch (error) {
            return `Error: ${error.message}`;
        }
    };

    const handleSend = async (overrideText = null) => {
        const text = overrideText || input.trim();
        if (!text || isLoading || !persistNodeData) return;

        const userMessage = { role: 'user', content: text };
        const nextHistory = [...goalHistory, userMessage];
        persistNodeData(id, 'goalHistory', nextHistory);

        if (!overrideText) {
            setInput('');
        }

        setIsLoading(true);
        const reply = await callAI(nextHistory);
        const aiMessage = { role: 'ai', content: reply };
        const finalHistory = [...nextHistory, aiMessage];
        persistNodeData(id, 'goalHistory', finalHistory);
        setIsLoading(false);

        if (reply.includes('[GOAL_COMPLETE]') && onSetGoalFromNode) {
            onSetGoalFromNode(id, reply.replace('[GOAL_COMPLETE]', '').trim());
        }
    };

    const toggleCheckbox = (messageIndex, itemId) => {
        setInteractiveStates((previous) => ({
            ...previous,
            [`${messageIndex}-${itemId}`]: !previous[`${messageIndex}-${itemId}`],
        }));
    };

    const selectOption = (messageIndex, itemId) => {
        setSelectedOptions((previous) => ({ ...previous, [messageIndex]: itemId }));
    };

    const submitInteractive = (messageIndex, parsed) => {
        const responseText = buildInteractiveResponseText(parsed, messageIndex, interactiveStates, selectedOptions);
        if (responseText) {
            handleSend(responseText);
        }
    };

    const progressItems = useMemo(
        () => collectInteractiveProgress(goalHistory, interactiveStates),
        [goalHistory, interactiveStates],
    );
    const completedProgressCount = progressItems.filter((item) => item.checked).length;

    const renderAIMessage = (content, messageIndex) => {
        const cleanContent = content.replace('[GOAL_COMPLETE]', '').trim();
        const parsed = parseInteractiveContent(cleanContent);
        const hasInteractive = parsed.some((part) => part.type === 'checkbox' || part.type === 'select');
        const canSubmit = hasInteractiveSelection(parsed, messageIndex, interactiveStates, selectedOptions);

        return (
            <div>
                {parsed.map((part, partIndex) => {
                    if (part.type === 'text') {
                        return (
                            <div key={partIndex} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                {part.content}
                            </div>
                        );
                    }

                    if (part.type === 'checkbox') {
                        return (
                            <div key={partIndex} className="nodrag nopan" style={{ margin: '0.4rem 0' }}>
                                {part.title && (
                                    <div style={{ marginBottom: '0.3rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                        {part.title}
                                    </div>
                                )}
                                {part.items.map((item) => {
                                    const checked = Boolean(interactiveStates[`${messageIndex}-${item.id}`]);
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => toggleCheckbox(messageIndex, item.id)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                width: '100%',
                                                padding: '0.4rem 0.6rem',
                                                marginBottom: '0.2rem',
                                                background: checked ? 'rgba(92, 124, 250, 0.15)' : 'rgba(255,255,255,0.02)',
                                                border: checked ? '1px solid rgba(92, 124, 250, 0.4)' : '1px solid var(--panel-border)',
                                                boxShadow: checked ? '0 2px 8px rgba(92, 124, 250, 0.15)' : 'none',
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                color: 'var(--text-main)',
                                                fontSize: '0.75rem',
                                                textAlign: 'left',
                                                transition: 'var(--transition-smooth)',
                                            }}
                                        >
                                            {checked ? <CheckSquare size={14} color="var(--primary)" /> : <Square size={14} color="var(--text-muted)" />}
                                            {item.label}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    }

                    if (part.type === 'select') {
                        return (
                            <div key={partIndex} className="nodrag nopan" style={{ margin: '0.4rem 0' }}>
                                {part.title && (
                                    <div style={{ marginBottom: '0.3rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                        {part.title}
                                    </div>
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    {part.items.map((item) => {
                                        const isSelected = selectedOptions[messageIndex] === item.id;
                                        return (
                                            <div
                                                key={item.id}
                                                onClick={() => selectOption(messageIndex, item.id)}
                                                style={{
                                                    padding: '0.4rem 0.6rem',
                                                    background: isSelected ? 'rgba(92, 124, 250, 0.15)' : 'rgba(255,255,255,0.02)',
                                                    border: isSelected ? '1px solid var(--primary)' : '1px solid var(--panel-border)',
                                                    boxShadow: isSelected ? '0 2px 8px rgba(92, 124, 250, 0.2)' : 'none',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    color: 'var(--text-main)',
                                                    fontSize: '0.75rem',
                                                    textAlign: 'left',
                                                    transition: 'var(--transition-smooth)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.3rem',
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        width: '18px',
                                                        height: '18px',
                                                        borderRadius: '50%',
                                                        flexShrink: 0,
                                                        background: isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                                                        color: isSelected ? 'white' : 'var(--text-muted)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '0.65rem',
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    {item.value.replace(/[.)\]]/g, '')}
                                                </span>
                                                {item.label}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    }

                    return null;
                })}

                {hasInteractive && messageIndex === goalHistory.length - 1 && !content.includes('[GOAL_COMPLETE]') && (
                    <button
                        type="button"
                        className="nodrag nopan"
                        onClick={() => submitInteractive(messageIndex, parsed)}
                        disabled={!canSubmit}
                        style={{
                            marginTop: '0.4rem',
                            padding: '0.35rem 0.8rem',
                            background: 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            cursor: canSubmit ? 'pointer' : 'default',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            transition: 'var(--transition-smooth)',
                            opacity: canSubmit ? 1 : 0.55,
                        }}
                    >
                        回答を送信
                    </button>
                )}
            </div>
        );
    };

    const hasCompletedGoal = goalHistory.some((message) => message.content.includes('[GOAL_COMPLETE]'));

    return (
        <div
            className="glass-panel"
            style={{
                width: '380px',
                height: '460px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'visible',
                position: 'relative',
                borderRadius: '16px',
                border: '1px solid var(--primary)',
                boxShadow: '0 8px 32px rgba(92, 124, 250, 0.15)',
            }}
        >
            <div
                className="editor-header"
                style={{
                    flexShrink: 0,
                    padding: '0.6rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: 'linear-gradient(135deg, rgba(92,124,250,0.1), transparent)',
                }}
            >
                <div
                    style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '8px',
                        background: 'var(--primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                    }}
                >
                    <Target size={14} />
                </div>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>{t('goal.title')}</h3>
                        <button
                            type="button"
                            className="nodrag nopan"
                            onClick={() => setShowProgressPanel((current) => !current)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.22rem',
                                padding: '0.16rem 0.42rem',
                                borderRadius: '999px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: showProgressPanel ? 'rgba(92, 124, 250, 0.14)' : 'rgba(255,255,255,0.04)',
                                color: 'var(--text-main)',
                                cursor: 'pointer',
                                fontSize: '0.62rem',
                                fontFamily: 'inherit',
                            }}
                        >
                            <ListTodo size={11} color="var(--primary)" />
                            {progressItems.length > 0 ? `${completedProgressCount}/${progressItems.length}` : t('goal.progress')}
                        </button>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--text-muted)' }}>目標・計画・報酬・改善を整理します</p>
                </div>
            </div>

            <div
                className="nodrag nowheel"
                style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    padding: '0.8rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                }}
            >
                {showProgressPanel && (
                    <div
                        className="nodrag nopan"
                        style={{
                            padding: '0.7rem 0.75rem',
                            borderRadius: '12px',
                            border: '1px solid var(--panel-border)',
                            background: 'rgba(255,255,255,0.03)',
                            display: 'grid',
                            gap: '0.45rem',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.76rem', fontWeight: 600 }}>
                            <ListTodo size={13} color="var(--primary)" />
                            {t('goal.progress')}
                            {progressItems.length > 0 && (
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                    {completedProgressCount}/{progressItems.length}
                                </span>
                            )}
                        </div>
                        {progressItems.length === 0 ? (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                {t('goal.progressEmpty')}
                            </div>
                        ) : (
                            progressItems.map((item) => (
                                <div
                                    key={item.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '0.45rem',
                                        padding: '0.42rem 0.48rem',
                                        borderRadius: '10px',
                                        background: item.checked ? 'rgba(52, 211, 153, 0.08)' : 'rgba(255,255,255,0.02)',
                                        border: item.checked ? '1px solid rgba(52, 211, 153, 0.24)' : '1px solid rgba(255,255,255,0.05)',
                                    }}
                                >
                                    {item.checked ? <CheckSquare size={14} color="var(--action)" /> : <Square size={14} color="var(--text-muted)" />}
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '0.75rem', lineHeight: 1.45 }}>{item.label}</div>
                                        <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: '0.12rem' }}>{item.groupTitle}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {goalHistory.length === 0 && (
                    <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <Bot size={24} style={{ opacity: 0.3, marginBottom: '0.4rem' }} />
                        <p style={{ margin: 0 }}>ここで Plan を対話形式で整理できます。</p>
                    </div>
                )}

                {goalHistory.map((message, messageIndex) => (
                    <div
                        key={messageIndex}
                        style={{
                            display: 'flex',
                            gap: '0.5rem',
                            flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
                        }}
                    >
                        <div
                            style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                flexShrink: 0,
                                background: message.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.7rem',
                            }}
                        >
                            {message.role === 'user' ? <User size={12} color="white" /> : <Target size={12} color="var(--primary)" />}
                        </div>
                        <div
                            style={{
                                background: message.role === 'user' ? 'linear-gradient(135deg, var(--primary) 0%, #748ffc 100%)' : 'var(--panel-bg)',
                                color: message.role === 'user' ? 'white' : 'var(--text-main)',
                                padding: '0.55rem 0.8rem',
                                borderRadius: message.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                                border: message.role === 'ai' ? '1px solid var(--panel-border)' : '1px solid rgba(255,255,255,0.1)',
                                boxShadow: message.role === 'user' ? '0 2px 8px rgba(92, 124, 250, 0.2)' : 'var(--shadow-sm)',
                                maxWidth: '88%',
                                fontSize: '0.82rem',
                                lineHeight: 1.6,
                            }}
                        >
                            {message.role === 'ai' ? renderAIMessage(message.content, messageIndex) : message.content}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div style={{ display: 'flex', gap: '0.5rem', animation: 'pulse 1.5s infinite' }}>
                        <div
                            style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                background: 'rgba(255,255,255,0.06)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Target size={12} color="var(--primary)" />
                        </div>
                        <div style={{ padding: '0.55rem 0.8rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('goal.thinking')}</div>
                    </div>
                )}

                {hasCompletedGoal && (
                    <div
                        style={{
                            textAlign: 'center',
                            color: 'var(--action)',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            padding: '0.5rem',
                            animation: 'fadeIn 0.5s',
                            border: '1px solid rgba(52, 211, 153, 0.2)',
                            borderRadius: '8px',
                            background: 'rgba(52, 211, 153, 0.05)',
                        }}
                    >
                        <Check size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-2px' }} />
                        {t('goal.complete')}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="nodrag nopan" style={{ flexShrink: 0, padding: '0.6rem', borderTop: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: '20px', padding: '0.2rem 0.2rem 0.2rem 0.6rem', alignItems: 'center' }}>
                    <textarea
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder={t('goal.placeholder')}
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-main)',
                            resize: 'none',
                            outline: 'none',
                            padding: '0.4rem 0',
                            minHeight: '24px',
                            maxHeight: '80px',
                            fontSize: '0.8rem',
                            fontFamily: 'inherit',
                        }}
                        rows={1}
                    />
                    <button
                        type="button"
                        onClick={() => handleSend()}
                        disabled={isLoading || !input.trim() || !persistNodeData}
                        style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: input.trim() ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                            color: input.trim() ? 'white' : 'var(--text-muted)',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: input.trim() ? 'pointer' : 'default',
                            transition: 'all 0.2s',
                            flexShrink: 0,
                        }}
                    >
                        <Send size={12} />
                    </button>
                </div>
            </div>

            <Handle
                type="source"
                position={sourcePos}
                id="goal"
                style={{
                    right: isLR ? -10 : undefined,
                    bottom: isLR ? undefined : -10,
                    left: isLR ? undefined : '50%',
                    top: isLR ? '50%' : undefined,
                    transform: isLR ? 'translateY(-50%)' : 'translateX(-50%)',
                    width: 16,
                    height: 16,
                    background: 'var(--primary)',
                    border: '2px solid var(--bg-dark)',
                    boxShadow: '0 0 0 5px rgba(92, 124, 250, 0.18)',
                    zIndex: 20,
                }}
            />
        </div>
    );
}
