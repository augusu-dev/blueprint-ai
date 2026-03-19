import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    BookOpen,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    Search,
    Sparkles,
    Settings,
    Trash2,
} from 'lucide-react';
import { getSpacePath } from './lib/routes';
import { resolveSpaceTitle } from './lib/space';
import {
    getDictionaryEntryExplanation,
    getDictionaryEntryVariants,
    loadAllDictionaryEntries,
    removeDictionaryEntriesById,
    updateDictionaryEntryById,
    upsertDictionaryEntry,
} from './lib/dictionary';
import {
    createSingleTurnHistory,
    requestChatText,
    resolveModelSelection,
} from './lib/llmClient';
import { getProviderDefinition, normalizeApiKeyEntry } from './lib/aiCatalog';

function loadApiKeys() {
    try {
        const raw = localStorage.getItem('blueprint_api_keys');
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map((item) => normalizeApiKeyEntry(item)) : [];
    } catch {
        return [];
    }
}

function loadSpaceTitle(spaceId, fallback) {
    try {
        if (!spaceId) return fallback;
        const stored = localStorage.getItem(`blueprint_space_${spaceId}`);
        if (!stored) return resolveSpaceTitle(spaceId, '', fallback);
        const parsed = JSON.parse(stored);
        return resolveSpaceTitle(spaceId, parsed?.title, fallback);
    } catch {
        return fallback;
    }
}

function clampIndex(value, length) {
    if (length <= 0) return 0;
    const parsed = Number.isInteger(value) ? value : Number.parseInt(value ?? '0', 10);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(Math.max(parsed, 0), length - 1);
}

function getEntrySpaceTitle(entry) {
    const sourceSpaceId = entry?.sourceRef?.spaceId || '';
    if (!sourceSpaceId) return '';
    return resolveSpaceTitle(sourceSpaceId, loadSpaceTitle(sourceSpaceId, 'space'), 'space');
}

function buildJumpPath(entry) {
    const sourceRef = entry?.sourceRef;
    if (!sourceRef || typeof sourceRef !== 'object') return null;
    const hasChatAnchor = Boolean(
        sourceRef.chatNodeId
        || Number.isInteger(sourceRef.messageIndex),
    );
    if (!hasChatAnchor) return null;

    const targetSpaceId = sourceRef.spaceId || null;
    if (!targetSpaceId) return null;

    const params = new URLSearchParams();
    if (sourceRef.chatNodeId) params.set('focusNode', sourceRef.chatNodeId);
    if (Number.isInteger(sourceRef.messageIndex)) params.set('focusMessage', String(sourceRef.messageIndex));
    if (sourceRef.term || entry?.term) params.set('focusTerm', sourceRef.term || entry.term);

    const basePath = getSpacePath(targetSpaceId, 'chat');
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
}

