import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Send, Bot } from 'lucide-react';
import { useLanguage } from './i18n';

export default function GoalWizard({ onClose, apiKeys, selectedApiKey, onSetGoal }) {
    const { t } = useLanguage();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [turnCount, setTurnCount] = useState(0);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const GOAL_SYSTEM_PROMPT = `あなたはワークスペースの目標設定アシスタントです。ユーザーがこのワークスペースの目的や目標を定義するのを対話形式でサポートしてください。

ルール:
1. ユーザーの最初のメッセージを受けて、それに関連する質問を2〜3個提示してください
2. 質問は以下の形式を混ぜてください:
   - チェックボックス形式: 「以下から該当するものを選んでください: □ A □ B □ C」
   - 複数選択: 「優先順位をつけてください: 1. X  2. Y  3. Z」
   - 定量的: 「具体的な数値目標はありますか？（例: 期限、件数等）」
   - 定性的: 「成功の基準をどう定義しますか？」
3. ユーザーの回答に応じて深掘りの質問をしてください
4. 3〜5往復の会話で切りの良いところでまとめてください
5. 最後に「[GOAL_COMPLETE]」というマーカーと共に、決まった目標をシステムプロンプト形式で簡潔にまとめてください
6. まとめは「このチャットの目標:」から始めてください`;

    const callAI = async (history) => {
        const apiKeyObj = apiKeys?.[selectedApiKey || 0];
        const keyToUse = apiKeyObj?.key?.trim();
        const provider = apiKeyObj?.provider || 'openai';
        const userModel = apiKeyObj?.model;

        if (!keyToUse) return t('chat.noApiKey');

        try {
            if (provider === 'gemini') {
                const modelToUse = userModel || 'gemini-3.1-pro-preview';
                const contents = [];
                contents.push({ role: 'user', parts: [{ text: GOAL_SYSTEM_PROMPT }] });
                contents.push({ role: 'model', parts: [{ text: 'はい、承知しました。ワークスペースの目標設定をお手伝いします。' }] });
                history.forEach(m => contents.push({
                    role: m.role === 'user' ? 'user' : 'model',
                    parts: [{ text: m.content }]
                }));

                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${keyToUse}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
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
                    provider === 'glm' ? 'https://open.bigmodel.cn/api/paas/v4/chat/completions' :
                        'https://api.openai.com/v1/chat/completions';
                const msgs = [{ role: 'system', content: GOAL_SYSTEM_PROMPT }];
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

    const handleSend = async () => {
        const text = input.trim();
        if (!text || isLoading) return;

        const userMsg = { role: 'user', content: text };
        const updatedHistory = [...messages, userMsg];
        setMessages(updatedHistory);
        setInput('');
        setIsLoading(true);

        const reply = await callAI(updatedHistory);
        const aiMsg = { role: 'ai', content: reply };
        const finalHistory = [...updatedHistory, aiMsg];
        setMessages(finalHistory);
        setTurnCount(prev => prev + 1);
        setIsLoading(false);

        // Check if goal is complete
        if (reply.includes('[GOAL_COMPLETE]')) {
            const goalText = reply.replace('[GOAL_COMPLETE]', '').trim();
            setTimeout(() => {
                onSetGoal(goalText);
                onClose();
            }, 2000);
        }
    };

    return (
        <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-dark)',
            height: '100%'
        }}>
            {/* Header */}
            <div style={{
                padding: '0.9rem 1.5rem',
                borderBottom: '1px solid var(--panel-border)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
            }}>
                <button onClick={onClose} className="btn-icon" style={{ width: '32px', height: '32px' }}>
                    <ArrowLeft size={16} />
                </button>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 500 }}>{t('goal.title')}</h3>
            </div>

            {/* Messages */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                maxWidth: '780px',
                width: '100%',
                margin: '0 auto'
            }}>
                {messages.map((msg, idx) => (
                    <div key={idx} style={{
                        display: 'flex',
                        gap: '0.75rem',
                        flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
                    }}>
                        <div style={{
                            width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                            background: msg.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: msg.role === 'user' ? 'white' : 'var(--text-main)', fontSize: '0.8rem'
                        }}>
                            {msg.role === 'user' ? '👤' : '🎯'}
                        </div>
                        <div style={{
                            background: msg.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.04)',
                            color: msg.role === 'user' ? 'white' : 'var(--text-main)',
                            padding: '0.75rem 1rem',
                            borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                            border: msg.role === 'ai' ? '1px solid var(--panel-border)' : 'none',
                            maxWidth: '85%', fontSize: '0.9rem', lineHeight: 1.7, whiteSpace: 'pre-wrap'
                        }}>
                            {msg.content.replace('[GOAL_COMPLETE]', '').trim()}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div style={{ display: 'flex', gap: '0.75rem', animation: 'pulse 1.5s infinite' }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🎯</div>
                        <div style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('goal.thinking')}</div>
                    </div>
                )}
                {turnCount > 0 && messages.some(m => m.content.includes('[GOAL_COMPLETE]')) && (
                    <div style={{ textAlign: 'center', color: 'var(--action)', fontSize: '0.88rem', padding: '1rem', animation: 'fadeIn 0.5s' }}>
                        ✅ {t('goal.complete')}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--panel-border)' }}>
                <div style={{
                    display: 'flex',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--panel-border)',
                    borderRadius: '20px',
                    overflow: 'hidden',
                    padding: '0.2rem 0.2rem 0.2rem 0.9rem',
                    alignItems: 'flex-end',
                    maxWidth: '780px',
                    margin: '0 auto'
                }}>
                    <textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder={t('goal.placeholder')}
                        style={{
                            flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)',
                            resize: 'none', outline: 'none', padding: '0.4rem 0', minHeight: '32px',
                            maxHeight: '120px', fontSize: '0.9rem', fontFamily: 'inherit'
                        }}
                        rows={1}
                    />
                    <button
                        onClick={handleSend}
                        disabled={isLoading || !input.trim()}
                        style={{
                            width: '34px', height: '34px', borderRadius: '50%',
                            background: input.trim() ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                            color: input.trim() ? 'white' : 'var(--text-muted)',
                            border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: input.trim() ? 'pointer' : 'default', transition: 'all 0.2s'
                        }}
                    >
                        <Send size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
}
