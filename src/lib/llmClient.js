import { getDefaultModel, getProviderDefinition, getSelectedModelId } from './aiCatalog';

function normalizeHistory(history = []) {
    return history.map((message) => ({
        role: message.role === 'ai' ? 'assistant' : 'user',
        content: message.content,
    }));
}

function joinTextParts(parts = []) {
    return parts
        .map((part) => {
            if (!part) return '';
            if (typeof part === 'string') return part;
            if (typeof part?.text === 'string') return part.text;
            if (typeof part?.content === 'string') return part.content;
            if (typeof part?.output_text === 'string') return part.output_text;
            if (Array.isArray(part?.parts)) return joinTextParts(part.parts);
            if (Array.isArray(part?.content)) return joinTextParts(part.content);
            return '';
        })
        .join('')
        .trim();
}

function extractGeminiText(data) {
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    for (const candidate of candidates) {
        const text = joinTextParts(candidate?.content?.parts);
        if (text) return text;
    }
    return '';
}

function extractAnthropicText(data) {
    const blocks = Array.isArray(data?.content) ? data.content : [];
    return blocks
        .map((block) => (block?.type === 'text' && typeof block?.text === 'string' ? block.text : ''))
        .join('\n')
        .trim();
}

function extractOpenAICompatibleText(data) {
    const choice = data?.choices?.[0] || null;
    const message = choice?.message || null;
    const content = message?.content;

    if (typeof data?.output_text === 'string' && data.output_text.trim()) {
        return data.output_text.trim();
    }

    if (typeof content === 'string' && content.trim()) {
        return content.trim();
    }

    if (Array.isArray(content)) {
        const text = joinTextParts(content);
        if (text) return text;
    }

    if (typeof choice?.text === 'string' && choice.text.trim()) {
        return choice.text.trim();
    }

    if (typeof choice?.delta?.content === 'string' && choice.delta.content.trim()) {
        return choice.delta.content.trim();
    }

    if (Array.isArray(data?.output)) {
        for (const item of data.output) {
            const text = joinTextParts(item?.content);
            if (text) return text;
        }
    }

    if (typeof data?.response === 'string' && data.response.trim()) {
        return data.response.trim();
    }

    if (typeof data?.result === 'string' && data.result.trim()) {
        return data.result.trim();
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

function isModelSelectionError(message = '') {
    const normalized = String(message || '').toLowerCase();
    if (!normalized) return false;
    return (
        normalized.includes('model')
        && (
            normalized.includes('not found')
            || normalized.includes('unknown')
            || normalized.includes('unsupported')
            || normalized.includes('invalid')
            || normalized.includes('does not exist')
            || normalized.includes('no such')
            || normalized.includes('unavailable')
        )
    );
}

function isRetryableStatus(status) {
    return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function isEmptyModelResponse(text) {
    const normalized = String(text || '').trim();
    return !normalized || /^No response\.?$/i.test(normalized);
}

function delay(ms) {
    return new Promise((resolve) => {
        globalThis.setTimeout(resolve, ms);
    });
}

async function fetchJsonWithTimeout(url, options, timeoutMs = 30000) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });

        const raw = await response.text();
        let data = {};
        try {
            data = raw ? JSON.parse(raw) : {};
        } catch {
            data = {};
        }

        return { response, data };
    } finally {
        globalThis.clearTimeout(timeout);
    }
}

async function requestWithRetry(executor, { attempts = 3 } = {}) {
    let lastError = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const text = await executor(attempt);
            if (!isEmptyModelResponse(text)) return text;
            lastError = new Error('No response');
        } catch (error) {
            lastError = error;
            if (error?.retryable === false) {
                throw error;
            }
        }

        if (attempt < attempts - 1) {
            await delay(320 * (attempt + 1));
        }
    }

    throw lastError || new Error('No response');
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
    attempts = 3,
    timeoutMs = 30000,
}) {
    const { provider, key, model } = resolveModelSelection(apiKeyEntry);
    const defaultModel = getDefaultModel(provider);

    if (!key) {
        throw new Error(`Missing credential for ${provider}`);
    }

    const normalizedHistory = normalizeHistory(history);

    if (provider === 'gemini') {
        let activeModel = model || defaultModel;
        return requestWithRetry(async () => {
            const runRequest = async () => {
                const { response, data } = await fetchJsonWithTimeout(
                    `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${key}`,
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
                    timeoutMs,
                );

                if (!response.ok) {
                    const error = new Error(data?.error?.message || 'Gemini Error');
                    error.retryable = isRetryableStatus(response.status);
                    throw error;
                }

                return extractGeminiText(data) || 'No response.';
            };

            const runRequestWithFallback = async () => {
                let text = await runRequest();
                if (isEmptyModelResponse(text) && activeModel !== defaultModel) {
                    activeModel = defaultModel;
                    text = await runRequest();
                }
                return text;
            };

            try {
                return await runRequestWithFallback();
            } catch (error) {
                if (activeModel !== defaultModel && isModelSelectionError(error?.message)) {
                    activeModel = defaultModel;
                    return runRequestWithFallback();
                }
                throw error;
            }
        }, { attempts });
    }

    if (provider === 'anthropic') {
        let activeModel = model || defaultModel;
        return requestWithRetry(async () => {
            const runRequest = async () => {
                const { response, data } = await fetchJsonWithTimeout('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': key,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerously-allow-browser': 'true',
                    },
                    body: JSON.stringify({
                        model: activeModel,
                        max_tokens: maxTokens,
                        system: systemPrompt || undefined,
                        messages: normalizedHistory,
                    }),
                }, timeoutMs);

                if (!response.ok) {
                    const error = new Error(data?.error?.message || 'Anthropic Error');
                    error.retryable = isRetryableStatus(response.status);
                    throw error;
                }

                return extractAnthropicText(data) || 'No response.';
            };

            const runRequestWithFallback = async () => {
                let text = await runRequest();
                if (isEmptyModelResponse(text) && activeModel !== defaultModel) {
                    activeModel = defaultModel;
                    text = await runRequest();
                }
                return text;
            };

            try {
                return await runRequestWithFallback();
            } catch (error) {
                if (activeModel !== defaultModel && isModelSelectionError(error?.message)) {
                    activeModel = defaultModel;
                    return runRequestWithFallback();
                }
                throw error;
            }
        }, { attempts });
    }

    let activeModel = model || defaultModel;
    return requestWithRetry(async () => {
        const runRequest = async () => {
            const { response, data } = await fetchJsonWithTimeout(getOpenAICompatibleEndpoint(provider), {
                method: 'POST',
                headers: getOpenAICompatibleHeaders(provider, key),
                body: JSON.stringify({
                    model: activeModel,
                    messages: [
                        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                        ...normalizedHistory,
                    ],
                    max_tokens: maxTokens,
                }),
            }, timeoutMs);

            if (!response.ok) {
                const error = new Error(data?.error?.message || 'LLM Error');
                error.retryable = isRetryableStatus(response.status);
                throw error;
            }

            return extractOpenAICompatibleText(data) || 'No response.';
        };

        const runRequestWithFallback = async () => {
            let text = await runRequest();
            if (isEmptyModelResponse(text) && activeModel !== defaultModel) {
                activeModel = defaultModel;
                text = await runRequest();
            }
            return text;
        };

        try {
            return await runRequestWithFallback();
        } catch (error) {
            if (activeModel !== defaultModel && isModelSelectionError(error?.message)) {
                activeModel = defaultModel;
                return runRequestWithFallback();
            }
            throw error;
        }
    }, { attempts });
}

export function createSingleTurnHistory(prompt) {
    return [{ role: 'user', content: prompt }];
}
