import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Bot, User, Trash2, Copy, Check, RefreshCw, GitBranch } from 'lucide-react';
import { supabase } from './lib/supabase';
import { useParams } from 'react-router-dom';
import { useLanguage } from './i18n';
import { resolveSpaceRouteParams } from './lib/routes';
import { createSingleTurnHistory, requestChatText, resolveModelSelection } from './lib/llmClient';

export default function LinearChat({ isOpen, onClose, node, onUpdateNodeData, onBranchFromChat }) {
    const routeParams = useParams();
    const { spaceId } = resolveSpaceRouteParams(routeParams);
    const { t } = useLanguage();
    const [input, setInput] = useState('');
    const [chatHistory, setChatHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [copiedIdx, setCopiedIdx] = useState(null);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (isOpen && node) {
            setChatHistory(node.data.chatHistory || []);
        }
    }, [isOpen, node]);

    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatHistory, isOpen]);

    const generateSpaceTitle = async (apiKeyObj, messageText) => {
        if (!spaceId) return;

        try {
            const { key } = resolveModelSelection(apiKeyObj);
            if (!key) return;
            /*

            const titlePrompt = `次の最初のメッセージをもとに、このスペースの短いタイトルを日本語で1つだけ作成してください。記号や引用符は不要です。\n\n${messageText}`;
            */
            const titlePrompt = `Create one short Japanese title for this space from the first message below. Return only the title with no quotes or extra punctuation.\n\n${messageText}`;
            let newTitle = (await requestChatText({
                apiKeyEntry: apiKeyObj,
                history: createSingleTurnHistory(titlePrompt),
                maxTokens: 50,
            })).trim();

            newTitle = newTitle.replace(/^["']|["']$/g, '');
            if (!newTitle || newTitle.includes('Untitled')) return;

            await supabase
                .from('spaces')
                .update({ title: newTitle })
                .eq('id', spaceId);

            window.dispatchEvent(new CustomEvent('spaceTitleUpdated'));
        } catch (error) {
            console.error('Title Generation Failed:', error);
        }
    };

    const handleSend = async (retryContent = null) => {
        const messageText = retryContent || input.trim();
        if (!messageText || !node) return;

        const newUserMsg = { role: 'user', content: messageText };
        let updatedHistory;

        if (retryContent) {
            // For retry: remove the last AI message, keep the user message
            const lastUserIdx = chatHistory.map(m => m.role).lastIndexOf('user');
            updatedHistory = [...chatHistory.slice(0, lastUserIdx), newUserMsg];
        } else {
            updatedHistory = [...chatHistory, newUserMsg];
        }

        setChatHistory(updatedHistory);
        if (!retryContent) setInput('');
        setIsLoading(true);

        const apiKeyObj = node.data.apiKeys?.[node.data.selectedApiKey || 0];
        const { key, provider } = resolveModelSelection(apiKeyObj);

        if (!key) {
            const errorMsg = { role: 'ai', content: `${t('chat.noApiKey')} (${provider})` };
            const finalHistory = [...updatedHistory, errorMsg];
            setChatHistory(finalHistory);
            onUpdateNodeData(node.id, 'chatHistory', finalHistory);
            setIsLoading(false);
            return;
        }

        try {
            let reply = "";

            reply = await requestChatText({
                apiKeyEntry: apiKeyObj,
                history: updatedHistory,
                systemPrompt: node.data.systemPrompt || '',
                enableGeminiSearch: true,
            });

            const finalHistory = [...updatedHistory, { role: 'ai', content: reply }];
            setChatHistory(finalHistory);
            onUpdateNodeData(node.id, 'chatHistory', finalHistory);

            if (chatHistory.length === 0 && spaceId && !retryContent) {
                await generateSpaceTitle(apiKeyObj, messageText);
            }
            return;
            /*

            if (provider === 'gemini') {
                const modelToUse = userModel || 'gemini-3.1-pro-preview';
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${keyToUse}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        systemInstruction: node.data.systemPrompt ? { parts: [{ text: node.data.systemPrompt }] } : undefined,
                        contents: updatedHistory.map(msg => ({
                            role: msg.role === 'user' ? 'user' : 'model',
                            parts: [{ text: msg.content }]
                        })),
                        tools: [{ googleSearch: {} }]
                    })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || `Gemini API Error`);
                reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";
            } else if (provider === 'anthropic') {
                const modelToUse = userModel || 'claude-sonnet-4-6';
                const messages = updatedHistory.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': keyToUse,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerously-allow-browser': 'true'
                    },
                    body: JSON.stringify({
                        model: modelToUse,
                        max_tokens: 2048,
                        system: node.data.systemPrompt || undefined,
                        messages: messages
                    })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || `Anthropic API Error`);
                reply = data.content?.[0]?.text || "No response.";
            } else {
                const modelToUse = userModel || (provider === 'openai' ? 'gpt-5.3-chat-latest' : provider === 'openrouter' ? 'google/gemini-3.1-pro-preview' : 'glm-4-plus');
                const endpoint = provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' :
                    provider === 'glm' ? 'https://open.bigmodel.cn/api/paas/v4/chat/completions' :
                        'https://api.openai.com/v1/chat/completions';

                const messages = [];
                if (node.data.systemPrompt) {
                    messages.push({ role: 'system', content: node.data.systemPrompt });
                }
                updatedHistory.forEach(m => messages.push({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${keyToUse}`
                    },
                    body: JSON.stringify({
                        model: modelToUse,
                        messages: messages
                    })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || `LLM API Error`);
                reply = data.choices?.[0]?.message?.content || "No response.";
            }

            const finalHistory = [...updatedHistory, { role: 'ai', content: reply }];
            setChatHistory(finalHistory);
            onUpdateNodeData(node.id, 'chatHistory', finalHistory);

            // Auto-generate title on first message
            if (chatHistory.length === 0 && spaceId && !retryContent) {
                try {
                    let newTitle = "Untitled Space";
                    const titlePrompt = `ユーザーの最初のメッセージ「${messageText}」に基づき、このワークスペースのタイトルを10文字以内で作成してください。余計な記号や説明は一切含めず、タイトルテキストのみを出力してください。`;

                    if (provider === 'gemini') {
                        const modelToUse = userModel || 'gemini-3.1-pro-preview';
                        const tRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${keyToUse}`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: titlePrompt }] }] })
                        });
                        const tData = await tRes.json();
                        newTitle = tData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || newTitle;
                    } else if (provider === 'anthropic') {
                        const modelToUse = userModel || 'claude-sonnet-4-6';
                        const tRes = await fetch('https://api.anthropic.com/v1/messages', {
                            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': keyToUse, 'anthropic-version': '2023-06-01', 'anthropic-dangerously-allow-browser': 'true' },
                            body: JSON.stringify({ model: modelToUse, max_tokens: 50, messages: [{ role: 'user', content: titlePrompt }] })
                        });
                        const tData = await tRes.json();
                        newTitle = tData.content?.[0]?.text?.trim() || newTitle;
                    } else {
                        const modelToUse = userModel || (provider === 'openai' ? 'gpt-5.3-chat-latest' : provider === 'openrouter' ? 'google/gemini-3.1-pro-preview' : 'glm-4-plus');
                        const endpoint = provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' :
                            provider === 'glm' ? 'https://open.bigmodel.cn/api/paas/v4/chat/completions' : 'https://api.openai.com/v1/chat/completions';
                        const tRes = await fetch(endpoint, {
                            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keyToUse}` },
                            body: JSON.stringify({ model: modelToUse, messages: [{ role: 'user', content: titlePrompt }] })
                        });
                        const tData = await tRes.json();
                        newTitle = tData.choices?.[0]?.message?.content?.trim() || newTitle;
                    }

                    newTitle = newTitle.replace(/^["']|["']$/g, '');

                    if (!newTitle.includes("Untitled")) {
                        await supabase
                            .from('spaces')
                            .update({ title: newTitle })
                            .eq('id', spaceId);

                        window.dispatchEvent(new CustomEvent('spaceTitleUpdated'));
                    }
                } catch (tErr) {
                    console.error("Title Generation Failed:", tErr);
                }
            }
            */
        } catch (err) {
            const errorMsg = { role: 'ai', content: `Error: ${err.message}` };
            const finalHistory = [...updatedHistory, errorMsg];
            setChatHistory(finalHistory);
            onUpdateNodeData(node.id, 'chatHistory', finalHistory);
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearChat = () => {
        if (confirm(t('chat.clearConfirm'))) {
            setChatHistory([]);
            onUpdateNodeData(node.id, 'chatHistory', []);
        }
    };

    const handleCopy = async (content, idx) => {
        try {
            await navigator.clipboard.writeText(content);
            setCopiedIdx(idx);
            setTimeout(() => setCopiedIdx(null), 2000);
        } catch (err) {
            console.error('Copy failed:', err);
        }
    };

    const handleRetry = (idx) => {
        // Find the user message before this AI message
        for (let i = idx - 1; i >= 0; i--) {
            if (chatHistory[i].role === 'user') {
                handleSend(chatHistory[i].content);
                return;
            }
        }
    };

    const handleBranch = (idx) => {
        if (!node || !onBranchFromChat) return;
        // Get chat history up to and including this message
        const branchHistory = chatHistory.slice(0, idx + 1);
        const currentBranchCount = node.data.branchCount || 0;
        if (currentBranchCount >= 10) return;

        const success = onBranchFromChat(node.id, branchHistory);
        if (success) {
            onUpdateNodeData(node.id, 'branchCount', currentBranchCount + 1);
        }
    };

    if (!isOpen || !node) return null;

    const branchCount = node.data.branchCount || 0;

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.25)',
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 2000
        }} onClick={onClose}>
            <div className="glass-panel"
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'var(--bg-dark)',
                    width: '420px',
                    height: '100vh',
                    maxWidth: '90vw',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '-8px 0 36px rgba(0,0,0,0.35)',
                    borderLeft: '1px solid var(--panel-border)',
                    animation: 'fadeIn 0.2s ease'
                }}>
                {/* Header */}
                <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem', letterSpacing: '-0.01em' }}>
                        💬 {t('chat.title')}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <select
                            className="node-select-sm"
                            value={node.data.selectedApiKey || 0}
                            onChange={(e) => onUpdateNodeData(node.id, 'selectedApiKey', parseInt(e.target.value))}
                            style={{ background: 'var(--panel-bg)', color: 'var(--text-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '0.2rem 0.4rem', outline: 'none', maxWidth: '110px' }}
                            title={t('chat.modelSelect')}
                        >
                            {node.data.apiKeys && node.data.apiKeys.map((item, i) => (
                                <option key={i} value={i}>Key {i + 1} ({item?.provider || 'openai'})</option>
                            ))}
                        </select>
                        <button onClick={handleClearChat} className="btn-icon" style={{ width: '30px', height: '30px' }} title={t('chat.clearBtn')}>
                            <Trash2 size={15} />
                        </button>
                        <button onClick={onClose} className="btn-icon" style={{ width: '30px', height: '30px' }}>
                            <X size={17} />
                        </button>
                    </div>
                </div>

                {/* Chat History */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {chatHistory.length === 0 ? (
                        <div style={{ margin: 'auto', color: 'var(--text-muted)', textAlign: 'center' }}>
                            <Bot size={42} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
                            <p style={{ fontSize: '0.88rem', fontWeight: 400, lineHeight: 1.6 }}>{t('chat.empty')}</p>
                        </div>
                    ) : (
                        chatHistory.map((msg, idx) => (
                            <div key={idx} className="chat-msg-wrapper" style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    gap: '0.6rem',
                                    flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                                    maxWidth: '90%'
                                }}>
                                    <div style={{
                                        width: '28px', height: '28px',
                                        borderRadius: '50%',
                                        background: msg.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0
                                    }}>
                                        {msg.role === 'user' ? <User size={14} color="white" /> : <Bot size={14} />}
                                    </div>
                                    <div style={{
                                        background: msg.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.04)',
                                        color: msg.role === 'user' ? 'white' : 'var(--text-main)',
                                        padding: '0.6rem 1rem',
                                        borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                                        border: msg.role === 'ai' ? '1px solid var(--panel-border)' : 'none',
                                        wordBreak: 'break-word',
                                        whiteSpace: 'pre-wrap',
                                        fontSize: '0.88rem',
                                        lineHeight: 1.6,
                                        fontWeight: 400
                                    }}>
                                        {msg.content}
                                        {msg.images && msg.images.length > 0 && (
                                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                                                {msg.images.map(img => (
                                                    <div key={img.id} style={{ width: '52px', height: '52px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                        <img src={img.data} alt="uploaded content" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Action buttons for AI messages */}
                                {msg.role === 'ai' && (
                                    <div className="chat-actions" style={{ marginLeft: '2.4rem' }}>
                                        <button
                                            className="chat-action-btn"
                                            onClick={() => handleCopy(msg.content, idx)}
                                            title={copiedIdx === idx ? t('chat.copied') : t('chat.copy')}
                                        >
                                            {copiedIdx === idx ? <Check size={12} /> : <Copy size={12} />}
                                            {copiedIdx === idx ? t('chat.copied') : t('chat.copy')}
                                        </button>
                                        <button
                                            className="chat-action-btn"
                                            onClick={() => handleRetry(idx)}
                                            disabled={isLoading}
                                            title={t('chat.retry')}
                                        >
                                            <RefreshCw size={12} />
                                            {t('chat.retry')}
                                        </button>
                                        <button
                                            className="chat-action-btn"
                                            onClick={() => handleBranch(idx)}
                                            disabled={branchCount >= 10}
                                            title={branchCount >= 10 ? t('chat.branchMax') : t('chat.branch')}
                                        >
                                            <GitBranch size={12} />
                                            {t('chat.branch')} {branchCount > 0 && `(${branchCount}/10)`}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                    {isLoading && (
                        <div style={{ display: 'flex', gap: '0.6rem', animation: 'pulse 1.5s infinite' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Bot size={14} />
                            </div>
                            <div style={{ padding: '0.6rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                {t('chat.generating')}
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div style={{ padding: '0.9rem', borderTop: '1px solid var(--panel-border)' }}>
                    <div style={{
                        display: 'flex',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--panel-border)',
                        borderRadius: '20px',
                        overflow: 'hidden',
                        padding: '0.2rem 0.2rem 0.2rem 0.9rem',
                        alignItems: 'flex-end',
                        minHeight: '46px',
                        transition: 'border-color 0.2s'
                    }}>
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            placeholder={t('chat.placeholder')}
                            style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-main)',
                                resize: 'none',
                                outline: 'none',
                                padding: '0.4rem 0',
                                minHeight: '30px',
                                maxHeight: '120px',
                                fontSize: '0.88rem',
                                fontWeight: 400,
                                fontFamily: 'inherit'
                            }}
                            rows={1}
                        />
                        <button
                            onClick={() => handleSend()}
                            disabled={isLoading || !input.trim()}
                            style={{
                                width: '32px', height: '32px',
                                borderRadius: '50%',
                                background: input.trim() ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                                color: input.trim() ? 'white' : 'var(--text-muted)',
                                border: 'none',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: input.trim() ? 'pointer' : 'default',
                                transition: 'all 0.2s',
                                marginBottom: '2px', marginRight: '2px'
                            }}
                        >
                            <Send size={14} style={{ marginLeft: '-1px', marginTop: '1px' }} />
                        </button>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.4rem', fontWeight: 400 }}>
                        {t('chat.shiftEnter')}
                    </div>
                </div>
            </div>
        </div>
    );
}
