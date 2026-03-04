import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Bot, User, Trash2 } from 'lucide-react';

export default function LinearChat({ isOpen, onClose, node, onUpdateNodeData }) {
    const [input, setInput] = useState('');
    const [chatHistory, setChatHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    // Sync node data chat history
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

    const handleSend = async () => {
        if (!input.trim() || !node) return;

        const newUserMsg = { role: 'user', content: input };
        const updatedHistory = [...chatHistory, newUserMsg];
        setChatHistory(updatedHistory);
        setInput('');
        setIsLoading(true);

        // Fetch settings from node API selection
        const apiKeyObj = node.data.apiKeys?.[node.data.selectedApiKeyIndex || 0];
        const keyToUse = apiKeyObj?.key?.trim();
        const provider = apiKeyObj?.provider || 'openai';
        const userModel = apiKeyObj?.model;

        if (!keyToUse) {
            const errorMsg = { role: 'ai', content: `Error: API Key (${provider}) is not set.` };
            const finalHistory = [...updatedHistory, errorMsg];
            setChatHistory(finalHistory);
            onUpdateNodeData(node.id, 'chatHistory', finalHistory);
            setIsLoading(false);
            return;
        }

        try {
            let reply = "";

            // Re-use logic from Editor for Gemini APIs etc.
            if (provider === 'gemini') {
                const modelToUse = userModel || 'gemini-3.1-pro-preview';
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${keyToUse}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: updatedHistory.map(msg => ({
                            role: msg.role === 'user' ? 'user' : 'model',
                            parts: [{ text: msg.content }]
                        })),
                        tools: [{ googleSearch: {} }] // Keep grounding active
                    })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || `Gemini API Error`);
                reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";
            } else if (provider === 'anthropic') {
                const modelToUse = userModel || 'claude-4.6-sonnet';
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
                        messages: messages
                    })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || `Anthropic API Error`);
                reply = data.content?.[0]?.text || "No response.";
            } else {
                // OpenAI / OpenRouter / GLM
                const modelToUse = userModel || (provider === 'openai' ? 'gpt-4o' : provider === 'openrouter' ? 'google/gemini-3.1-pro-preview' : 'glm-4-plus');
                const endpoint = provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' :
                    provider === 'glm' ? 'https://open.bigmodel.cn/api/paas/v4/chat/completions' :
                        'https://api.openai.com/v1/chat/completions';

                const messages = updatedHistory.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));

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
        if (confirm('チャット履歴を消去しますか？')) {
            setChatHistory([]);
            onUpdateNodeData(node.id, 'chatHistory', []);
        }
    }

    if (!isOpen || !node) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
        }}>
            <div className="glass-panel" style={{
                background: 'var(--bg-dark)',
                width: '600px',
                height: '80vh',
                maxWidth: '95vw',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
            }}>
                {/* Header */}
                <div style={{ padding: '1rem', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        💬 ノード・チャット
                    </h3>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={handleClearChat} className="btn-icon" title="チャット履歴を消去">
                            <Trash2 size={18} />
                        </button>
                        <button onClick={onClose} className="btn-icon">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Chat History */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {chatHistory.length === 0 ? (
                        <div style={{ margin: 'auto', color: 'var(--text-muted)', textAlign: 'center' }}>
                            <Bot size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
                            <p>チャットを始めましょう。ここでの会話はノード内部に保存されます。</p>
                        </div>
                    ) : (
                        chatHistory.map((msg, idx) => (
                            <div key={idx} style={{
                                display: 'flex',
                                gap: '1rem',
                                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
                            }}>
                                <div style={{
                                    width: '32px', height: '32px',
                                    borderRadius: '50%',
                                    background: msg.role === 'user' ? 'var(--primary)' : 'var(--panel-bg)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    {msg.role === 'user' ? <User size={16} color="white" /> : <Bot size={16} />}
                                </div>
                                <div style={{
                                    background: msg.role === 'user' ? 'var(--primary)' : 'var(--panel-bg)',
                                    color: msg.role === 'user' ? 'white' : 'var(--text-color)',
                                    padding: '0.75rem 1.2rem',
                                    borderRadius: '12px',
                                    maxWidth: '80%',
                                    border: msg.role === 'ai' ? '1px solid var(--panel-border)' : 'none',
                                    wordBreak: 'break-word',
                                    whiteSpace: 'pre-wrap'
                                }}>
                                    {msg.content}
                                </div>
                            </div>
                        ))
                    )}
                    {isLoading && (
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--panel-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Bot size={16} />
                            </div>
                            <div style={{ padding: '0.75rem 1.2rem', color: 'var(--text-muted)' }}>
                                応答を生成中...
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div style={{ padding: '1rem', borderTop: '1px solid var(--panel-border)' }}>
                    <div style={{
                        display: 'flex',
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid var(--panel-border)',
                        borderRadius: '24px',
                        overflow: 'hidden',
                        padding: '0.25rem 0.25rem 0.25rem 1rem',
                        alignItems: 'flex-end',
                        minHeight: '50px'
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
                            placeholder="メッセージを入力..."
                            style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-color)',
                                resize: 'none',
                                outline: 'none',
                                padding: '0.5rem 0',
                                minHeight: '34px',
                                maxHeight: '150px'
                            }}
                            rows={1}
                        />
                        <button
                            onClick={handleSend}
                            disabled={isLoading || !input.trim()}
                            style={{
                                width: '36px', height: '36px',
                                borderRadius: '50%',
                                background: input.trim() ? 'var(--primary)' : 'var(--panel-bg)',
                                color: input.trim() ? 'white' : 'var(--text-muted)',
                                border: 'none',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: input.trim() ? 'pointer' : 'default',
                                transition: 'background 0.2s',
                                marginBottom: '2px', marginRight: '2px'
                            }}
                        >
                            <Send size={16} style={{ marginLeft: '-2px', marginTop: '2px' }} />
                        </button>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.5rem' }}>
                        Shift+Enterで改行
                    </div>
                </div>
            </div>
        </div>
    );
}
