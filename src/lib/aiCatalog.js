const PROVIDER_DEFINITIONS = {
    openai: {
        id: 'openai',
        label: 'OpenAI API',
        defaultModel: 'gpt-5.4',
        models: [
            { value: 'gpt-5.4', label: 'GPT-5.4' },
            { value: 'gpt-5.4-pro', label: 'GPT-5.4 Pro' },
            { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
            { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano' },
            { value: 'gpt-5.3-chat-latest', label: 'GPT-5.3 Chat Latest' },
            { value: 'gpt-5.2', label: 'GPT-5.2' },
            { value: 'gpt-5.2-pro', label: 'GPT-5.2 Pro' },
            { value: 'gpt-5.1', label: 'GPT-5.1' },
            { value: 'gpt-5-pro', label: 'GPT-5 Pro' },
            { value: 'gpt-5', label: 'GPT-5' },
            { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
            { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
            { value: 'gpt-4.1', label: 'GPT-4.1' },
            { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
            { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
        ],
    },
    gemini: {
        id: 'gemini',
        label: 'Google Gemini',
        defaultModel: 'gemini-2.5-pro',
        models: [
            { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
            { value: 'gemini-3.1-flash-preview', label: 'Gemini 3.1 Flash Preview' },
            { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite Preview' },
            { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
            { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
            { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
        ],
    },
    anthropic: {
        id: 'anthropic',
        label: 'Anthropic Claude',
        defaultModel: 'claude-opus-4-1-20250805',
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
            { value: 'openai/gpt-5.4', label: 'OpenAI GPT-5.4' },
            { value: 'openai/gpt-5.4-mini', label: 'OpenAI GPT-5.4 Mini' },
            { value: 'anthropic/claude-sonnet-4.6', label: 'Anthropic Claude Sonnet 4.6' },
            { value: 'anthropic/claude-opus-4.6', label: 'Anthropic Claude Opus 4.6' },
            { value: 'google/gemini-3.1-pro-preview', label: 'Google Gemini 3.1 Pro Preview' },
            { value: 'google/gemini-3.1-flash-lite-preview', label: 'Google Gemini 3.1 Flash-Lite Preview' },
            { value: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2' },
            { value: 'qwen/qwen3-max-thinking', label: 'Qwen3 Max Thinking' },
            { value: 'z-ai/glm-5', label: 'GLM-5' },
        ],
    },
    deepseek: {
        id: 'deepseek',
        label: 'DeepSeek',
        defaultModel: 'deepseek-chat',
        models: [
            { value: 'deepseek-chat', label: 'DeepSeek Chat (V3.2)' },
            { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner (V3.2)' },
        ],
    },
    qwen: {
        id: 'qwen',
        label: 'Qwen',
        defaultModel: 'qwen3.5-plus',
        models: [
            { value: 'qwen3-max', label: 'Qwen3 Max' },
            { value: 'qwen3.5-plus', label: 'Qwen3.5 Plus' },
            { value: 'qwen3.5-flash', label: 'Qwen3.5 Flash' },
            { value: 'qwen-plus', label: 'Qwen Plus' },
            { value: 'qwen-flash', label: 'Qwen Flash' },
            { value: 'qwen-coder-plus-latest', label: 'Qwen Coder Plus Latest' },
        ],
    },
    glm: {
        id: 'glm',
        label: 'GLM (ZhipuAI)',
        defaultModel: 'glm-5',
        models: [
            { value: 'glm-5', label: 'GLM-5' },
            { value: 'glm-4.7', label: 'GLM-4.7' },
            { value: 'glm-4.7-flash', label: 'GLM-4.7 Flash' },
            { value: 'glm-4.6', label: 'GLM-4.6' },
        ],
    },
};

const PROVIDER_ORDER = ['openai', 'gemini', 'anthropic', 'openrouter', 'deepseek', 'qwen', 'glm'];
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

let openRouterModelCache = null;
let openRouterModelPromise = null;

function toUniqueModelList(models = []) {
    const seen = new Set();
    return models.filter((model) => {
        const value = model?.value;
        if (!value || seen.has(value)) return false;
        seen.add(value);
        return true;
    });
}

function detectProviderByKey(rawKey = '') {
    const key = String(rawKey || '').trim();

    if (key.startsWith('AIza')) return 'gemini';
    if (key.startsWith('sk-ant')) return 'anthropic';
    if (key.startsWith('sk-or-')) return 'openrouter';
    return 'openai';
}

export function getProviderDefinition(provider = 'openai') {
    return PROVIDER_DEFINITIONS[provider] || PROVIDER_DEFINITIONS.openai;
}

export function getProviderOptions() {
    return PROVIDER_ORDER.map((providerId) => getProviderDefinition(providerId));
}

export function getModelOptions(provider = 'openai') {
    return [...getProviderDefinition(provider).models];
}

export function getDefaultModel(provider = 'openai') {
    return getProviderDefinition(provider).defaultModel;
}

export function getSelectedModelId(item) {
    const provider = getProviderDefinition(item?.provider).id;
    const manualModel = typeof item?.manualModel === 'string' ? item.manualModel.trim() : '';
    return manualModel || item?.model || getDefaultModel(provider);
}

export function getSelectedModelLabel(item) {
    const provider = getProviderDefinition(item?.provider).id;
    const selectedModelId = getSelectedModelId(item);
    const selectedModel = getModelOptions(provider).find((model) => model.value === selectedModelId);
    return selectedModel?.label || selectedModelId;
}

export function normalizeApiKeyEntry(item) {
    if (typeof item === 'string') {
        const provider = detectProviderByKey(item);
        return {
            key: item,
            provider,
            model: getDefaultModel(provider),
            manualModel: '',
        };
    }

    const provider = getProviderDefinition(item?.provider).id;
    const validModels = new Set(getModelOptions(provider).map((model) => model.value));
    const manualModel = typeof item?.manualModel === 'string' ? item.manualModel.trim() : '';
    const model = validModels.has(item?.model) ? item.model : getDefaultModel(provider);

    return {
        key: item?.key || '',
        provider,
        model,
        manualModel,
    };
}

export function createEmptyApiKeyEntry(provider = 'openai') {
    return {
        key: '',
        provider: getProviderDefinition(provider).id,
        model: getDefaultModel(provider),
        manualModel: '',
    };
}

export async function fetchOpenRouterModels({ signal } = {}) {
    if (openRouterModelCache) {
        return openRouterModelCache;
    }

    if (!openRouterModelPromise) {
        openRouterModelPromise = fetch(OPENROUTER_MODELS_URL, { signal })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error('Failed to load OpenRouter models.');
                }
                const data = await response.json();
                const dynamicModels = Array.isArray(data?.data)
                    ? data.data.map((model) => ({
                        value: model.id,
                        label: model.name || model.id,
                    }))
                    : [];

                openRouterModelCache = toUniqueModelList([
                    ...getProviderDefinition('openrouter').models,
                    ...dynamicModels,
                ]);
                return openRouterModelCache;
            })
            .finally(() => {
                openRouterModelPromise = null;
            });
    }

    return openRouterModelPromise;
}
