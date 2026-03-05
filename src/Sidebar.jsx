import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { Plus, X, Search, MessageSquare } from 'lucide-react';
import { useLanguage } from './i18n';

export default function Sidebar({ isOpen, onClose }) {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const { id: currentSpaceId } = useParams();
    const [spaces, setSpaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchSpaces = async () => {
        if (!supabase) { setLoading(false); return; }
        const { data, error } = await supabase.from('spaces').select('id, title, updated_at').order('updated_at', { ascending: false });
        if (!error && data) setSpaces(data);
        setLoading(false);
    };

    useEffect(() => {
        if (isOpen) fetchSpaces();
    }, [isOpen]);

    useEffect(() => {
        const handleTitleUpdate = () => fetchSpaces();
        window.addEventListener('spaceTitleUpdated', handleTitleUpdate);
        return () => window.removeEventListener('spaceTitleUpdated', handleTitleUpdate);
    }, []);

    const handleNewSpace = async () => {
        if (!supabase) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase.from('spaces').insert({ user_id: user.id, title: t('editor.untitled'), nodes: [], edges: [] }).select().single();
        if (!error && data) {
            navigate(`/space/${data.id}`);
            onClose();
        }
    };

    const filteredSpaces = spaces.filter(s =>
        !searchQuery || (s.title || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <>
            {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}
            <div className={`sidebar-drawer ${isOpen ? 'sidebar-open' : ''}`}>
                {/* Header */}
                <div style={{
                    padding: '0.75rem 0.85rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--panel-border)'
                }}>
                    <span style={{ fontWeight: 500, fontSize: '0.95rem' }}>{t('sidebar.title')}</span>
                    <button className="btn-icon" onClick={onClose} style={{ width: '28px', height: '28px' }}>
                        <X size={16} />
                    </button>
                </div>

                {/* New Chat Button */}
                <div style={{ padding: '0.6rem 0.85rem' }}>
                    <button
                        onClick={handleNewSpace}
                        style={{
                            width: '100%', background: 'var(--primary)', color: 'white',
                            border: 'none', padding: '0.55rem', borderRadius: '10px',
                            fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                            transition: 'all 0.2s', fontFamily: 'inherit'
                        }}
                    >
                        <Plus size={15} />
                        {t('sidebar.newSpace')}
                    </button>
                </div>

                {/* Search */}
                <div style={{ padding: '0 0.85rem 0.5rem' }}>
                    <div style={{
                        display: 'flex', background: 'rgba(255,255,255,0.04)',
                        border: '1px solid var(--panel-border)', borderRadius: '8px',
                        alignItems: 'center', padding: '0 0.5rem'
                    }}>
                        <Search size={14} color="var(--text-muted)" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder={t('sidebar.search')}
                            style={{
                                flex: 1, background: 'transparent', border: 'none',
                                color: 'var(--text-main)', padding: '0.45rem 0.5rem',
                                fontSize: '0.82rem', outline: 'none', fontFamily: 'inherit'
                            }}
                        />
                    </div>
                </div>

                {/* Space list */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0.3rem 0.55rem' }}>
                    {loading ? (
                        <p style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center' }}>{t('sidebar.loading')}</p>
                    ) : filteredSpaces.length === 0 ? (
                        <p style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center' }}>{t('sidebar.empty')}</p>
                    ) : (
                        filteredSpaces.map(space => (
                            <button
                                key={space.id}
                                onClick={() => { navigate(`/space/${space.id}`); onClose(); }}
                                style={{
                                    width: '100%', textAlign: 'left', padding: '0.55rem 0.65rem',
                                    background: space.id === currentSpaceId ? 'rgba(108, 140, 255, 0.08)' : 'transparent',
                                    border: space.id === currentSpaceId ? '1px solid rgba(108, 140, 255, 0.15)' : '1px solid transparent',
                                    borderRadius: '8px', cursor: 'pointer', color: 'var(--text-main)',
                                    fontSize: '0.82rem', transition: 'all 0.15s', display: 'flex',
                                    alignItems: 'center', gap: '0.5rem', marginBottom: '0.15rem',
                                    fontFamily: 'inherit'
                                }}
                                onMouseEnter={e => { if (space.id !== currentSpaceId) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                onMouseLeave={e => { if (space.id !== currentSpaceId) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <MessageSquare size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                                <span style={{
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    fontWeight: space.id === currentSpaceId ? 500 : 400
                                }}>
                                    {space.title || t('editor.untitled')}
                                </span>
                            </button>
                        ))
                    )}
                </div>

                {/* Bottom search button */}
                <div style={{
                    padding: '0.6rem 0.85rem', borderTop: '1px solid var(--panel-border)'
                }}>
                    <button
                        onClick={() => { document.querySelector('.sidebar-drawer input')?.focus(); }}
                        style={{
                            width: '100%', background: 'rgba(255,255,255,0.03)',
                            border: '1px solid var(--panel-border)',
                            padding: '0.5rem', borderRadius: '8px',
                            fontSize: '0.8rem', color: 'var(--text-muted)',
                            cursor: 'pointer', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: '0.35rem', transition: 'all 0.2s',
                            fontFamily: 'inherit'
                        }}
                    >
                        <Search size={13} />
                        {t('sidebar.searchBtn')}
                    </button>
                </div>
            </div>
        </>
    );
}
