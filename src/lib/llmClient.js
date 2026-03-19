import { getDefaultModel, getProviderDefinition, getSelectedModelId } from './aiCatalog';

function normalizeHistory(history = []) {
    return history.map((message) => ({
        role: message.role === 'ai' ? 'assistant' : 'user',
        content: message.content,
    }));
}

function extractOpenAICompatibleText(data) {
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content === 'string') {
        return content;
    }

    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === 'string') return part;
                if (typeof part?.text === 'string') return part.text;
                if (typeof part?.content === 'string') return part.content;
                return '';
            })
            .join('')
            .trim();
    }

    return '';
}

function getOpenAICompatibleEndpoint(provider) {
    if (provider === 'openrouter') return 'https://openrouter.ai/api/v1/chat/completions';
    if (provider === 'deepseek') return 'https://api.deepseek.com/v1/chat/completions';
    if (provider === 'qwen') return 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
    if (provider === 'glm') return 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
    return 'https://api.openai.com/v1/chat/completions';
}

function getOpenAICompatibleHeaders(provider, key) {
    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
    };

    if (provider === 'openrouter' && typeof window !== 'undefined') {
        headers['HTTP-Referer'] = window.location.origin;
        headers['X-Title'] = 'Blueprint AI';
    }

    return headers;
}

export function resolveModelSelection(apiKeyEntry) {
    const provider = getProviderDefinition(apiKeyEntry?.provider).id;
    const key = apiKeyEntry?.key?.trim() || '';
    const model = getSelectedModelId(apiKeyEntry) || getDefaultModel(provider);
    return { provider, key, model };
}

export async function requestChatText({
    apiKeyEntry,
    history,
    systemPrompt = '',
    maxTokens = 2048,
    enableGeminiSearch = false,
}) {
    const { provider, key, model } = resolveModelSelection(apiKeyEntry);

    if (!key) {
        throw new Error(`Missing credential for ${provider}`);
    }

    const normalizedHistory = normalizeHistory(history);

    if (provider === 'gemini') {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
                    contents: normalizedHistory.map((message) => ({
                        role: message.role === 'user' ? 'user' : 'model',
                        parts: [{ text: message.content }],
                    })),
                    tools: enableGeminiSearch ? [{ googleSearch: {} }] : undefined,
                    generationConfig: maxTokens ? { maxOutputTokens: maxTokens } : undefined,
                }),
            },
        );

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Gemini Error');
        return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
    }

    if (provider === 'anthropic') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerously-allow-browser': 'true',
            },
            body: JSON.stringify({
                model,
                max_tokens: maxTokens,
                system: systemPrompt || undefined,
                messages: normalizedHistory,
            }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Anthropic Error');
        return data.content?.[0]?.text || 'No response.';
    }

    const response = await fetch(getOpenAICompatibleEndpoint(provider), {
        method: 'POST',
        headers: getOpenAICompatibleHeaders(provider, key),
        body: JSON.stringify({
            model,
            messages: [
                ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                ...normalizedHistory,
            ],
            max_tokens: maxTokens,
        }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'LLM Error');
    return extractOpenAICompatibleText(data) || 'No response.';
}

export function createSingleTurnHistory(prompt) {
    return [{ role: 'user', content: prompt }];
}
