import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { Plus, X, Search, MessageSquare, Trash2, Settings } from 'lucide-react';
import { useLanguage } from './i18n';

export default function Sidebar({ isOpen, onClose, onOpenSettings }) {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const { id: currentSpaceId } = useParams();
    const [spaces, setSpaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchSpaces = async () => {
        let allSpaces = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('blueprint_space_')) {
                try {
                    const spaceData = JSON.parse(localStorage.getItem(key));
                    const id = key.replace('blueprint_space_', '');
                    allSpaces.push({ id, title: spaceData.title || t('editor.untitled'), updated_at: spaceData.updated_at || new Date().toISOString() });
                } catch (e) { }
            }
        }

        if (supabase) {
            try {
                const { data, error } = await supabase.from('spaces').select('id, title, updated_at').order('updated_at', { ascending: false });
                if (!error && data) {
                    data.forEach(remoteSpace => {
                        const existingIdx = allSpaces.findIndex(s => s.id === remoteSpace.id);
                        if (existingIdx >= 0) allSpaces[existingIdx] = remoteSpace;
                        else allSpaces.push(remoteSpace);
                    });
                }
            } catch (e) { }
        }

        allSpaces.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        setSpaces(allSpaces);
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
        const initNodes = [{ id: '1', type: 'sequenceNode', position: { x: 100, y: 100 }, data: { isStarter: true, dir: 'LR', prompt: '' } }];
        try {
            if (supabase) {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data, error } = await supabase.from('spaces').insert({ user_id: user.id, title: t('editor.untitled'), nodes: initNodes, edges: [] }).select().single();
                    if (!error && data) {
                        navigate(`/space/${data.id}`);
                        onClose();
                        return;
                    }
                }
            }
        } catch (err) { }

        const newId = crypto.randomUUID();
        const spaceData = { title: t('editor.untitled'), nodes: initNodes, edges: [], updated_at: new Date().toISOString() };
        localStorage.setItem(`blueprint_space_${newId}`, JSON.stringify(spaceData));
        navigate(`/space/${newId}`);
        onClose();
    };

    const handleDeleteSpace = async (e, spaceId) => {
        e.stopPropagation();
        if (!confirm(t('sidebar.deleteConfirm'))) return;

        localStorage.removeItem(`blueprint_space_${spaceId}`);
        if (supabase) {
            try { await supabase.from('spaces').delete().eq('id', spaceId); } catch (err) { }
        }

        if (spaceId === currentSpaceId) navigate('/');
        fetchSpaces();
    };

    const filteredSpaces = spaces.filter(s =>
        !searchQuery || (s.title || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <>
            {isOpen && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 998, backdropFilter: 'blur(2px)' }} onClick={onClose} />}
            <div style={{
                position: 'fixed', top: 0, left: 0, bottom: 0,
                width: isOpen ? '220px' : '0',
                background: 'var(--bg-dark)',
                borderRight: isOpen ? '1px solid var(--panel-border)' : 'none',
                zIndex: 999, overflow: 'hidden',
                transition: 'width 0.2s ease',
                display: 'flex', flexDirection: 'column'
            }}>
                {/* Header */}
                <div style={{ padding: '0.6rem 0.65rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', minWidth: '220px' }}>
                    <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{t('sidebar.title')}</span>
                    <button className="btn-icon" onClick={onClose} style={{ width: '26px', height: '26px' }}><X size={14} /></button>
                </div>

                {/* New Chat */}
                <div style={{ padding: '0.5rem 0.65rem', minWidth: '220px' }}>
                    <button onClick={handleNewSpace} style={{
                        width: '100%', background: 'var(--primary)', color: 'white', border: 'none',
                        padding: '0.45rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 500,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '0.3rem', transition: 'all 0.2s', fontFamily: 'inherit'
                    }}>
                        <Plus size={13} /> {t('sidebar.newSpace')}
                    </button>
                </div>

                {/* Search */}
                <div style={{ padding: '0 0.65rem 0.4rem', minWidth: '220px' }}>
                    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--panel-border)', borderRadius: '6px', alignItems: 'center', padding: '0 0.4rem' }}>
                        <Search size={12} color="var(--text-muted)" />
                        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={t('sidebar.search')}
                            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)', padding: '0.35rem 0.4rem', fontSize: '0.78rem', outline: 'none', fontFamily: 'inherit' }} />
                    </div>
                </div>

                {/* Chat list */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0.2rem 0.45rem', minWidth: '220px' }}>
                    {loading ? (
                        <p style={{ padding: '0.8rem', color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center' }}>{t('sidebar.loading')}</p>
                    ) : filteredSpaces.length === 0 ? (
                        <p style={{ padding: '0.8rem', color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center' }}>{t('sidebar.empty')}</p>
                    ) : (
                        filteredSpaces.map(space => (
                            <div key={space.id} className="sidebar-item"
                                onClick={() => { navigate(`/space/${space.id}`); onClose(); }}
                                style={{
                                    padding: '0.4rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    background: space.id === currentSpaceId ? 'rgba(108, 140, 255, 0.08)' : 'transparent',
                                    border: space.id === currentSpaceId ? '1px solid rgba(108, 140, 255, 0.15)' : '1px solid transparent',
                                    borderRadius: '6px', cursor: 'pointer', marginBottom: '0.1rem',
                                    transition: 'all 0.15s', position: 'relative'
                                }}
                                onMouseEnter={e => { if (space.id !== currentSpaceId) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                onMouseLeave={e => { if (space.id !== currentSpaceId) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <MessageSquare size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                                <span style={{
                                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    fontSize: '0.78rem', color: 'var(--text-main)',
                                    fontWeight: space.id === currentSpaceId ? 500 : 400
                                }}>
                                    {space.title || t('editor.untitled')}
                                </span>
                                <button onClick={(e) => handleDeleteSpace(e, space.id)}
                                    className="sidebar-delete-btn"
                                    style={{
                                        opacity: 0, background: 'transparent', border: 'none',
                                        color: 'var(--text-muted)', cursor: 'pointer', padding: '0.15rem',
                                        display: 'flex', alignItems: 'center', transition: 'opacity 0.15s, color 0.15s',
                                        flexShrink: 0
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Bottom section */}
                <div style={{ padding: '0.5rem 0.65rem', borderTop: '1px solid var(--panel-border)', minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <button onClick={() => { document.querySelector('.sidebar-drawer input, div[style*="220px"] input')?.focus(); }}
                        style={{
                            width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)',
                            padding: '0.4rem', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-muted)',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: '0.3rem', transition: 'all 0.2s', fontFamily: 'inherit'
                        }}>
                        <Search size={11} /> {t('sidebar.searchBtn')}
                    </button>

                    {onOpenSettings && (
                        <button onClick={onOpenSettings}
                            style={{
                                width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)',
                                padding: '0.4rem', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-muted)',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: '0.3rem', transition: 'all 0.2s', fontFamily: 'inherit'
                            }}>
                            <Settings size={11} /> {t('editor.settings')}
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}
