const PROVIDER_DEFINITIONS = {
    openai: {
        id: 'openai',
        label: 'OpenAI API',
        defaultModel: 'gpt-5.2',
        models: [
            { value: 'gpt-5.2', label: 'GPT-5.2' },
            { value: 'gpt-5.1', label: 'GPT-5.1' },
            { value: 'gpt-5', label: 'GPT-5' },
            { value: 'gpt-5-mini', label: 'GPT-5 mini' },
            { value: 'gpt-5-nano', label: 'GPT-5 nano' },
            { value: 'gpt-4.1', label: 'GPT-4.1' },
            { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
            { value: 'gpt-4o', label: 'GPT-4o' },
            { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
        ],
    },
    gemini: {
        id: 'gemini',
        label: 'Google Gemini',
        defaultModel: 'gemini-2.5-pro',
        models: [
            { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
            { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
            { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
        ],
    },
    anthropic: {
        id: 'anthropic',
        label: 'Anthropic (Claude)',
        defaultModel: 'claude-sonnet-4-20250514',
        models: [
            { value: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1' },
            { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
            { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
            { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
            { value: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
        ],
    },
    openrouter: {
        id: 'openrouter',
        label: 'OpenRouter',
        defaultModel: 'openrouter/auto',
        models: [
            { value: 'openrouter/auto', label: 'OpenRouter Auto' },
        ],
    },
    deepseek: {
        id: 'deepseek',
        label: 'DeepSeek',
        defaultModel: 'deepseek-chat',
        models: [
            { value: 'deepseek-chat', label: 'DeepSeek Chat' },
            { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
        ],
    },
    groq: {
        id: 'groq',
        label: 'Groq',
        defaultModel: 'openai/gpt-oss-120b',
        models: [
            { value: 'openai/gpt-oss-120b', label: 'OpenAI gpt-oss-120b' },
            { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile' },
            { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
        ],
    },
    glm: {
        id: 'glm',
        label: 'GLM (ZhipuAI)',
        defaultModel: 'glm-4.7',
        models: [
            { value: 'glm-4.7', label: 'GLM-4.7' },
            { value: 'glm-4.7-flash', label: 'GLM-4.7-Flash' },
            { value: 'glm-4.5-air', label: 'GLM-4.5-Air' },
            { value: 'glm-4.5-flash', label: 'GLM-4.5-Flash' },
            { value: 'glm-4v-flash', label: 'GLM-4V-Flash' },
        ],
    },
};

const PROVIDER_ORDER = ['openai', 'gemini', 'anthropic', 'openrouter', 'deepseek', 'groq', 'glm'];

function detectProviderByKey(rawKey = '') {
    const key = String(rawKey || '').trim();

    if (key.startsWith('AIza')) return 'gemini';
    if (key.startsWith('sk-ant')) return 'anthropic';
    if (key.startsWith('sk-or-')) return 'openrouter';
    if (key.startsWith('gsk_')) return 'groq';
    return 'openai';
}

export function getProviderDefinition(provider = 'openai') {
    return PROVIDER_DEFINITIONS[provider] || PROVIDER_DEFINITIONS.openai;
}

export function getProviderOptions() {
    return PROVIDER_ORDER.map((providerId) => getProviderDefinition(providerId));
}

export function getModelOptions(provider = 'openai') {
    return getProviderDefinition(provider).models;
}

export function getDefaultModel(provider = 'openai') {
    return getProviderDefinition(provider).defaultModel;
}

export function normalizeApiKeyEntry(item) {
    if (typeof item === 'string') {
        return {
            key: item,
            provider: detectProviderByKey(item),
            model: '',
        };
    }

    const provider = getProviderDefinition(item?.provider).id;
    return {
        key: item?.key || '',
        provider,
        model: item?.model || '',
    };
}

export function createEmptyApiKeyEntry(provider = 'openai') {
    return {
        key: '',
        provider: getProviderDefinition(provider).id,
        model: '',
    };
}