function sortEntries(entries, sortMode, collator) {
    const nextEntries = [...entries];
    if (sortMode === 'oldest') {
        return nextEntries.sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
    }
    if (sortMode === 'alpha') {
        return nextEntries.sort((left, right) => collator.compare(left.term, right.term));
    }
    return nextEntries.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

const iconButtonStyle = {
    width: '28px',
    height: '28px',
    borderRadius: '999px',
    border: '1px solid rgba(35, 39, 48, 0.12)',
    background: 'rgba(255,255,255,0.96)',
    color: '#596074',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 8px 16px rgba(17, 24, 39, 0.08)',
};

const compactActionStyle = {
    border: '1px solid rgba(18, 22, 28, 0.12)',
    background: 'rgba(255,255,255,0.92)',
    color: '#232b38',
    borderRadius: '999px',
    padding: '0.34rem 0.72rem',
    fontSize: '0.74rem',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
};

export default function DictionaryPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const currentSpaceId = typeof location.state?.spaceId === 'string' && location.state.spaceId
        ? location.state.spaceId
        : (localStorage.getItem('blueprint_dictionary_context_space') || '');
    const [entries, setEntries] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortMode, setSortMode] = useState('newest');
    const [selectedIds, setSelectedIds] = useState([]);
    const [selectedApiIndex, setSelectedApiIndex] = useState(() => {
        try {
            const raw = localStorage.getItem('blueprint_dictionary_selected_api_global');
            const parsed = Number.parseInt(raw || '0', 10);
            return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
        } catch {
            return 0;
        }
    });
    const [apiKeys, setApiKeys] = useState(() => loadApiKeys());
    const [isGenerating, setIsGenerating] = useState({});
    const [statusMessage, setStatusMessage] = useState('');

    useEffect(() => {
        if (currentSpaceId) {
            localStorage.setItem('blueprint_dictionary_context_space', currentSpaceId);
        }
    }, [currentSpaceId]);

    useEffect(() => {
        setEntries(loadAllDictionaryEntries());
        setApiKeys(loadApiKeys());
    }, [currentSpaceId]);

    useEffect(() => {
        const handleDictionaryUpdated = () => {
            setEntries(loadAllDictionaryEntries());
        };
        const handleStorage = (event) => {
            if (!event || event.key === 'blueprint_api_keys') {
                setApiKeys(loadApiKeys());
            }
            if (!event || String(event.key || '').startsWith('blueprint_dictionary_')) {
                setEntries(loadAllDictionaryEntries());
            }
        };
        const handleSpaceTitleUpdated = () => setEntries(loadAllDictionaryEntries());

        window.addEventListener('dictionaryUpdated', handleDictionaryUpdated);
        window.addEventListener('storage', handleStorage);
        window.addEventListener('spaceTitleUpdated', handleSpaceTitleUpdated);
        return () => {
            window.removeEventListener('dictionaryUpdated', handleDictionaryUpdated);
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener('spaceTitleUpdated', handleSpaceTitleUpdated);
        };
    }, []);

    useEffect(() => {
        const nextIndex = Math.min(selectedApiIndex, Math.max(0, apiKeys.length - 1));
        if (nextIndex !== selectedApiIndex) {
            setSelectedApiIndex(nextIndex);
        }
    }, [apiKeys.length, selectedApiIndex]);

    useEffect(() => {
        localStorage.setItem('blueprint_dictionary_selected_api_global', String(selectedApiIndex));
    }, [selectedApiIndex]);

    useEffect(() => {
        setSelectedIds((current) => current.filter((id) => entries.some((entry) => entry.id === id)));
    }, [entries]);

    const collator = useMemo(
        () => new Intl.Collator('ja', { sensitivity: 'base', numeric: true }),
        [],
    );

    const selectedApiEntry = apiKeys[selectedApiIndex] || apiKeys[0] || null;
    const filteredEntries = useMemo(() => {
        const query = searchQuery.trim();
        const baseEntries = entries.filter((entry) => {
            if (!query) return true;
            const variants = getDictionaryEntryVariants(entry);
            const spaceTitle = buildJumpPath(entry) ? getEntrySpaceTitle(entry) : '';
            return entry.term.includes(query)
                || variants.some((variant) => variant.text.includes(query))
                || spaceTitle.includes(query);
        });
        return sortEntries(baseEntries, sortMode, collator);
    }, [collator, entries, searchQuery, sortMode]);

    const selectedCount = selectedIds.length;
    const refreshEntries = () => {
        setEntries(loadAllDictionaryEntries());
    };

    const handleToggleSelected = (entryId) => {
        setSelectedIds((current) => (
            current.includes(entryId)
                ? current.filter((id) => id !== entryId)
                : [...current, entryId]
        ));
    };

    const handleDeleteSelected = () => {
        if (selectedIds.length === 0) return;
        removeDictionaryEntriesById(selectedIds);
        setSelectedIds([]);
        refreshEntries();
        setStatusMessage('選択した単語を削除しました。');
    };

    const handleDeleteEntry = (entryId) => {
        removeDictionaryEntriesById([entryId]);
        setSelectedIds((current) => current.filter((id) => id !== entryId));
        refreshEntries();
    };

    const handleCycleVariant = (entry, direction) => {
        const variants = getDictionaryEntryVariants(entry);
        if (variants.length <= 1) return;

        updateDictionaryEntryById(entry.id, (current) => {
            const nextVariants = getDictionaryEntryVariants(current);
            return {
                ...current,
                activeVariantIndex: clampIndex((current?.activeVariantIndex || 0) + direction, nextVariants.length),
                collapsed: false,
                updatedAt: new Date().toISOString(),
            };
        });
        refreshEntries();
    };

    const handleGenerateExplanation = async (entry, { forceNewVariant = false } = {}) => {
        if (!entry || isGenerating[entry.id]) return;

        const apiCandidates = [
            selectedApiEntry,
            ...apiKeys.filter((candidate, index) => index !== selectedApiIndex),
        ].filter((candidate, index, array) => {
            const { key: candidateKey } = resolveModelSelection(candidate);
            if (!candidateKey) return false;
            return array.findIndex((item) => (
                item?.provider === candidate?.provider
                && item?.key === candidate?.key
                && item?.model === candidate?.model
                && item?.manualModel === candidate?.manualModel
            )) === index;
        });
        const { key } = resolveModelSelection(apiCandidates[0]);
        if (!key) {
            setStatusMessage('API キーを設定してください。');
            return;
        }

        const existingExplanation = getDictionaryEntryExplanation(entry);
        setStatusMessage('');
        setIsGenerating((current) => ({ ...current, [entry.id]: true }));
        try {
            const prompts = [
                [
                    '次の単語や短い表現を、日本語で短く説明してください。',
                    '- 2〜4文でまとめる',
                    '- 曖昧な一般論ではなく、意味が伝わる説明にする',
                    '- 似た表現との違いがあれば一言だけ添える',
                    '',
                    `単語: ${entry.term}`,
                    existingExplanation && forceNewVariant
                        ? `前回の説明: ${existingExplanation}\n前回と少し角度を変えて、より分かりやすく説明してください。`
                        : '',
                ].filter(Boolean).join('\n'),
                `「${entry.term}」を日本語で2〜3文で説明してください。返答は説明文だけにしてください。`,
                `単語: ${entry.term}\n日本語で簡潔に意味を説明してください。`,
            ];

            let rawText = '';
            let lastError = null;
            for (let attempt = 0; attempt < prompts.length; attempt += 1) {
                for (const candidate of apiCandidates) {
                    try {
                        rawText = (await requestChatText({
                            apiKeyEntry: candidate,
                            history: createSingleTurnHistory(prompts[attempt]),
                            maxTokens: attempt === 0 ? 320 : 220,
                        })).trim();
                        if (rawText && !/^Error:/i.test(rawText) && !/^No response\.?$/i.test(rawText) && rawText.length > 4) {
                            break;
                        }
                    } catch (error) {
                        lastError = error;
                        rawText = '';
                    }
                }
                if (rawText && !/^Error:/i.test(rawText) && !/^No response\.?$/i.test(rawText) && rawText.length > 4) break;
            }

            if (!rawText || /^Error:/i.test(rawText) || /^No response\.?$/i.test(rawText)) {
                if (lastError) throw lastError;
                throw new Error(rawText || 'No response');
            }

            upsertDictionaryEntry(entry.spaceId, {
                id: entry.id,
                spaceId: entry.spaceId,
                term: entry.term,
                variants: [{ text: rawText }],
                forceAddVariant: forceNewVariant || getDictionaryEntryVariants(entry).length > 0,
                collapsed: false,
                sourceKinds: ['explanation'],
                sourceRef: entry.sourceRef ?? null,
            });
            refreshEntries();
        } catch (error) {
            setStatusMessage(`説明の生成に失敗しました: ${error.message}`);
        } finally {
            setIsGenerating((current) => {
                const next = { ...current };
                delete next[entry.id];
                return next;
            });
        }
    };

    const handleToggleCollapsed = (entry) => {
        const hasExplanation = Boolean(getDictionaryEntryExplanation(entry));
        if (!hasExplanation) {
            handleGenerateExplanation(entry);
            return;
        }

        updateDictionaryEntryById(entry.id, (current) => ({
            ...current,
            collapsed: !current.collapsed,
            updatedAt: new Date().toISOString(),
        }));
        refreshEntries();
    };

    const handleJumpToSource = (entry) => {
        const nextPath = buildJumpPath(entry);
        if (!nextPath) return;
        navigate(nextPath);
    };

    const handleAddFromSearch = () => {
        const term = searchQuery.trim();
        if (!term) return;

        upsertDictionaryEntry(currentSpaceId || 'manual', {
            id: crypto.randomUUID(),
            spaceId: currentSpaceId || 'manual',
            term,
            explanation: '',
            collapsed: true,
            sourceKinds: ['dictionary'],
            sourceRef: null,
            matchByTerm: false,
        });
        refreshEntries();
        setSearchQuery('');
        setStatusMessage('単語を辞書に追加しました。');
    };

    const openSettingsFromDictionary = () => {
        if (!currentSpaceId) {
            navigate('/');
            return;
        }
        sessionStorage.setItem('blueprint_open_settings', '1');
        navigate(getSpacePath(currentSpaceId, 'chat'));
    };

    return (
        <div
            style={{
                display: 'flex',
                height: '100dvh',
                width: '100vw',
                overflow: 'hidden',
                background: 'linear-gradient(180deg, #f8f5f7 0%, #f2eff4 100%)',
                color: 'var(--text-main)',
            }}
        >
            <div
                style={{
                    width: '52px',
                    background: 'var(--bg-dark)',
                    borderRight: '1px solid var(--panel-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
                    paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
                    gap: '0.5rem',
                    flexShrink: 0,
                }}
            >
                <div
                    style={{
                        marginTop: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.55rem',
                    }}
                >
                    <button
                        type="button"
                        className="btn-icon"
                        onClick={() => navigate('/d')}
                        style={{
                            width: '36px',
                            height: '36px',
                            opacity: 1,
                            background: 'rgba(255,255,255,0.08)',
                            borderColor: 'rgba(255,255,255,0.14)',
                        }}
                        title="辞書"
                        aria-label="辞書"
                    >
                        <BookOpen size={17} />
                    </button>
                    <button
                        type="button"
                        className="btn-icon"
                        onClick={openSettingsFromDictionary}
                        style={{ width: '36px', height: '36px', opacity: 1 }}
                        title="設定"
                        aria-label="設定"
                    >
                        <Settings size={17} />
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div
                    style={{
                        padding: '1rem 1.25rem 0.8rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.9rem',
                        flexWrap: 'wrap',
                    }}
                >
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.58rem' }}>
                            <div
                                style={{
                                    width: '34px',
                                    height: '34px',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(135deg, rgba(83, 113, 255, 0.92), rgba(99, 190, 255, 0.92))',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'white',
                                    boxShadow: '0 12px 26px rgba(90, 116, 215, 0.24)',
                                }}
                            >
                                <BookOpen size={16} />
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>辞書</h1>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    すべてのスペースから集めた単語をまとめています
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            API
                            <select
                                className="node-select-sm"
                                value={selectedApiIndex}
                                onChange={(event) => setSelectedApiIndex(Number.parseInt(event.target.value, 10))}
                                style={{ minWidth: '240px', background: '#ffffff' }}
                            >
                                {apiKeys.length === 0 ? (
                                    <option value={0}>未設定</option>
                                ) : (
                                    apiKeys.map((item, index) => {
                                        const provider = getProviderDefinition(item.provider);
                                        const selectedModel = resolveModelSelection(item).model;
                                        return (
                                            <option key={`${item.provider}-${index}`} value={index}>
                                                Key {index + 1} - {provider.label} / {selectedModel}
                                            </option>
                                        );
                                    })
                                )}
                            </select>
                        </label>
                    </div>
                </div>

                <div style={{ padding: '0 1.25rem 0.85rem', display: 'grid', gap: '0.7rem' }}>
                    <div
                        style={{
                            display: 'flex',
                            gap: '0.5rem',
                            alignItems: 'center',
                            background: 'rgba(255,255,255,0.84)',
                            border: '1px solid rgba(31, 41, 55, 0.08)',
                            borderRadius: '999px',
                            padding: '0.5rem 0.82rem',
                            boxShadow: '0 12px 28px rgba(29, 33, 44, 0.06)',
                        }}
                    >
                        <Search size={15} color="var(--text-muted)" />
                        <input
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="単語・説明・スペース名で検索"
                            style={{
                                flex: 1,
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                fontFamily: 'inherit',
                                fontSize: '0.88rem',
                                color: 'var(--text-main)',
                            }}
                        />
                        <button
                            type="button"
                            onClick={handleAddFromSearch}
                            disabled={!searchQuery.trim()}
                            style={{
                                ...compactActionStyle,
                                background: searchQuery.trim() ? 'rgba(108,140,255,0.12)' : 'rgba(108,140,255,0.04)',
                                color: searchQuery.trim() ? '#5a74d7' : 'var(--text-muted)',
                                border: '1px solid rgba(108,140,255,0.16)',
                                cursor: searchQuery.trim() ? 'pointer' : 'default',
                            }}
                        >
                            新規追加
                        </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.42rem', flexWrap: 'wrap' }}>
                            {[
                                ['newest', '↓新', '新しい順'],
                                ['oldest', '↑旧', '古い順'],
                                ['alpha', 'A/あ', 'アルファベット / ひらがな順'],
                            ].map(([id, label, title]) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSortMode(id)}
                                    title={title}
                                    aria-label={title}
                                    style={{
                                        ...compactActionStyle,
                                        background: sortMode === id ? 'rgba(108,140,255,0.12)' : 'rgba(255,255,255,0.76)',
                                        color: sortMode === id ? '#536fd8' : '#5f6778',
                                        border: sortMode === id
                                            ? '1px solid rgba(108,140,255,0.22)'
                                            : '1px solid rgba(18,22,28,0.08)',
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={handleDeleteSelected}
                                disabled={selectedCount === 0}
                                style={{
                                    ...compactActionStyle,
                                    border: '1px solid rgba(248,113,113,0.18)',
                                    background: selectedCount === 0 ? 'rgba(255,255,255,0.72)' : 'rgba(248,113,113,0.08)',
                                    color: selectedCount === 0 ? 'var(--text-muted)' : '#b65757',
                                    cursor: selectedCount === 0 ? 'default' : 'pointer',
                                }}
                            >
                                選択削除 {selectedCount > 0 ? `(${selectedCount})` : ''}
                            </button>
                        </div>
                    </div>
                </div>

                {statusMessage && (
                    <div style={{ padding: '0 1.25rem 0.55rem', fontSize: '0.8rem', color: '#5f6e8f' }}>
                        {statusMessage}
                    </div>
                )}

                <div
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '0 1.25rem 1.25rem',
                    }}
                >
                    {filteredEntries.length === 0 ? (
                        <div
                            style={{
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--text-muted)',
                                textAlign: 'center',
                                gap: '0.55rem',
                            }}
                        >
                            <BookOpen size={38} style={{ opacity: 0.22 }} />
                            <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>辞書はまだ空です</div>
                            <div style={{ fontSize: '0.82rem', lineHeight: 1.7 }}>
                                チャットの選択範囲を保存するか、このページから単語を追加してください。
                            </div>
                        </div>
                    ) : (
                        <div style={{ borderTop: '1px solid rgba(18, 22, 28, 0.14)' }}>
                            {filteredEntries.map((entry) => {
                                const variants = getDictionaryEntryVariants(entry);
                                const activeVariantIndex = clampIndex(entry.activeVariantIndex, variants.length);
                                const activeVariant = variants[activeVariantIndex] || null;
                                const explanation = activeVariant?.text || getDictionaryEntryExplanation(entry);
                                const collapsed = Boolean(entry.collapsed);
                                const isSelected = selectedIds.includes(entry.id);
                                const isGeneratingEntry = Boolean(isGenerating[entry.id]);
                                const jumpPath = buildJumpPath(entry);

                                return (
                                    <div
                                        key={entry.id}
                                        style={{
                                            borderBottom: '1px solid rgba(18, 22, 28, 0.14)',
                                            padding: '0.7rem 0 0.55rem',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.7rem' }}>
                                            <label style={{ paddingTop: '0.18rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => handleToggleSelected(entry.id)}
                                                />
                                            </label>

                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleCollapsed(entry)}
                                                    style={{
                                                        border: 'none',
                                                        background: 'transparent',
                                                        padding: 0,
                                                        margin: 0,
                                                        textAlign: 'left',
                                                        cursor: 'pointer',
                                                        display: 'block',
                                                        width: '100%',
                                                        color: '#1e2430',
                                                        fontFamily: 'inherit',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.46rem', minWidth: 0 }}>
                                                        <span style={{ fontSize: '0.94rem', fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {entry.term}
                                                        </span>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.22rem', flexShrink: 0, color: '#5f6778' }}>
                                                            {entry.sourceKinds.includes('dictionary') && (
                                                                <span title="辞書から追加" aria-label="辞書から追加" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                                    <BookOpen size={12} />
                                                                </span>
                                                            )}
                                                            {entry.sourceKinds.includes('explanation') && (
                                                                <span title="説明から追加" aria-label="説明から追加" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                                    <Sparkles size={12} />
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </button>

                                                <div style={{ marginTop: '0.16rem', display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                                                    {jumpPath && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleJumpToSource(entry)}
                                                            style={{
                                                                border: 'none',
                                                                background: 'transparent',
                                                                padding: 0,
                                                                margin: 0,
                                                                cursor: 'pointer',
                                                                color: '#5f6778',
                                                                fontFamily: 'inherit',
                                                                fontSize: '0.72rem',
                                                                textDecoration: 'underline',
                                                            }}
                                                        >
                                                            {getEntrySpaceTitle(entry)}
                                                        </button>
                                                    )}
                                                    {isGeneratingEntry && (
                                                        <span style={{ fontSize: '0.72rem', color: '#6a7796' }}>説明を生成中...</span>
                                                    )}
                                                    {!isGeneratingEntry && !explanation && (
                                                        <span style={{ fontSize: '0.72rem', color: '#6a7796' }}>右の開閉ボタンで説明を作成できます</span>
                                                    )}
                                                </div>

                                                <div
                                                    style={{
                                                        overflow: 'hidden',
                                                        maxHeight: collapsed ? '0px' : '420px',
                                                        opacity: collapsed ? 0 : 1,
                                                        transition: 'max-height 220ms ease, opacity 180ms ease, padding-top 220ms ease',
                                                        paddingTop: collapsed ? '0px' : '0.52rem',
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            paddingLeft: '0.1rem',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '0.56rem',
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                whiteSpace: 'pre-wrap',
                                                                color: '#222b39',
                                                                fontSize: '0.84rem',
                                                                lineHeight: 1.75,
                                                            }}
                                                        >
                                                            {isGeneratingEntry
                                                                ? '説明を生成しています...'
                                                                : explanation || 'まだ説明がありません。'}
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleGenerateExplanation(entry, { forceNewVariant: true })}
                                                                disabled={isGeneratingEntry}
                                                                style={{
                                                                    ...compactActionStyle,
                                                                    cursor: isGeneratingEntry ? 'default' : 'pointer',
                                                                    opacity: isGeneratingEntry ? 0.68 : 1,
                                                                }}
                                                            >
                                                                <RefreshCw size={12} />
                                                            </button>

                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCycleVariant(entry, -1)}
                                                                    disabled={variants.length <= 1}
                                                                    style={{
                                                                        ...iconButtonStyle,
                                                                        opacity: variants.length <= 1 ? 0.4 : 1,
                                                                        cursor: variants.length <= 1 ? 'default' : 'pointer',
                                                                    }}
                                                                    aria-label="前の説明"
                                                                    title="前の説明"
                                                                >
                                                                    <ChevronLeft size={13} />
                                                                </button>
                                                                <div style={{ minWidth: '3.1rem', textAlign: 'center', fontSize: '0.73rem', color: '#677086', fontWeight: 700 }}>
                                                                    {variants.length === 0 ? '0/0' : `${activeVariantIndex + 1}/${variants.length}`}
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCycleVariant(entry, 1)}
                                                                    disabled={variants.length <= 1}
                                                                    style={{
                                                                        ...iconButtonStyle,
                                                                        opacity: variants.length <= 1 ? 0.4 : 1,
                                                                        cursor: variants.length <= 1 ? 'default' : 'pointer',
                                                                    }}
                                                                    aria-label="次の説明"
                                                                    title="次の説明"
                                                                >
                                                                    <ChevronRight size={13} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.38rem', paddingTop: '0.05rem' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleCollapsed(entry)}
                                                    style={{
                                                        ...iconButtonStyle,
                                                        background: collapsed ? 'rgba(255,255,255,0.98)' : 'rgba(108,140,255,0.1)',
                                                    }}
                                                    aria-label={explanation ? (collapsed ? '開く' : '閉じる') : '説明を作成'}
                                                    title={explanation ? (collapsed ? '開く' : '閉じる') : '説明を作成'}
                                                >
                                                    {explanation ? (
                                                        <ChevronDown
                                                            size={13}
                                                            style={{
                                                                transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                                                                transition: 'transform 180ms ease',
                                                            }}
                                                        />
                                                    ) : (
                                                        <Sparkles size={13} />
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteEntry(entry.id)}
                                                    style={iconButtonStyle}
                                                    aria-label="削除"
                                                    title="削除"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
