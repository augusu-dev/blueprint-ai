import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Send, CheckSquare, Square } from 'lucide-react';
import { useLanguage } from './i18n';

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
        // Checkbox pattern: □ or ☐ or [ ] or - [ ]
        const cbMatch = trimmed.match(/^[□☐\-\*]?\s*[\[（(]?\s*[\]）)]?\s*(.+)$/);
        const isCheckbox = trimmed.startsWith('□') || trimmed.startsWith('☐') || trimmed.match(/^-\s*\[\s*\]/);
        // Numbered option: 1. or A) etc
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
                // Check if this line looks like it could be followed by options
                if (trimmed.includes('選んで') || trimmed.includes('select') || trimmed.includes('choose') || trimmed.includes('该当') || trimmed.includes('チェック')) {
                    flushOptions();
                    flushText();
                    optionGroup.title = trimmed;
                } else if (trimmed === '') {
                    // empty line — might end the group
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

export default function GoalWizard({ onClose, apiKeys, selectedApiKey, onSetGoal, initialHistory, onSaveHistory }) {
    const { t } = useLanguage();
    const [messages, setMessages] = useState(initialHistory || []);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [interactiveStates, setInteractiveStates] = useState({});
    const [selectedOptions, setSelectedOptions] = useState({});
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Persist history on every change
    useEffect(() => {
        if (onSaveHistory && messages.length > 0) {
            onSaveHistory(messages);
        }
    }, [messages]);

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
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || 'Gemini Error');
                return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
            } else if (provider === 'anthropic') {
                const modelToUse = userModel || 'claude-sonnet-4-6';
                const msgs = history.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': keyToUse, 'anthropic-version': '2023-06-01', 'anthropic-dangerously-allow-browser': 'true' },
                    body: JSON.stringify({ model: modelToUse, max_tokens: 2048, system: GOAL_SYSTEM_PROMPT, messages: msgs })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || 'Anthropic Error');
                return data.content?.[0]?.text || 'No response.';
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
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || 'LLM Error');
                return data.choices?.[0]?.message?.content || 'No response.';
            }
        } catch (err) {
            return `Error: ${err.message}`;
        }
    };

    const handleSend = async (overrideText = null) => {
        const text = overrideText || input.trim();
        if (!text || isLoading) return;

        const userMsg = { role: 'user', content: text };
        const updatedHistory = [...messages, userMsg];
        setMessages(updatedHistory);
        if (!overrideText) setInput('');
        setIsLoading(true);

        const reply = await callAI(updatedHistory);
        const aiMsg = { role: 'ai', content: reply };
        const finalHistory = [...updatedHistory, aiMsg];
        setMessages(finalHistory);
        setIsLoading(false);

        if (reply.includes('[GOAL_COMPLETE]')) {
            const goalText = reply.replace('[GOAL_COMPLETE]', '').trim();
            onSetGoal(goalText);
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
        // Build response from interactive selections
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
                        return <div key={pi} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{part.content}</div>;
                    }
                    if (part.type === 'checkbox') {
                        return (
                            <div key={pi} style={{ margin: '0.6rem 0' }}>
                                {part.items.map(item => {
                                    const checked = !!interactiveStates[`${msgIdx}-${item.id}`];
                                    return (
                                        <button key={item.id}
                                            onClick={() => toggleCheckbox(msgIdx, item.id)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                width: '100%', padding: '0.55rem 0.75rem', marginBottom: '0.35rem',
                                                background: checked ? 'rgba(108, 140, 255, 0.12)' : 'rgba(255,255,255,0.03)',
                                                border: checked ? '1px solid rgba(108, 140, 255, 0.4)' : '1px solid var(--panel-border)',
                                                borderRadius: '10px', cursor: 'pointer', color: 'var(--text-main)',
                                                fontSize: '0.88rem', textAlign: 'left', transition: 'all 0.15s',
                                                fontFamily: 'inherit'
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
                            <div key={pi} style={{ margin: '0.6rem 0', display: 'grid', gridTemplateColumns: part.items.length <= 4 ? 'repeat(2, 1fr)' : '1fr', gap: '0.35rem' }}>
                                {part.items.map(item => {
                                    const isSelected = selectedOptions[msgIdx] === item.id;
                                    return (
                                        <button key={item.id}
                                            onClick={() => selectOption(msgIdx, item.id)}
                                            style={{
                                                padding: '0.6rem 0.8rem',
                                                background: isSelected ? 'rgba(108, 140, 255, 0.15)' : 'rgba(255,255,255,0.03)',
                                                border: isSelected ? '2px solid var(--primary)' : '1px solid var(--panel-border)',
                                                borderRadius: '12px', cursor: 'pointer', color: 'var(--text-main)',
                                                fontSize: '0.85rem', textAlign: 'left', transition: 'all 0.15s',
                                                fontFamily: 'inherit', fontWeight: isSelected ? 500 : 400,
                                                display: 'flex', alignItems: 'center', gap: '0.4rem'
                                            }}
                                        >
                                            <span style={{
                                                width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                                                background: isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                                                color: isSelected ? 'white' : 'var(--text-muted)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.72rem', fontWeight: 600
                                            }}>
                                                {item.value.replace(/[.)）\]]/g, '')}
                                            </span>
                                            {item.label}
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    }
                    return null;
                })}
                {/* Submit button for interactive messages */}
                {hasInteractive && msgIdx === messages.length - 1 && !content.includes('[GOAL_COMPLETE]') && (
                    <button
                        onClick={() => submitInteractive(msgIdx, parsed)}
                        style={{
                            marginTop: '0.6rem', padding: '0.5rem 1.2rem', background: 'var(--primary)',
                            color: 'white', border: 'none', borderRadius: '20px', cursor: 'pointer',
                            fontSize: '0.85rem', fontWeight: 500, transition: 'all 0.2s', fontFamily: 'inherit'
                        }}
                    >
                        回答を送信 →
                    </button>
                )}
            </div>
        );
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-dark)', height: '100%' }}>
            <div style={{ padding: '0.9rem 1.5rem', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button onClick={onClose} className="btn-icon" style={{ width: '32px', height: '32px' }}><ArrowLeft size={16} /></button>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 500 }}>{t('goal.title')}</h3>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '780px', width: '100%', margin: '0 auto' }}>
                {messages.map((msg, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0.75rem', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, background: msg.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>
                            {msg.role === 'user' ? '👤' : '🎯'}
                        </div>
                        <div style={{
                            background: msg.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.04)',
                            color: msg.role === 'user' ? 'white' : 'var(--text-main)',
                            padding: '0.75rem 1rem',
                            borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                            border: msg.role === 'ai' ? '1px solid var(--panel-border)' : 'none',
                            maxWidth: '85%', fontSize: '0.9rem'
                        }}>
                            {msg.role === 'ai' ? renderAIMessage(msg.content, idx) : msg.content}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div style={{ display: 'flex', gap: '0.75rem', animation: 'pulse 1.5s infinite' }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🎯</div>
                        <div style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('goal.thinking')}</div>
                    </div>
                )}
                {messages.some(m => m.content.includes('[GOAL_COMPLETE]')) && (
                    <div style={{ textAlign: 'center', color: 'var(--action)', fontSize: '0.88rem', padding: '1rem', animation: 'fadeIn 0.5s' }}>✅ {t('goal.complete')}</div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--panel-border)' }}>
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)', borderRadius: '20px', overflow: 'hidden', padding: '0.2rem 0.2rem 0.2rem 0.9rem', alignItems: 'flex-end', maxWidth: '780px', margin: '0 auto' }}>
                    <textarea value={input} onChange={e => setInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder={t('goal.placeholder')}
                        style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)', resize: 'none', outline: 'none', padding: '0.4rem 0', minHeight: '32px', maxHeight: '120px', fontSize: '0.9rem', fontFamily: 'inherit' }}
                        rows={1} />
                    <button onClick={() => handleSend()} disabled={isLoading || !input.trim()}
                        style={{ width: '34px', height: '34px', borderRadius: '50%', background: input.trim() ? 'var(--primary)' : 'rgba(255,255,255,0.05)', color: input.trim() ? 'white' : 'var(--text-muted)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default', transition: 'all 0.2s' }}>
                        <Send size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
}
