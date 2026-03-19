import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    BookOpen,
    CheckSquare,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Search,
    Sparkles,
    Square,
    Trash2,
} from 'lucide-react';
import { useLanguage } from './i18n';
import { getSpacePath } from './lib/routes';
import { resolveSpaceTitle } from './lib/space';
import {
    loadDictionaryEntries,
    removeDictionaryEntries,
    saveDictionaryEntries,
    updateDictionaryEntry,
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
        const stored = localStorage.getItem(`blueprint_space_${spaceId}`);
        if (!stored) return fallback;
        const parsed = JSON.parse(stored);
        return resolveSpaceTitle(spaceId, parsed?.title, fallback);
    } catch {
        return fallback;
    }
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

export default function DictionaryPage() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const { id: spaceId } = useParams();
    const [entries, setEntries] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortMode, setSortMode] = useState('newest');
    const [selectedIds, setSelectedIds] = useState([]);
    const [selectedApiIndex, setSelectedApiIndex] = useState(() => {
        try {
            const raw = localStorage.getItem(`blueprint_dictionary_selected_api_${spaceId || 'default'}`);
            const parsed = Number.parseInt(raw || '0', 10);
            return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
        } catch {
            return 0;
        }
    });
    const [apiKeys, setApiKeys] = useState(() => loadApiKeys());
    const [isGenerating, setIsGenerating] = useState({});
    const [statusMessage, setStatusMessage] = useState('');
    const [spaceTitle, setSpaceTitle] = useState(() => loadSpaceTitle(spaceId, t('editor.untitled')));

    useEffect(() => {
        setSpaceTitle(loadSpaceTitle(spaceId, t('editor.untitled')));
        setEntries(loadDictionaryEntries(spaceId));
        setApiKeys(loadApiKeys());
    }, [spaceId, t]);

    useEffect(() => {
        const handleDictionaryUpdated = (event) => {
            if (!event?.detail || event.detail.spaceId === spaceId) {
                setEntries(loadDictionaryEntries(spaceId));
            }
        };
        const handleStorage = (event) => {
            if (!event || event.key === 'blueprint_api_keys') {
                setApiKeys(loadApiKeys());
            }
        };
        window.addEventListener('dictionaryUpdated', handleDictionaryUpdated);
        window.addEventListener('storage', handleStorage);
        return () => {
            window.removeEventListener('dictionaryUpdated', handleDictionaryUpdated);
            window.removeEventListener('storage', handleStorage);
        };
    }, [spaceId]);

    useEffect(() => {
        const nextIndex = Math.min(selectedApiIndex, Math.max(0, apiKeys.length - 1));
        if (nextIndex !== selectedApiIndex) {
            setSelectedApiIndex(nextIndex);
        }
    }, [apiKeys.length, selectedApiIndex]);

    useEffect(() => {
        localStorage.setItem(`blueprint_dictionary_selected_api_${spaceId || 'default'}`, String(selectedApiIndex));
    }, [selectedApiIndex, spaceId]);

    useEffect(() => {
        setSelectedIds((current) => current.filter((id) => entries.some((entry) => entry.id === id)));
    }, [entries]);

    const collator = useMemo(
        () => new Intl.Collator('ja', { sensitivity: 'base', numeric: true }),
        [],
    );
    const selectedApiEntry = apiKeys[selectedApiIndex] || apiKeys[0] || null;
    const sortedEntries = useMemo(
        () => sortEntries(entries.filter((entry) => (
            !searchQuery.trim()
            || entry.term.includes(searchQuery.trim())
            || entry.explanation.includes(searchQuery.trim())
        )), sortMode, collator),
        [collator, entries, searchQuery, sortMode],
    );
    const selectedCount = selectedIds.length;
    const allVisibleSelected = sortedEntries.length > 0 && sortedEntries.every((entry) => selectedIds.includes(entry.id));

    const persistEntries = (nextEntries) => {
        const normalized = saveDictionaryEntries(spaceId, nextEntries);
        setEntries(normalized);
    };

    const handleToggleSelectAll = () => {
        if (allVisibleSelected) {
            setSelectedIds((current) => current.filter((id) => !sortedEntries.some((entry) => entry.id === id)));
            return;
        }
        const nextVisibleIds = sortedEntries.map((entry) => entry.id);
        setSelectedIds((current) => [...new Set([...current, ...nextVisibleIds])]);
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
        removeDictionaryEntries(spaceId, selectedIds);
        setSelectedIds([]);
        setEntries(loadDictionaryEntries(spaceId));
        setStatusMessage('選択した項目を削除しました');
    };

    const handleToggleCollapsed = (entry) => {
        persistEntries(entries.map((item) => (
            item.id === entry.id
                ? { ...item, collapsed: !item.collapsed, updatedAt: new Date().toISOString() }
                : item
        )));
    };

    const handleGenerateExplanation = async (entry) => {
        if (!entry || isGenerating[entry.id]) return;
        const apiKeyEntry = selectedApiEntry;
        const { key } = resolveModelSelection(apiKeyEntry);
        if (!key) {
            setStatusMessage('APIキーを設定してください');
            return;
        }

        setStatusMessage('');
        setIsGenerating((current) => ({ ...current, [entry.id]: true }));
        try {
            const prompt = [
                '次の語句を日本語で簡潔に説明してください。',
                '2〜4文で、必要なら補足を1行だけ足してください。',
                '余計な前置きや箇条書きは避けてください。',
                '',
                `語句: ${entry.term}`,
            ].join('\n');

            const rawText = (await requestChatText({
                apiKeyEntry,
                history: createSingleTurnHistory(prompt),
                maxTokens: 320,
            })).trim();

            if (!rawText) {
                throw new Error('No response.');
            }

            upsertDictionaryEntry(spaceId, {
                id: entry.id,
                term: entry.term,
                explanation: rawText,
                collapsed: true,
                createdAt: entry.createdAt,
            });
            setEntries(loadDictionaryEntries(spaceId));
        } catch (error) {
            setStatusMessage(`説明文の作成に失敗しました: ${error.message}`);
        } finally {
            setIsGenerating((current) => {
                const next = { ...current };
                delete next[entry.id];
                return next;
            });
        }
    };

    const handleEntryClick = (entry) => {
        if (!entry.explanation) {
            handleGenerateExplanation(entry);
            return;
        }

        handleToggleCollapsed(entry);
    };

    const handleDeleteEntry = (entryId) => {
        removeDictionaryEntries(spaceId, [entryId]);
        setSelectedIds((current) => current.filter((id) => id !== entryId));
        setEntries(loadDictionaryEntries(spaceId));
    };

    const handleAddFromSearch = () => {
        const term = searchQuery.trim();
        if (!term) return;
        upsertDictionaryEntry(spaceId, { term, explanation: '', collapsed: true });
        setEntries(loadDictionaryEntries(spaceId));
        setSearchQuery('');
        setStatusMessage('辞書に追加しました');
    };

    const goBackToSpace = () => {
        navigate(getSpacePath(spaceId));
    };

    return (
        <div
            style={{
                display: 'flex',
                height: '100dvh',
                width: '100vw',
                overflow: 'hidden',
                background: 'linear-gradient(180deg, #f7f4f7 0%, #f1eff3 100%)',
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
                <button
                    type="button"
                    className="btn-icon"
                    onClick={goBackToSpace}
                    style={{ width: '36px', height: '36px' }}
                    title="Space"
                    aria-label="Space"
                >
                    <ChevronLeft size={18} />
                </button>
                <button
                    type="button"
                    className="btn-icon"
                    style={{ width: '36px', height: '36px', opacity: 0.95 }}
                    title="Dictionary"
                    aria-label="Dictionary"
                >
                    <BookOpen size={17} />
                </button>
            </div>

            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div
                    style={{
                        padding: '0.9rem 1.25rem 0.75rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.75rem',
                        minWidth: 0,
                    }}
                >
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flexWrap: 'wrap' }}>
                            <div style={{
                                width: '34px',
                                height: '34px',
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, rgba(108,140,255,0.95), rgba(96,165,250,0.95))',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                boxShadow: '0 8px 24px rgba(108, 140, 255, 0.25)',
                            }}
                            >
                                <BookOpen size={16} />
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                                    辞書
                                </h1>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    {spaceTitle}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={goBackToSpace}
                                style={{
                                    marginLeft: '0.25rem',
                                    border: '1px solid rgba(108,140,255,0.18)',
                                    background: 'rgba(108,140,255,0.08)',
                                    color: '#5a74d7',
                                    borderRadius: '999px',
                                    padding: '0.38rem 0.75rem',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                スペースへ戻る
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            APIキー
                            <select
                                className="node-select-sm"
                                value={selectedApiIndex}
                                onChange={(event) => setSelectedApiIndex(Number.parseInt(event.target.value, 10))}
                                style={{ minWidth: '220px', background: '#ffffff' }}
                            >
                                {apiKeys.length === 0 ? (
                                    <option value={0}>未設定</option>
                                ) : (
                                    apiKeys.map((item, index) => {
                                        const provider = getProviderDefinition(item.provider);
                                        const label = `${provider.label} / ${item.model}`;
                                        return (
                                            <option key={`${item.provider}-${index}`} value={index}>
                                                Key {index + 1} - {label}
                                            </option>
                                        );
                                    })
                                )}
                            </select>
                        </label>
                    </div>
                </div>

                <div
                    style={{
                        padding: '0 1.25rem 0.8rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.75rem',
                        flexWrap: 'wrap',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => setSortMode('newest')}
                            style={{
                                border: '1px solid rgba(108,140,255,0.18)',
                                borderRadius: '999px',
                                background: sortMode === 'newest' ? 'rgba(108,140,255,0.12)' : 'rgba(255,255,255,0.72)',
                                color: sortMode === 'newest' ? '#5a74d7' : 'var(--text-muted)',
                                padding: '0.35rem 0.75rem',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            新しい順
                        </button>
                        <button
                            type="button"
                            onClick={() => setSortMode('oldest')}
                            style={{
                                border: '1px solid rgba(108,140,255,0.18)',
                                borderRadius: '999px',
                                background: sortMode === 'oldest' ? 'rgba(108,140,255,0.12)' : 'rgba(255,255,255,0.72)',
                                color: sortMode === 'oldest' ? '#5a74d7' : 'var(--text-muted)',
                                padding: '0.35rem 0.75rem',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            古い順
                        </button>
                        <button
                            type="button"
                            onClick={() => setSortMode('alpha')}
                            style={{
                                border: '1px solid rgba(108,140,255,0.18)',
                                borderRadius: '999px',
                                background: sortMode === 'alpha' ? 'rgba(108,140,255,0.12)' : 'rgba(255,255,255,0.72)',
                                color: sortMode === 'alpha' ? '#5a74d7' : 'var(--text-muted)',
                                padding: '0.35rem 0.75rem',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            アルファベット & ひらがな順
                        </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            <input type="checkbox" checked={allVisibleSelected} onChange={handleToggleSelectAll} />
                            全選択
                        </label>
                        <button
                            type="button"
                            onClick={handleDeleteSelected}
                            disabled={selectedCount === 0}
                            style={{
                                border: '1px solid rgba(248,113,113,0.22)',
                                borderRadius: '999px',
                                background: selectedCount === 0 ? 'rgba(255,255,255,0.62)' : 'rgba(248,113,113,0.1)',
                                color: selectedCount === 0 ? 'var(--text-muted)' : '#b84f4f',
                                padding: '0.35rem 0.75rem',
                                fontSize: '0.75rem',
                                cursor: selectedCount === 0 ? 'default' : 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            選択削除 {selectedCount > 0 ? `(${selectedCount})` : ''}
                        </button>
                    </div>
                </div>

                <div style={{ padding: '0 1.25rem 1rem', minWidth: 0 }}>
                    <div
                        style={{
                            display: 'flex',
                            gap: '0.5rem',
                            alignItems: 'center',
                            background: 'rgba(255,255,255,0.72)',
                            border: '1px solid rgba(31, 41, 55, 0.08)',
                            borderRadius: '999px',
                            padding: '0.48rem 0.8rem',
                            boxShadow: '0 12px 28px rgba(29, 33, 44, 0.06)',
                        }}
                    >
                        <Search size={15} color="var(--text-muted)" />
                        <input
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="語句や説明を検索"
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
                                border: 'none',
                                borderRadius: '999px',
                                background: searchQuery.trim() ? 'rgba(108,140,255,0.12)' : 'rgba(108,140,255,0.04)',
                                color: searchQuery.trim() ? '#5a74d7' : 'var(--text-muted)',
                                padding: '0.32rem 0.7rem',
                                fontSize: '0.74rem',
                                cursor: searchQuery.trim() ? 'pointer' : 'default',
                                fontFamily: 'inherit',
                            }}
                        >
                            追加
                        </button>
                    </div>
                </div>

                {statusMessage && (
                    <div style={{ padding: '0 1.25rem 0.6rem', fontSize: '0.8rem', color: '#5f6e8f' }}>
                        {statusMessage}
                    </div>
                )}

                <div
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '0 1.25rem 1.25rem',
                        display: 'grid',
                        gap: '0.7rem',
                        alignContent: 'start',
                    }}
                >
                    {sortedEntries.length === 0 ? (
                        <div
                            style={{
                                margin: 'auto',
                                padding: '3rem 1rem',
                                textAlign: 'center',
                                color: 'var(--text-muted)',
                            }}
                        >
                            <BookOpen size={38} style={{ opacity: 0.22, marginBottom: '0.8rem' }} />
                            <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                                まだ辞書項目がありません
                            </div>
                            <div style={{ fontSize: '0.82rem', lineHeight: 1.7 }}>
                                チャットで選択した語句を「辞書」に送るとここに追加されます。
                            </div>
                        </div>
                    ) : (
                        sortedEntries.map((entry) => {
                            const collapsed = Boolean(entry.collapsed);
                            const isSelected = selectedIds.includes(entry.id);
                            const isGeneratingEntry = Boolean(isGenerating[entry.id]);

                            return (
                                <div
                                    key={entry.id}
                                    style={{
                                        borderRadius: '20px',
                                        border: '1px solid rgba(125,161,255,0.2)',
                                        background: 'rgba(255,255,255,0.88)',
                                        boxShadow: '0 18px 36px rgba(17,31,66,0.08)',
                                        overflow: 'hidden',
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.55rem',
                                            padding: '0.85rem 0.95rem',
                                        }}
                                    >
                                        <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => handleToggleSelected(entry.id)}
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => handleEntryClick(entry)}
                                            style={{
                                                flex: 1,
                                                border: 'none',
                                                background: 'transparent',
                                                textAlign: 'left',
                                                padding: 0,
                                                cursor: 'pointer',
                                                color: '#22314d',
                                                fontSize: '0.92rem',
                                                fontWeight: 700,
                                                fontFamily: 'inherit',
                                            }}
                                        >
                                            {entry.term}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleToggleCollapsed(entry)}
                                            style={{
                                                ...buttonIconStyle,
                                                background: collapsed ? 'rgba(255,255,255,0.8)' : 'rgba(108,140,255,0.12)',
                                            }}
                                            aria-label={collapsed ? '展開' : '折りたたむ'}
                                            title={collapsed ? '展開' : '折りたたむ'}
                                        >
                                            {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteEntry(entry.id)}
                                            style={buttonIconStyle}
                                            aria-label="削除"
                                            title="削除"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>

                                    {!collapsed && (
                                        <div style={{
                                            padding: '0 0.95rem 0.95rem',
                                            borderTop: '1px solid rgba(125,161,255,0.12)',
                                        }}>
                                            <div style={{
                                                padding: '0.9rem 0.95rem',
                                                borderRadius: '16px',
                                                background: 'linear-gradient(180deg, rgba(235,242,255,0.95) 0%, rgba(219,231,255,0.92) 100%)',
                                                border: '1px solid rgba(125,161,255,0.25)',
                                                color: '#22314d',
                                                fontSize: '0.88rem',
                                                lineHeight: 1.85,
                                                whiteSpace: 'pre-wrap',
                                            }}>
                                                {isGeneratingEntry
                                                    ? '説明文を作成中...'
                                                    : entry.explanation || 'まだ説明文がありません。単語をクリックすると作成します。'}
                                            </div>
                                        </div>
                                    )}

                                    {collapsed && (
                                        <div style={{
                                            padding: '0 0.95rem 0.9rem',
                                            color: 'var(--text-muted)',
                                            fontSize: '0.78rem',
                                        }}>
                                            {isGeneratingEntry ? '説明文を作成中...' : (entry.explanation ? 'クリックで説明を表示' : 'クリックして説明を作成')}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

const buttonIconStyle = {
    width: '30px',
    height: '30px',
    borderRadius: '999px',
    border: '1px solid rgba(68, 76, 95, 0.12)',
    background: 'rgba(255,255,255,0.78)',
    color: '#707789',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 8px 18px rgba(29, 33, 44, 0.08)',
};
