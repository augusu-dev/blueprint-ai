import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X, Plus, Clock, LayoutTemplate } from 'lucide-react';
import { supabase } from './lib/supabase';
import { useLanguage } from './i18n';

export default function Sidebar({ isOpen, onClose }) {
    const { t } = useLanguage();
    const [spaces, setSpaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const { id: currentSpaceId } = useParams();
    const navigate = useNavigate();

    useEffect(() => {
        if (!isOpen) return;

        const fetchSpaces = async () => {
            let localSpaces = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('blueprint_space_')) {
                    try {
                        const s = JSON.parse(localStorage.getItem(key));
                        localSpaces.push({
                            id: key.replace('blueprint_space_', ''),
                            title: s.title || t('editor.untitled'),
                            updated_at: s.updated_at || new Date(0).toISOString()
                        });
                    } catch (e) { }
                }
            }

            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data, error } = await supabase
                        .from('spaces')
                        .select('id, title, updated_at')
                        .eq('user_id', user.id)
                        .order('updated_at', { ascending: false });

                    if (!error && data) {
                        const map = new Map();
                        localSpaces.forEach(s => map.set(s.id, s));
                        data.forEach(s => {
                            const l = map.get(s.id);
                            if (!l || new Date(s.updated_at) > new Date(l.updated_at)) {
                                map.set(s.id, s);
                            }
                        });
                        localSpaces = Array.from(map.values());
                    }
                }
            } catch (err) {
                console.warn("Failed to load spaces from Supabase", err);
            } finally {
                localSpaces.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
                setSpaces(localSpaces);
                setLoading(false);
            }
        };

        fetchSpaces();

        const handleTitleUpdate = () => fetchSpaces();
        window.addEventListener('spaceTitleUpdated', handleTitleUpdate);
        return () => window.removeEventListener('spaceTitleUpdated', handleTitleUpdate);
    }, [isOpen]);

    const handleNewSpace = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No user logged in");

            const currentSpace = spaces.find(s => s.id === currentSpaceId);
            if (currentSpace && (currentSpace.title === t('editor.untitled') || currentSpace.title === 'Untitled Space' || currentSpace.title === '無題のスペース' || currentSpace.title === '未命名空间')) {
                onClose();
                return;
            }

            const { data, error } = await supabase
                .from('spaces')
                .insert([{ user_id: user.id, title: t('editor.untitled') }])
                .select()
                .single();

            if (error) throw error;

            navigate(`/space/${data.id}`);
            onClose();
        } catch (err) {
            console.warn("Cloud DB creation failed, falling back to local space:", err.message);
            navigate(`/space/${crypto.randomUUID()}`);
            onClose();
        }
    };

    const handleSelectSpace = (id) => {
        navigate(`/space/${id}`);
        onClose();
    };

    const formatDate = (dateString) => {
        const d = new Date(dateString);
        return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    };

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    onClick={onClose}
                    style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.4)',
                        backdropFilter: 'blur(6px)',
                        zIndex: 999
                    }}
                />
            )}

            {/* Drawer */}
            <div style={{
                position: 'fixed',
                top: 0,
                left: isOpen ? 0 : '-340px',
                width: '310px',
                height: '100vh',
                background: 'var(--bg-dark)',
                borderRight: '1px solid var(--panel-border)',
                transition: 'left 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: isOpen ? '8px 0 30px rgba(0,0,0,0.25)' : 'none'
            }}>

                {/* Header */}
                <div style={{
                    padding: '1.25rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid var(--panel-border)'
                }}>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 500, margin: 0, letterSpacing: '-0.01em' }}>{t('sidebar.title')}</h2>
                    <button onClick={onClose} className="btn-icon" style={{ width: '28px', height: '28px' }}>
                        <X size={14} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                    <button
                        onClick={handleNewSpace}
                        style={{
                            width: '100%',
                            padding: '0.65rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4rem',
                            background: 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 500,
                            fontSize: '0.85rem',
                            marginBottom: '1.25rem',
                            transition: 'all 0.2s',
                            boxShadow: '0 4px 12px rgba(108, 140, 255, 0.2)'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--primary-hover)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                    >
                        <Plus size={16} /> {t('sidebar.newSpace')}
                    </button>

                    <h3 style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '0.75rem', marginLeft: '0.4rem', fontWeight: 500 }}>
                        {t('sidebar.history')}
                    </h3>

                    {loading ? (
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.85rem', marginTop: '2rem' }}>{t('sidebar.loading')}</p>
                    ) : spaces.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.85rem', marginTop: '2rem' }}>{t('sidebar.empty')}</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            {spaces.map(space => (
                                <div
                                    key={space.id}
                                    onClick={() => handleSelectSpace(space.id)}
                                    style={{
                                        padding: '0.6rem 0.8rem',
                                        borderRadius: '8px',
                                        background: space.id === currentSpaceId ? 'rgba(108, 140, 255, 0.08)' : 'transparent',
                                        border: `1px solid ${space.id === currentSpaceId ? 'rgba(108, 140, 255, 0.12)' : 'transparent'}`,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.2rem'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (space.id !== currentSpaceId) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                                    }}
                                    onMouseLeave={(e) => {
                                        if (space.id !== currentSpaceId) e.currentTarget.style.background = 'transparent';
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <LayoutTemplate size={13} color="var(--primary)" />
                                        <span style={{ fontWeight: 400, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {space.title}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.7rem', paddingLeft: '1.2rem' }}>
                                        <Clock size={9} />
                                        <span>{formatDate(space.updated_at)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
