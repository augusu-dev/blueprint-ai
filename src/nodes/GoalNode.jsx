import React, { useState, useEffect, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Send, CheckSquare, Square, Target, Bot, User } from 'lucide-react';
import { useLanguage } from '../i18n';

// Parse AI response for interactive elements
function parseInteractiveContent(text) {
    const parts = [];
    const lines = text.split('\n');
    let currentText = '';
    let inOptions = false;
    let optionGroup = { type: null, items: [], title: '' };

    const flushText = () => {
        if (currentText.trim()) {
            parts.push({ type: 'text', content: currentText.trim() });
            currentText = '';
        }
    };

    const flushOptions = () => {
        if (optionGroup.items.length > 0) {
            parts.push({ ...optionGroup });
            optionGroup = { type: null, items: [], title: '' };
            inOptions = false;
        }
    };

    for (const line of lines) {
        const trimmed = line.trim();
        const cbMatch = trimmed.match(/^[□☐\-\*]?\s*[\[（(]?\s*[\]）)]?\s*(.+)$/);
        const isCheckbox = trimmed.startsWith('□') || trimmed.startsWith('☐') || trimmed.match(/^-\s*\[\s*\]/);
        const numMatch = trimmed.match(/^([1-9A-D][.)\]）])\s*(.+)$/);

        if (isCheckbox) {
            if (!inOptions || optionGroup.type !== 'checkbox') {
                flushText();
                flushOptions();
                inOptions = true;
                optionGroup = { type: 'checkbox', items: [], title: '' };
            }
            const label = trimmed.replace(/^[□☐\-\*]\s*[\[（(]?\s*[\]）)]?\s*/, '').trim();
            optionGroup.items.push({ label, checked: false, id: `cb-${Math.random().toString(36).substr(2, 5)}` });
        } else if (numMatch && inOptions && optionGroup.type === 'select') {
            optionGroup.items.push({ label: numMatch[2], value: numMatch[1], id: `sel-${Math.random().toString(36).substr(2, 5)}` });
        } else if (numMatch && !inOptions) {
            flushText();
            inOptions = true;
            optionGroup = { type: 'select', items: [{ label: numMatch[2], value: numMatch[1], id: `sel-${Math.random().toString(36).substr(2, 5)}` }], title: '' };
        } else {
            if (inOptions) {
                if (trimmed.includes('選んで') || trimmed.includes('select') || trimmed.includes('choose') || trimmed.includes('该当') || trimmed.includes('チェック')) {
                    flushOptions();
                    flushText();
                    optionGroup.title = trimmed;
                } else if (trimmed === '') {
                } else {
                    flushOptions();
                    currentText += line + '\n';
                }
            } else {
                currentText += line + '\n';
            }
        }
    }
    flushText();
    flushOptions();
    return parts;
}

const GOAL_SYSTEM_PROMPT = `あなたはワークスペースの目標設定アシスタントです。ユーザーがこの作業の目的や目標を定義するのを対話形式でサポートしてください。

重要なルール:
1. **一度に1つの質問だけ**を聞いてください。複数の質問を同時に出さないでください。
2. ユーザーの回答を受けて、次の1つの質問を出してください
3. 質問形式は以下をランダムに使ってください（一問一答で）:
   - チェックボックス形式 (複数選択可): 該当するものを選んでくださいの後に、□で始まる選択肢を各行に
   - 番号選択形式 (単一選択): 最適なものを選んでくださいの後に、1. 2. 3. 4. で始まる選択肢を各行に
   - 自由回答: 具体的な質問文を書くだけ（選択肢なし）
4. 4〜6往復の会話で切りの良いところでまとめてください
5. まとめる時は「[GOAL_COMPLETE]」マーカーをつけて、「このチャットの目標:」から始まる簡潔なまとめを書いてください
6. 対話は自然で温かみのあるトーンで`;

export default function GoalNode({ data, id }) {
    const { t } = useLanguage();
    const {
        apiKeys = [],
        selectedApiKey = 0,
        goalHistory = [],
        onUpdateNodeData
    } = data;

    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [interactiveStates, setInteractiveStates] = useState({});
    const [selectedOptions, setSelectedOptions] = useState({});
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [goalHistory]);

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
                    { role: 'model', parts: [{ text: 'はい、目標設定をお手伝いします。' }] }
                ];
                history.forEach(m => contents.push({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${keyToUse}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents })
                });
                const resData = await response.json();
                if (!response.ok) throw new Error(resData.error?.message || 'Gemini Error');
                return resData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
            } else if (provider === 'anthropic') {
                const modelToUse = userModel || 'claude-sonnet-4-6';
                const msgs = history.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': keyToUse, 'anthropic-version': '2023-06-01', 'anthropic-dangerously-allow-browser': 'true' },
                    body: JSON.stringify({ model: modelToUse, max_tokens: 2048, system: GOAL_SYSTEM_PROMPT, messages: msgs })
                });
                const resData = await response.json();
                if (!response.ok) throw new Error(resData.error?.message || 'Anthropic Error');
                return resData.content?.[0]?.text || 'No response.';
            } else {
                const modelToUse = userModel || (provider === 'openai' ? 'gpt-5.3-chat-latest' : provider === 'openrouter' ? 'google/gemini-3.1-pro-preview' : 'glm-4-plus');
                const endpoint = provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' :
                    provider === 'glm' ? 'https://open.bigmodel.cn/api/paas/v4/chat/completions' : 'https://api.openai.com/v1/chat/completions';
                const msgs = [{ role: 'system', content: GOAL_SYSTEM_PROMPT }];
                history.forEach(m => msgs.push({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));
                const response = await fetch(endpoint, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keyToUse}` },
                    body: JSON.stringify({ model: modelToUse, messages: msgs })
                });
                const resData = await response.json();
                if (!response.ok) throw new Error(resData.error?.message || 'LLM Error');
                return resData.choices?.[0]?.message?.content || 'No response.';
            }
        } catch (err) {
            return `Error: ${err.message}`;
        }
    };

    const handleSend = async (overrideText = null) => {
        const text = overrideText || input.trim();
        if (!text || isLoading) return;

        const userMsg = { role: 'user', content: text };
        const updatedHistory = [...(goalHistory || []), userMsg];
        onUpdateNodeData(id, 'goalHistory', updatedHistory);

        if (!overrideText) setInput('');
        setIsLoading(true);

        const reply = await callAI(updatedHistory);
        const aiMsg = { role: 'ai', content: reply };
        const finalHistory = [...updatedHistory, aiMsg];
        onUpdateNodeData(id, 'goalHistory', finalHistory);
        setIsLoading(false);

        if (reply.includes('[GOAL_COMPLETE]') && data.onSetGoalFromNode) {
            const goalText = reply.replace('[GOAL_COMPLETE]', '').trim();
            // This is passed from Editor to trigger the update on the main sequence node
            data.onSetGoalFromNode(id, goalText);
        }
    };

    const toggleCheckbox = (msgIdx, itemId) => {
        setInteractiveStates(prev => {
            const key = `${msgIdx}-${itemId}`;
            return { ...prev, [key]: !prev[key] };
        });
    };

    const selectOption = (msgIdx, itemId) => {
        setSelectedOptions(prev => ({
            ...prev,
            [msgIdx]: itemId
        }));
    };

    const submitInteractive = (msgIdx, parsed) => {
        let responseText = '';
        parsed.forEach(part => {
            if (part.type === 'checkbox') {
                const selected = part.items.filter(item => interactiveStates[`${msgIdx}-${item.id}`]);
                if (selected.length > 0) responseText += selected.map(s => s.label).join('、') + '\n';
            } else if (part.type === 'select') {
                const selId = selectedOptions[msgIdx];
                const sel = part.items.find(it => it.id === selId);
                if (sel) responseText += sel.label + '\n';
            }
        });
        if (responseText.trim()) handleSend(responseText.trim());
    };

    const renderAIMessage = (content, msgIdx) => {
        const cleanContent = content.replace('[GOAL_COMPLETE]', '').trim();
        const parsed = parseInteractiveContent(cleanContent);
        const hasInteractive = parsed.some(p => p.type === 'checkbox' || p.type === 'select');

        return (
            <div>
                {parsed.map((part, pi) => {
                    if (part.type === 'text') {
                        return <div key={pi} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{part.content}</div>;
                    }
                    if (part.type === 'checkbox') {
                        return (
                            <div key={pi} className="nodrag nopan" style={{ margin: '0.4rem 0' }}>
                                {part.items.map(item => {
                                    const checked = !!interactiveStates[`${msgIdx}-${item.id}`];
                                    return (
                                        <div key={item.id}
                                            onClick={() => toggleCheckbox(msgIdx, item.id)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                width: '100%', padding: '0.4rem 0.6rem', marginBottom: '0.2rem',
                                                background: checked ? 'rgba(92, 124, 250, 0.15)' : 'rgba(255,255,255,0.02)',
                                                border: checked ? '1px solid rgba(92, 124, 250, 0.4)' : '1px solid var(--panel-border)',
                                                boxShadow: checked ? '0 2px 8px rgba(92, 124, 250, 0.15)' : 'none',
                                                borderRadius: '8px', cursor: 'pointer', color: 'var(--text-main)',
                                                fontSize: '0.75rem', textAlign: 'left', transition: 'var(--transition-smooth)'
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
                            <div key={pi} className="nodrag nopan" style={{ margin: '0.4rem 0', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                {part.items.map(item => {
                                    const isSelected = selectedOptions[msgIdx] === item.id;
                                    return (
                                        <div key={item.id}
                                            onClick={() => selectOption(msgIdx, item.id)}
                                            style={{
                                                padding: '0.4rem 0.6rem',
                                                background: isSelected ? 'rgba(92, 124, 250, 0.15)' : 'rgba(255,255,255,0.02)',
                                                border: isSelected ? '1px solid var(--primary)' : '1px solid var(--panel-border)',
                                                boxShadow: isSelected ? '0 2px 8px rgba(92, 124, 250, 0.2)' : 'none',
                                                borderRadius: '8px', cursor: 'pointer', color: 'var(--text-main)',
                                                fontSize: '0.75rem', textAlign: 'left', transition: 'var(--transition-smooth)',
                                                display: 'flex', alignItems: 'center', gap: '0.3rem'
                                            }}
                                        >
                                            <span style={{
                                                width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                                                background: isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                                                color: isSelected ? 'white' : 'var(--text-muted)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.65rem', fontWeight: 600
                                            }}>
                                                {item.value.replace(/[.)）\]]/g, '')}
                                            </span>
                                            {item.label}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    }
                    return null;
                })}
                {hasInteractive && msgIdx === (goalHistory || []).length - 1 && !content.includes('[GOAL_COMPLETE]') && (
                    <button
                        className="nodrag nopan"
                        onClick={() => submitInteractive(msgIdx, parsed)}
                        style={{
                            marginTop: '0.4rem', padding: '0.35rem 0.8rem', background: 'var(--primary)',
                            color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer',
                            fontSize: '0.75rem', fontWeight: 500, transition: 'var(--transition-smooth)'
                        }}
                    >
                        回答を送信 →
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="glass-panel" style={{
            width: '380px',
            height: '460px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRadius: '16px',
            border: '1px solid var(--primary)', // Highlight to show it's special
            boxShadow: '0 8px 32px rgba(92, 124, 250, 0.15)'
        }}>
            {/* Header */}
            <div className="editor-header" style={{
                padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: 'linear-gradient(135deg, rgba(92,124,250,0.1), transparent)'
            }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                    <Target size={14} />
                </div>
                <div>
                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>{t('goal.title')}</h3>
                    <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--text-muted)' }}>ワークスペースの目的を設定します</p>
                </div>
            </div>

            {/* Content / Chat */}
            <div className="nodrag nowheel" style={{
                flex: 1, overflowY: 'auto', padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.75rem'
            }}>
                {(!goalHistory || goalHistory.length === 0) && (
                    <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <Bot size={24} style={{ opacity: 0.3, marginBottom: '0.4rem' }} />
                        <p style={{ margin: 0 }}>右のノードでチャットを始める前に、ここで目的を定めましょう。</p>
                    </div>
                )}
                {(goalHistory || []).map((msg, idx) => (
                    <div key={idx} style={{
                        display: 'flex', gap: '0.5rem',
                        flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
                    }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0, background: msg.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>
                            {msg.role === 'user' ? <User size={12} color="white" /> : <Target size={12} color="var(--primary)" />}
                        </div>
                        <div style={{
                            background: msg.role === 'user' ? 'linear-gradient(135deg, var(--primary) 0%, #748ffc 100%)' : 'var(--panel-bg)',
                            color: msg.role === 'user' ? 'white' : 'var(--text-main)',
                            padding: '0.55rem 0.8rem',
                            borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                            border: msg.role === 'ai' ? '1px solid var(--panel-border)' : '1px solid rgba(255,255,255,0.1)',
                            boxShadow: msg.role === 'user' ? '0 2px 8px rgba(92, 124, 250, 0.2)' : 'var(--shadow-sm)',
                            maxWidth: '88%', fontSize: '0.82rem', lineHeight: 1.6
                        }}>
                            {msg.role === 'ai' ? renderAIMessage(msg.content, idx) : msg.content}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div style={{ display: 'flex', gap: '0.5rem', animation: 'pulse 1.5s infinite' }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Target size={12} color="var(--primary)" /></div>
                        <div style={{ padding: '0.55rem 0.8rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('goal.thinking')}</div>
                    </div>
                )}
                {(goalHistory || []).some(m => m.content.includes('[GOAL_COMPLETE]')) && (
                    <div style={{ textAlign: 'center', color: 'var(--action)', fontSize: '0.8rem', fontWeight: 500, padding: '0.5rem', animation: 'fadeIn 0.5s', border: '1px solid rgba(52, 211, 153, 0.2)', borderRadius: '8px', background: 'rgba(52, 211, 153, 0.05)' }}>
                        <Check size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-2px' }} />
                        {t('goal.complete')}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="nodrag nopan" style={{ padding: '0.6rem', borderTop: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: '20px', padding: '0.2rem 0.2rem 0.2rem 0.6rem', alignItems: 'center' }}>
                    <textarea
                        value={input} onChange={e => setInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder={t('goal.placeholder')}
                        style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)', resize: 'none', outline: 'none', padding: '0.4rem 0', minHeight: '24px', maxHeight: '80px', fontSize: '0.8rem', fontFamily: 'inherit' }}
                        rows={1}
                    />
                    <button onClick={() => handleSend()} disabled={isLoading || !input.trim()}
                        style={{ width: '28px', height: '28px', borderRadius: '50%', background: input.trim() ? 'var(--primary)' : 'rgba(255,255,255,0.05)', color: input.trim() ? 'white' : 'var(--text-muted)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default', transition: 'all 0.2s', flexShrink: 0 }}>
                        <Send size={12} />
                    </button>
                </div>
            </div>

            {/* Connection Handle to next node */}
            <Handle type="source" position={Position.Right} id="goal" style={{ right: -8, width: 14, height: 14, background: 'var(--primary)', border: '2px solid var(--bg-dark)' }} />
        </div>
    );
}
